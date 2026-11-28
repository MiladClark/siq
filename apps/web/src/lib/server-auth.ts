import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  channels,
  dmConversations,
  memberRoles,
  messageReactions,
  messages,
  roles,
  serverMembers,
  servers,
  users,
} from "@/db/schema";
import {
  canUserAccessChannel,
  computeEffectivePermissions,
  type EffectivePermissions,
} from "@siq/shared/lib/permissions";
import type {
  MessageItem,
  MessageReactionSummary,
  MessageReplyPreview,
} from "@siq/shared/lib/types";

export async function getServerMemberPermissions(
  serverId: string,
  userId: string
): Promise<{
  isMember: boolean;
  isOwner: boolean;
  permissions: EffectivePermissions;
  assignedRoleIds: string[];
}> {
  const db = getDb();
  const [serverRow] = await db
    .select({ id: servers.id, ownerId: servers.ownerId })
    .from(servers)
    .where(eq(servers.id, serverId))
    .limit(1);

  if (!serverRow) {
    return {
      isMember: false,
      isOwner: false,
      permissions: computeEffectivePermissions({
        userId,
        ownerId: null,
        serverRoles: [],
        assignedRoleIds: [],
      }),
      assignedRoleIds: [],
    };
  }

  const [membership, serverRoleRows, assignedRows] = await Promise.all([
    db
      .select({ id: serverMembers.id })
      .from(serverMembers)
      .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
      .limit(1),
    db.select().from(roles).where(eq(roles.serverId, serverId)),
    db
      .select({ roleId: memberRoles.roleId })
      .from(memberRoles)
      .where(and(eq(memberRoles.serverId, serverId), eq(memberRoles.userId, userId))),
  ]);

  const isMember = membership.length > 0;
  const isOwner = serverRow.ownerId === userId;
  const assignedRoleIds = assignedRows.map((r) => r.roleId);

  const permissions = computeEffectivePermissions({
    userId,
    ownerId: serverRow.ownerId,
    serverRoles: serverRoleRows,
    assignedRoleIds,
  });

  return { isMember, isOwner, permissions, assignedRoleIds };
}

export type ChannelAccess =
  | {
      ok: true;
      channel: typeof channels.$inferSelect;
      /** May post new messages (administrator or sendMessages) */
      canSend: boolean;
      /** May pin/delete other people's messages (administrator or manageMessages) */
      canModerate: boolean;
    }
  | { ok: false; status: 403 | 404; error: string };

/**
 * Server-side gate for every channel message endpoint. Mirrors the rules used by the
 * workspace bootstrap and the LiveKit token route: the caller must be a member of the
 * channel's server and pass the private-channel role check.
 */
export async function getChannelAccess(
  channelId: string,
  user: { id: string; role: "admin" | "member" }
): Promise<ChannelAccess> {
  const db = getDb();
  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!channel) return { ok: false, status: 404, error: "Channel not found." };

  if (!channel.serverId) {
    // Legacy workspace-wide channel (created before multi-server support)
    return { ok: true, channel, canSend: true, canModerate: user.role === "admin" };
  }

  const { isMember, permissions, assignedRoleIds } = await getServerMemberPermissions(
    channel.serverId,
    user.id
  );
  if (!isMember) {
    return { ok: false, status: 404, error: "Channel not found." };
  }
  const canAccess = canUserAccessChannel({
    channel: { isPrivate: Boolean(channel.isPrivate), allowedRoleIds: channel.allowedRoleIds ?? [] },
    permissions,
    assignedRoleIds,
  });
  if (!canAccess) {
    return { ok: false, status: 403, error: "You do not have access to this channel." };
  }
  return {
    ok: true,
    channel,
    canSend: permissions.administrator || permissions.sendMessages,
    canModerate: permissions.administrator || permissions.manageMessages,
  };
}

export async function verifyDmParticipant(dmId: string, userId: string) {
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

/** A reply must point at a message in the same conversation (prevents cross-channel leaks). */
export async function isValidReplyTarget(
  replyToId: string | null | undefined,
  scope: { channelId: string } | { dmConversationId: string }
): Promise<boolean> {
  if (!replyToId) return true;
  const db = getDb();
  const [target] = await db
    .select({ channelId: messages.channelId, dmConversationId: messages.dmConversationId })
    .from(messages)
    .where(eq(messages.id, replyToId))
    .limit(1);
  if (!target) return false;
  return "channelId" in scope
    ? target.channelId === scope.channelId
    : target.dmConversationId === scope.dmConversationId;
}

/** Shared hydrator for both Server Channel messages and Direct Messages */
export async function hydrateMessagesList(
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
            channelId: messages.channelId,
            dmConversationId: messages.dmConversationId,
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

  const replyMap = new Map<string, MessageReplyPreview & { scope: string }>();
  for (const r of replyRows) {
    replyMap.set(r.id, {
      id: r.id,
      content: r.content,
      authorDisplayName: r.authorDisplayName,
      hasAttachments: (r.attachments?.length ?? 0) > 0,
      scope: r.channelId ? `c:${r.channelId}` : `d:${r.dmConversationId}`,
    });
  }
  // Only show a reply preview when the quoted message lives in the same conversation
  const replyFor = (message: typeof messages.$inferSelect): MessageReplyPreview | null => {
    if (!message.replyToId) return null;
    const hit = replyMap.get(message.replyToId);
    const scope = message.channelId ? `c:${message.channelId}` : `d:${message.dmConversationId}`;
    if (!hit || hit.scope !== scope) return null;
    return {
      id: hit.id,
      content: hit.content,
      authorDisplayName: hit.authorDisplayName,
      hasAttachments: hit.hasAttachments,
    };
  };

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
    dmConversationId: message.dmConversationId,
    content: message.content,
    replyToId: message.replyToId,
    replyTo: replyFor(message),
    attachments: message.attachments ?? [],
    pinned: Boolean(message.pinned),
    pinnedAt: message.pinnedAt ? message.pinnedAt.toISOString() : null,
    reactions: reactionsByMessage.get(message.id) ?? [],
    editedAt: message.editedAt ? message.editedAt.toISOString() : null,
    createdAt: message.createdAt.toISOString(),
    author,
  }));
}
