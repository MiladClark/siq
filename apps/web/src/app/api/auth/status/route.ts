import { count } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const dbConfigured = isDatabaseConfigured();
  if (!dbConfigured) {
    return NextResponse.json({
      dbConfigured: false,
      schemaReady: false,
      hasUsers: false,
      user: null,
    });
  }

  try {
    const db = getDb();
    const [{ total }] = await db.select({ total: count() }).from(users);
    const user = await getCurrentUser();

    return NextResponse.json({
      dbConfigured: true,
      schemaReady: true,
      hasUsers: total > 0,
      user,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database connection error";
    return NextResponse.json({
      dbConfigured: true,
      schemaReady: false,
      hasUsers: false,
      user: null,
      error: message,
    });
  }
}
