"use client";

import { Lock, ShieldCheck, Wifi } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { VoiceNetworkStats } from "@/lib/types";

interface ConnectionStatusButtonProps {
  stats: VoiceNetworkStats;
}

function getSignalStyle(pingMs: number | null) {
  if (pingMs === null) {
    return {
      box: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
      stroke: "#a1a1aa",
    };
  }
  if (pingMs < 110) {
    return {
      box: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
      stroke: "#34d399",
    };
  }
  if (pingMs < 230) {
    return {
      box: "bg-amber-500/15 text-amber-400 border-amber-500/25",
      stroke: "#fbbf24",
    };
  }
  return {
    box: "bg-rose-500/15 text-rose-400 border-rose-500/25",
    stroke: "#fb7185",
  };
}

function formatTickTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ConnectionStatusButton({ stats }: ConnectionStatusButtonProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [tab, setTab] = useState<"connection" | "privacy">("connection");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const signal = getSignalStyle(stats.lastPingMs);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
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
    <div ref={containerRef} className="relative">
      {/* Hover Ping Tooltip (matches Discord-style ms pill above icon) */}
      <AnimatePresence>
        {hovered && !open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.94 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute -top-9 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/[0.12] bg-[#18191E] px-2.5 py-1 font-mono text-[11px] font-semibold text-zinc-100 shadow-xl"
          >
            {stats.lastPingMs !== null ? `${stats.lastPingMs} ms` : "Measuring…"}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Signal Icon Button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label="Voice connection details"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all active:scale-95 ${signal.box}`}
      >
        <Wifi className="h-4 w-4" />
      </button>

      {/* Detailed Network Popover */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.17, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-[132px] left-3 z-[85] w-[306px] origin-bottom-left overflow-hidden rounded-xl border border-white/[0.11] bg-[#14151A] shadow-2xl shadow-black/80"
          >
            {/* Tabs */}
            <div className="flex items-center gap-5 border-b border-white/[0.07] px-4 pt-3">
              <button
                type="button"
                onClick={() => setTab("connection")}
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
              <div className="space-y-3.5 p-4">
                {/* Live Ping Graph */}
                <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-[#0B0C0F] p-2.5">
                  <div className="relative h-[84px] w-full">
                    {/* Horizontal Grid Lines + Y-Axis labels */}
                    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between text-[9px] font-mono text-zinc-500">
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
                  <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] text-zinc-500">
                    <span>{firstTs ? formatTickTime(firstTs) : "—"}</span>
                    <span>{midTs ? formatTickTime(midTs) : ""}</span>
                    <span>{lastTs ? formatTickTime(lastTs) : "Now"}</span>
                  </div>
                </div>

                {/* Server & Live Metrics */}
                <div className="space-y-1.5">
                  <p className="truncate font-mono text-xs font-semibold text-zinc-100">
                    {stats.serverHost || "livekit-edge"}
                  </p>
                  <div className="space-y-0.5 text-xs text-zinc-400">
                    <p>
                      Average ping:{" "}
                      <span className="font-mono font-semibold text-zinc-100">
                        {stats.avgPingMs !== null ? `${stats.avgPingMs} ms` : "—"}
                      </span>
                    </p>
                    <p>
                      Last ping:{" "}
                      <span className="font-mono font-semibold text-zinc-100">
                        {stats.lastPingMs !== null ? `${stats.lastPingMs} ms` : "—"}
                      </span>
                    </p>
                    <p>
                      Outbound packet loss rate:{" "}
                      <span className="font-mono font-semibold text-zinc-100">
                        {stats.packetLossPct.toFixed(1)}%
                      </span>
                    </p>
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
              <div className="space-y-3 p-4 text-xs leading-relaxed text-zinc-400">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
