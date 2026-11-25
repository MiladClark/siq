import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { memberRoles, roles, serverMembers, servers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getServerMemberPermissions } from "@/lib/server-auth";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; userId: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: serverId, userId: targetUserId } = await context.params;
  const { isMember, permissions } = await getServerMemberPermissions(serverId, user.id);
  if (!isMember || (!permissions.administrator && !permissions.manageRoles)) {
    return NextResponse.json(
      { error: "You do not have permission to assign roles." },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as { roleIds?: string[] };
    const requestedIds = Array.isArray(body.roleIds) ? body.roleIds : [];

    const db = getDb();
    let validRoleIds: string[] = [];
    if (requestedIds.length > 0) {
      const validRows = await db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.serverId, serverId),
            eq(roles.isDefault, false),
            inArray(roles.id, requestedIds)
          )
        );
      validRoleIds = validRows.map((r) => r.id);
    }

    await db
      .delete(memberRoles)
      .where(
        and(eq(memberRoles.serverId, serverId), eq(memberRoles.userId, targetUserId))
      );

    if (validRoleIds.length > 0) {
      await db
        .insert(memberRoles)
        .values(
          validRoleIds.map((roleId) => ({
            serverId,
            userId: targetUserId,
            roleId,
          }))
        )
        .onConflictDoNothing();
    }

    return NextResponse.json({ ok: true, userId: targetUserId, roleIds: validRoleIds });
  } catch (error) {
    console.error("[member roles PUT]", error);
    return NextResponse.json({ error: "Failed to update member roles." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; userId: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: serverId, userId: targetUserId } = await context.params;
  const { isMember, permissions } = await getServerMemberPermissions(serverId, user.id);
  if (!isMember || (!permissions.administrator && !permissions.kickMembers)) {
    return NextResponse.json(
      { error: "You do not have permission to kick members." },
      { status: 403 }
    );
  }

  const db = getDb();
  const [srv] = await db
    .select({ ownerId: servers.ownerId })
    .from(servers)
    .where(eq(servers.id, serverId))
    .limit(1);

  if (srv?.ownerId === targetUserId) {
    return NextResponse.json(
      { error: "Cannot kick the server owner." },
      { status: 400 }
    );
  }

  await Promise.all([
    db
      .delete(serverMembers)
      .where(
        and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, targetUserId))
      ),
    db
      .delete(memberRoles)
      .where(
        and(eq(memberRoles.serverId, serverId), eq(memberRoles.userId, targetUserId))
      ),
  ]);

  return NextResponse.json({ ok: true, userId: targetUserId });
}
