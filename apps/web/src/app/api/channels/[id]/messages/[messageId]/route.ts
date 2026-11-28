import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { messages } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getChannelAccess } from "@/lib/server-auth";
import { updateMessageSchema } from "@/lib/validators";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; messageId: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: channelId, messageId } = await context.params;
  const access = await getChannelAccess(channelId, user);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const body = await request.json();
    const parsed = updateMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid message update." },
        { status: 400 }
      );
    }

    const db = getDb();
    const [existing] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.channelId, channelId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }

    const updates: Partial<typeof messages.$inferInsert> = {};

    if (parsed.data.content !== undefined) {
      if (existing.authorId !== user.id) {
        return NextResponse.json(
          { error: "You can only edit your own messages." },
          { status: 403 }
        );
      }
      updates.content = parsed.data.content;
      updates.editedAt = new Date();
    }

    if (parsed.data.pinned !== undefined) {
      if (existing.authorId !== user.id && !access.canModerate) {
        return NextResponse.json(
          { error: "Only the author or members with Manage Messages can pin this message." },
          { status: 403 }
        );
      }
      updates.pinned = parsed.data.pinned;
      updates.pinnedAt = parsed.data.pinned ? new Date() : null;
      updates.pinnedById = parsed.data.pinned ? user.id : null;
    }

    const [updated] = await db
      .update(messages)
      .set(updates)
      .where(eq(messages.id, messageId))
      .returning();

    return NextResponse.json({
      message: {
        id: updated.id,
        content: updated.content,
        editedAt: updated.editedAt ? updated.editedAt.toISOString() : null,
        pinned: Boolean(updated.pinned),
        pinnedAt: updated.pinnedAt ? updated.pinnedAt.toISOString() : null,
      },
    });
  } catch (error) {
    console.error("[messages PATCH]", error);
    return NextResponse.json({ error: "Failed to update message." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; messageId: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: channelId, messageId } = await context.params;
  const access = await getChannelAccess(channelId, user);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const db = getDb();

  const [existing] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.channelId, channelId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  if (existing.authorId !== user.id && !access.canModerate) {
    return NextResponse.json(
      { error: "You can only delete your own messages." },
      { status: 403 }
    );
  }

  await db.delete(messages).where(eq(messages.id, messageId));
  return NextResponse.json({ ok: true, id: messageId });
}
