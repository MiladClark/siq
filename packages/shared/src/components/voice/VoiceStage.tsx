"use client";

import {
  Copy,
  Expand,
  Eye,
  Fullscreen,
  Headphones,
  Maximize2,
  Mic,
  MicOff,
  Minimize,
  Minimize2,
  Monitor,
  MonitorOff,
  PhoneOff,
  PictureInPicture2,
  Play,
  Radio,
  RotateCcw,
  Settings,
  Shrink,
  SlidersHorizontal,
  SwitchCamera,
  User,
  Users,
  UserX,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ConnectionState, type Track } from "livekit-client";
import { AnimatePresence, motion } from "motion/react";
import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Avatar } from "@siq/shared/components/ui/Avatar";
import { BarVisualizer } from "@siq/shared/components/ui/BarVisualizer";
import { type ContextMenuEntry, useContextMenu } from "@siq/shared/components/ui/ContextMenu";
import {
  DockItem,
  FloatingDock,
  SpotlightCard,
  StatusPill,
} from "@siq/shared/components/ui/MotionPrimitives";
import type { ProfilePopoverTarget } from "@siq/shared/components/ui/UserProfilePopover";
import {
  useVoice,
  type VoiceParticipantView,
} from "@siq/shared/components/voice/VoiceProvider";
import { playSound } from "@siq/shared/lib/sounds";
import type { ChannelItem, PublicUser, VoiceParticipantSummary } from "@siq/shared/lib/types";

