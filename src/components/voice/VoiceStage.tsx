"use client";

import {
  AlertCircle,
  Copy,
  Headphones,
  Maximize2,
  Mic,
  MicOff,
  Monitor,
  PhoneOff,
  SlidersHorizontal,
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
  type ScreenSharePreset,
  useVoice,
  type VoiceParticipantView,
} from "@/components/voice/VoiceProvider";
import { playSound } from "@/lib/sounds";
import type { ChannelItem, PublicUser, VoiceParticipantSummary } from "@/lib/types";

function VideoTrackCanvas({
  track,
  mirror = false,
  className = "",
}: {
  track: Track;
  mirror?: boolean;
  className?: string;
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
      className={`${mirror ? "-scale-x-100" : ""} ${className}`}
    />
  );
}

interface VoiceStageProps {
  channel: ChannelItem;
  currentUser: PublicUser;
  livekitReady: boolean;
  previewOccupants: VoiceParticipantSummary[];
  onOpenUserProfile: (target: ProfilePopoverTarget) => void;
}

export function VoiceStage({
  channel,
  currentUser,
  livekitReady,
  previewOccupants,
  onOpenUserProfile,
}: VoiceStageProps) {
  const { openMenu } = useContextMenu();
  const {
    activeChannel,
    connectionState,
    error,
    participants,
    isMuted,
    isDeafened,
    isCameraOn,
    isScreenSharing,
    screenPreset,
    setScreenPreset,
    noiseSuppression,
    toggleNoiseSuppression,
    devices,
    selectedAudioInput,
    selectedAudioOutput,
    selectedVideoInput,
    setAudioInput,
    setAudioOutput,
    setVideoInput,
    refreshDevices,
    userVolumes,
    setUserVolume,
    toggleLocalMuteUser,
    kickParticipant,
    serverMuteParticipant,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    clearError,
  } = useVoice();

  const [focusedScreenIdentity, setFocusedScreenIdentity] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const stageVideoContainerRef = useRef<HTMLDivElement | null>(null);

  const isInThisChannel =
    activeChannel?.id === channel.id &&
    connectionState !== ConnectionState.Disconnected;

  const isConnecting =
    activeChannel?.id === channel.id &&
    connectionState === ConnectionState.Connecting;

  const screenSharers = participants.filter((p) => p.isScreenSharing && p.screenTrack);

  useEffect(() => {
    if (screenSharers.length === 0) {
      setFocusedScreenIdentity(null);
      return;
    }
    if (
      !focusedScreenIdentity ||
      !screenSharers.some((s) => s.identity === focusedScreenIdentity)
    ) {
      setFocusedScreenIdentity(screenSharers[0].identity);
    }
  }, [screenSharers, focusedScreenIdentity]);

  const focusedSharer: VoiceParticipantView | null =
    screenSharers.find((s) => s.identity === focusedScreenIdentity) ?? null;

  function requestFullscreen() {
    const el = stageVideoContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen?.();
    }
  }

  function openParticipantProfile(
    e: React.MouseEvent<HTMLElement>,
    p: {
      identity: string;
      name: string;
      username?: string;
      avatarColor: string;
      avatarUrl?: string | null;
      role?: "admin" | "member";
    }
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    onOpenUserProfile({
      id: p.identity,
      displayName: p.name,
      username: p.username,
      avatarColor: p.avatarColor,
      avatarUrl: p.avatarUrl,
      role: p.role,
      online: true,
      inVoiceChannelName: channel.name,
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
    const currentVol = userVolumes[p.identity] ?? 1;
    const isLocallyMuted = currentVol === 0;
    const rect = e.currentTarget.getBoundingClientRect();

    const entries: ContextMenuEntry[] = [
      { type: "header", id: "hdr", label: p.name },
      {
        type: "item",
        id: "profile",
        label: "View Profile",
        icon: <User className="h-3.5 w-3.5" />,
        onSelect: () => {
          onOpenUserProfile({
            id: p.identity,
            displayName: p.name,
            username: p.username,
            avatarColor: p.avatarColor,
            avatarUrl: p.avatarUrl,
            role: p.role,
            online: true,
            inVoiceChannelName: channel.name,
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
      },
    ];

    if (p.username) {
      entries.push({
        type: "item",
        id: "copy-user",
        label: "Copy Username",
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => {
          void navigator.clipboard.writeText(`@${p.username}`);
          playSound("copy");
        },
      });
    }

    if (!p.isLocal) {
      entries.push(
        { type: "divider", id: "d1" },
        {
          type: "slider",
          id: "vol",
          label: "User Volume",
          value: currentVol,
          onChange: (v) => setUserVolume(p.identity, v),
        },
        {
          type: "item",
          id: "local-mute",
          label: isLocallyMuted ? "Unmute for me" : "Mute for me",
          icon: isLocallyMuted ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" />
          ),
          onSelect: () => toggleLocalMuteUser(p.identity),
        }
      );

      if (currentUser.role === "admin") {
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
    }

    openMenu(e, entries);
  }

  // Not yet joined to this voice channel
  if (!isInThisChannel) {
    return (
      <motion.div
        key={`voice-preview-${channel.id}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-1 flex-col items-center justify-center p-6"
      >
        <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#0E0F12] p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Volume2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 dir="auto" className="truncate text-lg font-semibold text-zinc-100">
                {channel.name}
              </h2>
              <p className="text-xs text-zinc-400">
                {previewOccupants.length === 0
                  ? "No one in voice yet · Double-click channel to join instantly"
                  : `${previewOccupants.length} ${previewOccupants.length === 1 ? "person" : "people"} connected`}
              </p>
            </div>
          </div>

          {previewOccupants.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
              {previewOccupants.map((occ) => (
                <button
                  key={occ.identity}
                  type="button"
                  onClick={(e) => openParticipantProfile(e, occ)}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-[#14151A] px-2.5 py-1.5 transition-colors hover:border-white/[0.15]"
                >
                  <Avatar
                    name={occ.name}
                    color={occ.avatarColor}
                    avatarUrl={occ.avatarUrl}
                    size="sm"
                  />
                  <span dir="auto" className="text-xs text-zinc-200">
                    {occ.name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {!livekitReady && (
            <div className="mt-5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3.5 text-xs leading-relaxed text-amber-200">
              <p className="font-medium text-amber-300">LiveKit keys required</p>
              <p className="mt-1 text-amber-200/80">
                Add <code className="font-mono">NEXT_PUBLIC_LIVEKIT_URL</code>,{" "}
                <code className="font-mono">LIVEKIT_API_KEY</code>, and{" "}
                <code className="font-mono">LIVEKIT_API_SECRET</code> in Vercel to activate
                voice &amp; screen share.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={clearError} className="hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={!livekitReady || isConnecting}
            onClick={() => void joinVoiceChannel(channel)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Headphones className="h-4 w-4" />
            <span>{isConnecting ? "Connecting..." : "Join Voice"}</span>
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key={`voice-live-${channel.id}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className="relative flex min-h-0 flex-1 flex-col bg-[#0B0C0F]"
    >
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={clearError} className="hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Media Area */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
        {/* Focused Screen Share Theater */}
        <AnimatePresence>
          {focusedSharer && focusedSharer.screenTrack && (
            <motion.div
              ref={stageVideoContainerRef}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-black"
            >
              <VideoTrackCanvas
                track={focusedSharer.screenTrack}
                className="h-full max-h-[65dvh] w-full object-contain"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-[#0E0F12]/95 px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span dir="auto" className="text-xs font-medium text-zinc-100">
                    {focusedSharer.name}&apos;s screen
                  </span>
                  {screenSharers.length > 1 && (
                    <div className="ml-2 flex items-center gap-1">
                      {screenSharers.map((s) => (
                        <button
                          key={s.identity}
                          type="button"
                          onClick={() => setFocusedScreenIdentity(s.identity)}
                          className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                            s.identity === focusedSharer.identity
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-white/[0.06] text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {!focusedSharer.isLocal && focusedSharer.screenAudioTrack && (
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-3.5 w-3.5 text-zinc-400" />
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        aria-label="Stream audio volume"
                        value={userVolumes[`${focusedSharer.identity}:screen`] ?? 1}
                        onChange={(e) =>
                          setUserVolume(
                            `${focusedSharer.identity}:screen`,
                            Number(e.target.value)
                          )
                        }
                        className="h-1.5 w-24 cursor-pointer accent-emerald-500"
                      />
                      <span className="w-9 font-mono text-[11px] text-zinc-400">
                        {Math.round(
                          (userVolumes[`${focusedSharer.identity}:screen`] ?? 1) * 100
                        )}
                        %
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={requestFullscreen}
                    title="Fullscreen"
                    className="rounded-lg border border-white/[0.1] bg-[#18191E] p-1.5 text-zinc-300 transition-colors hover:text-white"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Participant Grid */}
        <div
          className={`grid gap-3 ${
            focusedSharer
              ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
              : participants.length <= 2
                ? "my-auto grid-cols-1 sm:grid-cols-2"
                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          }`}
        >
          <AnimatePresence>
            {participants.map((p) => {
              const vol = userVolumes[p.identity] ?? 1;
              return (
                <motion.div
                  key={p.identity}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  onContextMenu={(e) => handleParticipantContextMenu(e, p)}
                  className={`relative flex flex-col justify-between overflow-hidden rounded-xl border bg-[#121316] transition-colors ${
                    p.isSpeaking
                      ? "border-emerald-500/70 ring-1 ring-emerald-500/40"
                      : "border-white/[0.08]"
                  } ${focusedSharer ? "min-h-[140px]" : "min-h-[210px]"}`}
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
                      <div
                        className={`rounded-full p-1 transition-shadow ${
                          p.isSpeaking
                            ? "ring-2 ring-emerald-400 ring-offset-4 ring-offset-[#0E0F12]"
                            : ""
                        }`}
                      >
                        <Avatar
                          name={p.name}
                          color={p.avatarColor}
                          avatarUrl={p.avatarUrl}
                          size="lg"
                        />
                      </div>
                    )}

                    {p.isScreenSharing && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusedScreenIdentity(p.identity);
                        }}
                        className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-black/75 px-2 py-0.5 text-[10px] font-medium text-emerald-300 hover:bg-black"
                      >
                        <Monitor className="h-3 w-3" />
                        <span>LIVE</span>
                      </span>
                    )}
                  </button>

                  {/* Participant Footer + Per-User Volume Slider */}
                  <div className="space-y-2 border-t border-white/[0.06] bg-[#121316] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => openParticipantProfile(e, p)}
                        className="flex min-w-0 items-center gap-1.5 text-left hover:underline"
                      >
                        <span dir="auto" className="truncate text-xs font-medium text-zinc-100">
                          {p.name}
                        </span>
                        {p.isLocal && (
                          <span className="font-mono text-[10px] text-zinc-500">(you)</span>
                        )}
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5 text-zinc-400">
                        {p.isMuted ? (
                          <MicOff className="h-3.5 w-3.5 text-rose-400" />
                        ) : (
                          <Mic
                            className={`h-3.5 w-3.5 ${
                              p.isSpeaking ? "text-emerald-400" : "text-zinc-400"
                            }`}
                          />
                        )}
                      </div>
                    </div>

                    {!p.isLocal && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleLocalMuteUser(p.identity)}
                          title={vol === 0 ? "Unmute for me" : "Mute for me"}
                          className="shrink-0 text-zinc-500 hover:text-zinc-200"
                        >
                          {vol === 0 ? (
                            <VolumeX className="h-3 w-3 text-rose-400" />
                          ) : (
                            <Volume2 className="h-3 w-3" />
                          )}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={2}
                          step={0.05}
                          aria-label={`Volume for ${p.name}`}
                          value={vol}
                          onChange={(e) => setUserVolume(p.identity, Number(e.target.value))}
                          className="h-1 flex-1 cursor-pointer accent-emerald-500"
                        />
                        <span className="w-8 text-right font-mono text-[10px] text-zinc-500">
                          {Math.round(vol * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Audio/Video Settings Popover */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-20 left-1/2 z-30 w-[92%] max-w-sm -translate-x-1/2 rounded-xl border border-white/[0.12] bg-[#14151A] p-4 shadow-2xl shadow-black/75"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-100">
                Voice &amp; Stream Settings
              </span>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-md p-1 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label htmlFor="voice-mic-select" className="block text-zinc-400">
                  Microphone
                </label>
                <select
                  id="voice-mic-select"
                  value={selectedAudioInput}
                  onChange={(e) => void setAudioInput(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.1] bg-[#0E0F12] px-2.5 py-2 text-zinc-100"
                >
                  <option value="">System Default</option>
                  {devices.audioInputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                    </option>
                  ))}
                </select>
              </div>

              {devices.audioOutputs.length > 0 && (
                <div className="space-y-1">
                  <label htmlFor="voice-speaker-select" className="block text-zinc-400">
                    Output / Headset
                  </label>
                  <select
                    id="voice-speaker-select"
                    value={selectedAudioOutput}
                    onChange={(e) => setAudioOutput(e.target.value)}
                    className="w-full rounded-lg border border-white/[0.1] bg-[#0E0F12] px-2.5 py-2 text-zinc-100"
                  >
                    <option value="">System Default</option>
                    {devices.audioOutputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Speaker ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {devices.videoInputs.length > 0 && (
                <div className="space-y-1">
                  <label htmlFor="voice-cam-select" className="block text-zinc-400">
                    Webcam
                  </label>
                  <select
                    id="voice-cam-select"
                    value={selectedVideoInput}
                    onChange={(e) => void setVideoInput(e.target.value)}
                    className="w-full rounded-lg border border-white/[0.1] bg-[#0E0F12] px-2.5 py-2 text-zinc-100"
                  >
                    <option value="">System Default</option>
                    {devices.videoInputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="screen-preset-select" className="block text-zinc-400">
                  Screen share quality
                </label>
                <select
                  id="screen-preset-select"
                  value={screenPreset}
                  onChange={(e) => setScreenPreset(e.target.value as ScreenSharePreset)}
                  className="w-full rounded-lg border border-white/[0.1] bg-[#0E0F12] px-2.5 py-2 text-zinc-100"
                >
                  <option value="1080p60">1080p · 60fps (Gaming / Smooth)</option>
                  <option value="1080p30">1080p · 30fps (Sharp Text)</option>
                  <option value="720p30">720p · 30fps (Low Bandwidth)</option>
                </select>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-[#0E0F12] px-3 py-2">
                <span className="text-zinc-300">Noise suppression</span>
                <button
                  type="button"
                  onClick={() => void toggleNoiseSuppression()}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    noiseSuppression
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-white/[0.06] text-zinc-400"
                  }`}
                >
                  {noiseSuppression ? "On" : "Off"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Voice Control Deck */}
      <div className="flex shrink-0 items-center justify-center gap-2 border-t border-white/[0.07] bg-[#0E0F12] px-4 py-3">
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

        <button
          type="button"
          onClick={() => void toggleScreenShare()}
          title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
          className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-all active:scale-[0.97] ${
            isScreenSharing
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              : "border-white/[0.08] bg-[#18191E] text-zinc-100 hover:bg-white/[0.08]"
          }`}
        >
          <Monitor className="h-4 w-4" />
          <span className="hidden sm:inline">
            {isScreenSharing ? "Stop Share" : "Share Screen"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (!settingsOpen) void refreshDevices();
            setSettingsOpen((v) => !v);
          }}
          title="Audio & stream settings"
          className={`rounded-lg border p-2 text-zinc-300 transition-all hover:text-white active:scale-[0.97] ${
            settingsOpen
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-white/[0.08] bg-[#18191E]"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => void leaveVoiceChannel()}
          title="Disconnect from voice"
          className="ml-1 flex items-center gap-2 rounded-lg bg-rose-500 px-3.5 py-2 text-xs font-semibold text-white transition-all hover:bg-rose-400 active:scale-[0.97]"
        >
          <PhoneOff className="h-4 w-4" />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>
    </motion.div>
  );
}
