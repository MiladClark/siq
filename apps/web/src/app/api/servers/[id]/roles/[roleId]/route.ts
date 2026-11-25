import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { roles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getServerMemberPermissions } from "@/lib/server-auth";
import { updateRoleSchema } from "@/lib/validators";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; roleId: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: serverId, roleId } = await context.params;
  const { isMember, permissions } = await getServerMemberPermissions(serverId, user.id);
  if (!isMember || (!permissions.administrator && !permissions.manageRoles)) {
    return NextResponse.json(
      { error: "You do not have permission to edit roles." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid role update." },
        { status: 400 }
      );
    }

    const db = getDb();
    const [existing] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.serverId, serverId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }

    const updates: Partial<typeof roles.$inferInsert> = {};
    if (parsed.data.name !== undefined && !existing.isDefault) {
      updates.name = parsed.data.name;
    }
    if (parsed.data.color !== undefined) updates.color = parsed.data.color;
    if (parsed.data.position !== undefined) updates.position = parsed.data.position;
    if (parsed.data.permissions !== undefined) {
      updates.permissions = {
        ...(existing.permissions ?? {}),
        ...parsed.data.permissions,
      };
    }

    const [updated] = await db
      .update(roles)
      .set(updates)
      .where(eq(roles.id, roleId))
      .returning();

    return NextResponse.json({ role: updated });
  } catch (error) {
    console.error("[roles PATCH]", error);
    return NextResponse.json({ error: "Failed to update role." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; roleId: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: serverId, roleId } = await context.params;
  const { isMember, permissions } = await getServerMemberPermissions(serverId, user.id);
  if (!isMember || (!permissions.administrator && !permissions.manageRoles)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.serverId, serverId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Role not found." }, { status: 404 });
  }
  if (existing.isDefault) {
    return NextResponse.json(
      { error: "The @everyone role cannot be deleted." },
      { status: 400 }
    );
  }

  await db.delete(roles).where(eq(roles.id, roleId));
  return NextResponse.json({ ok: true, id: roleId });
}
