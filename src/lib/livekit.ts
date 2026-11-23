import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { pickAvatarColor, type VoiceOccupancyMap } from "@/lib/types";

export function isLiveKitConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();
  const key = process.env.LIVEKIT_API_KEY?.trim();
  const secret = process.env.LIVEKIT_API_SECRET?.trim();
  return Boolean(url && key && secret && !url.includes("your-project.livekit.cloud"));
}

export function getLiveKitHttpUrl(): string {
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() ?? "";
  if (wsUrl.startsWith("wss://")) return `https://${wsUrl.slice(6)}`;
  if (wsUrl.startsWith("ws://")) return `http://${wsUrl.slice(5)}`;
  return wsUrl;
}

export function getRoomServiceClient(): RoomServiceClient {
  return new RoomServiceClient(
    getLiveKitHttpUrl(),
    process.env.LIVEKIT_API_KEY!.trim(),
    process.env.LIVEKIT_API_SECRET!.trim()
  );
}

export async function createLiveKitRoomToken(params: {
  roomName: string;
  userId: string;
  displayName: string;
  username: string;
  avatarColor: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  role: "admin" | "member";
}): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit credentials are not configured.");
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: params.userId,
    name: params.displayName,
    metadata: JSON.stringify({
      username: params.username,
      avatarColor: params.avatarColor,
      avatarUrl: params.avatarUrl,
      bannerUrl: params.bannerUrl,
      role: params.role,
    }),
    ttl: "6h",
  });

  at.addGrant({
    roomJoin: true,
    room: params.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return at.toJwt();
}

export async function fetchVoiceOccupancy(): Promise<VoiceOccupancyMap | null> {
  if (!isLiveKitConfigured()) {
    return {};
  }

  try {
    const client = getRoomServiceClient();
    const rooms = await client.listRooms();
    const occupancy: VoiceOccupancyMap = {};

    await Promise.all(
      rooms.map(async (room) => {
        if (!room.numParticipants) return;
        const participants = await client.listParticipants(room.name);
        occupancy[room.name] = participants.map((p) => {
          let avatarColor = pickAvatarColor(p.identity);
          let username: string | undefined;
          let avatarUrl: string | null = null;
          if (p.metadata) {
            try {
              const parsed = JSON.parse(p.metadata) as {
                avatarColor?: string;
                avatarUrl?: string | null;
                username?: string;
              };
              if (parsed.avatarColor) avatarColor = parsed.avatarColor;
              if (parsed.username) username = parsed.username;
              if (parsed.avatarUrl) avatarUrl = parsed.avatarUrl;
            } catch {
              // ignore malformed metadata
            }
          }
          const isScreenSharing = (p.tracks ?? []).some(
            (t) => t.source === 3 && !t.muted // TrackSource.SCREEN_SHARE = 3
          );
          return {
            identity: p.identity,
            name: p.name || username || "Member",
            username,
            avatarColor,
            avatarUrl,
            isScreenSharing,
          };
        });
      })
    );

    return occupancy;
  } catch (error) {
    console.warn(
      "[livekit] occupancy fetch skipped:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
