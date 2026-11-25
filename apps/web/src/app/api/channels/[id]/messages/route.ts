import { and, asc, desc, eq, gt, ilike, inArray, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { channels, messageReactions, messages, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import type {
  MessageItem,
  MessageReactionSummary,
  MessageReplyPreview,
} from "@siq/shared/lib/types";
import { createMessageSchema } from "@/lib/validators";

async function hydrateMessages(
  rows: Array<{
    message: typeof messages.$inferSelect;
    author: {
      id: string;
      username: string;
      displayName: string;
      avatarColor: string;
      avatarUrl: string | null;
      bannerUrl: string | null;
      role: "admin" | "member";
    };
  }>,
  currentUserId: string
): Promise<MessageItem[]> {
  if (rows.length === 0) return [];

  const db = getDb();
  const messageIds = rows.map((r) => r.message.id);
  const replyIds = Array.from(
    new Set(
      rows
        .map((r) => r.message.replyToId)
        .filter((id): id is string => Boolean(id))
    )
  );

  const [replyRows, reactionRows] = await Promise.all([
    replyIds.length > 0
      ? db
          .select({
            id: messages.id,
            content: messages.content,
            attachments: messages.attachments,
            authorDisplayName: users.displayName,
          })
          .from(messages)
          .innerJoin(users, eq(messages.authorId, users.id))
          .where(inArray(messages.id, replyIds))
      : Promise.resolve([]),
    db
      .select({
        messageId: messageReactions.messageId,
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
        createdAt: messageReactions.createdAt,
      })
      .from(messageReactions)
      .where(inArray(messageReactions.messageId, messageIds))
      .orderBy(asc(messageReactions.createdAt)),
  ]);

  const replyMap = new Map<string, MessageReplyPreview>();
  for (const r of replyRows) {
    replyMap.set(r.id, {
      id: r.id,
      content: r.content,
      authorDisplayName: r.authorDisplayName,
      hasAttachments: (r.attachments?.length ?? 0) > 0,
    });
  }

  const reactionsByMessage = new Map<string, MessageReactionSummary[]>();
  const bucketMap = new Map<string, Map<string, MessageReactionSummary>>();

  for (const row of reactionRows) {
    let byEmoji = bucketMap.get(row.messageId);
    if (!byEmoji) {
      byEmoji = new Map();
      bucketMap.set(row.messageId, byEmoji);
    }
    let summary = byEmoji.get(row.emoji);
    if (!summary) {
      summary = {
        emoji: row.emoji,
        count: 0,
        userIds: [],
        reactedByMe: false,
      };
      byEmoji.set(row.emoji, summary);
    }
    summary.count += 1;
    summary.userIds.push(row.userId);
    if (row.userId === currentUserId) {
      summary.reactedByMe = true;
    }
  }

  bucketMap.forEach((byEmoji, msgId) => {
    reactionsByMessage.set(msgId, Array.from(byEmoji.values()));
  });

  return rows.map(({ message, author }) => ({
    id: message.id,
    channelId: message.channelId,
    content: message.content,
    replyToId: message.replyToId,
    replyTo: message.replyToId ? (replyMap.get(message.replyToId) ?? null) : null,
    attachments: message.attachments ?? [],
    pinned: Boolean(message.pinned),
    pinnedAt: message.pinnedAt ? message.pinnedAt.toISOString() : null,
    reactions: reactionsByMessage.get(message.id) ?? [],
    editedAt: message.editedAt ? message.editedAt.toISOString() : null,
    createdAt: message.createdAt.toISOString(),
    author,
  }));
}

export async function GET(
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

  const { id: channelId } = await context.params;
  const { searchParams } = new URL(request.url);
  const afterParam = searchParams.get("after");
  const beforeParam = searchParams.get("before");
  const pinnedParam = searchParams.get("pinned");
  const searchQuery = searchParams.get("q")?.trim() ?? "";

  try {
    const db = getDb();

    if (pinnedParam === "true") {
      const rows = await db
        .select({
          message: messages,
          author: {
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            avatarColor: users.avatarColor,
            avatarUrl: users.avatarUrl,
            bannerUrl: users.bannerUrl,
            role: users.role,
          },
        })
        .from(messages)
        .innerJoin(users, eq(messages.authorId, users.id))
        .where(and(eq(messages.channelId, channelId), eq(messages.pinned, true)))
        .orderBy(desc(messages.pinnedAt), desc(messages.createdAt))
        .limit(50);

      const items = await hydrateMessages(rows, user.id);
      return NextResponse.json(
        { messages: items },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (searchQuery) {
      const escaped = searchQuery.replace(/[%_\\]/g, "\\$&");
      const rows = await db
        .select({
          message: messages,
          author: {
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            avatarColor: users.avatarColor,
            avatarUrl: users.avatarUrl,
            bannerUrl: users.bannerUrl,
            role: users.role,
          },
        })
        .from(messages)
        .innerJoin(users, eq(messages.authorId, users.id))
        .where(
          and(
            eq(messages.channelId, channelId),
            ilike(messages.content, `%${escaped}%`)
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(40);

      const items = await hydrateMessages(rows, user.id);
      return NextResponse.json(
        { messages: items },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (afterParam) {
      const afterDate = new Date(afterParam);
      if (Number.isNaN(afterDate.getTime())) {
        return NextResponse.json({ error: "Invalid after timestamp." }, { status: 400 });
      }

      const rows = await db
        .select({
          message: messages,
          author: {
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            avatarColor: users.avatarColor,
            avatarUrl: users.avatarUrl,
            bannerUrl: users.bannerUrl,
            role: users.role,
          },
        })
        .from(messages)
        .innerJoin(users, eq(messages.authorId, users.id))
        .where(and(eq(messages.channelId, channelId), gt(messages.createdAt, afterDate)))
        .orderBy(asc(messages.createdAt))
        .limit(80);

      const items = await hydrateMessages(rows, user.id);
      return NextResponse.json(
        { messages: items },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (beforeParam) {
      const beforeDate = new Date(beforeParam);
      if (Number.isNaN(beforeDate.getTime())) {
        return NextResponse.json({ error: "Invalid before timestamp." }, { status: 400 });
      }

      const PAGE_SIZE = 50;
      const olderDesc = await db
        .select({
          message: messages,
          author: {
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            avatarColor: users.avatarColor,
            avatarUrl: users.avatarUrl,
            bannerUrl: users.bannerUrl,
            role: users.role,
          },
        })
        .from(messages)
        .innerJoin(users, eq(messages.authorId, users.id))
        .where(and(eq(messages.channelId, channelId), lt(messages.createdAt, beforeDate)))
        .orderBy(desc(messages.createdAt))
        .limit(PAGE_SIZE + 1);

      const hasMore = olderDesc.length > PAGE_SIZE;
      const slice = hasMore ? olderDesc.slice(0, PAGE_SIZE) : olderDesc;
      const items = await hydrateMessages(slice.reverse(), user.id);
      return NextResponse.json(
        { messages: items, hasMore },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const INITIAL_LIMIT = 80;
    const latestDesc = await db
      .select({
        message: messages,
        author: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarColor: users.avatarColor,
          avatarUrl: users.avatarUrl,
          bannerUrl: users.bannerUrl,
          role: users.role,
        },
      })
      .from(messages)
      .innerJoin(users, eq(messages.authorId, users.id))
      .where(eq(messages.channelId, channelId))
      .orderBy(desc(messages.createdAt))
      .limit(INITIAL_LIMIT + 1);

    const hasMore = latestDesc.length > INITIAL_LIMIT;
    const slice = hasMore ? latestDesc.slice(0, INITIAL_LIMIT) : latestDesc;
    const items = await hydrateMessages(slice.reverse(), user.id);
    return NextResponse.json(
      { messages: items, hasMore },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[messages GET]", error);
    return NextResponse.json({ error: "Failed to load messages." }, { status: 500 });
  }
}

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

  const { id: channelId } = await context.params;

  try {
    const body = await request.json();
    const parsed = createMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid message." },
        { status: 400 }
      );
    }

    const db = getDb();
    const [channel] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);

    if (!channel) {
      return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    }

    const [created] = await db
      .insert(messages)
      .values({
        channelId,
        authorId: user.id,
        content: parsed.data.content.trim(),
        replyToId: parsed.data.replyToId,
        attachments: parsed.data.attachments,
      })
      .returning();

    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, user.id));

    const [hydrated] = await hydrateMessages(
      [
        {
          message: created,
          author: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarColor: user.avatarColor,
            avatarUrl: user.avatarUrl,
            bannerUrl: user.bannerUrl,
            role: user.role,
          },
        },
      ],
      user.id
    );

    return NextResponse.json({ message: hydrated }, { status: 201 });
  } catch (error) {
    console.error("[messages POST]", error);
    return NextResponse.json({ error: "Failed to send message." }, { status: 500 });
  }
}
