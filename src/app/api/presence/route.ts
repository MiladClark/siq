import { and, asc, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { channels, messages, users } from "@/db/schema";
import { getCurrentUser, serializeUser } from "@/lib/auth";
import { fetchVoiceOccupancySnapshot, isLiveKitConfigured } from "@/lib/livekit";
import { mentionsUsername } from "@/lib/mentions";
import { isBlobStorageConfigured } from "@/lib/storage";
import {
  loadUserDms,
  loadUserFriends,
  loadUserServers,
} from "@/lib/workspace-data";

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

    const [memberRows, voiceSnap, userServers] = await Promise.all([
      db.select().from(users).orderBy(asc(users.createdAt)),
      fetchVoiceOccupancySnapshot(),
      loadUserServers(user.id),
    ]);

    const serializedMembers = memberRows.map(serializeUser);
    const userMap = new Map(serializedMembers.map((m) => [m.id, m]));

    const [friends, dms] = await Promise.all([
      loadUserFriends(user.id, userMap),
      loadUserDms(user.id, userMap),
    ]);

    const visibleChannelIds = userServers.flatMap((s) => s.channels.map((c) => c.id));
    const userDmIds = dms.map((d) => d.id);

    const [recentChannelRows, recentDmRows] = await Promise.all([
      validSince && visibleChannelIds.length > 0
        ? db
            .select({
              id: messages.id,
              channelId: messages.channelId,
              serverId: channels.serverId,
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
            .where(
              and(
                inArray(messages.channelId, visibleChannelIds),
                gt(messages.createdAt, validSince),
                ne(messages.authorId, user.id)
              )
            )
            .orderBy(desc(messages.createdAt))
            .limit(15)
        : Promise.resolve([]),
      validSince && userDmIds.length > 0
        ? db
            .select({
              id: messages.id,
              dmConversationId: messages.dmConversationId,
              content: messages.content,
              attachments: messages.attachments,
              createdAt: messages.createdAt,
              authorId: users.id,
              authorDisplayName: users.displayName,
              authorAvatarColor: users.avatarColor,
              authorAvatarUrl: users.avatarUrl,
            })
            .from(messages)
            .innerJoin(users, eq(messages.authorId, users.id))
            .where(
              and(
                inArray(messages.dmConversationId, userDmIds),
                gt(messages.createdAt, validSince),
                ne(messages.authorId, user.id)
              )
            )
            .orderBy(desc(messages.createdAt))
            .limit(15)
        : Promise.resolve([]),
    ]);

    const combinedNotifications = [
      ...recentChannelRows.map((m) => ({
        id: m.id,
        kind: "message" as const,
        mentioned: mentionsUsername(m.content, user.username),
        channelId: m.channelId ?? "",
        dmConversationId: null,
        serverId: m.serverId ?? null,
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
      ...recentDmRows.map((m) => ({
        id: m.id,
        kind: "message" as const,
        mentioned: mentionsUsername(m.content, user.username),
        channelId: "",
        dmConversationId: m.dmConversationId ?? null,
        serverId: null,
        channelName: "Direct Message",
        authorId: m.authorId,
        authorDisplayName: m.authorDisplayName,
        authorAvatarColor: m.authorAvatarColor,
        authorAvatarUrl: m.authorAvatarUrl,
        content: m.content,
        hasAttachments: (m.attachments?.length ?? 0) > 0,
        createdAt: m.createdAt.toISOString(),
        read: false,
      })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return NextResponse.json(
      {
        serverTime: now.toISOString(),
        members: serializedMembers,
        servers: userServers,
        friends,
        dmConversations: dms,
        voiceOccupancy: voiceSnap ? voiceSnap.occupancy : null,
        voiceRoomCreatedAt: voiceSnap ? voiceSnap.roomCreatedAt : null,
        recentNotifications: combinedNotifications,
        capabilities: {
          livekitReady: isLiveKitConfigured(),
          blobReady: isBlobStorageConfigured(),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[presence GET]", error);
    return NextResponse.json({ error: "Failed to sync presence." }, { status: 500 });
  }
}
