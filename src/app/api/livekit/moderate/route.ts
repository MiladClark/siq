import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRoomServiceClient, isLiveKitConfigured } from "@/lib/livekit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can moderate voice participants." },
      { status: 403 }
    );
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
