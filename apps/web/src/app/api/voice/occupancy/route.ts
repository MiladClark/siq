import { and, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { dmConversations, users } from "@/db/schema";
import { getCurrentUser, serializeUser } from "@/lib/auth";
import { fetchVoiceOccupancySnapshot } from "@/lib/livekit";
import type { IncomingCallItem } from "@siq/shared/lib/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const snap = await fetchVoiceOccupancySnapshot();
  const incomingCalls: IncomingCallItem[] = [];

  if (snap && isDatabaseConfigured()) {
    const candidateDmIds: string[] = [];
    for (const [roomName, occupants] of Object.entries(snap.occupancy)) {
      if (!roomName.startsWith("dm-") || occupants.length === 0) continue;
      if (occupants.some((o) => o.identity === user.id)) continue;
      const convId = roomName.slice(3);
      if (UUID_RE.test(convId)) {
        candidateDmIds.push(convId);
      }
    }

    if (candidateDmIds.length > 0) {
      try {
        const db = getDb();
        const convRows = await db
          .select()
          .from(dmConversations)
          .where(
            and(
              inArray(dmConversations.id, candidateDmIds),
              or(
                eq(dmConversations.userAId, user.id),
                eq(dmConversations.userBId, user.id)
              )
            )
          );

        if (convRows.length > 0) {
          const peerIds = convRows.map((c) =>
            c.userAId === user.id ? c.userBId : c.userAId
          );
          const peerRows = await db
            .select()
            .from(users)
            .where(inArray(users.id, peerIds));
          const peerMap = new Map(peerRows.map((u) => [u.id, serializeUser(u)]));

          for (const conv of convRows) {
            const peerId = conv.userAId === user.id ? conv.userBId : conv.userAId;
            const caller = peerMap.get(peerId);
            const roomName = `dm-${conv.id}`;
            const callerOcc = (snap.occupancy[roomName] ?? []).find(
              (o) => o.identity === peerId
            );
            if (!caller || !callerOcc) continue;

            incomingCalls.push({
              dmConversationId: conv.id,
              roomName,
              caller,
              withVideo: Boolean(callerOcc.isCameraOn),
              startedAtMs:
                snap.roomCreatedAt[roomName] ?? callerOcc.joinedAt ?? Date.now(),
            });
          }
        }
      } catch (err) {
        console.warn("[voice/occupancy] incoming call lookup skipped:", err);
      }
    }
  }

  return NextResponse.json(
    {
      voiceOccupancy: snap ? snap.occupancy : null,
      voiceRoomCreatedAt: snap ? snap.roomCreatedAt : null,
      incomingCalls,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
