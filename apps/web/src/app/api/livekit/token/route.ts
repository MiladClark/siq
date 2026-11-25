import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { channels, dmConversations, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createLiveKitRoomToken, isLiveKitConfigured } from "@/lib/livekit";
import { canUserAccessChannel } from "@siq/shared/lib/permissions";
import { getServerMemberPermissions } from "@/lib/server-auth";

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
    const body = (await request.json()) as {
      channelId?: string;
      dmConversationId?: string;
    };

    const db = getDb();

    // 1-on-1 Direct Message Voice / Video Call
    if (body.dmConversationId) {
      const [conv] = await db
        .select()
        .from(dmConversations)
        .where(eq(dmConversations.id, body.dmConversationId))
        .limit(1);

      if (!conv || (conv.userAId !== user.id && conv.userBId !== user.id)) {
        return NextResponse.json({ error: "DM conversation not found." }, { status: 404 });
      }

      const peerId = conv.userAId === user.id ? conv.userBId : conv.userAId;
      const [peer] = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, peerId))
        .limit(1);

      const roomName = `dm-${conv.id}`;
      const token = await createLiveKitRoomToken({
        roomName,
        userId: user.id,
        displayName: user.displayName,
        username: user.username,
        avatarColor: user.avatarColor,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        role: user.role,
      });

      return NextResponse.json({
        token,
        url: process.env.NEXT_PUBLIC_LIVEKIT_URL!.trim(),
        roomName,
        channelName: peer?.displayName ? `Call with ${peer.displayName}` : "Direct Call",
      });
    }

    if (!body.channelId) {
      return NextResponse.json(
        { error: "channelId or dmConversationId is required." },
        { status: 400 }
      );
    }

    const [channel] = await db
      .select()
      .from(channels)
      .where(eq(channels.id, body.channelId))
      .limit(1);

    if (!channel || channel.type !== "voice") {
      return NextResponse.json({ error: "Voice channel not found." }, { status: 404 });
    }

    if (channel.serverId) {
      const { isMember, permissions, assignedRoleIds } =
        await getServerMemberPermissions(channel.serverId, user.id);

      if (!isMember) {
        return NextResponse.json(
          { error: "You are not a member of this server." },
          { status: 403 }
        );
      }

      if (!permissions.administrator && !permissions.connectVoice) {
        return NextResponse.json(
          { error: "Your role does not have permission to join voice channels." },
          { status: 403 }
        );
      }

      const canAccess = canUserAccessChannel({
        channel: {
          isPrivate: Boolean(channel.isPrivate),
          allowedRoleIds: channel.allowedRoleIds ?? [],
        },
        permissions,
        assignedRoleIds,
      });

      if (!canAccess) {
        return NextResponse.json(
          { error: "You do not have access to this private voice channel." },
          { status: 403 }
        );
      }
    }

    const token = await createLiveKitRoomToken({
      roomName: channel.slug,
      userId: user.id,
      displayName: user.displayName,
      username: user.username,
      avatarColor: user.avatarColor,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl,
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
