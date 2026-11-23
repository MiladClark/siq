"use client";

import {
  Gamepad2,
  Monitor,
  MonitorOff,
  Radio,
  RefreshCw,
  Type,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useVoice } from "@/components/voice/VoiceProvider";
import type {
  ScreenCodecOption,
  ScreenFpsOption,
  ScreenResolutionOption,
  ScreenShareConfig,
} from "@/lib/preferences";

interface ScreenShareModalProps {
  open: boolean;
  onClose: () => void;
}

const QUICK_PRESETS: Array<{
  id: string;
  label: string;
  sub: string;
  config: Partial<ScreenShareConfig>;
}> = [
  {
    id: "gaming",
    label: "Gaming",
    sub: "1080p · 60fps · 6 Mbps",
    config: { resolution: "1080p", fps: 60, mode: "motion", codec: "vp9", bitrateMbps: 6 },
  },
  {
    id: "crisp",
    label: "Coding / Text",
    sub: "1080p · 30fps · Sharp",
    config: { resolution: "1080p", fps: 30, mode: "detail", codec: "vp9", bitrateMbps: 4 },
  },
  {
    id: "ultra",
    label: "Source / 1440p",
    sub: "1440p · 60fps · 9 Mbps",
    config: { resolution: "1440p", fps: 60, mode: "motion", codec: "h264", bitrateMbps: 9 },
  },
  {
    id: "lite",
    label: "Low Bandwidth",
    sub: "720p · 30fps · 2.5 Mbps",
    config: { resolution: "720p", fps: 30, mode: "motion", codec: "vp8", bitrateMbps: 3 },
  },
];

export function ScreenShareModal({ open, onClose }: ScreenShareModalProps) {
  const {
    isScreenSharing,
    screenShareConfig,
    startScreenShare,
    stopScreenShare,
  } = useVoice();

  const [draft, setDraft] = useState<ScreenShareConfig>(screenShareConfig);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(screenShareConfig);
      setBusy(false);
    }
  }, [open, screenShareConfig]);

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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="screenshare-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-xl border border-white/[0.11] bg-[#121316] shadow-2xl shadow-black/75"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
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
                <div>
                  <h2
                    id="screenshare-modal-title"
                    className="text-sm font-semibold text-zinc-100"
                  >
                    {isScreenSharing ? "Stream Controls" : "Share Your Screen"}
                  </h2>
                  <p className="text-[11px] text-zinc-400">
                    {isScreenSharing
                      ? `Currently live · ${screenShareConfig.resolution} · ${screenShareConfig.fps}fps · ${screenShareConfig.codec.toUpperCase()}`
                      : "Configure quality and pick a window or screen to stream"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close screen share modal"
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {/* Quick Presets */}
              <div className="space-y-1.5">
                <span className="block text-[11px] font-medium text-zinc-400">
                  Quick presets
                </span>
                <div className="grid grid-cols-2 gap-2">
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
                        className={`rounded-lg border px-3 py-2 text-left transition-all ${
                          active
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                            : "border-white/[0.08] bg-[#18191E] text-zinc-300 hover:border-white/[0.15]"
                        }`}
                      >
                        <div className="text-xs font-semibold">{p.label}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
                          {p.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Resolution & FPS */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-medium text-zinc-400">
                    Resolution
                  </span>
                  <div className="grid grid-cols-4 gap-1 rounded-lg border border-white/[0.08] bg-[#0E0F12] p-1">
                    {(["720p", "1080p", "1440p", "source"] as ScreenResolutionOption[]).map(
                      (res) => (
                        <button
                          key={res}
                          type="button"
                          onClick={() => setDraft((d) => ({ ...d, resolution: res }))}
                          className={`rounded-md py-1.5 font-mono text-[11px] font-medium transition-colors ${
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
                  <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/[0.08] bg-[#0E0F12] p-1">
                    {([15, 30, 60] as ScreenFpsOption[]).map((fps) => (
                      <button
                        key={fps}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, fps }))}
                        className={`rounded-md py-1.5 font-mono text-[11px] font-medium transition-colors ${
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-medium text-zinc-400">
                    Content Priority
                  </span>
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/[0.08] bg-[#0E0F12] p-1">
                    <button
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, mode: "motion" }))}
                      className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
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
                      className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
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
                  <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/[0.08] bg-[#0E0F12] p-1">
                    {(["vp9", "h264", "vp8"] as ScreenCodecOption[]).map((codec) => (
                      <button
                        key={codec}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, codec }))}
                        className={`rounded-md py-1.5 font-mono text-[11px] font-medium uppercase transition-colors ${
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

              {/* Bitrate Slider + System Audio Toggle */}
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-white/[0.07] bg-[#0E0F12] p-3.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">Max Bitrate</span>
                    <span className="font-mono text-emerald-400">
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
                    className="h-1.5 w-full cursor-pointer accent-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                  <div className="flex items-center gap-2 text-xs text-zinc-300">
                    {draft.shareAudio ? (
                      <Volume2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <VolumeX className="h-4 w-4 text-zinc-500" />
                    )}
                    <span>Share system / tab audio</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({ ...d, shareAudio: !d.shareAudio }))
                    }
                    className={`rounded-md px-3 py-1 text-[11px] font-semibold transition-colors ${
                      draft.shareAudio
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-white/[0.06] text-zinc-400"
                    }`}
                  >
                    {draft.shareAudio ? "On" : "Off"}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] bg-[#0E0F12] px-5 py-3.5">
              {isScreenSharing ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStop()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3.5 py-2 text-xs font-semibold text-rose-300 transition-all hover:bg-rose-500 hover:text-white active:scale-[0.98] disabled:opacity-50"
                >
                  <MonitorOff className="h-3.5 w-3.5" />
                  <span>Stop Stream</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-white/[0.1] px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleStartOrSwitch()}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
              >
                {isScreenSharing ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>{busy ? "Switching..." : "Apply & Change Source"}</span>
                  </>
                ) : (
                  <>
                    <Monitor className="h-3.5 w-3.5" />
                    <span>{busy ? "Starting..." : "Go Live"}</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
