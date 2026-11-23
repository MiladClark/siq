"use client";

import {
  Calendar,
  Gamepad2,
  Mic,
  MicOff,
  Monitor,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ConnectionState, type Track } from "livekit-client";
import { useEffect, useRef } from "react";
import { TextChannelView } from "@/components/chat/TextChannelView";
import { Avatar, resolveDisplayStatus } from "@/components/ui/Avatar";
import type { ProfilePopoverTarget } from "@/components/ui/UserProfilePopover";
import { useVoice } from "@/components/voice/VoiceProvider";
import type { MessageDensity, TextScale } from "@/lib/preferences";
import type {
  DmConversationItem,
  PublicUser,
  ServerDetail,
  VoiceOccupancyMap,
} from "@/lib/types";

interface DmConversationViewProps {
  conversation: DmConversationItem;
  currentUser: PublicUser;
  members: PublicUser[];
  servers: ServerDetail[];
  onlineMemberIds: Set<string>;
  voiceOccupancy: VoiceOccupancyMap;
  blobReady: boolean;
  showProfileSidebar: boolean;
  density: MessageDensity;
  textScale: TextScale;
  jumpTarget: { messageId: string; nonce: number } | null;
  unpinnedEvent: { messageId: string; nonce: number } | null;
  onStartCall: (withVideo: boolean) => void;
  onLeaveCall: () => void;
  onOpenScreenShareModal: () => void;
  onOpenUserProfile: (target: ProfilePopoverTarget) => void;
  onSelectServer: (serverId: string) => void;
  onMessagesSeen: (
    conversationId: string,
    messageIds: string[],
    latestCreatedAt?: string
  ) => void;
}

