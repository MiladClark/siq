"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type VisualizerState = "idle" | "connecting" | "listening" | "speaking" | "muted";

interface BarVisualizerProps {
  /** Current voice activity state */
  state?: VisualizerState;
  /** Number of vertical frequency bars */
  barCount?: number;
  /** Optional WebRTC / MediaStreamTrack for true live frequency analysis */
  mediaStreamTrack?: MediaStreamTrack | null;
  /** Size preset */
  size?: "xs" | "sm" | "md" | "lg";
  /** Center-aligned symmetrical bars (studio look) or bottom-aligned */
  centerAlign?: boolean;
  /** Accent color mode */
  tone?: "emerald" | "rose" | "zinc" | "amber";
  className?: string;
}

const SIZE_CONFIG = {
  xs: { height: 14, barWidth: 2, gap: 2, minPct: 22 },
  sm: { height: 20, barWidth: 2.5, gap: 2.5, minPct: 18 },
  md: { height: 30, barWidth: 3, gap: 3, minPct: 16 },
  lg: { height: 48, barWidth: 4, gap: 4, minPct: 14 },
} as const;

const TONE_CLASSES = {
  emerald: {
    active: "bg-emerald-400 shadow-[0_0_8px_rgb(var(--siq-accent-rgb)/0.48)]",
    idle: "bg-zinc-600/60",
  },
  rose: {
    active: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.4)]",
    idle: "bg-rose-500/30",
  },
  amber: {
    active: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]",
    idle: "bg-zinc-600/60",
  },
  zinc: {
    active: "bg-zinc-200",
    idle: "bg-zinc-700/60",
  },
} as const;

/**
 * Single shared AudioContext for all BarVisualizer instances so we NEVER
 * spawn & destroy AudioContext threads every time a participant starts/stops speaking.
 */
let sharedVisualizerCtx: AudioContext | null = null;

function getSharedVisualizerAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedVisualizerCtx && sharedVisualizerCtx.state !== "closed") {
    return sharedVisualizerCtx;
  }
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    sharedVisualizerCtx = new AudioCtx();
    return sharedVisualizerCtx;
  } catch {
    return null;
  }
}

/**
 * ElevenLabs-inspired real-time acoustic BarVisualizer.
 * Reads real frequency bands via a single shared Web Audio AnalyserNode when a
 * MediaStreamTrack is provided, and seamlessly falls back to organic acoustic motion curves.
 */
