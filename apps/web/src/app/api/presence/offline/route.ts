import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function POST() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  try {
    const db = getDb();
    // Mark offline by backdating lastSeenAt beyond the online window
    const offlineTime = new Date(Date.now() - 10 * 60 * 1000);
    await db
      .update(users)
      .set({ lastSeenAt: offlineTime })
      .where(eq(users.id, user.id));
  } catch {
    // ignore beacon errors during unload
  }

  return NextResponse.json({ ok: true });
}
