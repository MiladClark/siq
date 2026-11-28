"use client";

import { Lock, ShieldCheck, Wifi } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HeaderPanel } from "@siq/shared/components/ui/HeaderPanel";
import { useVoice } from "@siq/shared/components/voice/VoiceProvider";
import type { NoiseCancellationMode } from "@siq/shared/lib/noise-processor";
import type { SiqAiEngine, SiqNeuralState } from "@siq/shared/lib/siq-audio-worklet";
import type { VoiceNetworkStats } from "@siq/shared/lib/types";

interface ConnectionStatusButtonProps {
  stats: VoiceNetworkStats;
  open: boolean;
  onToggle: () => void;
}

function getSignalStyle(pingMs: number | null) {
  if (pingMs === null) {
    return {
      box: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
      text: "text-zinc-400",
      stroke: "#a1a1aa",
    };
  }
  if (pingMs < 110) {
    return {
      box: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
      text: "text-emerald-400",
      stroke: "#34d399",
    };
  }
  if (pingMs < 230) {
    return {
      box: "bg-amber-500/15 text-amber-400 border-amber-500/25",
      text: "text-amber-400",
      stroke: "#fbbf24",
    };
  }
  return {
    box: "bg-rose-500/15 text-rose-400 border-rose-500/25",
    text: "text-rose-400",
    stroke: "#fb7185",
  };
}

function describeNoiseEngine(
  mode: NoiseCancellationMode,
  siq: SiqAiEngine,
  neural: SiqNeuralState
): { label: string; tone: string } {
  if (mode === "siq") {
    if (siq === "ultra") {
      return neural === "loading" || neural === "priming"
        ? { label: "SIQ Ultra AI · loading model", tone: "text-amber-300" }
        : { label: "SIQ Ultra AI · DeepFilterNet3", tone: "text-emerald-300" };
    }
    if (siq === "fast") return { label: "SIQ Fast AI · GTCRN", tone: "text-emerald-300" };
    return { label: "SIQ Spectral", tone: "text-emerald-300" };
  }
  const labels: Record<NoiseCancellationMode, string> = {
    siq: "SIQ",
    krisp: "Krisp AI",
    gtcrn: "GTCRN",
    rnnoise: "RNNoise",
    standard: "Browser (WebRTC)",
    off: "Off",
  };
  return { label: labels[mode], tone: mode === "off" ? "text-zinc-400" : "text-zinc-100" };
}

function formatTickTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ConnectionStatusButton({ stats, open, onToggle }: ConnectionStatusButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [tab, setTab] = useState<"connection" | "privacy">("connection");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);

  const signal = getSignalStyle(stats.lastPingMs);
  const { activeNoiseEngine, activeSiqEngine, siqNeuralState } = useVoice();
  const engine = describeNoiseEngine(activeNoiseEngine, activeSiqEngine, siqNeuralState);

  useLayoutEffect(() => {
    if (!open) return;
    function updateAnchor() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ left: rect.left, top: rect.top, width: rect.width });
    }
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [open]);

  // Build SVG polyline points (max scale 400ms, auto-scales higher if needed)
  const samples = stats.history;
  const maxY = Math.max(400, ...samples.map((s) => s.pingMs + 40));
  const width = 264;
  const height = 84;
  const points = samples
    .map((s, idx) => {
      const x =
        samples.length <= 1 ? width : (idx / (samples.length - 1)) * width;
      const y = height - Math.min(height - 3, (s.pingMs / maxY) * (height - 8)) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const firstTs = samples[0]?.timestamp;
  const midTs = samples[Math.floor(samples.length / 2)]?.timestamp;
  const lastTs = samples[samples.length - 1]?.timestamp;

  return (
    <div className="relative">
      {/* Hover Ping Tooltip (matches Discord-style ms pill above icon) */}
      <AnimatePresence>
        {hovered && !open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.94 }}
            transition={{ duration: 0.12 }}
            className="siq-glass pointer-events-none absolute -top-10 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold tabular-nums text-zinc-100"
          >
            {stats.lastPingMs !== null ? `${stats.lastPingMs} ms` : "Measuring…"}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Signal Icon Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label="Voice connection details"
        aria-expanded={open}
        aria-controls={open ? "workspace-header-voice" : undefined}
        aria-haspopup="dialog"
        data-header-trigger="voice"
        className={`siq-voice-trigger flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${signal.box}`}
      >
        <Wifi className="size-[18px]" />
      </button>

      {/* Detailed Network Popover */}
      {anchor && createPortal(
        <AnimatePresence>
          {open && (
            <HeaderPanel
              kind="voice"
              label="Voice connection details"
              pillContent={<Wifi className={`size-[18px] ${signal.text}`} />}
              style={{
                "--voice-anchor-left": `${anchor.left}px`,
                "--voice-anchor-top": `${anchor.top}px`,
                "--voice-anchor-width": `${anchor.width}px`,
              } as CSSProperties}
            >
              {/* Tabs */}
              <div className="flex shrink-0 items-center gap-5 border-b border-white/[0.07] px-4 pt-3">
                <button
                  type="button"
                  onClick={() => setTab("connection")}
                  aria-pressed={tab === "connection"}
                  className={`relative pb-2.5 text-xs font-semibold transition-colors ${
                    tab === "connection" ? "text-emerald-400" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Connection
                  {tab === "connection" && (
                    <motion.span
                      layoutId="conn-tab-indicator"
                      className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-emerald-400"
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTab("privacy")}
                  aria-pressed={tab === "privacy"}
                  className={`relative pb-2.5 text-xs font-semibold transition-colors ${
                    tab === "privacy" ? "text-emerald-400" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Privacy
                  {tab === "privacy" && (
                    <motion.span
                      layoutId="conn-tab-indicator"
                      className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-emerald-400"
                    />
                  )}
                </button>
              </div>

              {tab === "connection" ? (
                <div className="min-h-0 space-y-3.5 overflow-y-auto p-4">
                  {/* Live Ping Graph */}
                  <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-black/30 p-2.5">
                    <div className="relative h-[84px] w-full">
                      {/* Horizontal Grid Lines + Y-Axis labels */}
                      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between text-[10px] font-medium tabular-nums text-zinc-500">
                        <div className="flex items-center justify-end border-b border-white/[0.05] pb-0.5">
                          {Math.round(maxY)}
                        </div>
                        <div className="flex items-center justify-end border-b border-white/[0.05] pb-0.5">
                          {Math.round(maxY / 2)}
                        </div>
                        <div className="flex items-center justify-end">0</div>
                      </div>

                      <svg
                        viewBox={`0 0 ${width} ${height}`}
                        className="h-full w-full overflow-visible"
                        preserveAspectRatio="none"
                      >
                        {samples.length > 1 ? (
                          <polyline
                            fill="none"
                            stroke={signal.stroke}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={points}
                          />
                        ) : (
                          <line
                            x1="0"
                            y1={height / 2}
                            x2={width}
                            y2={height / 2}
                            stroke="#3f3f46"
                            strokeDasharray="4 4"
                            strokeWidth="1.5"
                          />
                        )}
                      </svg>
                    </div>

                    {/* X-Axis Timestamps */}
                    <div className="mt-1.5 flex items-center justify-between text-[10px] font-medium tabular-nums text-zinc-500">
                      <span>{firstTs ? formatTickTime(firstTs) : "—"}</span>
                      <span>{midTs ? formatTickTime(midTs) : ""}</span>
                      <span>{lastTs ? formatTickTime(lastTs) : "Now"}</span>
                    </div>
                  </div>

                  {/* Server & Live Metrics */}
                  <div className="space-y-1.5">
                    <p className="truncate text-xs font-semibold text-zinc-100">
                      {stats.serverHost || "LiveKit"}
                    </p>
                    <div className="space-y-0.5 text-xs text-zinc-400">
                      <p>
                        Average voice ping{" "}
                        <span className="font-semibold tabular-nums text-zinc-100">
                          {stats.avgPingMs !== null ? `${stats.avgPingMs} ms` : "—"}
                        </span>
                      </p>
                      <p>
                        Latest voice ping{" "}
                        <span className="font-semibold tabular-nums text-zinc-100">
                          {stats.lastPingMs !== null ? `${stats.lastPingMs} ms` : "—"}
                        </span>
                      </p>
                      <p>
                        Outbound audio loss{" "}
                        <span className="font-semibold tabular-nums text-zinc-100">
                          {stats.packetLossPct !== null ? `${stats.packetLossPct.toFixed(1)}%` : "—"}
                        </span>
                      </p>
                      <p>
                        Transport{" "}
                        <span className="font-semibold text-zinc-100">{stats.transport ?? "—"}</span>
                      </p>
                      <p>
                        Noise cancellation{" "}
                        <span className={`font-semibold ${engine.tone}`}>{engine.label}</span>
                      </p>
                      {stats.joinTiming && (
                        <p className="tabular-nums">
                          Token {stats.joinTiming.tokenMs} ms · Voice setup {stats.joinTiming.connectMs} ms
                        </p>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    You may notice delayed audio at 250 ms or higher, or robotic audio if
                    packet loss exceeds 10%.
                  </p>

                  {/* Encryption Badge */}
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-2 text-xs font-medium text-emerald-300">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>DTLS-SRTP Encrypted</span>
                  </div>
                </div>
              ) : (
                <div className="min-h-0 space-y-3 overflow-y-auto p-4 text-xs leading-relaxed text-zinc-400">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    <span className="font-semibold">Transport Security Active</span>
                  </div>
                  <p>
                    All voice, webcam, and screen share media streams are encrypted in
                    transit with WebRTC DTLS-SRTP between your browser and LiveKit.
                  </p>
                  <p>
                    Room access tokens are short-lived, signed server-side, and scoped only
                    to invited members of this private instance.
                  </p>
                </div>
              )}
            </HeaderPanel>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
