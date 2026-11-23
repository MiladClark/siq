import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchVoiceOccupancy } from "@/lib/livekit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const voiceOccupancy = await fetchVoiceOccupancy();
  return NextResponse.json(
    { voiceOccupancy },
    { headers: { "Cache-Control": "no-store" } }
  );
}
