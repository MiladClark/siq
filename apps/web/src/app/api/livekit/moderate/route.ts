import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { channels } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getRoomServiceClient, isLiveKitConfigured } from "@/lib/livekit";
import { getServerMemberPermissions } from "@/lib/server-auth";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isLiveKitConfigured()) {
    return NextResponse.json({ error: "LiveKit is not configured." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      action?: "kick" | "mute";
      roomName?: string;
      targetIdentity?: string;
    };

    if (!body.action || !body.roomName || !body.targetIdentity) {
      return NextResponse.json(
        { error: "action, roomName, and targetIdentity are required." },
        { status: 400 }
      );
    }

    // Check server-level permissions if this room belongs to a server voice channel
    const db = getDb();
    const [ch] = await db
      .select({ serverId: channels.serverId })
      .from(channels)
      .where(eq(channels.slug, body.roomName))
      .limit(1);

    let allowed = user.role === "admin";
    if (ch?.serverId) {
      const { isMember, permissions } = await getServerMemberPermissions(
        ch.serverId,
        user.id
      );
      if (isMember) {
        allowed =
          permissions.administrator ||
          (body.action === "kick" ? permissions.kickMembers : permissions.muteMembers);
      }
    }

    if (!allowed) {
      return NextResponse.json(
        { error: "You do not have permission to moderate voice participants." },
        { status: 403 }
      );
    }

    const client = getRoomServiceClient();

    if (body.action === "kick") {
      await client.removeParticipant(body.roomName, body.targetIdentity);
      return NextResponse.json({ ok: true, action: "kick" });
    }

    if (body.action === "mute") {
      const participant = await client.getParticipant(body.roomName, body.targetIdentity);
      const audioTracks = participant.tracks.filter((t) => t.type === 0); // TrackType.AUDIO = 0
      await Promise.all(
        audioTracks.map((t) =>
          client.mutePublishedTrack(body.roomName!, body.targetIdentity!, t.sid, true)
        )
      );
      return NextResponse.json({ ok: true, action: "mute", mutedCount: audioTracks.length });
    }

    return NextResponse.json({ error: "Unsupported moderation action." }, { status: 400 });
  } catch (error) {
    console.error("[livekit/moderate POST]", error);
    return NextResponse.json(
      { error: "Moderation action failed. Participant may have already left." },
      { status: 500 }
    );
  }
}
