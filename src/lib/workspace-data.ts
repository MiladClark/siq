import { asc, count } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db";
import { channels, users } from "@/db/schema";
import { serializeUser } from "@/lib/auth";
import type { ChannelItem, PublicUser } from "@/lib/types";

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

export async function getWorkspaceInitialData(): Promise<{
  channels: ChannelItem[];
  members: PublicUser[];
}> {
  const db = getDb();
  const [channelRows, memberRows] = await Promise.all([
    db.select().from(channels).orderBy(asc(channels.type), asc(channels.position)),
    db.select().from(users).orderBy(asc(users.createdAt)),
  ]);

  return {
    channels: channelRows.map((ch) => ({
      id: ch.id,
      name: ch.name,
      slug: ch.slug,
      type: ch.type,
      description: ch.description,
      position: ch.position,
    })),
    members: memberRows.map(serializeUser),
  };
}
