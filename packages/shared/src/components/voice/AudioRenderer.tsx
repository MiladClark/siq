"use client";

import type { RemoteAudioTrack } from "livekit-client";
import { useEffect, useRef } from "react";
import {
  ensurePlaybackRunning,
  getPlaybackContext,
  playbackContextSupportsSinkId,
} from "@siq/shared/lib/audio-playback";

interface RemoteAudioPlayerProps {
  track: RemoteAudioTrack;
  volume: number; // 0 to 3 (0% - 300%)
  deafened: boolean;
  outputDeviceId?: string;
}

function clampGain(volume: number, deafened: boolean): number {
  return deafened ? 0 : Math.max(0, Math.min(3, volume));
}

/**
 * Plays a LiveKit RemoteAudioTrack through the shared low-latency playback context with a
 * per-user GainNode (up to 300 %). Output-device routing is done once on the shared context
 * (AudioContext.setSinkId); browsers without it fall back to a per-player sink element.
 */
export function RemoteAudioPlayer({ track, volume, deafened, outputDeviceId }: RemoteAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const latestGainRef = useRef(clampGain(volume, deafened));
  latestGainRef.current = clampGain(volume, deafened);

  useEffect(() => {
    const mediaStreamTrack = track.mediaStreamTrack;
    if (!mediaStreamTrack) return;

    const stream = new MediaStream([mediaStreamTrack]);
    const el = audioRef.current;
    const ctx = getPlaybackContext();

    let source: MediaStreamAudioSourceNode | null = null;
    let gainNode: GainNode | null = null;
    let sinkEl: HTMLAudioElement | null = null;
    let sinkDest: MediaStreamAudioDestinationNode | null = null;

    // Chromium only pulls WebRTC audio into Web Audio while a media element consumes it.
    if (el) {
      el.srcObject = stream;
      el.muted = true;
      void el.play().catch(() => {});
    }

    if (ctx) {
      try {
        source = ctx.createMediaStreamSource(stream);
        gainNode = ctx.createGain();
        gainNode.gain.value = latestGainRef.current;
        source.connect(gainNode);

        const needsSinkFallback = Boolean(outputDeviceId) && !playbackContextSupportsSinkId();
        const canSinkElement =
          typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
        if (needsSinkFallback && canSinkElement) {
          sinkDest = ctx.createMediaStreamDestination();
          gainNode.connect(sinkDest);
          sinkEl = document.createElement("audio");
          sinkEl.srcObject = sinkDest.stream;
          sinkEl.autoplay = true;
          const setSink = (sinkEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> })
            .setSinkId;
          if (setSink && outputDeviceId) void setSink.call(sinkEl, outputDeviceId).catch(() => {});
          void sinkEl.play().catch(() => {});
        } else {
          gainNode.connect(ctx.destination);
        }
        ensurePlaybackRunning();
        ctxRef.current = ctx;
        gainRef.current = gainNode;
      } catch {
        source = null;
        gainNode = null;
      }
    }

    if (!gainNode && el) {
      // Last-resort native playback (0–100 %)
      el.muted = latestGainRef.current === 0;
      el.volume = Math.min(1, latestGainRef.current);
      void el.play().catch(() => {});
    }

    return () => {
      try {
        source?.disconnect();
        gainNode?.disconnect();
        sinkDest?.disconnect();
      } catch {
        // ignore cleanup errors
      }
      if (sinkEl) {
        sinkEl.pause();
        sinkEl.srcObject = null;
      }
      if (el) {
        el.pause();
        el.srcObject = null;
      }
      ctxRef.current = null;
      gainRef.current = null;
    };
  }, [track, outputDeviceId]);

  // Smoothly update volume / deafen without rebuilding the graph
  useEffect(() => {
    const target = clampGain(volume, deafened);
    if (gainRef.current && ctxRef.current) {
      gainRef.current.gain.setTargetAtTime(target, ctxRef.current.currentTime, 0.02);
      ensurePlaybackRunning();
    } else if (audioRef.current && !gainRef.current) {
      audioRef.current.muted = target === 0;
      audioRef.current.volume = Math.min(1, target);
    }
  }, [volume, deafened]);

  return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
}
