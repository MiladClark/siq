import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchVoiceOccupancySnapshot } from "@/lib/livekit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const snap = await fetchVoiceOccupancySnapshot();
  return NextResponse.json(
    {
      voiceOccupancy: snap ? snap.occupancy : null,
      voiceRoomCreatedAt: snap ? snap.roomCreatedAt : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
