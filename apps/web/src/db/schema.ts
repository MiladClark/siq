import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export interface MessageAttachment {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

export interface RolePermissions {
  administrator?: boolean;
  manageServer?: boolean;
  manageChannels?: boolean;
  manageRoles?: boolean;
  createInvites?: boolean;
  kickMembers?: boolean;
  muteMembers?: boolean;
  manageMessages?: boolean;
  sendMessages?: boolean;
  connectVoice?: boolean;
  streamScreen?: boolean;
}

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: varchar("username", { length: 32 }).notNull().unique(),
  email: varchar("email", { length: 255 }).unique(),
  displayName: varchar("display_name", { length: 64 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  avatarColor: varchar("avatar_color", { length: 16 }).notNull().default("#10B981"),
  avatarUrl: text("avatar_url"),
  bannerUrl: text("banner_url"),
  bio: text("bio"),
  presenceStatus: varchar("presence_status", { length: 16 })
    .$type<"online" | "idle" | "dnd" | "invisible">()
    .notNull()
    .default("online"),
  customActivity: varchar("custom_activity", { length: 120 }),
  role: varchar("role", { length: 16 }).$type<"admin" | "member">().notNull().default("member"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const servers = pgTable("servers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  tag: varchar("tag", { length: 8 }),
  iconUrl: text("icon_url"),
  bannerUrl: text("banner_url"),
  accentColor: varchar("accent_color", { length: 16 }).notNull().default("#10B981"),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const serverMembers = pgTable(
  "server_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nickname: varchar("nickname", { length: 40 }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("server_members_server_user_idx").on(table.serverId, table.userId),
    index("server_members_user_idx").on(table.userId),
  ]
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 48 }).notNull(),
    color: varchar("color", { length: 16 }).notNull().default("#94A3B8"),
    position: integer("position").notNull().default(0),
    permissions: jsonb("permissions").$type<RolePermissions>().notNull().default({}),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("roles_server_pos_idx").on(table.serverId, table.position)]
);

export const memberRoles = pgTable(
  "member_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("member_roles_srv_usr_role_idx").on(
      table.serverId,
      table.userId,
      table.roleId
    ),
  ]
);

export const channelCategories = pgTable(
  "channel_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 48 }).notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("channel_categories_server_pos_idx").on(table.serverId, table.position)]
);

export const inviteCodes = pgTable("invite_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  serverId: uuid("server_id").references(() => servers.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  maxUses: integer("max_uses").notNull().default(5),
  usesCount: integer("uses_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id").references(() => servers.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => channelCategories.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 64 }).notNull(),
    slug: varchar("slug", { length: 96 }).notNull().unique(),
    type: varchar("type", { length: 16 }).$type<"text" | "voice">().notNull(),
    description: varchar("description", { length: 200 }),
    isPrivate: boolean("is_private").notNull().default(false),
    allowedRoleIds: jsonb("allowed_role_ids").$type<string[]>().notNull().default([]),
    position: integer("position").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("channels_type_pos_idx").on(table.type, table.position),
    index("channels_server_idx").on(table.serverId),
  ]
);

export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addresseeId: uuid("addressee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 })
      .$type<"pending" | "accepted" | "blocked">()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("friendships_pair_idx").on(table.requesterId, table.addresseeId),
    index("friendships_addressee_idx").on(table.addresseeId),
  ]
);

export const dmConversations = pgTable(
  "dm_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userAId: uuid("user_a_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userBId: uuid("user_b_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("dm_conversations_pair_idx").on(table.userAId, table.userBId),
    index("dm_conversations_last_msg_idx").on(table.lastMessageAt),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
    dmConversationId: uuid("dm_conversation_id").references(() => dmConversations.id, {
      onDelete: "cascade",
    }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull().default(""),
    replyToId: uuid("reply_to_id"),
    attachments: jsonb("attachments").$type<MessageAttachment[]>().notNull().default([]),
    pinned: boolean("pinned").notNull().default(false),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    pinnedById: uuid("pinned_by_id").references(() => users.id, { onDelete: "set null" }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("messages_channel_created_idx").on(table.channelId, table.createdAt),
    index("messages_dm_created_idx").on(table.dmConversationId, table.createdAt),
  ]
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: varchar("emoji", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("message_reactions_msg_user_emoji_idx").on(
      table.messageId,
      table.userId,
      table.emoji
    ),
    index("message_reactions_message_idx").on(table.messageId),
  ]
);

export type User = typeof users.$inferSelect;
export type Server = typeof servers.$inferSelect;
export type ServerMember = typeof serverMembers.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type MemberRole = typeof memberRoles.$inferSelect;
export type ChannelCategory = typeof channelCategories.$inferSelect;
export type InviteCode = typeof inviteCodes.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type DmConversation = typeof dmConversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type MessageReaction = typeof messageReactions.$inferSelect;
