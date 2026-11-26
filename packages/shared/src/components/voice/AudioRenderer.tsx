"use client";

import type { RemoteAudioTrack } from "livekit-client";
import { useEffect, useRef } from "react";

interface RemoteAudioPlayerProps {
  track: RemoteAudioTrack;
  volume: number; // 0 to 2 (0% - 200%)
  deafened: boolean;
  outputDeviceId?: string;
}

/**
 * Plays a LiveKit RemoteAudioTrack with Web Audio GainNode boost (up to 200%)
 * and optional audio output device selection (setSinkId).
 */
export function RemoteAudioPlayer({
  track,
  volume,
  deafened,
  outputDeviceId,
}: RemoteAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const mediaStreamTrack = track.mediaStreamTrack;
    if (!mediaStreamTrack) return;

    const stream = new MediaStream([mediaStreamTrack]);
    const el = audioRef.current;

    let audioCtx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let gainNode: GainNode | null = null;
    let destAudioEl: HTMLAudioElement | null = null;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioCtx();
      source = audioCtx.createMediaStreamSource(stream);
      gainNode = audioCtx.createGain();
      gainNode.gain.value = deafened ? 0 : volume;

      // Keep hidden muted <audio> bound so Chromium keeps decoding WebRTC frames
      if (el) {
        el.srcObject = stream;
        el.muted = true;
        void el.play().catch(() => {});
      }

      // If custom output device is supported and chosen, route through MediaStreamDestination
      const supportsSinkId =
        typeof HTMLMediaElement !== "undefined" &&
        "setSinkId" in HTMLMediaElement.prototype;

      if (outputDeviceId && supportsSinkId) {
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(gainNode);
        gainNode.connect(dest);

        destAudioEl = document.createElement("audio");
        destAudioEl.srcObject = dest.stream;
        destAudioEl.autoplay = true;
        const setSink = (destAudioEl as HTMLAudioElement & {
          setSinkId?: (id: string) => Promise<void>;
        }).setSinkId;
        if (setSink) {
          void setSink.call(destAudioEl, outputDeviceId).catch(() => {});
        }
        void destAudioEl.play().catch(() => {});
      } else {
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
      }

      if (audioCtx.state === "suspended") {
        void audioCtx.resume().catch(() => {});
      }

      ctxRef.current = audioCtx;
      gainRef.current = gainNode;
    } catch {
      // Fallback to native <audio> element (0..100%)
      if (el) {
        el.srcObject = stream;
        el.muted = deafened;
        el.volume = Math.min(1, Math.max(0, volume));
        void el.play().catch(() => {});
      }
    }

    return () => {
      try {
        source?.disconnect();
        gainNode?.disconnect();
        if (destAudioEl) {
          destAudioEl.pause();
          destAudioEl.srcObject = null;
        }
        if (audioCtx && audioCtx.state !== "closed") {
          void audioCtx.close();
        }
      } catch {
        // ignore cleanup errors
      }
      ctxRef.current = null;
      gainRef.current = null;
    };
  }, [track, outputDeviceId]);

  // Smoothly update volume / deafen state without tearing down the audio graph
  useEffect(() => {
    const targetGain = deafened ? 0 : Math.max(0, Math.min(3, volume));
    if (gainRef.current && ctxRef.current) {
      gainRef.current.gain.setTargetAtTime(targetGain, ctxRef.current.currentTime, 0.02);
      if (ctxRef.current.state === "suspended") {
        void ctxRef.current.resume().catch(() => {});
      }
    } else if (audioRef.current) {
      audioRef.current.muted = deafened;
      audioRef.current.volume = Math.min(1, targetGain);
    }
  }, [volume, deafened]);

  return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
}
