"use client";

import {
  Camera,
  ChevronDown,
  Gamepad2,
  Monitor,
  MonitorOff,
  Radio,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
  SwitchCamera,
  Type,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useVoice } from "@siq/shared/components/voice/VoiceProvider";
import type {
  ScreenCodecOption,
  ScreenFpsOption,
  ScreenResolutionOption,
  ScreenShareConfig,
} from "@siq/shared/lib/preferences";

interface ScreenShareModalProps {
  open: boolean;
  onClose: () => void;
}

const QUICK_PRESETS: Array<{
  id: string;
  label: string;
  sub: string;
  badge?: string;
  icon: "mobile" | "gaming" | "crisp" | "ultra";
  config: Partial<ScreenShareConfig>;
}> = [
  {
    id: "mobile",
    label: "Smooth Mobile",
    sub: "720p · 30fps · 3 Mbps",
    badge: "Balanced",
    icon: "mobile",
    config: { resolution: "720p", fps: 30, mode: "motion", codec: "h264", bitrateMbps: 3 },
  },
  {
    id: "gaming",
    label: "Gaming",
    sub: "1080p · 60fps · 6 Mbps",
    icon: "gaming",
    config: { resolution: "1080p", fps: 60, mode: "motion", codec: "vp9", bitrateMbps: 6 },
  },
  {
    id: "crisp",
    label: "Coding / Text",
    sub: "1080p · 30fps · Sharp",
    icon: "crisp",
    config: { resolution: "1080p", fps: 30, mode: "detail", codec: "h264", bitrateMbps: 4 },
  },
  {
    id: "ultra",
    label: "Source / 1440p",
    sub: "1440p · 60fps · 9 Mbps",
    icon: "ultra",
    config: { resolution: "1440p", fps: 60, mode: "motion", codec: "h264", bitrateMbps: 9 },
  },
];

const SEGMENT_TRACK =
  "grid gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]";
const SEGMENT_BUTTON =
  "relative isolate rounded-lg py-2 transition-colors duration-200 sm:py-1.5";
const SEGMENT_PILL_ACCENT =
  "absolute inset-0 -z-10 rounded-lg bg-gradient-to-b from-emerald-400 to-emerald-500 shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_6px_16px_-6px_rgb(var(--siq-accent-rgb)/0.9)]";
const SEGMENT_PILL_NEUTRAL =
  "absolute inset-0 -z-10 rounded-lg bg-white/[0.09] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1),inset_0_1px_0_rgb(255_255_255/0.08)]";
const SEGMENT_SPRING = { type: "spring", stiffness: 520, damping: 40 } as const;
const FIELD_LABEL = "block text-[11px] font-semibold text-zinc-400";

function PresetIcon({ kind, active }: { kind: "mobile" | "gaming" | "crisp" | "ultra"; active: boolean }) {
  const cls = `h-4 w-4 shrink-0 transition-colors duration-200 ${active ? "text-emerald-300" : "text-zinc-400"}`;
  switch (kind) {
    case "mobile":
      return <Smartphone className={cls} />;
    case "gaming":
      return <Gamepad2 className={cls} />;
    case "crisp":
      return <Type className={cls} />;
    case "ultra":
      return <Monitor className={cls} />;
  }
}

