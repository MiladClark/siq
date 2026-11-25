import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { dmConversations, messages } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { updateMessageSchema } from "@/lib/validators";

async function verifyDmParticipant(dmId: string, userId: string) {
  const db = getDb();
  const [conv] = await db
    .select()
    .from(dmConversations)
    .where(eq(dmConversations.id, dmId))
    .limit(1);
  if (!conv) return null;
  if (conv.userAId !== userId && conv.userBId !== userId) return null;
  return conv;
}

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

  const { id: dmId, messageId } = await context.params;
  const conv = await verifyDmParticipant(dmId, user.id);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
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
      .where(and(eq(messages.id, messageId), eq(messages.dmConversationId, dmId)))
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
    console.error("[dm messages PATCH]", error);
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

  const { id: dmId, messageId } = await context.params;
  const conv = await verifyDmParticipant(dmId, user.id);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.dmConversationId, dmId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  if (existing.authorId !== user.id) {
    return NextResponse.json(
      { error: "You can only delete your own messages." },
      { status: 403 }
    );
  }

  await db.delete(messages).where(eq(messages.id, messageId));
  return NextResponse.json({ ok: true, id: messageId });
}
