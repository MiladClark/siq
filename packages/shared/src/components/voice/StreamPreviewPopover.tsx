"use client";

import { Monitor, Play } from "lucide-react";
import type { Track } from "livekit-client";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar, type AvatarStatus } from "@siq/shared/components/ui/Avatar";

export interface StreamPreviewTarget {
  identity: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
  status: AvatarStatus;
  channelId: string;
  channelName: string;
  startedAtMs: number | null;
  liveScreenTrack: Track | null;
  anchorRect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
}

function formatDuration(elapsedMs: number): string {
  const totalSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

function LivePreviewCanvas({ track }: { track: Track }) {
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
      className="h-full w-full object-cover"
    />
  );
}

export function StreamPreviewPopover({
  target,
  onMouseEnter,
  onMouseLeave,
  onWatchStream,
}: {
  target: StreamPreviewTarget;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onWatchStream: (target: StreamPreviewTarget) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: target.anchorRect.top,
    left: target.anchorRect.right + 12,
  });
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    const width = el?.offsetWidth || 292;
    const height = el?.offsetHeight || 245;
    const pad = 12;

    let left = target.anchorRect.right + 12;
    if (left + width > window.innerWidth - pad) {
      left = target.anchorRect.left - width - 12;
    }
    if (left < pad) left = pad;

    let top = target.anchorRect.top - 16;
    if (top + height > window.innerHeight - pad) {
      top = window.innerHeight - height - pad;
    }
    if (top < pad) top = pad;

    setCoords({ top, left });
  }, [target]);

  const elapsedText = target.startedAtMs
    ? formatDuration(nowMs - target.startedAtMs)
    : "LIVE";

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -6, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -4, scale: 0.96 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      style={{ top: coords.top, left: coords.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-[88] w-[292px] overflow-hidden rounded-xl border border-white/[0.11] bg-[#14151A] p-3.5 shadow-2xl shadow-black/80"
    >
      {/* Header: Avatar + Name + Ticking Timer */}
      <div className="flex items-center justify-between gap-2.5 border-b border-white/[0.07] pb-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar
            name={target.displayName}
            color={target.avatarColor}
            avatarUrl={target.avatarUrl}
            size="sm"
            status={target.status}
            ringClassName="ring-[#14151A]"
          />
          <span dir="auto" className="truncate text-xs font-semibold text-zinc-100">
            {target.displayName}
          </span>
        </div>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-emerald-400">
          {elapsedText}
        </span>
      </div>

      {/* Streaming Now Row */}
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-400">Streaming Now</span>
        <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
          LIVE
        </span>
      </div>

      {/* Live Video Preview or Clean Stage Placeholder */}
      <div className="mt-2 aspect-video w-full overflow-hidden rounded-lg border border-white/[0.08] bg-black">
        {target.liveScreenTrack ? (
          <LivePreviewCanvas track={target.liveScreenTrack} />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#0E0F12] px-3 text-center">
            <Monitor className="h-6 w-6 text-emerald-400/80" />
            <p className="text-xs font-medium text-zinc-200">
              {target.displayName}&apos;s Screen
            </p>
            <p dir="auto" className="text-[10px] text-zinc-500">
              in {target.channelName}
            </p>
          </div>
        )}
      </div>

      {/* Full-Width Watch Stream CTA */}
      <button
        type="button"
        onClick={() => onWatchStream(target)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98]"
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        <span>Watch Stream</span>
      </button>
    </motion.div>
  );
}
