import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { channels, users } from "@/db/schema";
import { getCurrentUser, serializeUser } from "@/lib/auth";
import { fetchVoiceOccupancy, isLiveKitConfigured } from "@/lib/livekit";
import { isBlobStorageConfigured } from "@/lib/storage";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const db = getDb();
    const now = new Date();

    await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, user.id));

    const [memberRows, channelRows, voiceOccupancy] = await Promise.all([
      db.select().from(users).orderBy(asc(users.createdAt)),
      db
        .select()
        .from(channels)
        .orderBy(asc(channels.type), asc(channels.position), asc(channels.createdAt)),
      fetchVoiceOccupancy(),
    ]);

    return NextResponse.json({
      serverTime: now.toISOString(),
      members: memberRows.map(serializeUser),
      channels: channelRows.map((ch) => ({
        id: ch.id,
        name: ch.name,
        slug: ch.slug,
        type: ch.type,
        description: ch.description,
        position: ch.position,
        createdById: ch.createdById,
      })),
      voiceOccupancy,
      capabilities: {
        livekitReady: isLiveKitConfigured(),
        blobReady: isBlobStorageConfigured(),
      },
    });
  } catch (error) {
    console.error("[presence GET]", error);
    return NextResponse.json({ error: "Failed to sync presence." }, { status: 500 });
  }
}
