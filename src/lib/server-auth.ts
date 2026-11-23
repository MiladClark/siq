import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  memberRoles,
  messageReactions,
  messages,
  roles,
  serverMembers,
  servers,
  users,
} from "@/db/schema";
import {
  computeEffectivePermissions,
  type EffectivePermissions,
} from "@/lib/permissions";
import type {
  MessageItem,
  MessageReactionSummary,
  MessageReplyPreview,
} from "@/lib/types";

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
    dmConversationId: message.dmConversationId,
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
