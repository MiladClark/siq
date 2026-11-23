import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { channels, messages, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import type { MessageItem, MessageReplyPreview } from "@/lib/types";
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
  }>
): Promise<MessageItem[]> {
  const replyIds = Array.from(
    new Set(
      rows
        .map((r) => r.message.replyToId)
        .filter((id): id is string => Boolean(id))
    )
  );

  const replyMap = new Map<string, MessageReplyPreview>();
  if (replyIds.length > 0) {
    const db = getDb();
    const replyRows = await db
      .select({
        id: messages.id,
        content: messages.content,
        attachments: messages.attachments,
        authorDisplayName: users.displayName,
      })
      .from(messages)
      .innerJoin(users, eq(messages.authorId, users.id))
      .where(inArray(messages.id, replyIds));

    for (const r of replyRows) {
      replyMap.set(r.id, {
        id: r.id,
        content: r.content,
        authorDisplayName: r.authorDisplayName,
        hasAttachments: (r.attachments?.length ?? 0) > 0,
      });
    }
  }

  return rows.map(({ message, author }) => ({
    id: message.id,
    channelId: message.channelId,
    content: message.content,
    replyToId: message.replyToId,
    replyTo: message.replyToId ? (replyMap.get(message.replyToId) ?? null) : null,
    attachments: message.attachments ?? [],
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

  try {
    const db = getDb();

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
        .limit(50);

      const items = await hydrateMessages(rows);
      return NextResponse.json({ messages: items });
    }

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
      .limit(80);

    const items = await hydrateMessages(latestDesc.reverse());
    return NextResponse.json({ messages: items });
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

    const [hydrated] = await hydrateMessages([
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
    ]);

    return NextResponse.json({ message: hydrated }, { status: 201 });
  } catch (error) {
    console.error("[messages POST]", error);
    return NextResponse.json({ error: "Failed to send message." }, { status: 500 });
  }
}