function VideoTrackCanvas({
  track,
  mirror = false,
  style,
  className = "",
  videoRefExternal,
}: {
  track: Track;
  mirror?: boolean;
  style?: React.CSSProperties;
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
      style={style}
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
  onJoinVoiceChannel: (channel: ChannelItem, watchIdentity?: string) => void;
  onLeaveVoiceChannel: () => void;
}

function clampZoom(val: number): number {
  return Math.min(3, Math.max(1, Number(val.toFixed(2))));
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
    cameraFacingMode,
    isSwitchingCamera,
    canSwitchCamera,
    isScreenSharing,
    screenShareConfig,
    stopScreenShare,
    userVolumes,
    setUserVolume,
    kickParticipant,
    serverMuteParticipant,
    watchTargetIdentity,
    setWatchTargetIdentity,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    switchCameraFacingMode,
  } = useVoice();

  const [streamFit, setStreamFit] = useState<"contain" | "cover">("contain");
  const [streamZoom, setStreamZoom] = useState<number>(1);
  const [streamPan, setStreamPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null
  );

  const [showParticipantsStrip, setShowParticipantsStrip] = useState(true);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStreamVolRef = useRef<number>(1);

  const [liveVideoMeta, setLiveVideoMeta] = useState<{
    width: number;
    height: number;
    fps: number;
  } | null>(null);

  const stageRootRef = useRef<HTMLDivElement | null>(null);
  const videoSurfaceRef = useRef<HTMLDivElement | null>(null);
  const focusedVideoElRef = useRef<HTMLVideoElement | null>(null);

  const isInThisChannel =
    activeChannel?.id === channel.id &&
    connectionState !== ConnectionState.Disconnected;

  const isConnecting =
    activeChannel?.id === channel.id &&
    connectionState === ConnectionState.Connecting;

  const screenSharers = participants.filter((p) => p.isScreenSharing);

  useEffect(() => {
    setPipSupported(
      typeof document !== "undefined" && Boolean(document.pictureInPictureEnabled)
    );
  }, []);

  // Track native OS Fullscreen accurately
  useEffect(() => {
    function handleFsChange() {
      const active = Boolean(document.fullscreenElement);
      setIsBrowserFullscreen(active);
      if (active) {
        setShowParticipantsStrip(false);
      } else {
        setShowParticipantsStrip(true);
        setHudVisible(true);
      }
    }
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Only clear watch target if the watched stream ends
  useEffect(() => {
    if (!watchTargetIdentity) return;
    const stillLive = screenSharers.some((s) => s.identity === watchTargetIdentity);
    if (!stillLive) {
      setWatchTargetIdentity(null);
      setStreamZoom(1);
      setStreamPan({ x: 0, y: 0 });
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
    }
  }, [screenSharers, setWatchTargetIdentity, watchTargetIdentity]);

  const focusedSharer: VoiceParticipantView | null = watchTargetIdentity
    ? (screenSharers.find((s) => s.identity === watchTargetIdentity) ?? null)
    : null;

  // Reset zoom/pan when switching watched streamer
  useEffect(() => {
    setStreamZoom(1);
    setStreamPan({ x: 0, y: 0 });
  }, [focusedSharer?.identity]);

  // Track Picture-in-Picture state accurately
  useEffect(() => {
    const el = focusedVideoElRef.current;
    if (!el) {
      setIsPipActive(false);
      return;
    }
    const onEnter = () => setIsPipActive(true);
    const onLeave = () => setIsPipActive(false);
    el.addEventListener("enterpictureinpicture", onEnter);
    el.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      el.removeEventListener("enterpictureinpicture", onEnter);
      el.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, [focusedSharer?.screenTrack]);

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

  // Auto-hide HUD & cursor on idle mouse in Cinema / Fullscreen modes
  const wakeHud = useCallback(() => {
    setHudVisible(true);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    if (focusedSharer && (isBrowserFullscreen || isStageMaximized)) {
      hudTimerRef.current = setTimeout(() => {
        setHudVisible(false);
      }, 2600);
    }
  }, [focusedSharer, isBrowserFullscreen, isStageMaximized]);

  useEffect(() => {
    wakeHud();
    return () => {
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, [wakeHud]);

  const toggleBrowserFullscreen = useCallback(() => {
    const el = stageRootRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const resetZoomAndPan = useCallback(() => {
    setStreamZoom(1);
    setStreamPan({ x: 0, y: 0 });
  }, []);

  const applyZoomDelta = useCallback((delta: number) => {
    setStreamZoom((prev) => {
      const next = clampZoom(prev + delta);
      if (next <= 1) {
        setStreamPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  // Desktop keyboard shortcuts while watching a stream
  useEffect(() => {
    if (!focusedSharer) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleBrowserFullscreen();
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        onToggleMaximize();
      } else if (e.key === "0") {
        e.preventDefault();
        resetZoomAndPan();
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        applyZoomDelta(0.25);
      } else if (e.key === "-") {
        e.preventDefault();
        applyZoomDelta(-0.25);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyZoomDelta, focusedSharer, onToggleMaximize, resetZoomAndPan, toggleBrowserFullscreen]);

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
    resetZoomAndPan();
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
    if (isStageMaximized) {
      onToggleMaximize();
    }
  }

  function clampPanBounds(panX: number, panY: number, zoom: number) {
    const container = videoSurfaceRef.current;
    if (!container || zoom <= 1) return { x: 0, y: 0 };
    const maxX = ((zoom - 1) * container.clientWidth) / 2;
    const maxY = ((zoom - 1) * container.clientHeight) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, panX)),
      y: Math.max(-maxY, Math.min(maxY, panY)),
    };
  }

  function handleVideoWheel(e: ReactWheelEvent<HTMLDivElement>) {
    if (!focusedSharer?.screenTrack) return;
    if (e.ctrlKey || e.metaKey || streamZoom > 1 || isStageMaximized || isBrowserFullscreen) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      setStreamZoom((prev) => {
        const next = clampZoom(prev + delta);
        if (next <= 1) {
          setStreamPan({ x: 0, y: 0 });
        } else {
          setStreamPan((p) => clampPanBounds(p.x, p.y, next));
        }
        return next;
      });
    }
  }

  function handleVideoPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || streamZoom <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanning(true);
    panStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: streamPan.x,
      panY: streamPan.y,
    };
  }

  function handleVideoPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    wakeHud();
    if (!isPanning || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.startX;
    const dy = e.clientY - panStartRef.current.startY;
    setStreamPan(
      clampPanBounds(
        panStartRef.current.panX + dx,
        panStartRef.current.panY + dy,
        streamZoom
      )
    );
  }

  function handleVideoPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (isPanning) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setIsPanning(false);
      panStartRef.current = null;
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
        label: p.isLocal ? "Preview My Stream" : "Watch Stream",
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
    const liveLobbyStreamer = previewOccupants.find((o) => o.isScreenSharing);
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
      <div className="siq-grid-bg relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-[#08090C] p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(58% 48% at 50% 42%, rgb(var(--siq-accent-rgb) / 0.09) 0%, rgba(8, 9, 12, 0) 72%)",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 flex w-full max-w-2xl flex-col items-center text-center"
        >
          {previewOccupants.length > 0 ? (
            <div className="mb-7 flex flex-wrap items-center justify-center gap-3">
              {previewOccupants.slice(0, 6).map((occ) => {
                const fresh = resolveMemberVisuals(occ.identity, occ);
                return (
                  <SpotlightCard
                    key={occ.identity}
                    spotlightColor={`${fresh.avatarColor}28`}
                    className="siq-bezel-sm rounded-2xl border border-white/[0.09] bg-[#111218]/90 transition-transform duration-150 hover:-translate-y-0.5"
                  >
                    <button
                      type="button"
                      onClick={(e) =>
                        occ.isScreenSharing
                          ? onJoinVoiceChannel(channel, occ.identity)
                          : openParticipantProfile(e, occ)
                      }
                      className="relative z-10 flex h-32 w-44 flex-col items-center justify-center px-3 focus:outline-none active:scale-[0.98]"
                    >
                      {occ.isScreenSharing && (
                        <StatusPill
                          label="LIVE"
                          tone="rose"
                          pulse
                          className="absolute right-2.5 top-2.5"
                        />
                      )}
                      <Avatar
                        name={fresh.name}
                        color={fresh.avatarColor}
                        avatarUrl={fresh.avatarUrl}
                        size="lg"
                      />
                      <span
                        dir="auto"
                        className="mt-2.5 max-w-[140px] truncate text-xs font-semibold text-zinc-100"
                      >
                        {fresh.name}
                      </span>
                      {occ.isScreenSharing && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                          <Play className="h-2.5 w-2.5 fill-current" />
                          Click to watch
                        </span>
                      )}
                    </button>
                  </SpotlightCard>
                );
              })}
              {previewOccupants.length > 6 && (
                <div className="siq-bezel-sm flex h-32 w-24 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#111218] text-sm font-semibold tabular-nums text-zinc-300">
                  +{previewOccupants.length - 6}
                </div>
              )}
            </div>
          ) : (
            <div className="siq-bezel mb-6 flex h-24 w-44 flex-col items-center justify-center gap-2 rounded-3xl border border-white/[0.09] bg-[#101116]/90">
              <BarVisualizer state="listening" barCount={11} size="md" />
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                READY · OPUS
              </span>
            </div>
          )}

          <div className="mb-2">
            <StatusPill
              label={
                previewOccupants.length > 0
                  ? `${previewOccupants.length} active in room`
                  : "Voice Room Ready"
              }
              tone={previewOccupants.length > 0 ? "emerald" : "zinc"}
              pulse={previewOccupants.length > 0}
            />
          </div>

          <h2
            dir="auto"
            className="text-balance text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl"
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

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              type="button"
              disabled={!livekitReady || isConnecting}
              onClick={() => onJoinVoiceChannel(channel)}
              className="inline-flex items-center justify-center gap-2.5 rounded-2xl bg-emerald-500 px-8 py-3 text-sm font-semibold text-zinc-950 shadow-xl shadow-emerald-500/20 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Headphones className="h-4 w-4" />
              <span>{isConnecting ? "Connecting..." : "Join Voice"}</span>
            </motion.button>

            {liveLobbyStreamer && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                disabled={!livekitReady || isConnecting}
                onClick={() => onJoinVoiceChannel(channel, liveLobbyStreamer.identity)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/12 px-6 py-3 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>
                  Watch {resolveMemberVisuals(liveLobbyStreamer.identity, liveLobbyStreamer).name}
                </span>
              </motion.button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  const streamAudioKey = focusedSharer ? `${focusedSharer.identity}:screen` : "";
  const streamAudioVol = streamAudioKey ? (userVolumes[streamAudioKey] ?? 1) : 1;
  const isStreamAudioMuted = streamAudioVol === 0;
  const isCinemaLayout = Boolean(focusedSharer && (isStageMaximized || isBrowserFullscreen));
  const shouldShowParticipantsGrid = !focusedSharer || showParticipantsStrip;

  function handleToggleStreamAudioMute() {
    if (!streamAudioKey) return;
    if (streamAudioVol > 0) {
      prevStreamVolRef.current = streamAudioVol;
      setUserVolume(streamAudioKey, 0);
    } else {
      setUserVolume(streamAudioKey, prevStreamVolRef.current > 0 ? prevStreamVolRef.current : 1);
    }
  }

  return (
    <div
      ref={stageRootRef}
      onMouseMove={wakeHud}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#08090C]"
    >
      {/* Main Media Area */}
      <div
        className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${
          isCinemaLayout
            ? "gap-2 p-0"
            : "gap-3 p-2.5 sm:gap-3.5 sm:p-4"
        }`}
      >
        {/* Live Broadcast Discovery Bar (shown when streams are active and none is currently opened) */}
        <AnimatePresence>
          {!focusedSharer && screenSharers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="siq-bezel-sm flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/25 bg-[#111319] px-3.5 py-2.5 sm:px-4"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-rose-300 ring-1 ring-rose-500/35">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                  LIVE
                </span>
                {screenSharers.length === 1 ? (
                  <span className="truncate text-xs font-medium text-zinc-200">
                    {screenSharers[0].isLocal ? (
                      <>
                        You are sharing your screen{" "}
                        <span className="font-mono text-[11px] text-zinc-400">
                          ({screenShareConfig.resolution} · {screenShareConfig.fps}fps ·{" "}
                          {screenShareConfig.codec.toUpperCase()})
                        </span>
                      </>
                    ) : (
                      <>
                        <strong dir="auto" className="font-semibold text-white">
                          {resolveMemberVisuals(screenSharers[0].identity, screenSharers[0]).name}
                        </strong>{" "}
                        is sharing their screen
                      </>
                    )}
                  </span>
                ) : (
                  <span className="text-xs font-medium text-zinc-200">
                    {screenSharers.length} live screen streams in this channel
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {screenSharers.map((sharer) => {
                  const sVisual = resolveMemberVisuals(sharer.identity, sharer);
                  return (
                    <button
                      key={sharer.identity}
                      type="button"
                      onClick={() => setWatchTargetIdentity(sharer.identity)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98]"
                    >
                      {sharer.isLocal ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5 fill-current" />
                      )}
                      <span>
                        {sharer.isLocal
                          ? "Preview Stream"
                          : screenSharers.length > 1
                            ? `Watch ${sVisual.name}`
                            : "Watch Stream"}
                      </span>
                    </button>
                  );
                })}

                {isScreenSharing && (
                  <>
                    <button
                      type="button"
                      onClick={onOpenScreenShareModal}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#181920] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-white/[0.18] hover:text-white"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" />
                      <span>Stream Options</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void stopScreenShare()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500 hover:text-white"
                    >
                      <MonitorOff className="h-3.5 w-3.5" />
                      <span>Stop</span>
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Focused Screen Share Theater */}
        <AnimatePresence>
          {focusedSharer && (
            <motion.div
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className={`group/theater relative flex min-h-0 flex-1 flex-col overflow-hidden bg-black ${
                isCinemaLayout
                  ? "min-h-0 rounded-none border-0"
                  : "min-h-[240px] rounded-2xl border border-white/[0.1] sm:min-h-[380px]"
              }`}
            >
              {/* Video Surface (supports zoom, drag-to-pan, double-click fullscreen, idle cursor hide) */}
              <div
                ref={videoSurfaceRef}
                onWheel={handleVideoWheel}
                onPointerDown={handleVideoPointerDown}
                onPointerMove={handleVideoPointerMove}
                onPointerUp={handleVideoPointerUp}
                onPointerCancel={handleVideoPointerUp}
                onClick={() => {
                  if (!isPanning) setHudVisible((v) => !v);
                }}
                onDoubleClick={() => {
                  if (streamZoom > 1) {
                    resetZoomAndPan();
                  } else {
                    toggleBrowserFullscreen();
                  }
                }}
                className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#050507] select-none ${
                  isCinemaLayout && !hudVisible
                    ? "cursor-none"
                    : streamZoom > 1
                      ? isPanning
                        ? "cursor-grabbing"
                        : "cursor-grab"
                      : "cursor-default"
                }`}
              >
                {focusedSharer.screenTrack ? (
                  <VideoTrackCanvas
                    track={focusedSharer.screenTrack}
                    videoRefExternal={focusedVideoElRef}
                    style={{
                      transform:
                        streamZoom > 1 || streamPan.x !== 0 || streamPan.y !== 0
                          ? `translate3d(${streamPan.x}px, ${streamPan.y}px, 0) scale(${streamZoom})`
                          : undefined,
                      transformOrigin: "center center",
                    }}
                    className={`h-full w-full transition-transform ${
                      isPanning ? "duration-0" : "duration-150 ease-out"
                    } ${streamFit === "cover" ? "object-cover" : "object-contain"}`}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                    <BarVisualizer state="connecting" barCount={7} size="sm" />
                    <p className="text-xs font-medium text-zinc-400">
                      Connecting to{" "}
                      <span dir="auto" className="text-zinc-200">
                        {resolveMemberVisuals(focusedSharer.identity, focusedSharer).name}
                      </span>
                      &apos;s stream…
                    </p>
                  </div>
                )}

                {/* Top Floating HUD */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 bg-gradient-to-b from-black/85 via-black/45 to-transparent px-3.5 py-3 transition-opacity duration-200 sm:gap-3 sm:px-5 ${
                    hudVisible
                      ? "opacity-100"
                      : "opacity-0 group-hover/theater:opacity-100"
                  }`}
                >
                  <div className="pointer-events-auto flex min-w-0 items-center gap-2.5">
                    {isStageMaximized && !isBrowserFullscreen && (
                      <button
                        type="button"
                        onClick={onToggleMaximize}
                        title="Restore sidebar layout (Esc)"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.15] bg-black/70 px-2.5 py-1 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-500/45 hover:text-emerald-300"
                      >
                        <Minimize2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Exit Full Width</span>
                      </button>
                    )}

                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-rose-300 ring-1 ring-rose-500/40">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                      LIVE
                    </span>
                    <Avatar
                      name={resolveMemberVisuals(focusedSharer.identity, focusedSharer).name}
                      color={resolveMemberVisuals(focusedSharer.identity, focusedSharer).avatarColor}
                      avatarUrl={
                        resolveMemberVisuals(focusedSharer.identity, focusedSharer).avatarUrl
                      }
                      size="xs"
                    />
                    <span dir="auto" className="truncate text-xs font-semibold text-white">
                      {focusedSharer.isLocal
                        ? "Your Screen Preview"
                        : `${resolveMemberVisuals(focusedSharer.identity, focusedSharer).name}'s screen`}
                    </span>
                    {liveVideoMeta && (
                      <span className="hidden rounded-md border border-white/[0.12] bg-black/70 px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-zinc-200 sm:inline">
                        {liveVideoMeta.width}×{liveVideoMeta.height}
                        {liveVideoMeta.fps > 0 ? ` · ${liveVideoMeta.fps} FPS` : ""}
                      </span>
                    )}
                    {streamZoom > 1 && (
                      <button
                        type="button"
                        onClick={resetZoomAndPan}
                        title="Reset zoom to 100%"
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-emerald-200 hover:bg-emerald-500 hover:text-zinc-950"
                      >
                        <span>{Math.round(streamZoom * 100)}%</span>
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
                    {screenSharers.length > 1 && (
                      <div className="flex items-center gap-1 rounded-lg border border-white/[0.12] bg-black/70 p-0.5">
                        {screenSharers.map((s) => {
                          const active = s.identity === focusedSharer.identity;
                          return (
                            <button
                              key={s.identity}
                              type="button"
                              onClick={() => setWatchTargetIdentity(s.identity)}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                active
                                  ? "bg-emerald-500 font-semibold text-zinc-950"
                                  : "text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                              }`}
                            >
                              {s.isLocal
                                ? "You"
                                : resolveMemberVisuals(s.identity, s).name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleCloseStream}
                      title="Stop watching stream (stay in voice)"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.14] bg-black/70 px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:border-rose-500/50 hover:bg-rose-500/85 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Close Stream</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Precision Studio Theater Control Bar */}
              <div
                onMouseEnter={wakeHud}
                className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] bg-[#0E0F13] px-3 py-2 sm:gap-3 sm:px-4"
              >
                {/* Left: Stream Audio Mixer OR Broadcaster Quick Controls */}
                <div className="flex min-w-0 items-center gap-2.5">
                  {focusedSharer.isLocal ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                        <Radio className="h-3.5 w-3.5" />
                        <span className="hidden md:inline">Broadcasting</span>
                        <span className="font-mono">
                          {screenShareConfig.resolution} · {screenShareConfig.fps}fps
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={onOpenScreenShareModal}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#17181F] px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:border-white/[0.18] hover:text-white"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Change Window / Quality</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void stopScreenShare()}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-500/15 px-2.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500 hover:text-white"
                      >
                        <MonitorOff className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Stop Sharing</span>
                      </button>
                    </div>
                  ) : focusedSharer.screenAudioTrack ? (
                    <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#15161C] px-2.5 py-1">
                      <button
                        type="button"
                        onClick={handleToggleStreamAudioMute}
                        title={isStreamAudioMuted ? "Unmute stream audio" : "Mute stream audio"}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
                      >
                        {isStreamAudioMuted ? (
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
                          if (v > 0) prevStreamVolRef.current = v;
                          setUserVolume(streamAudioKey, v);
                        }}
                        className="h-1.5 w-20 cursor-pointer accent-emerald-500 sm:w-28"
                      />
                      <span className="w-9 text-right font-mono text-[11px] font-medium tabular-nums text-zinc-300">
                        {Math.round(streamAudioVol * 100)}%
                      </span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                      <VolumeX className="h-3.5 w-3.5" />
                      <span>No stream audio shared</span>
                    </span>
                  )}
                </div>

                {/* Right: Zoom + Fit/Fill + Participants Toggle + PiP + Full App Width + OS Fullscreen */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* Desktop Zoom Control Pill */}
                  <div className="hidden items-center rounded-lg border border-white/[0.09] bg-[#17181F] p-0.5 sm:flex">
                    <button
                      type="button"
                      disabled={streamZoom <= 1}
                      onClick={() => applyZoomDelta(-0.25)}
                      title="Zoom out (-)"
                      aria-label="Zoom out"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-35"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={resetZoomAndPan}
                      title="Reset zoom (0)"
                      className="min-w-[46px] px-1.5 font-mono text-[11px] font-semibold tabular-nums text-zinc-200 hover:text-emerald-300"
                    >
                      {Math.round(streamZoom * 100)}%
                    </button>
                    <button
                      type="button"
                      disabled={streamZoom >= 3}
                      onClick={() => applyZoomDelta(0.25)}
                      title="Zoom in (+)"
                      aria-label="Zoom in"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-35"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Fit vs Fill */}
                  <button
                    type="button"
                    onClick={() => {
                      resetZoomAndPan();
                      setStreamFit((f) => (f === "contain" ? "cover" : "contain"));
                    }}
                    title={streamFit === "contain" ? "Fill frame (crop edges)" : "Fit entire screen"}
                    aria-pressed={streamFit === "cover"}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors ${
                      streamFit === "cover"
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : "border-white/[0.09] bg-[#17181F] text-zinc-300 hover:border-white/[0.18] hover:text-white"
                    }`}
                  >
                    {streamFit === "contain" ? (
                      <Expand className="h-3.5 w-3.5" />
                    ) : (
                      <Shrink className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden lg:inline">
                      {streamFit === "contain" ? "Fill" : "Fit"}
                    </span>
                  </button>

                  {/* Show / Hide Participant Tiles */}
                  <button
                    type="button"
                    onClick={() => setShowParticipantsStrip((v) => !v)}
                    title={
                      showParticipantsStrip
                        ? "Hide participant cards"
                        : "Show participant cards"
                    }
                    aria-pressed={!showParticipantsStrip}
                    className={`hidden h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors sm:inline-flex ${
                      !showParticipantsStrip
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : "border-white/[0.09] bg-[#17181F] text-zinc-300 hover:border-white/[0.18] hover:text-white"
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" />
                  </button>

                  {/* Picture-in-Picture */}
                  {pipSupported && (
                    <button
                      type="button"
                      onClick={() => void togglePictureInPicture()}
                      title={isPipActive ? "Exit Picture-in-Picture" : "Picture-in-Picture"}
                      aria-pressed={isPipActive}
                      className={`hidden h-8 w-8 items-center justify-center rounded-lg border transition-colors sm:flex ${
                        isPipActive
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                          : "border-white/[0.09] bg-[#17181F] text-zinc-300 hover:border-white/[0.18] hover:text-white"
                      }`}
                    >
                      <PictureInPicture2 className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {/* Full-App Window Width (Theater Mode) */}
                  {!isBrowserFullscreen && (
                    <button
                      type="button"
                      onClick={onToggleMaximize}
                      title={
                        isStageMaximized
                          ? "Restore sidebars (T / Esc)"
                          : "Expand to full app width (T)"
                      }
                      aria-pressed={isStageMaximized}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors ${
                        isStageMaximized
                          ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-300"
                          : "border-white/[0.09] bg-[#17181F] text-zinc-200 hover:border-white/[0.18] hover:text-white"
                      }`}
                    >
                      {isStageMaximized ? (
                        <Minimize2 className="h-3.5 w-3.5" />
                      ) : (
                        <Maximize2 className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden md:inline">
                        {isStageMaximized ? "Exit Wide" : "Full Width"}
                      </span>
                    </button>
                  )}

                  {/* True Monitor OS Fullscreen */}
                  <button
                    type="button"
                    onClick={toggleBrowserFullscreen}
                    title={
                      isBrowserFullscreen
                        ? "Exit Fullscreen (F / Esc)"
                        : "Fullscreen (F / Double-click)"
                    }
                    aria-pressed={isBrowserFullscreen}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors ${
                      isBrowserFullscreen
                        ? "border-emerald-500/50 bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                        : "border-white/[0.12] bg-[#1C1E26] text-zinc-100 hover:border-emerald-500/45 hover:text-emerald-300"
                    }`}
                  >
                    {isBrowserFullscreen ? (
                      <Minimize className="h-3.5 w-3.5" />
                    ) : (
                      <Fullscreen className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">
                      {isBrowserFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Participant Grid */}
        {shouldShowParticipantsGrid && (
          <div
            className={`grid shrink-0 gap-2.5 sm:gap-3.5 ${
              focusedSharer
                ? "grid-cols-2 px-2 pb-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
                : participants.length === 1
                  ? "mx-auto my-auto w-full max-w-md grid-cols-1"
                  : participants.length === 2
                    ? "my-auto grid-cols-1 sm:grid-cols-2"
                    : "grid-cols-2 lg:grid-cols-3"
            }`}
          >
            {participants.map((p) => {
              const fresh = resolveMemberVisuals(p.identity, p);
              const barState = p.isMuted
                ? "muted"
                : p.isSpeaking
                  ? "speaking"
                  : "idle";
              const isBeingWatched = focusedSharer?.identity === p.identity;

              return (
                <SpotlightCard
                  key={p.identity}
                  active={p.isSpeaking || isBeingWatched}
                  spotlightColor={`${fresh.avatarColor}22`}
                  onContextMenu={(e) => handleParticipantContextMenu(e, p)}
                  className={`siq-bezel-sm flex flex-col justify-between rounded-2xl border bg-[#101116] transition-all duration-150 ${
                    isBeingWatched
                      ? "border-emerald-500/55 ring-1 ring-emerald-500/25"
                      : p.isSpeaking
                        ? "border-emerald-500/65 shadow-[0_0_24px_-8px_rgb(var(--siq-accent-rgb)/0.48)]"
                        : "border-white/[0.08] hover:border-white/[0.14]"
                  } ${
                    focusedSharer
                      ? "min-h-[104px] sm:min-h-[118px]"
                      : "min-h-[168px] sm:min-h-[224px]"
                  }`}
                >
                  {/* Video or Avatar Center */}
                  <div className="relative z-10 flex flex-1 overflow-hidden bg-[#0B0C10]/80">
                    <button
                      type="button"
                      onClick={(e) =>
                        p.isScreenSharing && !isBeingWatched
                          ? setWatchTargetIdentity(p.identity)
                          : openParticipantProfile(e, p)
                      }
                      className="flex h-full w-full flex-col items-center justify-center gap-2.5 text-left focus:outline-none"
                    >
                      {p.isCameraOn && p.cameraTrack ? (
                        <VideoTrackCanvas
                          track={p.cameraTrack}
                          mirror={p.isLocal && cameraFacingMode === "user"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <>
                          <Avatar
                            name={fresh.name}
                            color={fresh.avatarColor}
                            avatarUrl={fresh.avatarUrl}
                            size={focusedSharer ? "sm" : "lg"}
                            speaking={p.isSpeaking}
                            speakingOffsetClassName="ring-offset-[#0B0C10]"
                          />
                          {!focusedSharer && !p.isScreenSharing && (
                            <BarVisualizer
                              state={barState}
                              barCount={9}
                              size="sm"
                              mediaStreamTrack={p.micAudioTrack?.mediaStreamTrack ?? null}
                            />
                          )}
                          {!focusedSharer && p.isScreenSharing && (
                            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500 hover:text-zinc-950">
                              <Play className="h-3 w-3 fill-current" />
                              <span>{p.isLocal ? "Preview Stream" : "Watch Stream"}</span>
                            </span>
                          )}
                        </>
                      )}
                    </button>

                    {p.isLocal && p.isCameraOn && canSwitchCamera && (
                      <button
                        type="button"
                        disabled={isSwitchingCamera}
                        onClick={() => void switchCameraFacingMode()}
                        title={
                          cameraFacingMode === "user"
                            ? "Switch to rear camera"
                            : "Switch to front camera"
                        }
                        aria-label={
                          cameraFacingMode === "user"
                            ? "Switch to rear camera"
                            : "Switch to front camera"
                        }
                        className="absolute left-2.5 top-2.5 inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.15] bg-black/75 px-2.5 text-[11px] font-medium text-zinc-100 transition-colors hover:border-emerald-500/50 hover:text-emerald-300 active:scale-95 disabled:opacity-50"
                      >
                        <SwitchCamera
                          className={`h-3.5 w-3.5 ${isSwitchingCamera ? "animate-spin" : ""}`}
                        />
                        <span className="hidden sm:inline">
                          {cameraFacingMode === "user" ? "Front" : "Rear"}
                        </span>
                      </button>
                    )}

                    {p.isScreenSharing && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isBeingWatched) {
                            handleCloseStream();
                          } else {
                            setWatchTargetIdentity(p.identity);
                          }
                        }}
                        title={isBeingWatched ? "Watching now — click to close" : "Watch stream"}
                        className={`absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide transition-colors ${
                          isBeingWatched
                            ? "border-emerald-400/60 bg-emerald-500 text-zinc-950"
                            : "border-rose-500/45 bg-black/80 text-rose-300 hover:border-emerald-500/50 hover:bg-emerald-500 hover:text-zinc-950"
                        }`}
                      >
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
                        </span>
                        <span>{isBeingWatched ? "WATCHING" : "LIVE"}</span>
                      </button>
                    )}
                  </div>

                  {/* Clean Participant Footer */}
                  <div className="relative z-10 flex items-center justify-between gap-2 border-t border-white/[0.06] bg-[#121319]/95 px-3 py-2">
                    <button
                      type="button"
                      onClick={(e) => openParticipantProfile(e, p)}
                      className="flex min-w-0 items-center gap-1.5 text-left hover:underline"
                    >
                      <span dir="auto" className="truncate text-xs font-semibold text-zinc-100">
                        {fresh.name}
                      </span>
                      {p.isLocal && (
                        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                          you
                        </span>
                      )}
                    </button>
                    <div className="flex shrink-0 items-center gap-2 text-zinc-400">
                      {focusedSharer && !p.isMuted && (
                        <BarVisualizer
                          state={barState}
                          barCount={4}
                          size="xs"
                          mediaStreamTrack={p.micAudioTrack?.mediaStreamTrack ?? null}
                        />
                      )}
                      {p.isMuted ? (
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
                          <MicOff className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors duration-100 ${
                            p.isSpeaking
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-white/[0.04] text-zinc-400"
                          }`}
                        >
                          <Mic className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </SpotlightCard>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Studio Control Deck (Stays accessible inside OS Fullscreen & Full-App Mode) */}
      <div
        onMouseEnter={wakeHud}
        className={`relative flex shrink-0 items-center justify-center border-t border-white/[0.07] bg-[#0B0C0F]/95 px-2 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] transition-opacity duration-200 sm:px-4 sm:py-2.5 ${
          isBrowserFullscreen && !hudVisible
            ? "pointer-events-none opacity-0"
            : "opacity-100"
        }`}
      >
        <FloatingDock className="siq-voice-stage-dock">
          <DockItem
            label={isMuted ? "Unmute microphone" : "Mute microphone"}
            onClick={() => void toggleMute()}
            danger={isMuted}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            <span className="hidden lg:inline">{isMuted ? "Muted" : "Mute"}</span>
          </DockItem>

          <DockItem
            label={isDeafened ? "Undeafen audio" : "Deafen audio"}
            onClick={() => void toggleDeafen()}
            danger={isDeafened}
          >
            {isDeafened ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            <span className="hidden lg:inline">{isDeafened ? "Deafened" : "Deafen"}</span>
          </DockItem>

          <DockItem
            label={isCameraOn ? "Turn off camera" : "Turn on camera"}
            onClick={() => void toggleCamera()}
            active={isCameraOn}
          >
            {isCameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            <span className="hidden lg:inline">Camera</span>
          </DockItem>

          {isCameraOn && canSwitchCamera && (
            <DockItem
              label={
                cameraFacingMode === "user"
                  ? "Switch to rear camera"
                  : "Switch to front camera"
              }
              onClick={() => void switchCameraFacingMode()}
            >
              <SwitchCamera
                className={`h-4 w-4 ${isSwitchingCamera ? "animate-spin" : ""}`}
              />
              <span className="hidden lg:inline">
                {cameraFacingMode === "user" ? "Rear" : "Front"}
              </span>
            </DockItem>
          )}

          <DockItem
            label={isScreenSharing ? "Stream options & stop" : "Share screen"}
            onClick={onOpenScreenShareModal}
            active={isScreenSharing}
            badge={isScreenSharing ? "LIVE" : undefined}
          >
            <Monitor className="h-4 w-4" />
            <span className="hidden lg:inline">
              {isScreenSharing ? "Streaming" : "Share"}
            </span>
          </DockItem>

          {!focusedSharer && (
            <DockItem
              label={isStageMaximized ? "Restore sidebars" : "Expand stage to full app width"}
              onClick={onToggleMaximize}
              active={isStageMaximized}
            >
              {isStageMaximized ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </DockItem>
          )}

          <div className="mx-0.5 h-6 w-px bg-white/[0.09]" />

          <DockItem label="Voice & audio settings" onClick={onOpenVoiceSettings}>
            <Settings className="h-4 w-4" />
          </DockItem>

          <DockItem
            label="Disconnect from voice"
            onClick={() => {
              if (document.fullscreenElement) {
                void document.exitFullscreen().catch(() => {});
              }
              onLeaveVoiceChannel();
            }}
            solidDanger
          >
            <PhoneOff className="h-4 w-4" />
            <span className="hidden sm:inline">Leave</span>
          </DockItem>
        </FloatingDock>
      </div>
    </div>
  );
}
