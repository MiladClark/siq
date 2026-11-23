import { asc, count, desc, eq, inArray, or } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db";
import { ensureAppSchema } from "@/db/ensure-schema";
import {
  channelCategories,
  channels,
  dmConversations,
  friendships,
  memberRoles,
  messages,
  roles,
  serverMembers,
  servers,
  users,
} from "@/db/schema";
import { serializeUser } from "@/lib/auth";
import { fetchVoiceOccupancySnapshot, isLiveKitConfigured } from "@/lib/livekit";
import { canUserAccessChannel, computeEffectivePermissions } from "@/lib/permissions";
import { isBlobStorageConfigured } from "@/lib/storage";
import type {
  ChannelItem,
  DmConversationItem,
  FriendItem,
  PublicUser,
  ServerDetail,
  VoiceOccupancyMap,
  VoiceRoomCreatedAtMap,
} from "@/lib/types";

export type { ChannelItem };

export interface AuthBootstrapState {
  dbConfigured: boolean;
  schemaReady: boolean;
  hasUsers: boolean;
  dbError?: string;
}

export async function getAuthBootstrapState(): Promise<AuthBootstrapState> {
  if (!isDatabaseConfigured()) {
    return {
      dbConfigured: false,
      schemaReady: false,
      hasUsers: false,
    };
  }

  try {
    await ensureAppSchema();
    const db = getDb();
    const [{ total }] = await db.select({ total: count() }).from(users);
    return {
      dbConfigured: true,
      schemaReady: true,
      hasUsers: total > 0,
    };
  } catch (error) {
    return {
      dbConfigured: true,
      schemaReady: false,
      hasUsers: false,
      dbError: error instanceof Error ? error.message : "Database error",
    };
  }
}

export async function loadUserServers(userId: string): Promise<ServerDetail[]> {
  const db = getDb();

  const memberships = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(eq(serverMembers.userId, userId));

  const serverIds = memberships.map((m) => m.serverId);
  if (serverIds.length === 0) return [];

  const [serverRows, allMemberRows, roleRows, memberRoleRows, categoryRows, channelRows] =
    await Promise.all([
      db
        .select()
        .from(servers)
        .where(inArray(servers.id, serverIds))
        .orderBy(desc(servers.isDefault), asc(servers.createdAt)),
      db
        .select({ serverId: serverMembers.serverId, userId: serverMembers.userId })
        .from(serverMembers)
        .where(inArray(serverMembers.serverId, serverIds)),
      db
        .select()
        .from(roles)
        .where(inArray(roles.serverId, serverIds))
        .orderBy(desc(roles.position), asc(roles.createdAt)),
      db
        .select()
        .from(memberRoles)
        .where(inArray(memberRoles.serverId, serverIds)),
      db
        .select()
        .from(channelCategories)
        .where(inArray(channelCategories.serverId, serverIds))
        .orderBy(asc(channelCategories.position), asc(channelCategories.createdAt)),
      db
        .select()
        .from(channels)
        .where(inArray(channels.serverId, serverIds))
        .orderBy(asc(channels.type), asc(channels.position), asc(channels.createdAt)),
    ]);

  return serverRows.map((srv) => {
    const srvMembers = allMemberRows
      .filter((m) => m.serverId === srv.id)
      .map((m) => m.userId);
    const srvRoles = roleRows
      .filter((r) => r.serverId === srv.id)
      .map((r) => ({
        id: r.id,
        serverId: r.serverId,
        name: r.name,
        color: r.color,
        position: r.position,
        permissions: r.permissions ?? {},
        isDefault: r.isDefault,
      }));

    const memberRoleIds: Record<string, string[]> = {};
    for (const mr of memberRoleRows) {
      if (mr.serverId !== srv.id) continue;
      if (!memberRoleIds[mr.userId]) memberRoleIds[mr.userId] = [];
      memberRoleIds[mr.userId].push(mr.roleId);
    }

    const myRoleIds = memberRoleIds[userId] ?? [];
    const myPerms = computeEffectivePermissions({
      userId,
      ownerId: srv.ownerId,
      serverRoles: srvRoles,
      assignedRoleIds: myRoleIds,
    });

    const visibleChannels: ChannelItem[] = channelRows
      .filter((ch) => ch.serverId === srv.id)
      .map((ch) => ({
        id: ch.id,
        serverId: ch.serverId,
        categoryId: ch.categoryId,
        name: ch.name,
        slug: ch.slug,
        type: ch.type,
        description: ch.description,
        isPrivate: Boolean(ch.isPrivate),
        allowedRoleIds: ch.allowedRoleIds ?? [],
        position: ch.position,
        createdById: ch.createdById,
      }))
      .filter((ch) =>
        canUserAccessChannel({
          channel: ch,
          permissions: myPerms,
          assignedRoleIds: myRoleIds,
        })
      );

    return {
      id: srv.id,
      name: srv.name,
      tag: srv.tag ?? null,
      iconUrl: srv.iconUrl ?? null,
      bannerUrl: srv.bannerUrl ?? null,
      accentColor: srv.accentColor,
      ownerId: srv.ownerId,
      isDefault: srv.isDefault,
      createdAt: srv.createdAt.toISOString(),
      categories: categoryRows
        .filter((cat) => cat.serverId === srv.id)
        .map((cat) => ({
          id: cat.id,
          serverId: cat.serverId,
          name: cat.name,
          position: cat.position,
        })),
      channels: visibleChannels,
      roles: srvRoles,
      memberIds: srvMembers,
      memberRoleIds,
    };
  });
}

