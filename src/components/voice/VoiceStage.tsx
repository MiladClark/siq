"use client";

import {
  ArrowsOut,
  Headphones,
  Microphone,
  MicrophoneSlash,
  MonitorPlay,
  PhoneDisconnect,
  Sliders,
  SpeakerHigh,
  SpeakerSlash,
  VideoCamera,
  VideoCameraSlash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { ConnectionState, type Track } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import {
  type ScreenSharePreset,
  useVoice,
  type VoiceParticipantView,
} from "@/components/voice/VoiceProvider";
import type { ChannelItem, VoiceParticipantSummary } from "@/lib/types";

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
  livekitReady: boolean;
  previewOccupants: VoiceParticipantSummary[];
}

export function VoiceStage({
  channel,
  livekitReady,
  previewOccupants,
}: VoiceStageProps) {
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

  // Auto-focus the first active screen share when one starts
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

  // Not yet joined to this voice channel
  if (!isInThisChannel) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#0E0F12] p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <SpeakerHigh size={22} weight="fill" />
            </div>
            <div className="min-w-0">
              <h2 dir="auto" className="truncate text-lg font-semibold text-zinc-100">
                {channel.name}
              </h2>
              <p className="text-xs text-zinc-400">
                {previewOccupants.length === 0
                  ? "No one in voice yet"
                  : `${previewOccupants.length} ${previewOccupants.length === 1 ? "person" : "people"} connected`}
              </p>
            </div>
          </div>

          {previewOccupants.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
              {previewOccupants.map((occ) => (
                <div
                  key={occ.identity}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-[#14151A] px-2.5 py-1.5"
                >
                  <Avatar name={occ.name} color={occ.avatarColor} size="sm" />
                  <span dir="auto" className="text-xs text-zinc-200">
                    {occ.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!livekitReady && (
            <div className="mt-5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3.5 text-xs leading-relaxed text-amber-200">
              <p className="font-medium text-amber-300">LiveKit keys required</p>
              <p className="mt-1 text-amber-200/80">
                Add <code className="font-mono">NEXT_PUBLIC_LIVEKIT_URL</code>,{" "}
                <code className="font-mono">LIVEKIT_API_KEY</code>, and{" "}
                <code className="font-mono">LIVEKIT_API_SECRET</code> in Vercel /{" "}
                <code className="font-mono">.env.local</code> to activate voice &amp; screen share.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              <WarningCircle size={15} weight="bold" className="mt-0.5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={clearError} className="text-rose-200 hover:text-white">
                <X size={14} />
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={!livekitReady || isConnecting}
            onClick={() => void joinVoiceChannel(channel)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Headphones size={17} weight="bold" />
            <span>
              {isConnecting
                ? "Connecting..."
                : activeChannel && activeChannel.id !== channel.id
                  ? `Switch to ${channel.name}`
                  : "Join Voice"}
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#0B0C0F]">
      {error && (
        <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <WarningCircle size={15} weight="bold" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={clearError} className="hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Media Area */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
        {/* Focused Screen Share Theater */}
        {focusedSharer && focusedSharer.screenTrack && (
          <div
            ref={stageVideoContainerRef}
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
                    <SpeakerHigh size={14} className="text-zinc-400" />
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
                      {Math.round((userVolumes[`${focusedSharer.identity}:screen`] ?? 1) * 100)}%
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={requestFullscreen}
                  title="Fullscreen"
                  className="rounded-lg border border-white/[0.1] bg-[#18191E] p-1.5 text-zinc-300 transition-colors hover:text-white"
                >
                  <ArrowsOut size={15} />
                </button>
              </div>
            </div>
          </div>
        )}

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
          {participants.map((p) => {
            const vol = userVolumes[p.identity] ?? 1;
            return (
              <div
                key={p.identity}
                className={`relative flex flex-col justify-between overflow-hidden rounded-xl border bg-[#121316] transition-all ${
                  p.isSpeaking
                    ? "border-emerald-500/70 ring-1 ring-emerald-500/40"
                    : "border-white/[0.08]"
                } ${focusedSharer ? "min-h-[140px]" : "min-h-[210px]"}`}
              >
                {/* Video or Avatar Center */}
                <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#0E0F12]">
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
                      <Avatar name={p.name} color={p.avatarColor} size="lg" />
                    </div>
                  )}

                  {p.isScreenSharing && (
                    <button
                      type="button"
                      onClick={() => setFocusedScreenIdentity(p.identity)}
                      className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-black/75 px-2 py-0.5 text-[10px] font-medium text-emerald-300 hover:bg-black"
                    >
                      <MonitorPlay size={12} weight="bold" />
                      <span>LIVE</span>
                    </button>
                  )}
                </div>

                {/* Participant Footer + Per-User Volume Slider */}
                <div className="space-y-2 border-t border-white/[0.06] bg-[#121316] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span dir="auto" className="truncate text-xs font-medium text-zinc-100">
                        {p.name}
                      </span>
                      {p.isLocal && (
                        <span className="font-mono text-[10px] text-zinc-500">(you)</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-zinc-400">
                      {p.isMuted ? (
                        <MicrophoneSlash size={14} className="text-rose-400" />
                      ) : (
                        <Microphone
                          size={14}
                          className={p.isSpeaking ? "text-emerald-400" : "text-zinc-400"}
                        />
                      )}
                    </div>
                  </div>

                  {!p.isLocal && (
                    <div className="flex items-center gap-2">
                      <SpeakerHigh size={12} className="shrink-0 text-zinc-500" />
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
              </div>
            );
          })}
        </div>
      </div>

      {/* Audio/Video Settings Popover */}
      {settingsOpen && (
        <div className="absolute bottom-20 left-1/2 z-30 w-[92%] max-w-sm -translate-x-1/2 rounded-xl border border-white/[0.12] bg-[#14151A] p-4 shadow-2xl shadow-black/70">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-100">
              Voice &amp; Stream Settings
            </span>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="rounded-md p-1 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
            >
              <X size={14} />
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
        </div>
      )}

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
          {isMuted ? <MicrophoneSlash size={16} weight="bold" /> : <Microphone size={16} />}
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
          {isDeafened ? <SpeakerSlash size={16} weight="bold" /> : <SpeakerHigh size={16} />}
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
          {isCameraOn ? <VideoCamera size={16} weight="fill" /> : <VideoCameraSlash size={16} />}
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
          <MonitorPlay size={16} weight={isScreenSharing ? "fill" : "regular"} />
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
          <Sliders size={16} />
        </button>

        <button
          type="button"
          onClick={() => void leaveVoiceChannel()}
          title="Disconnect from voice"
          className="ml-1 flex items-center gap-2 rounded-lg bg-rose-500 px-3.5 py-2 text-xs font-semibold text-white transition-all hover:bg-rose-400 active:scale-[0.97]"
        >
          <PhoneDisconnect size={16} weight="bold" />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>
    </div>
  );
}
