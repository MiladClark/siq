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

  // Grow out of the side facing the voice roster row that opened the preview
  const opensRight = coords.left >= target.anchorRect.left;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: opensRight ? -8 : 8, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{
        opacity: 0,
        x: opensRight ? -4 : 4,
        scale: 0.96,
        transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
      }}
      transition={{ type: "spring", stiffness: 480, damping: 32 }}
      style={{
        top: coords.top,
        left: coords.left,
        transformOrigin: opensRight ? "left top" : "right top",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="siq-glass fixed z-[88] w-[292px] overflow-hidden rounded-2xl p-3"
    >
      {/* Rose stage light spilling from the live badge */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_45%_at_100%_0%,rgba(244,63,94,0.12),transparent_70%)]"
      />

      {/* Header: Avatar + Name + Ticking Timer */}
      <div className="relative flex items-center justify-between gap-2.5 border-b border-white/[0.06] px-0.5 pb-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar
            name={target.displayName}
            color={target.avatarColor}
            avatarUrl={target.avatarUrl}
            size="sm"
            status={target.status}
            ringClassName="ring-[#1b1c23]"
          />
          <span dir="auto" className="truncate text-xs font-semibold text-zinc-100">
            {target.displayName}
          </span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
          <span aria-hidden="true" className="siq-live-dot !h-1.5 !w-1.5" />
          {elapsedText}
        </span>
      </div>

      {/* Streaming Now Row */}
      <div className="relative mt-2.5 flex items-center justify-between px-0.5">
        <span className="text-[11px] font-medium text-zinc-400">Streaming Now</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-rose-500 to-rose-600 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-white shadow-[0_0_14px_rgba(244,63,94,0.55)]">
          <span aria-hidden="true" className="h-1 w-1 animate-pulse rounded-full bg-white motion-reduce:animate-none" />
          LIVE
        </span>
      </div>

      {/* Live Video Preview or Clean Stage Placeholder */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 30, delay: 0.05 }}
        className="relative mt-2 aspect-video w-full overflow-hidden rounded-xl bg-black shadow-[0_12px_28px_-14px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.08]"
      >
        {target.liveScreenTrack ? (
          <LivePreviewCanvas track={target.liveScreenTrack} />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[radial-gradient(90%_80%_at_50%_30%,rgb(var(--siq-accent-rgb)/0.1),transparent_70%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.4))] px-3 text-center">
            <span className="mb-0.5 grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/25 shadow-[0_0_24px_-6px_rgb(var(--siq-accent-rgb)/0.6)]">
              <Monitor className="h-5 w-5 text-emerald-300" />
            </span>
            <p className="text-xs font-medium text-zinc-200">
              {target.displayName}&apos;s Screen
            </p>
            <p dir="auto" className="text-[10px] text-zinc-500">
              in {target.channelName}
            </p>
          </div>
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-t from-black/35 via-transparent to-white/[0.04]"
        />
      </motion.div>

      {/* Full-Width Watch Stream CTA */}
      <button
        type="button"
        onClick={() => onWatchStream(target)}
        className="siq-cta mt-3 flex w-full items-center justify-center gap-2 px-3.5 py-2 text-xs"
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        <span>Watch Stream</span>
      </button>
    </motion.div>
  );
}
