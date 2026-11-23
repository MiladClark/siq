import { and, asc, desc, eq, gt, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { channels, messages, users } from "@/db/schema";
import { getCurrentUser, serializeUser } from "@/lib/auth";
import { fetchVoiceOccupancy, isLiveKitConfigured } from "@/lib/livekit";
import { isBlobStorageConfigured } from "@/lib/storage";

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sinceParam = searchParams.get("since");
  const sinceDate = sinceParam ? new Date(sinceParam) : null;
  const validSince = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null;

  try {
    const db = getDb();
    const now = new Date();

    await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, user.id));

    const [memberRows, channelRows, voiceOccupancy, recentMessageRows] = await Promise.all([
      db.select().from(users).orderBy(asc(users.createdAt)),
      db
        .select()
        .from(channels)
        .orderBy(asc(channels.type), asc(channels.position), asc(channels.createdAt)),
      fetchVoiceOccupancy(),
      validSince
        ? db
            .select({
              id: messages.id,
              channelId: messages.channelId,
              channelName: channels.name,
              content: messages.content,
              attachments: messages.attachments,
              createdAt: messages.createdAt,
              authorId: users.id,
              authorDisplayName: users.displayName,
              authorAvatarColor: users.avatarColor,
              authorAvatarUrl: users.avatarUrl,
            })
            .from(messages)
            .innerJoin(channels, eq(messages.channelId, channels.id))
            .innerJoin(users, eq(messages.authorId, users.id))
            .where(and(gt(messages.createdAt, validSince), ne(messages.authorId, user.id)))
            .orderBy(desc(messages.createdAt))
            .limit(15)
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      serverTime: now.toISOString(),
      members: memberRows.map(serializeUser),
      channels: channelRows.map((ch) => ({
        id: ch.id,
        name: ch.name,
        slug: ch.slug,
        type: ch.type,
        description: ch.description,
        position: ch.position,
        createdById: ch.createdById,
      })),
      voiceOccupancy,
      recentNotifications: recentMessageRows.reverse().map((m) => ({
        id: m.id,
        channelId: m.channelId,
        channelName: m.channelName,
        authorId: m.authorId,
        authorDisplayName: m.authorDisplayName,
        authorAvatarColor: m.authorAvatarColor,
        authorAvatarUrl: m.authorAvatarUrl,
        content: m.content,
        hasAttachments: (m.attachments?.length ?? 0) > 0,
        createdAt: m.createdAt.toISOString(),
        read: false,
      })),
      capabilities: {
        livekitReady: isLiveKitConfigured(),
        blobReady: isBlobStorageConfigured(),
      },
    });
  } catch (error) {
    console.error("[presence GET]", error);
    return NextResponse.json({ error: "Failed to sync presence." }, { status: 500 });
  }
}
