import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { messageReactions, messages } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import type { MessageReactionSummary } from "@siq/shared/lib/types";
import { toggleReactionSchema } from "@/lib/validators";

export async function POST(
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

  const { id: messageId } = await context.params;

  try {
    const body = await request.json();
    const parsed = toggleReactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid reaction." },
        { status: 400 }
      );
    }

    const db = getDb();
    const [msg] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!msg) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }

    const emoji = parsed.data.emoji;
    const [existing] = await db
      .select({ id: messageReactions.id })
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, user.id),
          eq(messageReactions.emoji, emoji)
        )
      )
      .limit(1);

    if (existing) {
      await db.delete(messageReactions).where(eq(messageReactions.id, existing.id));
    } else {
      await db
        .insert(messageReactions)
        .values({ messageId, userId: user.id, emoji })
        .onConflictDoNothing();
    }

    const allRows = await db
      .select({
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
      })
      .from(messageReactions)
      .where(eq(messageReactions.messageId, messageId))
      .orderBy(asc(messageReactions.createdAt));

    const byEmoji = new Map<string, MessageReactionSummary>();
    for (const r of allRows) {
      let item = byEmoji.get(r.emoji);
      if (!item) {
        item = { emoji: r.emoji, count: 0, userIds: [], reactedByMe: false };
        byEmoji.set(r.emoji, item);
      }
      item.count += 1;
      item.userIds.push(r.userId);
      if (r.userId === user.id) {
        item.reactedByMe = true;
      }
    }

    return NextResponse.json({
      messageId,
      reactions: Array.from(byEmoji.values()),
    });
  } catch (error) {
    console.error("[reactions POST]", error);
    return NextResponse.json({ error: "Failed to toggle reaction." }, { status: 500 });
  }
}