export function ScreenShareModal({ open, onClose }: ScreenShareModalProps) {
  const {
    isScreenSharing,
    supportsScreenShare,
    screenShareConfig,
    startScreenShare,
    stopScreenShare,
    enableCameraWithFacing,
  } = useVoice();

  const [draft, setDraft] = useState<ScreenShareConfig>(screenShareConfig);
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Reset only when the sheet opens: re-running on config changes would clear "busy" while
  // the OS source picker is still open and re-enable Go Live.
  useEffect(() => {
    if (open) {
      setDraft(screenShareConfig);
      setBusy(false);
      // Keep bottom sheet compact by default on phones, expanded on desktop
      setShowAdvanced(typeof window !== "undefined" ? window.innerWidth >= 640 : true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleStartOrSwitch() {
    setBusy(true);
    const ok = await startScreenShare(draft);
    setBusy(false);
    if (ok) {
      onClose();
    }
  }

  async function handleStop() {
    setBusy(true);
    await stopScreenShare();
    setBusy(false);
    onClose();
  }

  async function handleFallbackCamera(facing: "environment" | "user") {
    setBusy(true);
    const ok = await enableCameraWithFacing(facing);
    setBusy(false);
    if (ok) {
      onClose();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="siq-backdrop fixed inset-0 z-[75] flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="screenshare-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 16 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="siq-glass siq-edge-light relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl !border-x-0 !border-b-0 sm:max-w-xl sm:rounded-3xl sm:!border"
          >
            {/* Mobile Sheet Grabber Handle */}
            <div className="flex justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-white/[0.18]" />
            </div>

            {/* Sticky Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.035] to-transparent px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-[box-shadow,background-color] duration-300 ${
                    isScreenSharing
                      ? "bg-gradient-to-br from-emerald-400/35 to-emerald-500/10 text-emerald-200 ring-emerald-400/45 shadow-[0_0_26px_-6px_rgb(var(--siq-accent-rgb)/0.9),inset_0_1px_0_rgb(255_255_255/0.16)]"
                      : "bg-gradient-to-br from-emerald-400/25 to-emerald-500/[0.04] text-emerald-300 ring-emerald-400/30 shadow-[0_10px_24px_-10px_rgb(var(--siq-accent-rgb)/0.8),inset_0_1px_0_rgb(255_255_255/0.12)]"
                  }`}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={isScreenSharing ? "live" : "idle"}
                      initial={{ opacity: 0, scale: 0.5, rotate: -30 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.5, rotate: 30 }}
                      transition={{ type: "spring", stiffness: 520, damping: 28 }}
                      className="flex"
                    >
                      {isScreenSharing ? (
                        <Radio className="h-4 w-4" />
                      ) : (
                        <Monitor className="h-4 w-4" />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2
                      id="screenshare-modal-title"
                      className="truncate text-[15px] font-bold tracking-tight text-zinc-50"
                    >
                      {isScreenSharing ? "Stream Controls" : "Share Your Screen"}
                    </h2>
                    {isScreenSharing && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-300 ring-1 ring-inset ring-emerald-500/35">
                        <span className="siq-live-dot" />
                        LIVE
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                    {isScreenSharing
                      ? `${screenShareConfig.resolution} · ${screenShareConfig.fps}fps · ${screenShareConfig.codec.toUpperCase()} · ${screenShareConfig.bitrateMbps} Mbps`
                      : supportsScreenShare
                        ? "Choose a quality preset and pick what to share"
                        : "Screen capture isn't exposed in this mobile browser"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close screen share modal"
                className="siq-icon-btn shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:space-y-5 sm:px-5 sm:py-5">
              {!supportsScreenShare && !isScreenSharing ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.09] to-amber-500/[0.02] p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
                    <p className="text-xs font-bold text-amber-200">
                      Browser screen capture unavailable
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">
                      Mobile Safari and some in-app browsers restrict web screen recording
                      (<code className="font-mono text-[11px] text-amber-200">getDisplayMedia</code>).
                      You can stream your rear or front camera directly instead, or use Chrome on Android / Desktop.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleFallbackCamera("environment")}
                      className="flex items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-left ring-4 ring-emerald-500/[0.07] shadow-[0_14px_30px_-16px_rgb(var(--siq-accent-rgb)/0.9)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-500/15 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 shadow-[inset_0_0_0_1px_rgb(var(--siq-accent-rgb)/0.35)]">
                        <SwitchCamera className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-100">Share Rear Camera</p>
                        <p className="mt-0.5 text-[11px] text-zinc-400">
                          Show another screen or desk live
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleFallbackCamera("user")}
                      className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.15] hover:bg-white/[0.05] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-zinc-200">
                        <Camera className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-100">Share Front Camera</p>
                        <p className="mt-0.5 text-[11px] text-zinc-400">
                          Switch to video call view
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Quick Presets */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="siq-section-label !px-0">
                        Quality Preset
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-2.5 py-0.5 font-mono text-[11px] tabular-nums text-emerald-300 shadow-[0_0_18px_-8px_rgb(var(--siq-accent-rgb)/0.9)]">
                        <span>{draft.resolution === "source" ? "Native" : draft.resolution}</span>
                        <span className="text-zinc-600">·</span>
                        <span>{draft.fps}fps</span>
                        <span className="text-zinc-600">·</span>
                        <span className="uppercase">{draft.codec}</span>
                        <span className="text-zinc-600">·</span>
                        <span>{draft.bitrateMbps}Mbps</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {QUICK_PRESETS.map((p, index) => {
                        const active =
                          draft.resolution === p.config.resolution &&
                          draft.fps === p.config.fps &&
                          draft.mode === p.config.mode;
                        return (
                          <motion.button
                            key={p.id}
                            type="button"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              delay: 0.05 + index * 0.04,
                              type: "spring",
                              stiffness: 420,
                              damping: 30,
                            }}
                            onClick={() => setDraft((prev) => ({ ...prev, ...p.config }))}
                            className={`flex flex-col justify-between gap-2.5 rounded-2xl border p-3 text-left transition-[translate,scale,border-color,background-color,box-shadow,color] duration-200 hover:-translate-y-0.5 active:scale-[0.97] ${
                              active
                                ? "border-emerald-500/55 bg-emerald-500/[0.12] text-emerald-100 ring-4 ring-emerald-500/10 shadow-[0_14px_30px_-16px_rgb(var(--siq-accent-rgb)/0.95)]"
                                : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:border-white/[0.15] hover:bg-white/[0.05]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span
                                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-200 ${
                                  active ? "bg-emerald-500/20" : "bg-white/[0.05]"
                                }`}
                              >
                                <PresetIcon kind={p.icon} active={active} />
                              </span>
                              {p.badge && (
                                <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-zinc-300 ring-1 ring-inset ring-white/[0.06]">
                                  {p.badge}
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="text-xs font-bold">{p.label}</div>
                              <div className="mt-0.5 text-[10px] font-medium tabular-nums text-zinc-400">
                                {p.sub}
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {/* System Audio Switch */}
                  <div
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 transition-[border-color,background-color] duration-300 ${
                      draft.shareAudio
                        ? "border-emerald-500/25 bg-emerald-500/[0.05]"
                        : "border-white/[0.08] bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors duration-300 ${
                          draft.shareAudio ? "bg-emerald-500/20" : "bg-white/[0.05]"
                        }`}
                      >
                        {draft.shareAudio ? (
                          <Volume2 className="h-4 w-4 shrink-0 text-emerald-400" />
                        ) : (
                          <VolumeX className="h-4 w-4 shrink-0 text-zinc-500" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-100">Share Audio</p>
                        <p className="truncate text-[11px] text-zinc-500">
                          Include tab or device audio when supported
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draft.shareAudio}
                      onClick={() =>
                        setDraft((d) => ({ ...d, shareAudio: !d.shareAudio }))
                      }
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-[background-color,border-color,box-shadow] duration-300 ${
                        draft.shareAudio
                          ? "border-emerald-400/50 bg-emerald-500 shadow-[0_0_18px_-4px_rgb(var(--siq-accent-rgb)/0.85)]"
                          : "border-white/[0.1] bg-white/[0.08]"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.45)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                          draft.shareAudio ? "translate-x-5" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Collapsible Advanced Controls on Mobile (Always visible on Desktop) */}
                  <div className="space-y-3">
                    <button
                      type="button"
                      aria-expanded={showAdvanced}
                      onClick={() => setShowAdvanced((v) => !v)}
                      className="siq-press flex w-full items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5 text-xs font-semibold text-zinc-300 hover:border-white/[0.14] hover:text-zinc-100 sm:hidden"
                    >
                      <span className="inline-flex items-center gap-2">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Advanced Stream Settings</span>
                      </span>
                      <span className="inline-flex items-center gap-2 text-[11px] text-zinc-500">
                        <span className="font-mono uppercase">{draft.codec}</span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${showAdvanced ? "rotate-180" : ""}`}
                        />
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {showAdvanced && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-4 pt-1">
                            {/* Resolution & FPS */}
                            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <span className={FIELD_LABEL}>
                                  Resolution
                                </span>
                                <div className={`${SEGMENT_TRACK} grid-cols-4`}>
                                  {(["720p", "1080p", "1440p", "source"] as ScreenResolutionOption[]).map(
                                    (res) => (
                                      <button
                                        key={res}
                                        type="button"
                                        onClick={() => setDraft((d) => ({ ...d, resolution: res }))}
                                        className={`${SEGMENT_BUTTON} text-[11px] font-semibold tabular-nums ${
                                          draft.resolution === res
                                            ? "text-zinc-950"
                                            : "text-zinc-400 hover:text-zinc-100"
                                        }`}
                                      >
                                        {draft.resolution === res && (
                                          <motion.span
                                            layoutId="siq-screenshare-resolution"
                                            className={SEGMENT_PILL_ACCENT}
                                            transition={SEGMENT_SPRING}
                                          />
                                        )}
                                        <span className="relative">
                                          {res === "source" ? "Native" : res}
                                        </span>
                                      </button>
                                    )
                                  )}
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <span className={FIELD_LABEL}>
                                  Frame Rate
                                </span>
                                <div className={`${SEGMENT_TRACK} grid-cols-3`}>
                                  {([15, 30, 60] as ScreenFpsOption[]).map((fps) => (
                                    <button
                                      key={fps}
                                      type="button"
                                      onClick={() => setDraft((d) => ({ ...d, fps }))}
                                      className={`${SEGMENT_BUTTON} text-[11px] font-semibold tabular-nums ${
                                        draft.fps === fps
                                          ? "text-zinc-950"
                                          : "text-zinc-400 hover:text-zinc-100"
                                      }`}
                                    >
                                      {draft.fps === fps && (
                                        <motion.span
                                          layoutId="siq-screenshare-fps"
                                          className={SEGMENT_PILL_ACCENT}
                                          transition={SEGMENT_SPRING}
                                        />
                                      )}
                                      <span className="relative">{fps} FPS</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Priority Mode & Codec */}
                            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <span className={FIELD_LABEL}>
                                  Content Priority
                                </span>
                                <div className={`${SEGMENT_TRACK} grid-cols-2`}>
                                  <button
                                    type="button"
                                    onClick={() => setDraft((d) => ({ ...d, mode: "motion" }))}
                                    className={`${SEGMENT_BUTTON} flex items-center justify-center gap-1.5 text-xs font-semibold ${
                                      draft.mode === "motion"
                                        ? "text-zinc-100"
                                        : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                                  >
                                    {draft.mode === "motion" && (
                                      <motion.span
                                        layoutId="siq-screenshare-mode"
                                        className={SEGMENT_PILL_NEUTRAL}
                                        transition={SEGMENT_SPRING}
                                      />
                                    )}
                                    <Gamepad2 className="h-3.5 w-3.5 text-emerald-400" />
                                    <span>Motion</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDraft((d) => ({ ...d, mode: "detail" }))}
                                    className={`${SEGMENT_BUTTON} flex items-center justify-center gap-1.5 text-xs font-semibold ${
                                      draft.mode === "detail"
                                        ? "text-zinc-100"
                                        : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                                  >
                                    {draft.mode === "detail" && (
                                      <motion.span
                                        layoutId="siq-screenshare-mode"
                                        className={SEGMENT_PILL_NEUTRAL}
                                        transition={SEGMENT_SPRING}
                                      />
                                    )}
                                    <Type className="h-3.5 w-3.5 text-emerald-400" />
                                    <span>Sharp Text</span>
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <span className={FIELD_LABEL}>
                                  Video Codec
                                </span>
                                <div className={`${SEGMENT_TRACK} grid-cols-3`}>
                                  {(["vp9", "h264", "vp8"] as ScreenCodecOption[]).map((codec) => (
                                    <button
                                      key={codec}
                                      type="button"
                                      onClick={() => setDraft((d) => ({ ...d, codec }))}
                                      className={`${SEGMENT_BUTTON} text-[11px] font-semibold uppercase tracking-wide ${
                                        draft.codec === codec
                                          ? "text-zinc-100"
                                          : "text-zinc-400 hover:text-zinc-200"
                                      }`}
                                    >
                                      {draft.codec === codec && (
                                        <motion.span
                                          layoutId="siq-screenshare-codec"
                                          className={SEGMENT_PILL_NEUTRAL}
                                          transition={SEGMENT_SPRING}
                                        />
                                      )}
                                      <span className="relative">{codec}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Bitrate Slider */}
                            <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-zinc-300">Max Bitrate</span>
                                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
                                  {draft.bitrateMbps} Mbps
                                </span>
                              </div>
                              <input
                                type="range"
                                min={2}
                                max={10}
                                step={1}
                                value={draft.bitrateMbps}
                                onChange={(e) =>
                                  setDraft((d) => ({ ...d, bitrateMbps: Number(e.target.value) }))
                                }
                                className="h-2 w-full cursor-pointer accent-emerald-400"
                              />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </div>

            {/* Sticky Footer Actions */}
            <div className="flex shrink-0 items-center justify-between gap-2.5 border-t border-white/[0.06] bg-black/20 px-4 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
              {isScreenSharing ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStop()}
                  className="siq-press inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-300 hover:border-rose-400/60 hover:bg-rose-500 hover:text-white hover:shadow-[0_10px_26px_-10px_rgba(244,63,94,0.9)] disabled:opacity-50"
                >
                  <MonitorOff className="h-4 w-4" />
                  <span>Stop Stream</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="siq-press min-h-10 rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-300 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  Cancel
                </button>
              )}

              {(supportsScreenShare || isScreenSharing) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStartOrSwitch()}
                  className="siq-cta inline-flex min-h-10 flex-1 items-center justify-center gap-2 !rounded-xl px-5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                >
                  {isScreenSharing ? (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      <span>{busy ? "Switching..." : "Apply & Change Source"}</span>
                    </>
                  ) : (
                    <>
                      <Monitor className="h-4 w-4" />
                      <span>{busy ? "Starting..." : "Go Live"}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
