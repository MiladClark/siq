"use client";

import { mediaUrl } from "@/lib/client-api";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatedIconButton } from "@siq/shared/components/ui/AnimatedIcon";
import { DownloadIcon, PauseIcon, PlayIcon } from "@siq/shared/components/ui/animated-icons";

const BAR_COUNT = 72;
const SPEEDS = [1, 1.25, 1.5, 2, 0.75] as const;

interface AudioWaveformPlayerProps {
  src: string;
  name: string;
  onDownload: () => void;
}

function fallbackPeaks(src: string) {
  let seed = 17;
  for (const character of src) seed = (Math.imul(seed, 31) + character.charCodeAt(0)) >>> 0;
  return Array.from({ length: BAR_COUNT }, (_, index) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const envelope = 0.45 + 0.55 * Math.sin((index / (BAR_COUNT - 1)) * Math.PI);
    return (0.15 + (seed / 2 ** 32) * 0.8) * envelope;
  });
}

function getPeaks(buffer: AudioBuffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    buffer.getChannelData(index)
  );
  const samplesPerBar = buffer.length / BAR_COUNT;
  const stride = Math.max(1, Math.floor(samplesPerBar / 256));
  const peaks = Array.from({ length: BAR_COUNT }, (_, index) => {
    const start = Math.floor(index * samplesPerBar);
    const end = Math.min(buffer.length, Math.ceil((index + 1) * samplesPerBar));
    let peak = 0;
    for (const samples of channels) {
      for (let sample = start; sample < end; sample += stride) {
        peak = Math.max(peak, Math.abs(samples[sample]));
      }
    }
    return peak;
  });
  const max = Math.max(0.05, ...peaks);
  return peaks.map((peak) => peak / max);
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function AudioWaveformPlayer({ src, name, onDownload }: AudioWaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [decoded, setDecoded] = useState<{ src: string; peaks: number[]; duration: number } | null>(
    null
  );
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const placeholder = useMemo(() => fallbackPeaks(src), [src]);
  const analysis = decoded?.src === src ? decoded : null;
  const peaks = analysis?.peaks ?? placeholder;
  const duration = mediaDuration || analysis?.duration || 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !window.OfflineAudioContext) return;
    const request = new AbortController();
    async function decode() {
      try {
        const response = await fetch(mediaUrl(src), { signal: request.signal });
        if (!response.ok) return;
        const bytes = await response.arrayBuffer();
        if (request.signal.aborted) return;
        const context = new OfflineAudioContext(1, 1, 22050);
        const buffer = await context.decodeAudioData(bytes);
        if (!request.signal.aborted) {
          setDecoded({ src, peaks: getPeaks(buffer), duration: buffer.duration });
        }
      } catch {
        // Keep the deterministic waveform if the browser cannot decode the file.
      }
    }
    void decode();
    return () => request.abort();
  }, [src, visible]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !audio || !context) return;
    let frame = 0;
    let width = 0;
    let height = 0;

    function draw() {
      if (!context || !audio || !canvas || !width || !height) return;
      const progress = duration > 0 ? Math.min(1, audio.currentTime / duration) : 0;
      const accent = getComputedStyle(canvas).color;
      const step = width / peaks.length;
      const barWidth = Math.max(1, step * 0.58);
      context.clearRect(0, 0, width, height);
      peaks.forEach((peak, index) => {
        const barHeight = Math.max(2, peak * (height - 4));
        context.fillStyle = (index + 0.5) / peaks.length <= progress ? accent : "#555862";
        context.beginPath();
        context.roundRect(
          index * step + (step - barWidth) / 2,
          (height - barHeight) / 2,
          barWidth,
          barHeight,
          2
        );
        context.fill();
      });
      if (progress > 0) {
        context.fillStyle = accent;
        context.fillRect(Math.min(width - 1, progress * width), 1, 1, height - 2);
      }
    }

    function resize() {
      if (!canvas || !context) return;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function animate() {
      draw();
      frame = requestAnimationFrame(animate);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    audio.addEventListener("timeupdate", draw);
    if (playing) frame = requestAnimationFrame(animate);
    return () => {
      observer.disconnect();
      audio.removeEventListener("timeupdate", draw);
      cancelAnimationFrame(frame);
    };
  }, [duration, peaks, playing]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      setError(null);
      await audio.play();
    } catch {
      setError("Audio could not be played.");
    }
  }

  return (
    <div
      dir="ltr"
      className="siq-bezel-sm w-80 max-w-full min-w-0 space-y-2 rounded-xl border border-white/[0.09] bg-[#0E0F12] p-2.5"
    >
      <audio
        ref={audioRef}
        src={visible ? src : undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onDurationChange={(event) => {
          const length = event.currentTarget.duration;
          setMediaDuration(Number.isFinite(length) ? length : 0);
        }}
        onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
        onError={() => setError("Audio is unavailable in this browser.")}
      />
      <div className="flex items-center justify-between gap-2">
        <p dir="auto" title={name} className="min-w-0 truncate text-xs font-medium text-zinc-200">
          {name}
        </p>
        <AnimatedIconButton
          type="button"
          icon={DownloadIcon}
          iconSize={14}
          aria-label={`Download ${name}`}
          title={`Download ${name}`}
          onClick={onDownload}
          className="rounded-md p-1 text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100"
        />
      </div>
      <div className="flex items-center gap-2">
        <AnimatedIconButton
          type="button"
          icon={playing ? PauseIcon : PlayIcon}
          iconSize={16}
          aria-label={playing ? "Pause audio" : "Play audio"}
          onClick={() => void togglePlayback()}
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/[0.1] bg-[#16171D] text-emerald-300 hover:bg-white/[0.08]"
        />
        <div className="min-w-0 flex-1">
          <div className="relative rounded-md focus-within:outline focus-within:outline-emerald-400">
            <canvas ref={canvasRef} aria-hidden="true" className="block h-8 w-full text-emerald-400" />
            <input
              type="range"
              aria-label="Seek audio"
              aria-valuetext={`${formatTime(elapsed)} of ${formatTime(duration)}`}
              disabled={duration <= 0}
              min={0}
              max={duration || 1}
              step={0.01}
              value={Math.min(duration, elapsed)}
              onChange={(event) => {
                const time = event.target.valueAsNumber;
                if (!audioRef.current) return;
                audioRef.current.currentTime = time;
                setElapsed(time);
              }}
              className="absolute inset-0 m-0 h-full w-full cursor-ew-resize opacity-0 disabled:cursor-default"
            />
          </div>
          <p className="font-mono text-[10px] tabular-nums text-zinc-400">
            {formatTime(elapsed)} / {duration ? formatTime(duration) : "–:––"}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Playback speed ${SPEEDS[speedIndex]}x. Click to change speed.`}
          onClick={() => {
            const next = (speedIndex + 1) % SPEEDS.length;
            if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
            setSpeedIndex(next);
          }}
          className="min-w-10 shrink-0 rounded-md border border-white/[0.1] bg-[#16171D] px-1 py-1 font-mono text-[10px] text-zinc-300 hover:text-white"
        >
          {SPEEDS[speedIndex]}x
        </button>
      </div>
      {error && (
        <p role="status" className="text-[11px] text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
