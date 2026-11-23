import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { channels } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createLiveKitRoomToken, isLiveKitConfigured } from "@/lib/livekit";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isLiveKitConfigured()) {
    return NextResponse.json(
      {
        error:
          "LiveKit is not configured yet. Add NEXT_PUBLIC_LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET to your environment variables.",
      },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as { channelId?: string };
    if (!body.channelId) {
      return NextResponse.json({ error: "channelId is required." }, { status: 400 });
    }

    const db = getDb();
    const [channel] = await db
      .select()
      .from(channels)
      .where(eq(channels.id, body.channelId))
      .limit(1);

    if (!channel || channel.type !== "voice") {
      return NextResponse.json({ error: "Voice channel not found." }, { status: 404 });
    }

    const token = await createLiveKitRoomToken({
      roomName: channel.slug,
      userId: user.id,
      displayName: user.displayName,
      username: user.username,
      avatarColor: user.avatarColor,
      avatarUrl: user.avatarUrl,
      role: user.role,
    });

    return NextResponse.json({
      token,
      url: process.env.NEXT_PUBLIC_LIVEKIT_URL!.trim(),
      roomName: channel.slug,
      channelName: channel.name,
    });
  } catch (error) {
    console.error("[livekit/token POST]", error);
    return NextResponse.json({ error: "Failed to generate voice token." }, { status: 500 });
  }
}
