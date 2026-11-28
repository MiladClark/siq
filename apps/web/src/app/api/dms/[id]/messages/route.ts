import { and, asc, desc, eq, gte, ilike, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { dmConversations, messages, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { hydrateMessagesList, isValidReplyTarget } from "@/lib/server-auth";
import { createMessageSchema } from "@/lib/validators";

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

// Cursors arrive with millisecond precision (JS ISO strings) while Postgres stores microseconds:
// "after" starts at the next millisecond so the last known message is not re-sent every poll,
// "before" includes the whole boundary millisecond so no message is ever skipped (the client
// de-duplicates by id).
function nextMillisecond(date: Date): Date {
  return new Date(date.getTime() + 1);
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

  const { id: dmId } = await context.params;
  const conv = await verifyDmParticipant(dmId, user.id);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const afterParam = searchParams.get("after");
  const beforeParam = searchParams.get("before");
  const pinnedParam = searchParams.get("pinned");
  const searchQuery = searchParams.get("q")?.trim() ?? "";

  try {
    const db = getDb();
    const authorSelect = {
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarColor: users.avatarColor,
      avatarUrl: users.avatarUrl,
      bannerUrl: users.bannerUrl,
      role: users.role,
    };

    if (pinnedParam === "true") {
      const rows = await db
        .select({ message: messages, author: authorSelect })
        .from(messages)
        .innerJoin(users, eq(messages.authorId, users.id))
        .where(and(eq(messages.dmConversationId, dmId), eq(messages.pinned, true)))
        .orderBy(desc(messages.pinnedAt), desc(messages.createdAt))
        .limit(50);

      const items = await hydrateMessagesList(rows, user.id);
      return NextResponse.json(
        { messages: items },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (searchQuery) {
      const escaped = searchQuery.replace(/[%_\\]/g, "\\$&");
      const rows = await db
        .select({ message: messages, author: authorSelect })
        .from(messages)
        .innerJoin(users, eq(messages.authorId, users.id))
        .where(
          and(
            eq(messages.dmConversationId, dmId),
            ilike(messages.content, `%${escaped}%`)
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(40);

      const items = await hydrateMessagesList(rows, user.id);
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
        .select({ message: messages, author: authorSelect })
        .from(messages)
        .innerJoin(users, eq(messages.authorId, users.id))
        .where(
          and(eq(messages.dmConversationId, dmId), gte(messages.createdAt, nextMillisecond(afterDate)))
        )
        .orderBy(asc(messages.createdAt))
        .limit(80);

      const items = await hydrateMessagesList(rows, user.id);
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
        .select({ message: messages, author: authorSelect })
        .from(messages)
        .innerJoin(users, eq(messages.authorId, users.id))
        .where(
          and(eq(messages.dmConversationId, dmId), lt(messages.createdAt, nextMillisecond(beforeDate)))
        )
        .orderBy(desc(messages.createdAt))
        .limit(PAGE_SIZE + 1);

      const hasMore = olderDesc.length > PAGE_SIZE;
      const slice = hasMore ? olderDesc.slice(0, PAGE_SIZE) : olderDesc;
      const items = await hydrateMessagesList(slice.reverse(), user.id);
      return NextResponse.json(
        { messages: items, hasMore },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const INITIAL_LIMIT = 80;
    const latestDesc = await db
      .select({ message: messages, author: authorSelect })
      .from(messages)
      .innerJoin(users, eq(messages.authorId, users.id))
      .where(eq(messages.dmConversationId, dmId))
      .orderBy(desc(messages.createdAt))
      .limit(INITIAL_LIMIT + 1);

    const hasMore = latestDesc.length > INITIAL_LIMIT;
    const slice = hasMore ? latestDesc.slice(0, INITIAL_LIMIT) : latestDesc;
    const items = await hydrateMessagesList(slice.reverse(), user.id);
    return NextResponse.json(
      { messages: items, hasMore },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[dm messages GET]", error);
    return NextResponse.json({ error: "Failed to load direct messages." }, { status: 500 });
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

  const { id: dmId } = await context.params;
  const conv = await verifyDmParticipant(dmId, user.id);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  try {
    const body = await request.json();
    const parsed = createMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid message." },
        { status: 400 }
      );
    }

    if (!(await isValidReplyTarget(parsed.data.replyToId, { dmConversationId: dmId }))) {
      return NextResponse.json(
        { error: "The message you replied to is not in this conversation." },
        { status: 400 }
      );
    }

    const db = getDb();
    const now = new Date();
    const [created] = await db
      .insert(messages)
      .values({
        channelId: null,
        dmConversationId: dmId,
        authorId: user.id,
        content: parsed.data.content.trim(),
        replyToId: parsed.data.replyToId,
        attachments: parsed.data.attachments,
      })
      .returning();

    await Promise.all([
      db
        .update(dmConversations)
        .set({ lastMessageAt: now })
        .where(eq(dmConversations.id, dmId)),
      db.update(users).set({ lastSeenAt: now }).where(eq(users.id, user.id)),
    ]);

    const [hydrated] = await hydrateMessagesList(
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
    console.error("[dm messages POST]", error);
    return NextResponse.json({ error: "Failed to send direct message." }, { status: 500 });
  }
}