export async function loadUserFriends(
  userId: string,
  userMap: Map<string, PublicUser>
): Promise<FriendItem[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(friendships)
    .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))
    .orderBy(desc(friendships.updatedAt));

  const items: FriendItem[] = [];
  for (const row of rows) {
    const otherId = row.requesterId === userId ? row.addresseeId : row.requesterId;
    const otherUser = userMap.get(otherId);
    if (!otherUser) continue;

    let direction: FriendItem["direction"] = "friend";
    if (row.status === "blocked") {
      if (row.requesterId !== userId) continue; // Only show blocks initiated by self
      direction = "blocked";
    } else if (row.status === "pending") {
      direction = row.requesterId === userId ? "outgoing" : "incoming";
    }

    items.push({
      friendshipId: row.id,
      status: row.status,
      direction,
      user: otherUser,
      createdAt: row.createdAt.toISOString(),
    });
  }
  return items;
}

export async function loadUserDms(
  userId: string,
  userMap: Map<string, PublicUser>
): Promise<DmConversationItem[]> {
  const db = getDb();
  const convRows = await db
    .select()
    .from(dmConversations)
    .where(or(eq(dmConversations.userAId, userId), eq(dmConversations.userBId, userId)))
    .orderBy(desc(dmConversations.lastMessageAt));

  if (convRows.length === 0) return [];

  const convIds = convRows.map((c) => c.id);
  const recentDmMsgs = await db
    .select({
      dmConversationId: messages.dmConversationId,
      content: messages.content,
      attachments: messages.attachments,
      authorId: messages.authorId,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.dmConversationId, convIds))
    .orderBy(desc(messages.createdAt))
    .limit(Math.max(50, convIds.length * 3));

  const lastMsgMap = new Map<
    string,
    { preview: string; authorId: string }
  >();
  for (const m of recentDmMsgs) {
    if (!m.dmConversationId || lastMsgMap.has(m.dmConversationId)) continue;
    lastMsgMap.set(m.dmConversationId, {
      preview:
        m.content?.trim() ||
        ((m.attachments?.length ?? 0) > 0 ? "Sent an attachment" : ""),
      authorId: m.authorId,
    });
  }

  const result: DmConversationItem[] = [];
  for (const conv of convRows) {
    const peerId = conv.userAId === userId ? conv.userBId : conv.userAId;
    const peer = userMap.get(peerId);
    if (!peer) continue;
    const last = lastMsgMap.get(conv.id);
    result.push({
      id: conv.id,
      peer,
      lastMessageAt: conv.lastMessageAt.toISOString(),
      lastMessagePreview: last?.preview ?? null,
      lastMessageAuthorId: last?.authorId ?? null,
      createdAt: conv.createdAt.toISOString(),
    });
  }
  return result;
}

export async function getWorkspaceInitialData(userId: string): Promise<{
  servers: ServerDetail[];
  friends: FriendItem[];
  dmConversations: DmConversationItem[];
  members: PublicUser[];
  voiceOccupancy: VoiceOccupancyMap;
  voiceRoomCreatedAt: VoiceRoomCreatedAtMap;
  capabilities: {
    livekitReady: boolean;
    blobReady: boolean;
  };
}> {
  await ensureAppSchema();
  const db = getDb();

  const [memberRows, voiceSnap, userServers] = await Promise.all([
    db.select().from(users).orderBy(asc(users.createdAt)),
    fetchVoiceOccupancySnapshot(),
    loadUserServers(userId),
  ]);

  const serializedMembers = memberRows.map(serializeUser);
  const userMap = new Map<string, PublicUser>(
    serializedMembers.map((m) => [m.id, m])
  );

  const [friends, dms] = await Promise.all([
    loadUserFriends(userId, userMap),
    loadUserDms(userId, userMap),
  ]);

  return {
    servers: userServers,
    friends,
    dmConversations: dms,
    members: serializedMembers,
    voiceOccupancy: voiceSnap?.occupancy ?? {},
    voiceRoomCreatedAt: voiceSnap?.roomCreatedAt ?? {},
    capabilities: {
      livekitReady: isLiveKitConfigured(),
      blobReady: isBlobStorageConfigured(),
    },
  };
}
