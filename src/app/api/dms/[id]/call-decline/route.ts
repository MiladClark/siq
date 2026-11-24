import { eq } from "drizzle-orm";
import { DataPacket_Kind } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { dmConversations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getRoomServiceClient, isLiveKitConfigured } from "@/lib/livekit";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: dmConversationId } = await context.params;
  const db = getDb();

  const [conv] = await db
    .select()
    .from(dmConversations)
    .where(eq(dmConversations.id, dmConversationId))
    .limit(1);

  if (!conv || (conv.userAId !== user.id && conv.userBId !== user.id)) {
    return NextResponse.json({ error: "DM conversation not found." }, { status: 404 });
  }

  if (isLiveKitConfigured()) {
    const roomName = `dm-${conv.id}`;
    const client = getRoomServiceClient();
    const payload = new TextEncoder().encode(
      JSON.stringify({
        type: "dm-call-declined",
        dmConversationId: conv.id,
        byUserId: user.id,
        byDisplayName: user.displayName,
      })
    );

    try {
      await client.sendData(roomName, payload, DataPacket_Kind.RELIABLE, {
        topic: "dm-call-control",
      });
    } catch {
      // Caller may have already disconnected
    }

    // Give the reliable data packet a brief beat to reach the waiting caller, then close room
    await new Promise((resolve) => setTimeout(resolve, 350));
    try {
      await client.deleteRoom(roomName);
    } catch {
      // Room may already be closed
    }
  }

  return NextResponse.json({ ok: true });
}
