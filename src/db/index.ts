import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && !url.includes("user:password@host"));
}

function isNeonUrl(url: string): boolean {
  return url.includes("neon.tech");
}

type DbInstance =
  | ReturnType<typeof drizzleNeon<typeof schema>>
  | ReturnType<typeof drizzlePg<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __siqDb?: DbInstance;
  __siqPool?: Pool;
};

function createDb(): DbInstance {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not configured. Add it to .env.local or Vercel Environment Variables."
    );
  }

  if (isNeonUrl(url)) {
    const sql = neon(url);
    return drizzleNeon(sql, { schema });
  }

  const pool =
    globalForDb.__siqPool ??
    new Pool({
      connectionString: url,
      max: 10,
    });
  globalForDb.__siqPool = pool;

  return drizzlePg(pool, { schema });
}

export function getDb(): DbInstance {
  if (!globalForDb.__siqDb) {
    globalForDb.__siqDb = createDb();
  }
  return globalForDb.__siqDb;
}