function CallVideoCanvas({
  track,
  mirror = false,
}: {
  track: Track;
  mirror?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`h-full w-full object-cover ${mirror ? "-scale-x-100" : ""}`}
    />
  );
}

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DmConversationView({
  conversation,
  currentUser,
  members,
  servers,
  onlineMemberIds,
  voiceOccupancy,
  blobReady,
  showProfileSidebar,
  density,
  textScale,
  jumpTarget,
  unpinnedEvent,
  onStartCall,
  onLeaveCall,
  onOpenScreenShareModal,
  onOpenUserProfile,
  onSelectServer,
  onMessagesSeen,
}: DmConversationViewProps) {
  const voice = useVoice();

  const livePeer =
    members.find((m) => m.id === conversation.peer.id) ?? conversation.peer;
  const peerOnline = onlineMemberIds.has(livePeer.id);
  const peerStatus = resolveDisplayStatus(peerOnline, livePeer.presenceStatus);

  const dmRoomSlug = `dm-${conversation.id}`;
  const isInThisDmCall =
    voice.activeChannel?.slug === dmRoomSlug &&
    voice.connectionState !== ConnectionState.Disconnected;
  const waitingCallOccupants = voiceOccupancy[dmRoomSlug] ?? [];
  const peerWaitingInCall =
    !isInThisDmCall && waitingCallOccupants.some((o) => o.identity === livePeer.id);

  const mutualServers = servers.filter((s) => s.memberIds.includes(livePeer.id));

  // Synthetic ChannelItem adapter so our battle-tested TextChannelView powers DMs identically
  const syntheticDmChannel = {
    id: conversation.id,
    name: livePeer.displayName,
    slug: dmRoomSlug,
    type: "text" as const,
    description: `@${livePeer.username}`,
    position: 0,
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Incoming / Waiting 1-on-1 Call Banner */}
        {peerWaitingInCall && (
          <div className="flex items-center justify-between gap-3 border-b border-emerald-500/25 bg-emerald-500/10 px-5 py-3">
            <div className="flex items-center gap-3">
              <Avatar
                name={livePeer.displayName}
                color={livePeer.avatarColor}
                avatarUrl={livePeer.avatarUrl}
                size="sm"
                speaking
                speakingOffsetClassName="ring-offset-[#121316]"
              />
              <div>
                <p className="text-xs font-semibold text-emerald-200">
                  {livePeer.displayName} started a call
                </p>
                <p className="text-[11px] text-emerald-300/75">
                  Join voice or video call right here in this DM
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onStartCall(false)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
              >
                <Phone className="h-3.5 w-3.5" />
                <span>Join Call</span>
              </button>
              <button
                type="button"
                onClick={() => onStartCall(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25"
              >
                <Video className="h-3.5 w-3.5" />
                <span>Video</span>
              </button>
            </div>
          </div>
        )}

        {/* Active 1-on-1 DM Call Stage */}
        {isInThisDmCall && (
          <div className="shrink-0 border-b border-white/[0.08] bg-[#0B0C0F] px-5 py-4">
            <div className="flex flex-wrap items-center justify-center gap-4">
              {voice.participants.map((p) => {
                const m = members.find((item) => item.id === p.identity);
                const name = m?.displayName ?? p.name;
                const avatarColor = m?.avatarColor ?? p.avatarColor;
                const avatarUrl = m ? m.avatarUrl : p.avatarUrl;
                const activeVideo = p.screenTrack ?? (p.isCameraOn ? p.cameraTrack : null);
                return (
                  <div
                    key={p.identity}
                    className={`relative flex flex-col items-center justify-center overflow-hidden rounded-xl border bg-[#14151A] ${
                      activeVideo ? "h-44 w-72" : "h-32 w-48"
                    } ${
                      p.isSpeaking
                        ? "border-emerald-500/75 ring-1 ring-emerald-500/35"
                        : "border-white/[0.08]"
                    }`}
                  >
                    {activeVideo ? (
                      <CallVideoCanvas
                        track={activeVideo}
                        mirror={p.isLocal && !p.screenTrack}
                      />
                    ) : (
                      <Avatar
                        name={name}
                        color={avatarColor}
                        avatarUrl={avatarUrl}
                        size="lg"
                        speaking={p.isSpeaking}
                        speakingOffsetClassName="ring-offset-[#14151A]"
                      />
                    )}
                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between">
                      <span
                        dir="auto"
                        className="truncate rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-medium text-zinc-100 backdrop-blur-xs"
                      >
                        {name}
                      </span>
                      {p.isMuted && (
                        <span className="rounded-md bg-rose-500/80 p-1 text-white">
                          <MicOff className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Compact DM Call Control Bar */}
            <div className="mt-3.5 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void voice.toggleMute()}
                title={voice.isMuted ? "Unmute" : "Mute"}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                  voice.isMuted
                    ? "border-rose-500/40 bg-rose-500/20 text-rose-300"
                    : "border-white/[0.1] bg-[#18191E] text-zinc-200 hover:bg-white/[0.08]"
                }`}
              >
                {voice.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => void voice.toggleDeafen()}
                title={voice.isDeafened ? "Undeafen" : "Deafen"}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                  voice.isDeafened
                    ? "border-rose-500/40 bg-rose-500/20 text-rose-300"
                    : "border-white/[0.1] bg-[#18191E] text-zinc-200 hover:bg-white/[0.08]"
                }`}
              >
                {voice.isDeafened ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => void voice.toggleCamera()}
                title={voice.isCameraOn ? "Turn off camera" : "Turn on camera"}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                  voice.isCameraOn
                    ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                    : "border-white/[0.1] bg-[#18191E] text-zinc-200 hover:bg-white/[0.08]"
                }`}
              >
                {voice.isCameraOn ? (
                  <Video className="h-4 w-4" />
                ) : (
                  <VideoOff className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={onOpenScreenShareModal}
                title={voice.isScreenSharing ? "Stream options" : "Share screen"}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                  voice.isScreenSharing
                    ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                    : "border-white/[0.1] bg-[#18191E] text-zinc-200 hover:bg-white/[0.08]"
                }`}
              >
                <Monitor className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onLeaveCall}
                title="End call"
                className="flex h-9 items-center gap-1.5 rounded-full bg-rose-500 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-rose-400"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                <span>Leave</span>
              </button>
            </div>
          </div>
        )}

        {/* Unified Direct Message Chat Feed */}
        <TextChannelView
          channel={syntheticDmChannel}
          currentUser={currentUser}
          members={members}
          blobReady={blobReady}
          isDm
          density={density}
          textScale={textScale}
          jumpTarget={jumpTarget}
          unpinnedEvent={unpinnedEvent}
          onOpenUserProfile={onOpenUserProfile}
          onMessagesSeen={onMessagesSeen}
        />
      </div>

      {/* Right Sticky Friend Profile Sidebar (Image 8 ergonomics) */}
      {showProfileSidebar && (
        <aside className="hidden w-[300px] shrink-0 flex-col overflow-y-auto border-l border-white/[0.07] bg-[#0E0F12] select-none lg:flex">
          {/* Banner */}
          <div
            className="h-28 w-full shrink-0"
            style={
              !livePeer.bannerUrl
                ? {
                    background: `linear-gradient(135deg, ${livePeer.avatarColor}45 0%, #0E0F12 100%)`,
                  }
                : {
                    backgroundImage: `url(${livePeer.bannerUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
            }
          />

          <div className="flex flex-1 flex-col gap-4 px-4 pb-5">
            {/* Avatar */}
            <div className="-mt-10">
              <div className="inline-flex rounded-full ring-[5px] ring-[#0E0F12]">
                <Avatar
                  name={livePeer.displayName}
                  color={livePeer.avatarColor}
                  avatarUrl={livePeer.avatarUrl}
                  size="xl"
                  status={peerStatus}
                  ringClassName="ring-[#0E0F12]"
                />
              </div>
            </div>

            {/* Identity */}
            <div>
              <h3 dir="auto" className="text-lg font-bold tracking-tight text-zinc-50">
                {livePeer.displayName}
              </h3>
              <p className="text-xs font-medium text-zinc-400">@{livePeer.username}</p>
            </div>

            {/* Quick Call Actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onStartCall(false)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#16171C] py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
              >
                <Phone className="h-3.5 w-3.5" />
                <span>Voice Call</span>
              </button>
              <button
                type="button"
                onClick={() => onStartCall(true)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#16171C] py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
              >
                <Video className="h-3.5 w-3.5" />
                <span>Video Call</span>
              </button>
            </div>

            {/* Activity & Bio Card */}
            <div className="space-y-3 rounded-xl border border-white/[0.07] bg-[#14151A] p-3.5">
              {livePeer.customActivity && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Activity
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-200">
                    <Gamepad2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span dir="auto" className="truncate">
                      {livePeer.customActivity}
                    </span>
                  </p>
                </div>
              )}

              {livePeer.bio && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    About Me
                  </p>
                  <p
                    dir="auto"
                    className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-300"
                  >
                    {livePeer.bio}
                  </p>
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Member Since
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs font-medium tabular-nums text-zinc-300">
                  <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                  <span>{formatMemberSince(livePeer.createdAt)}</span>
                </p>
              </div>
            </div>

            {/* Mutual Servers */}
            {mutualServers.length > 0 && (
              <div className="space-y-2 rounded-xl border border-white/[0.07] bg-[#14151A] p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 tabular-nums">
                  Mutual Servers — {mutualServers.length}
                </p>
                <div className="space-y-1">
                  {mutualServers.map((srv) => (
                    <button
                      key={srv.id}
                      type="button"
                      onClick={() => onSelectServer(srv.id)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
                    >
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-zinc-950"
                        style={{ backgroundColor: srv.accentColor }}
                      >
                        {srv.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={srv.iconUrl}
                            alt={srv.name}
                            className="h-full w-full rounded-md object-cover"
                          />
                        ) : (
                          srv.name.slice(0, 2).toUpperCase()
                        )}
                      </span>
                      <span dir="auto" className="truncate text-xs font-medium text-zinc-200">
                        {srv.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
