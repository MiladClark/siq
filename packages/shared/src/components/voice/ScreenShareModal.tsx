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

function PresetIcon({ kind, active }: { kind: "mobile" | "gaming" | "crisp" | "ultra"; active: boolean }) {
  const cls = `h-4 w-4 shrink-0 ${active ? "text-emerald-400" : "text-zinc-400"}`;
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
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-[75] flex items-end justify-center bg-black/72 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="screenshare-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="siq-bezel flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-white/[0.12] bg-[#121316] sm:max-w-xl sm:rounded-2xl sm:border"
          >
            {/* Mobile Sheet Grabber Handle */}
            <div className="flex justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-white/[0.16]" />
            </div>

            {/* Sticky Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
                    isScreenSharing
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                      : "border-white/[0.1] bg-[#18191E] text-zinc-200"
                  }`}
                >
                  {isScreenSharing ? (
                    <Radio className="h-4 w-4" />
                  ) : (
                    <Monitor className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2
                      id="screenshare-modal-title"
                      className="truncate text-sm font-semibold text-zinc-100"
                    >
                      {isScreenSharing ? "Stream Controls" : "Share Your Screen"}
                    </h2>
                    {isScreenSharing && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        LIVE
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-zinc-400">
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
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:space-y-5 sm:px-5 sm:py-5">
              {!supportsScreenShare && !isScreenSharing ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
                    <p className="text-xs font-semibold text-amber-200">
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
                      className="flex items-center gap-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5 text-left transition-colors hover:bg-emerald-500/15 active:scale-[0.99] disabled:opacity-50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                        <SwitchCamera className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-100">Share Rear Camera</p>
                        <p className="mt-0.5 text-[11px] text-zinc-400">
                          Show another screen or desk live
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleFallbackCamera("user")}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.09] bg-[#17181E] p-3.5 text-left transition-colors hover:border-white/[0.16] active:scale-[0.99] disabled:opacity-50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-zinc-200">
                        <Camera className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-100">Share Front Camera</p>
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
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                        Quality Preset
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#17181E] px-2 py-0.5 font-mono text-[11px] tabular-nums text-emerald-300">
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
                      {QUICK_PRESETS.map((p) => {
                        const active =
                          draft.resolution === p.config.resolution &&
                          draft.fps === p.config.fps &&
                          draft.mode === p.config.mode;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setDraft((prev) => ({ ...prev, ...p.config }))}
                            className={`flex flex-col justify-between gap-2 rounded-xl border p-3 text-left transition-all active:scale-[0.98] ${
                              active
                                ? "border-emerald-500/55 bg-emerald-500/12 text-emerald-100"
                                : "border-white/[0.08] bg-[#17181E] text-zinc-300 hover:border-white/[0.16]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <PresetIcon kind={p.icon} active={active} />
                              {p.badge && (
                                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-zinc-300">
                                  {p.badge}
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="text-xs font-semibold">{p.label}</div>
                              <div className="mt-0.5 text-[10px] font-medium tabular-nums text-zinc-400">
                                {p.sub}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* System Audio Switch */}
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#0E0F12] px-3.5 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {draft.shareAudio ? (
                        <Volume2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : (
                        <VolumeX className="h-4 w-4 shrink-0 text-zinc-500" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-zinc-200">Share Audio</p>
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
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                        draft.shareAudio
                          ? "border-emerald-400/50 bg-emerald-500"
                          : "border-white/[0.12] bg-[#1C1D24]"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
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
                      className="flex w-full items-center justify-between rounded-xl border border-white/[0.07] bg-[#0E0F12] px-3.5 py-2.5 text-xs font-medium text-zinc-300 transition-colors hover:border-white/[0.14] hover:text-zinc-100 sm:hidden"
                    >
                      <span className="inline-flex items-center gap-2">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Advanced Stream Settings</span>
                      </span>
                      <span className="inline-flex items-center gap-2 text-[11px] text-zinc-500">
                        <span className="font-mono uppercase">{draft.codec}</span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                        />
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {showAdvanced && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-4 pt-1">
                            {/* Resolution & FPS */}
                            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <span className="block text-[11px] font-medium text-zinc-400">
                                  Resolution
                                </span>
                                <div className="grid grid-cols-4 gap-1 rounded-xl border border-white/[0.08] bg-[#0E0F12] p-1">
                                  {(["720p", "1080p", "1440p", "source"] as ScreenResolutionOption[]).map(
                                    (res) => (
                                      <button
                                        key={res}
                                        type="button"
                                        onClick={() => setDraft((d) => ({ ...d, resolution: res }))}
                                        className={`rounded-lg py-2 text-[11px] font-semibold tabular-nums transition-colors sm:py-1.5 ${
                                          draft.resolution === res
                                            ? "bg-emerald-500 text-zinc-950"
                                            : "text-zinc-400 hover:text-zinc-100"
                                        }`}
                                      >
                                        {res === "source" ? "Native" : res}
                                      </button>
                                    )
                                  )}
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <span className="block text-[11px] font-medium text-zinc-400">
                                  Frame Rate
                                </span>
                                <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.08] bg-[#0E0F12] p-1">
                                  {([15, 30, 60] as ScreenFpsOption[]).map((fps) => (
                                    <button
                                      key={fps}
                                      type="button"
                                      onClick={() => setDraft((d) => ({ ...d, fps }))}
                                      className={`rounded-lg py-2 text-[11px] font-semibold tabular-nums transition-colors sm:py-1.5 ${
                                        draft.fps === fps
                                          ? "bg-emerald-500 text-zinc-950"
                                          : "text-zinc-400 hover:text-zinc-100"
                                      }`}
                                    >
                                      {fps} FPS
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Priority Mode & Codec */}
                            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <span className="block text-[11px] font-medium text-zinc-400">
                                  Content Priority
                                </span>
                                <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.08] bg-[#0E0F12] p-1">
                                  <button
                                    type="button"
                                    onClick={() => setDraft((d) => ({ ...d, mode: "motion" }))}
                                    className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors sm:py-1.5 ${
                                      draft.mode === "motion"
                                        ? "bg-[#1E2027] text-zinc-100"
                                        : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                                  >
                                    <Gamepad2 className="h-3.5 w-3.5 text-emerald-400" />
                                    <span>Motion</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDraft((d) => ({ ...d, mode: "detail" }))}
                                    className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors sm:py-1.5 ${
                                      draft.mode === "detail"
                                        ? "bg-[#1E2027] text-zinc-100"
                                        : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                                  >
                                    <Type className="h-3.5 w-3.5 text-emerald-400" />
                                    <span>Sharp Text</span>
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <span className="block text-[11px] font-medium text-zinc-400">
                                  Video Codec
                                </span>
                                <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.08] bg-[#0E0F12] p-1">
                                  {(["vp9", "h264", "vp8"] as ScreenCodecOption[]).map((codec) => (
                                    <button
                                      key={codec}
                                      type="button"
                                      onClick={() => setDraft((d) => ({ ...d, codec }))}
                                      className={`rounded-lg py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors sm:py-1.5 ${
                                        draft.codec === codec
                                          ? "bg-[#1E2027] text-zinc-100"
                                          : "text-zinc-400 hover:text-zinc-200"
                                      }`}
                                    >
                                      {codec}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Bitrate Slider */}
                            <div className="space-y-1.5 rounded-xl border border-white/[0.07] bg-[#0E0F12] p-3.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-zinc-300">Max Bitrate</span>
                                <span className="font-semibold tabular-nums text-emerald-400">
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
                                className="h-2 w-full cursor-pointer accent-emerald-500"
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
            <div className="flex shrink-0 items-center justify-between gap-2.5 border-t border-white/[0.07] bg-[#0E0F12] px-4 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-3.5">
              {isScreenSharing ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStop()}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-300 transition-all hover:bg-rose-500 hover:text-white active:scale-[0.98] disabled:opacity-50"
                >
                  <MonitorOff className="h-4 w-4" />
                  <span>Stop Stream</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-10 rounded-xl border border-white/[0.1] px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
              )}

              {(supportsScreenShare || isScreenSharing) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStartOrSwitch()}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50 sm:flex-none"
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