export function BarVisualizer({
  state = "idle",
  barCount = 7,
  mediaStreamTrack = null,
  size = "sm",
  centerAlign = true,
  tone = "emerald",
  className = "",
}: BarVisualizerProps) {
  const cfg = SIZE_CONFIG[size];
  const palette = TONE_CLASSES[state === "muted" ? "rose" : state === "connecting" ? "amber" : tone];

  // Static baseline levels shaped like a natural bell curve
  const baseline = useMemo(
    () =>
      Array.from({ length: barCount }, (_, i) => {
        const center = (barCount - 1) / 2;
        const dist = center > 0 ? Math.abs(i - center) / center : 0;
        return Math.max(cfg.minPct, Math.round(cfg.minPct + (1 - dist) * 10));
      }),
    [barCount, cfg.minPct]
  );

  const [levels, setLevels] = useState<number[]>(baseline);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<{
    analyser: AnalyserNode;
    dataArray: Uint8Array<ArrayBuffer>;
  } | null>(null);

  useEffect(() => {
    setLevels(baseline);
  }, [baseline]);

  // Bind AnalyserNode ONLY when mediaStreamTrack changes (NOT on idle <-> speaking toggles!)
  useEffect(() => {
    if (!mediaStreamTrack || mediaStreamTrack.readyState !== "live") {
      analyserRef.current = null;
      return;
    }

    const ctx = getSharedVisualizerAudioContext();
    if (!ctx) {
      analyserRef.current = null;
      return;
    }

    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    try {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.72;
      const stream = new MediaStream([mediaStreamTrack]);
      source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyserRef.current = {
        analyser,
        dataArray: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
      };
    } catch {
      analyserRef.current = null;
    }

    return () => {
      analyserRef.current = null;
      try {
        source?.disconnect();
        analyser?.disconnect();
      } catch {
        // ignore audio node teardown errors
      }
    };
  }, [mediaStreamTrack]);

  // Animate bars only when active
  useEffect(() => {
    if (state === "idle" || state === "muted") {
      setLevels(baseline);
      return;
    }

    if (sharedVisualizerCtx && sharedVisualizerCtx.state === "suspended") {
      void sharedVisualizerCtx.resume().catch(() => {});
    }

    let cancelled = false;
    let lastFrame = 0;
    const startTime = performance.now();

    const tick = (now: number) => {
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(tick);

      // Throttle React state updates to ~24fps for smooth CSS transitions & low CPU
      if (now - lastFrame < 42) return;
      lastFrame = now;

      const t = (now - startTime) / 1000;
      const center = (barCount - 1) / 2;
      const bound = analyserRef.current;

      if (bound && state === "speaking") {
        bound.analyser.getByteFrequencyData(bound.dataArray);
        const usableBins = Math.min(bound.dataArray.length, 24);
        let energySum = 0;
        const measured = Array.from({ length: barCount }, (_, i) => {
          const binIndex = Math.min(
            usableBins - 1,
            Math.floor((i / Math.max(1, barCount - 1)) * (usableBins - 2)) + 1
          );
          const v = bound.dataArray[binIndex] / 255;
          energySum += v;
          const dist = center > 0 ? Math.abs(i - center) / center : 0;
          const envelope = 1 - dist * 0.28;
          return Math.min(100, Math.max(cfg.minPct, Math.round(v * envelope * 115)));
        });

        if (energySum > 0.08) {
          setLevels(measured);
          return;
        }
      }

      if (state === "connecting") {
        const next = Array.from({ length: barCount }, (_, i) => {
          const wave = Math.sin(t * 5.2 - i * 0.65);
          return Math.round(cfg.minPct + ((wave + 1) / 2) * 52);
        });
        setLevels(next);
        return;
      }

      if (state === "listening") {
        const next = Array.from({ length: barCount }, (_, i) => {
          const dist = center > 0 ? Math.abs(i - center) / center : 0;
          const wave = Math.sin(t * 2.4 + i * 0.85) * 0.5 + 0.5;
          return Math.round(cfg.minPct + wave * (1 - dist * 0.45) * 26);
        });
        setLevels(next);
        return;
      }

      // Speaking organic acoustic synthesis
      const next = Array.from({ length: barCount }, (_, i) => {
        const dist = center > 0 ? Math.abs(i - center) / center : 0;
        const envelope = 1 - dist * 0.42;
        const f1 = Math.sin(t * 9.5 + i * 1.15);
        const f2 = Math.cos(t * 14.2 - i * 1.9);
        const f3 = Math.sin(t * 5.1 + i * 0.6);
        const combined = ((f1 * 0.45 + f2 * 0.35 + f3 * 0.2) + 1) / 2;
        return Math.min(
          100,
          Math.max(cfg.minPct, Math.round(cfg.minPct + combined * envelope * 84))
        );
      });
      setLevels(next);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [barCount, baseline, cfg.minPct, state]);

  const isActive = state === "speaking" || state === "connecting" || state === "listening";

  return (
    <div
      aria-hidden="true"
      className={`inline-flex shrink-0 ${
        centerAlign ? "items-center" : "items-end"
      } ${className}`}
      style={{ height: cfg.height, gap: cfg.gap }}
    >
      {levels.map((pct, idx) => (
        <span
          key={idx}
          className={`rounded-full transition-[height,background-color,box-shadow] duration-75 ease-out ${
            isActive ? palette.active : palette.idle
          }`}
          style={{
            width: cfg.barWidth,
            height: `${pct}%`,
          }}
        />
      ))}
    </div>
  );
}
