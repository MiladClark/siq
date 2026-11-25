import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { channels } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getServerMemberPermissions } from "@/lib/server-auth";
import { updateChannelSchema } from "@/lib/validators";

async function canManageExistingChannel(
  channel: typeof channels.$inferSelect,
  user: { id: string; role: "admin" | "member" }
): Promise<boolean> {
  if (channel.serverId) {
    const { isMember, permissions } = await getServerMemberPermissions(
      channel.serverId,
      user.id
    );
    if (isMember && (permissions.administrator || permissions.manageChannels)) {
      return true;
    }
  }
  return user.role === "admin" || channel.createdById === user.id;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const db = getDb();

  const [existing] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  if (!(await canManageExistingChannel(existing, user))) {
    return NextResponse.json(
      { error: "You do not have permission to edit this channel." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = updateChannelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid channel update." },
        { status: 400 }
      );
    }

    const updates: Partial<typeof channels.$inferInsert> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) {
      updates.description = parsed.data.description?.trim() || null;
    }
    if (parsed.data.categoryId !== undefined) updates.categoryId = parsed.data.categoryId;
    if (parsed.data.isPrivate !== undefined) updates.isPrivate = parsed.data.isPrivate;
    if (parsed.data.allowedRoleIds !== undefined) {
      updates.allowedRoleIds = parsed.data.allowedRoleIds;
    }

    const [updated] = await db
      .update(channels)
      .set(updates)
      .where(eq(channels.id, id))
      .returning();

    return NextResponse.json({
      channel: {
        id: updated.id,
        serverId: updated.serverId,
        categoryId: updated.categoryId,
        name: updated.name,
        slug: updated.slug,
        type: updated.type,
        description: updated.description,
        isPrivate: Boolean(updated.isPrivate),
        allowedRoleIds: updated.allowedRoleIds ?? [],
        position: updated.position,
        createdById: updated.createdById,
      },
    });
  } catch (error) {
    console.error("[channels PATCH]", error);
    return NextResponse.json({ error: "Failed to update channel." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const db = getDb();

  const [existing] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  if (!(await canManageExistingChannel(existing, user))) {
    return NextResponse.json(
      { error: "You do not have permission to delete this channel." },
      { status: 403 }
    );
  }

  await db.delete(channels).where(eq(channels.id, id));
  return NextResponse.json({ ok: true, id });
}
