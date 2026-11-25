import { asc, eq, isNull, sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db";
import {
  channelCategories,
  channels,
  inviteCodes,
  memberRoles,
  roles,
  serverMembers,
  servers,
  users,
} from "@/db/schema";

let ensuredPromise: Promise<void> | null = null;

export const DEFAULT_EVERYONE_PERMISSIONS = {
  administrator: false,
  manageServer: false,
  manageChannels: false,
  manageRoles: false,
  createInvites: true,
  kickMembers: false,
  muteMembers: false,
  manageMessages: false,
  sendMessages: true,
  connectVoice: true,
  streamScreen: true,
};

export const ADMIN_ROLE_PERMISSIONS = {
  administrator: true,
  manageServer: true,
  manageChannels: true,
  manageRoles: true,
  createInvites: true,
  kickMembers: true,
  muteMembers: true,
  manageMessages: true,
  sendMessages: true,
  connectVoice: true,
  streamScreen: true,
};

/** Idempotently ensures ALL Phase 1-4 tables, columns, and default-server data migration
 *  exist cleanly on both local Docker Postgres and Production Neon Postgres with zero data loss. */
export async function ensureAppSchema(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  if (ensuredPromise) return ensuredPromise;

  ensuredPromise = (async () => {
    const db = getDb();

    // 1. User profile & status columns
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`);
    await db.execute(
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS presence_status VARCHAR(16) NOT NULL DEFAULT 'online'`
    );
    await db.execute(
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_activity VARCHAR(120)`
    );

    // 2. Multi-server, members, roles, categories
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS servers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(64) NOT NULL,
        tag VARCHAR(8),
        icon_url TEXT,
        banner_url TEXT,
        accent_color VARCHAR(16) NOT NULL DEFAULT '#10B981',
        owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS servers_single_default_idx ON servers(is_default) WHERE is_default = true`
    );
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS server_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nickname VARCHAR(40),
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS server_members_server_user_idx ON server_members(server_id, user_id)`
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS server_members_user_idx ON server_members(user_id)`
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name VARCHAR(48) NOT NULL,
        color VARCHAR(16) NOT NULL DEFAULT '#94A3B8',
        position INTEGER NOT NULL DEFAULT 0,
        permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS roles_server_pos_idx ON roles(server_id, position)`
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS member_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS member_roles_srv_usr_role_idx ON member_roles(server_id, user_id, role_id)`
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS channel_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name VARCHAR(48) NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS channel_categories_server_pos_idx ON channel_categories(server_id, position)`
    );

    // 3. Extend channels & invite_codes
    await db.execute(
      sql`ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES servers(id) ON DELETE CASCADE`
    );
    await db.execute(
      sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES servers(id) ON DELETE CASCADE`
    );
    await db.execute(
      sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES channel_categories(id) ON DELETE SET NULL`
    );
    await db.execute(
      sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false`
    );
    await db.execute(
      sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS allowed_role_ids JSONB NOT NULL DEFAULT '[]'::jsonb`
    );
    await db.execute(
      sql`ALTER TABLE channels ALTER COLUMN slug TYPE VARCHAR(96)`
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS channels_server_idx ON channels(server_id)`
    );

    // 4. Friendships & Direct Messages
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS friendships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx ON friendships(requester_id, addressee_id)`
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships(addressee_id)`
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS dm_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS dm_conversations_pair_idx ON dm_conversations(user_a_id, user_b_id)`
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS dm_conversations_last_msg_idx ON dm_conversations(last_message_at)`
    );

    // 5. Extend messages (pins + nullable channel_id + dm_conversation_id) & reactions
    await db.execute(
      sql`ALTER TABLE messages ALTER COLUMN channel_id DROP NOT NULL`
    );
    await db.execute(
      sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS dm_conversation_id UUID REFERENCES dm_conversations(id) ON DELETE CASCADE`
    );
    await db.execute(
      sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false`
    );
    await db.execute(
      sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ`
    );
    await db.execute(
      sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_by_id UUID REFERENCES users(id) ON DELETE SET NULL`
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS messages_dm_created_idx ON messages(dm_conversation_id, created_at)`
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji VARCHAR(32) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS message_reactions_msg_user_emoji_idx ON message_reactions(message_id, user_id, emoji)`
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON message_reactions(message_id)`
    );

    // 6. Auto-migrate legacy single-workspace data into a default "siq" server once
    const existingServers = await db.select({ id: servers.id }).from(servers).limit(1);
    const existingUsers = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .orderBy(asc(users.createdAt));

    if (existingServers.length === 0 && existingUsers.length > 0) {
      const owner =
        existingUsers.find((u) => u.role === "admin") ?? existingUsers[0];

      const [insertedDefault] = await db
        .insert(servers)
        .values({
          name: "siq",
          tag: "SIQ",
          accentColor: "#10B981",
          ownerId: owner.id,
          isDefault: true,
        })
        .onConflictDoNothing()
        .returning();

      if (!insertedDefault) {
        // Another concurrent serverless instance already bootstrapped the default server
        return;
      }
      const defaultServer = insertedDefault;

      const [, adminRole] = await db
        .insert(roles)
        .values([
          {
            serverId: defaultServer.id,
            name: "@everyone",
            color: "#94A3B8",
            position: 0,
            permissions: DEFAULT_EVERYONE_PERMISSIONS,
            isDefault: true,
          },
          {
            serverId: defaultServer.id,
            name: "Admin",
            color: "#10B981",
            position: 10,
            permissions: ADMIN_ROLE_PERMISSIONS,
            isDefault: false,
          },
        ])
        .returning();

      const [textCat, voiceCat] = await db
        .insert(channelCategories)
        .values([
          { serverId: defaultServer.id, name: "TEXT", position: 0 },
          { serverId: defaultServer.id, name: "VOICES", position: 1 },
        ])
        .returning();

      // Attach all legacy channels to the default server + matching category
      const legacyChannels = await db
        .select({ id: channels.id, type: channels.type })
        .from(channels)
        .where(isNull(channels.serverId));

      for (const ch of legacyChannels) {
        await db
          .update(channels)
          .set({
            serverId: defaultServer.id,
            categoryId: ch.type === "voice" ? voiceCat.id : textCat.id,
          })
          .where(eq(channels.id, ch.id));
      }

      // Attach legacy invites to default server
      await db
        .update(inviteCodes)
        .set({ serverId: defaultServer.id })
        .where(isNull(inviteCodes.serverId));

      // Enroll all existing users into default server & grant Admin role to existing admins
      for (const u of existingUsers) {
        await db
          .insert(serverMembers)
          .values({ serverId: defaultServer.id, userId: u.id })
          .onConflictDoNothing();

        if (u.role === "admin" && adminRole) {
          await db
            .insert(memberRoles)
            .values({
              serverId: defaultServer.id,
              userId: u.id,
              roleId: adminRole.id,
            })
            .onConflictDoNothing();
        }
      }
    }
  })().catch((err) => {
    ensuredPromise = null;
    console.warn("[db/ensure-schema] skipped:", err instanceof Error ? err.message : err);
  });

  return ensuredPromise;
}
