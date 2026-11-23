"use client";

import {
  Copy,
  Expand,
  Headphones,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  PhoneOff,
  PictureInPicture2,
  Play,
  Settings,
  Shrink,
  User,
  UserX,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { ConnectionState, type Track } from "livekit-client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { type ContextMenuEntry, useContextMenu } from "@/components/ui/ContextMenu";
import type { ProfilePopoverTarget } from "@/components/ui/UserProfilePopover";
import {
  useVoice,
  type VoiceParticipantView,
} from "@/components/voice/VoiceProvider";
import { playSound } from "@/lib/sounds";
import type { ChannelItem, PublicUser, VoiceParticipantSummary } from "@/lib/types";

function VideoTrackCanvas({
  track,
  mirror = false,
  className = "",
  videoRefExternal,
}: {
  track: Track;
  mirror?: boolean;
  className?: string;
  videoRefExternal?: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const localRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <video
      ref={(node) => {
        localRef.current = node;
        if (videoRefExternal) videoRefExternal.current = node;
      }}
      autoPlay
      playsInline
      muted
      className={`${mirror ? "-scale-x-100" : ""} ${className}`}
    />
  );
}

interface VoiceStageProps {
  channel: ChannelItem;
  currentUser: PublicUser;
  members: PublicUser[];
  livekitReady: boolean;
  previewOccupants: VoiceParticipantSummary[];
  isStageMaximized: boolean;
  onToggleMaximize: () => void;
  onOpenScreenShareModal: () => void;
  onOpenVoiceSettings: () => void;
  onOpenUserProfile: (target: ProfilePopoverTarget) => void;
  onJoinVoiceChannel: (channel: ChannelItem) => void;
  onLeaveVoiceChannel: () => void;
}

export function VoiceStage({
  channel,
  currentUser,
  members,
  livekitReady,
  previewOccupants,
  isStageMaximized,
  onToggleMaximize,
  onOpenScreenShareModal,
  onOpenVoiceSettings,
  onOpenUserProfile,
  onJoinVoiceChannel,
  onLeaveVoiceChannel,
}: VoiceStageProps) {
  const { openMenu } = useContextMenu();
  const {
    activeChannel,
    connectionState,
    participants,
    isMuted,
    isDeafened,
    isCameraOn,
    isScreenSharing,
    activeNoiseEngine,
    userVolumes,
    setUserVolume,
    kickParticipant,
    serverMuteParticipant,
    watchTargetIdentity,
    setWatchTargetIdentity,
    toggleMute,
    toggleDeafen,
    toggleCamera,
  } = useVoice();

  const [streamFit, setStreamFit] = useState<"contain" | "cover">("contain");
  const [streamMuted, setStreamMuted] = useState(false);
  const [liveVideoMeta, setLiveVideoMeta] = useState<{
    width: number;
    height: number;
    fps: number;
  } | null>(null);

  const stageVideoContainerRef = useRef<HTMLDivElement | null>(null);
  const focusedVideoElRef = useRef<HTMLVideoElement | null>(null);

  const isInThisChannel =
    activeChannel?.id === channel.id &&
    connectionState !== ConnectionState.Disconnected;

  const isConnecting =
    activeChannel?.id === channel.id &&
    connectionState === ConnectionState.Connecting;

  const screenSharers = participants.filter((p) => p.isScreenSharing && p.screenTrack);

  // Never auto-jump into someone's stream. Only clear watch target if the watched stream ends.
  useEffect(() => {
    if (!watchTargetIdentity) return;
    const stillLive = screenSharers.some((s) => s.identity === watchTargetIdentity);
    if (!stillLive) {
      setWatchTargetIdentity(null);
    }
  }, [screenSharers, setWatchTargetIdentity, watchTargetIdentity]);

  const focusedSharer: VoiceParticipantView | null =
    watchTargetIdentity
      ? (screenSharers.find((s) => s.identity === watchTargetIdentity) ?? null)
      : null;

  // Measure real rendered stream resolution & FPS from <video> element
  useEffect(() => {
    if (!focusedSharer) {
      setLiveVideoMeta(null);
      return;
    }

    let lastFrames = 0;
    let lastTime = performance.now();

    const timer = setInterval(() => {
      const el = focusedVideoElRef.current;
      if (!el || !el.videoWidth) return;
      const now = performance.now();
      const quality = el.getVideoPlaybackQuality?.();
      const totalFrames = quality?.totalVideoFrames ?? 0;
      const dt = (now - lastTime) / 1000;
      const fps =
        dt > 0.2 && lastFrames > 0
          ? Math.max(0, Math.round((totalFrames - lastFrames) / dt))
          : 0;

      lastFrames = totalFrames;
      lastTime = now;
      setLiveVideoMeta({
        width: el.videoWidth,
        height: el.videoHeight,
        fps,
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [focusedSharer]);

  function requestFullscreen() {
    const el = stageVideoContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen?.();
    }
  }

  async function togglePictureInPicture() {
    const videoEl = focusedVideoElRef.current;
    if (!videoEl) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoEl.requestPictureInPicture();
      }
    } catch {
      // ignore PiP refusal
    }
  }

  function handleCloseStream() {
    setWatchTargetIdentity(null);
    if (isStageMaximized) {
      onToggleMaximize();
    }
  }

  function resolveMemberVisuals(
    identity: string,
    fallback: {
      name: string;
      username?: string;
      avatarColor: string;
      avatarUrl?: string | null;
      bannerUrl?: string | null;
      role?: "admin" | "member";
    }
  ) {
    const m = members.find((item) => item.id === identity);
    return {
      name: m?.displayName ?? fallback.name,
      username: m?.username ?? fallback.username,
      avatarColor: m?.avatarColor ?? fallback.avatarColor,
      avatarUrl: m ? m.avatarUrl : (fallback.avatarUrl ?? null),
      bannerUrl: m ? m.bannerUrl : (fallback.bannerUrl ?? null),
      role: m?.role ?? fallback.role,
    };
  }

  function openParticipantProfile(
    e: React.MouseEvent<HTMLElement>,
    p: {
      identity: string;
      name: string;
      username?: string;
      avatarColor: string;
      avatarUrl?: string | null;
      bannerUrl?: string | null;
      role?: "admin" | "member";
      isScreenSharing?: boolean;
    }
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fresh = resolveMemberVisuals(p.identity, p);
    onOpenUserProfile({
      id: p.identity,
      displayName: fresh.name,
      username: fresh.username,
      avatarColor: fresh.avatarColor,
      avatarUrl: fresh.avatarUrl,
      bannerUrl: fresh.bannerUrl,
      role: fresh.role,
      online: true,
      inVoiceChannelName: channel.name,
      isScreenSharing: p.isScreenSharing,
      voiceChannelId: channel.id,
      anchorRect: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
    });
  }

  function handleParticipantContextMenu(
    e: React.MouseEvent<HTMLElement>,
    p: VoiceParticipantView
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fresh = resolveMemberVisuals(p.identity, p);

    const entries: ContextMenuEntry[] = [
      { type: "header", id: "hdr", label: fresh.name },
    ];

    if (p.isScreenSharing) {
      entries.push({
        type: "item",
        id: "watch-stream",
        label: "Watch Stream",
        icon: <Play className="h-3.5 w-3.5 text-emerald-400" />,
        onSelect: () => {
          setWatchTargetIdentity(p.identity);
        },
      });
    }

    entries.push({
      type: "item",
      id: "profile",
      label: "View Profile",
      icon: <User className="h-3.5 w-3.5" />,
      onSelect: () => {
        onOpenUserProfile({
          id: p.identity,
          displayName: fresh.name,
          username: fresh.username,
          avatarColor: fresh.avatarColor,
          avatarUrl: fresh.avatarUrl,
          bannerUrl: fresh.bannerUrl,
          role: fresh.role,
          online: true,
          inVoiceChannelName: channel.name,
          isScreenSharing: p.isScreenSharing,
          voiceChannelId: channel.id,
          anchorRect: {
            top: rect.top,
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          },
        });
      },
    });

    if (fresh.username) {
      entries.push({
        type: "item",
        id: "copy-user",
        label: "Copy Username",
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => {
          void navigator.clipboard.writeText(`@${fresh.username}`);
          playSound("copy");
        },
      });
    }

    if (!p.isLocal && currentUser.role === "admin") {
      entries.push(
        { type: "divider", id: "d-admin" },
        {
          type: "item",
          id: "server-mute",
          label: "Server Mute",
          icon: <MicOff className="h-3.5 w-3.5" />,
          onSelect: () => void serverMuteParticipant(p.identity, channel.slug),
        },
        {
          type: "item",
          id: "kick",
          label: "Kick from Voice",
          icon: <UserX className="h-3.5 w-3.5" />,
          danger: true,
          onSelect: () => void kickParticipant(p.identity, channel.slug),
        }
      );
    }

    openMenu(e, entries);
  }

  // Spacious Discord-inspired Voice Lobby (Pre-Join Stage)
  if (!isInThisChannel) {
    const occupantSummary = (() => {
      if (previewOccupants.length === 0) {
        return "No one is currently in voice · Double-click channel or press Join";
      }
      const names = previewOccupants.map((occ) => resolveMemberVisuals(occ.identity, occ).name);
      if (names.length === 1) return `${names[0]} is currently in voice`;
      if (names.length === 2) return `${names[0]} and ${names[1]} are currently in voice`;
      return `${names[0]}, ${names[1]}, and ${names.length - 2} ${names.length - 2 === 1 ? "other" : "others"} are currently in voice`;
    })();

    return (
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-[#0B0C0F] p-6">
        {/* Subtle ambient matte obsidian depth (zero blurple slop) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 42%, rgba(16, 185, 129, 0.07) 0%, rgba(9, 9, 11, 0) 72%)",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 flex w-full max-w-2xl flex-col items-center text-center"
        >
          {/* Occupant Preview Tile Row (matches Discord lobby cards in Obsidian + user accent tint) */}
          {previewOccupants.length > 0 ? (
            <div className="mb-7 flex flex-wrap items-center justify-center gap-3">
              {previewOccupants.slice(0, 6).map((occ) => {
                const fresh = resolveMemberVisuals(occ.identity, occ);
                return (
                  <button
                    key={occ.identity}
                    type="button"
                    onClick={(e) => openParticipantProfile(e, occ)}
                    style={{
                      backgroundColor: `${fresh.avatarColor}18`,
                      borderColor: `${fresh.avatarColor}30`,
                    }}
                    className="group relative flex h-28 w-44 flex-col items-center justify-center rounded-xl border transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]"
                  >
                    {occ.isScreenSharing && (
                      <span className="absolute right-2 top-2 rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white shadow-sm">
                        LIVE
                      </span>
                    )}
                    <Avatar
                      name={fresh.name}
                      color={fresh.avatarColor}
                      avatarUrl={fresh.avatarUrl}
                      size="lg"
                    />
                    <span
                      dir="auto"
                      className="mt-2 max-w-[140px] truncate text-[11px] font-medium text-zinc-200"
                    >
                      {fresh.name}
                    </span>
                  </button>
                );
              })}
              {previewOccupants.length > 6 && (
                <div className="flex h-28 w-24 items-center justify-center rounded-xl border border-white/[0.08] bg-[#14151A] text-sm font-semibold tabular-nums text-zinc-300">
                  +{previewOccupants.length - 6}
                </div>
              )}
            </div>
          ) : (
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
              <Volume2 className="h-7 w-7" />
            </div>
          )}

          <h2
            dir="auto"
            className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl"
          >
            {channel.name}
          </h2>
          <p className="mt-1.5 max-w-md text-xs text-zinc-400 sm:text-sm">
            {occupantSummary}
          </p>

          {!livekitReady && (
            <div className="mt-5 max-w-md rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3.5 text-left text-xs leading-relaxed text-amber-200">
              <p className="font-medium text-amber-300">LiveKit keys required</p>
              <p className="mt-1 text-amber-200/80">
                Add <code className="font-mono">NEXT_PUBLIC_LIVEKIT_URL</code>,{" "}
                <code className="font-mono">LIVEKIT_API_KEY</code>, and{" "}
                <code className="font-mono">LIVEKIT_API_SECRET</code> in Vercel to activate
                voice &amp; screen share.
              </p>
            </div>
          )}

          <button
            type="button"
            disabled={!livekitReady || isConnecting}
            onClick={() => onJoinVoiceChannel(channel)}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-7 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-500/15 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Headphones className="h-4 w-4" />
            <span>{isConnecting ? "Connecting..." : "Join Voice"}</span>
          </button>
        </motion.div>
      </div>
    );
  }

  const streamAudioKey = focusedSharer ? `${focusedSharer.identity}:screen` : "";
  const streamAudioVol = streamAudioKey ? (userVolumes[streamAudioKey] ?? 1) : 1;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#0B0C0F]">
      {/* Main Media Area */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-5">
        {/* Focused Screen Share Theater (only shown when user explicitly clicks Watch Stream) */}
        <AnimatePresence>
          {focusedSharer && focusedSharer.screenTrack && (
            <motion.div
              ref={stageVideoContainerRef}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={`group/theater relative flex flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-black ${
                isStageMaximized ? "min-h-[72dvh] flex-1" : "min-h-[340px] flex-1"
              }`}
            >
              {/* Video Surface */}
              <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
                <VideoTrackCanvas
                  track={focusedSharer.screenTrack}
                  videoRefExternal={focusedVideoElRef}
                  className={`h-full w-full ${
                    isStageMaximized ? "max-h-[78dvh]" : "max-h-[64dvh]"
                  } ${streamFit === "cover" ? "object-cover" : "object-contain"}`}
                />

                {/* Top Floating HUD */}
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 py-3 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-hover/theater:opacity-100">
                  <div className="pointer-events-auto flex min-w-0 items-center gap-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-300 ring-1 ring-emerald-500/35">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      LIVE
                    </span>
                    <Avatar
                      name={resolveMemberVisuals(focusedSharer.identity, focusedSharer).name}
                      color={resolveMemberVisuals(focusedSharer.identity, focusedSharer).avatarColor}
                      avatarUrl={resolveMemberVisuals(focusedSharer.identity, focusedSharer).avatarUrl}
                      size="xs"
                    />
                    <span dir="auto" className="truncate text-xs font-semibold text-white">
                      {resolveMemberVisuals(focusedSharer.identity, focusedSharer).name}&apos;s screen
                    </span>
                    {liveVideoMeta && (
                      <span className="hidden rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-zinc-200 ring-1 ring-white/10 sm:inline">
                        {liveVideoMeta.width}×{liveVideoMeta.height}
                        {liveVideoMeta.fps > 0 ? ` · ${liveVideoMeta.fps} fps` : ""}
                      </span>
                    )}
                  </div>

                  <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
                    {screenSharers.length > 1 &&
                      screenSharers.map((s) => (
                        <button
                          key={s.identity}
                          type="button"
                          onClick={() => setWatchTargetIdentity(s.identity)}
                          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                            s.identity === focusedSharer.identity
                              ? "bg-emerald-500 text-zinc-950"
                              : "bg-black/60 text-zinc-300 ring-1 ring-white/15 hover:text-white"
                          }`}
                        >
                          {resolveMemberVisuals(s.identity, s).name}
                        </button>
                      ))}

                    <button
                      type="button"
                      onClick={handleCloseStream}
                      title="Close stream view (stay in voice)"
                      className="inline-flex items-center gap-1 rounded-lg bg-black/65 px-2.5 py-1 text-xs font-medium text-zinc-200 ring-1 ring-white/15 transition-colors hover:bg-rose-500/80 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Close</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom Theater Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-[#0E0F12] px-4 py-2">
                <div className="flex items-center gap-2.5">
                  {!focusedSharer.isLocal && focusedSharer.screenAudioTrack ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!streamMuted) {
                            setStreamMuted(true);
                            setUserVolume(streamAudioKey, 0);
                          } else {
                            setStreamMuted(false);
                            setUserVolume(streamAudioKey, 1);
                          }
                        }}
                        title={streamMuted || streamAudioVol === 0 ? "Unmute stream" : "Mute stream"}
                        className="rounded-md p-1 text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                      >
                        {streamMuted || streamAudioVol === 0 ? (
                          <VolumeX className="h-4 w-4 text-rose-400" />
                        ) : (
                          <Volume2 className="h-4 w-4 text-emerald-400" />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        aria-label="Stream audio volume"
                        value={streamAudioVol}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setStreamMuted(v === 0);
                          setUserVolume(streamAudioKey, v);
                        }}
                        className="h-1.5 w-24 cursor-pointer accent-emerald-500"
                      />
                      <span className="w-9 text-[11px] font-medium tabular-nums text-zinc-400">
                        {Math.round(streamAudioVol * 100)}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-500">
                      {focusedSharer.isLocal
                        ? "You are streaming · click Stream Options to adjust or stop"
                        : "Stream video only"}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setStreamFit((f) => (f === "contain" ? "cover" : "contain"))
                    }
                    title={streamFit === "contain" ? "Fill frame" : "Fit frame"}
                    className="rounded-lg border border-white/[0.09] bg-[#18191E] p-1.5 text-zinc-300 transition-colors hover:border-white/[0.18] hover:text-white"
                  >
                    {streamFit === "contain" ? (
                      <Expand className="h-3.5 w-3.5" />
                    ) : (
                      <Shrink className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => void togglePictureInPicture()}
                    title="Picture-in-Picture"
                    className="rounded-lg border border-white/[0.09] bg-[#18191E] p-1.5 text-zinc-300 transition-colors hover:border-white/[0.18] hover:text-white"
                  >
                    <PictureInPicture2 className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={onToggleMaximize}
                    title={isStageMaximized ? "Restore layout" : "Maximize stage"}
                    className={`rounded-lg border p-1.5 transition-colors ${
                      isStageMaximized
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : "border-white/[0.09] bg-[#18191E] text-zinc-300 hover:border-white/[0.18] hover:text-white"
                    }`}
                  >
                    {isStageMaximized ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={requestFullscreen}
                    title="Fullscreen"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#18191E] px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 transition-colors hover:border-white/[0.18] hover:text-white"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Fullscreen</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Participant Grid (clean cards, NO volume slider here — volume is exclusively in left sidebar) */}
        <div
          className={`grid gap-3 ${
            focusedSharer
              ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
              : participants.length <= 2
                ? "my-auto grid-cols-1 sm:grid-cols-2"
                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          }`}
        >
          {participants.map((p) => {
            const fresh = resolveMemberVisuals(p.identity, p);
            return (
              <motion.div
                key={p.identity}
                layout
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                onContextMenu={(e) => handleParticipantContextMenu(e, p)}
                className={`relative flex flex-col justify-between overflow-hidden rounded-xl border bg-[#121316] transition-colors duration-100 ${
                  p.isSpeaking
                    ? "border-emerald-500/75 ring-1 ring-emerald-500/35"
                    : "border-white/[0.08]"
                } ${focusedSharer ? "min-h-[126px]" : "min-h-[210px]"}`}
              >
                {/* Video or Avatar Center */}
                <button
                  type="button"
                  onClick={(e) => openParticipantProfile(e, p)}
                  className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#0E0F12] text-left focus:outline-none"
                >
                  {p.isCameraOn && p.cameraTrack ? (
                    <VideoTrackCanvas
                      track={p.cameraTrack}
                      mirror={p.isLocal}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Avatar
                      name={fresh.name}
                      color={fresh.avatarColor}
                      avatarUrl={fresh.avatarUrl}
                      size={focusedSharer ? "md" : "lg"}
                      speaking={p.isSpeaking}
                      speakingOffsetClassName="ring-offset-[#0E0F12]"
                    />
                  )}

                  {p.isScreenSharing && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        openParticipantProfile(e, p);
                      }}
                      title="Click to view profile & watch stream"
                      className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-md border border-emerald-500/45 bg-black/80 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-300 transition-colors hover:bg-emerald-500 hover:text-zinc-950"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      <span>LIVE</span>
                    </span>
                  )}
                </button>

                {/* Clean Participant Footer (Name + Mic status only) */}
                <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] bg-[#121316] px-3.5 py-2.5">
                  <button
                    type="button"
                    onClick={(e) => openParticipantProfile(e, p)}
                    className="flex min-w-0 items-center gap-1.5 text-left hover:underline"
                  >
                    <span dir="auto" className="truncate text-xs font-semibold text-zinc-100">
                      {fresh.name}
                    </span>
                    {p.isLocal && (
                      <span className="text-[11px] font-medium text-zinc-500">(you)</span>
                    )}
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5 text-zinc-400">
                    {p.isMuted ? (
                      <MicOff className="h-3.5 w-3.5 text-rose-400" />
                    ) : (
                      <Mic
                        className={`h-3.5 w-3.5 transition-colors duration-100 ${
                          p.isSpeaking ? "text-emerald-400" : "text-zinc-400"
                        }`}
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Bottom Voice Control Deck */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/[0.07] bg-[#0E0F12] px-4 py-3">
        <div className="hidden items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={onOpenVoiceSettings}
            title="Noise cancellation & audio settings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#14151A] px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:border-emerald-500/35 hover:text-emerald-300"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                activeNoiseEngine === "off" ? "bg-zinc-600" : "bg-emerald-400"
              }`}
            />
            <span>
              NC:{" "}
              {activeNoiseEngine === "krisp"
                ? "Krisp AI"
                : activeNoiseEngine === "gtcrn"
                  ? "GTCRN AI"
                  : activeNoiseEngine === "rnnoise"
                    ? "RNNoise AI"
                    : activeNoiseEngine === "standard"
                      ? "Standard"
                      : "Off"}
            </span>
          </button>
        </div>

        <div className="mx-auto flex items-center gap-2 sm:mx-0">
          <button
            type="button"
            onClick={() => void toggleMute()}
            title={isMuted ? "Unmute mic" : "Mute mic"}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-all active:scale-[0.97] ${
              isMuted
                ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                : "border-white/[0.08] bg-[#18191E] text-zinc-100 hover:bg-white/[0.08]"
            }`}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            <span className="hidden sm:inline">{isMuted ? "Muted" : "Mute"}</span>
          </button>

          <button
            type="button"
            onClick={() => void toggleDeafen()}
            title={isDeafened ? "Undeafen" : "Deafen"}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-all active:scale-[0.97] ${
              isDeafened
                ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                : "border-white/[0.08] bg-[#18191E] text-zinc-100 hover:bg-white/[0.08]"
            }`}
          >
            {isDeafened ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{isDeafened ? "Deafened" : "Deafen"}</span>
          </button>

          <button
            type="button"
            onClick={() => void toggleCamera()}
            title={isCameraOn ? "Turn off camera" : "Turn on camera"}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-all active:scale-[0.97] ${
              isCameraOn
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-white/[0.08] bg-[#18191E] text-zinc-100 hover:bg-white/[0.08]"
            }`}
          >
            {isCameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            <span className="hidden sm:inline">Camera</span>
          </button>

          {/* Share Screen opens options / live controls modal — never kills stream on accidental click */}
          <button
            type="button"
            onClick={onOpenScreenShareModal}
            title={isScreenSharing ? "Stream options & stop" : "Share screen"}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-all active:scale-[0.97] ${
              isScreenSharing
                ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                : "border-white/[0.08] bg-[#18191E] text-zinc-100 hover:bg-white/[0.08]"
            }`}
          >
            <Monitor className="h-4 w-4" />
            <span className="hidden sm:inline">
              {isScreenSharing ? "Stream Options" : "Share Screen"}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenVoiceSettings}
            title="Voice & Video settings"
            className="rounded-lg border border-white/[0.08] bg-[#18191E] p-2 text-zinc-300 transition-all hover:text-white active:scale-[0.97]"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onLeaveVoiceChannel}
            title="Disconnect from voice"
            className="ml-1 flex items-center gap-2 rounded-lg bg-rose-500 px-3.5 py-2 text-xs font-semibold text-white transition-all hover:bg-rose-400 active:scale-[0.97]"
          >
            <PhoneOff className="h-4 w-4" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>

        <div className="hidden w-24 sm:block" />
      </div>
    </div>
  );
}
