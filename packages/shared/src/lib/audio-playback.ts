"use client";

/**
 * One shared, low-latency AudioContext for all remote voice playback and speaking meters.
 *
 * Creating an AudioContext per participant (the previous approach) multiplies output
 * streams, CPU wake-ups and hardware buffers, and forces an extra <audio> hop per player
 * when a custom output device is chosen. A single context with AudioContext.setSinkId()
 * keeps every voice on the same clock with the smallest possible output buffer.
 */

type SinkableContext = AudioContext & { setSinkId?: (id: string | { type: "none" }) => Promise<void> };

let sharedContext: SinkableContext | null = null;
let currentSinkId = "";
let pendingSink: Promise<void> | null = null;
let resumeListenerAttached = false;

function attachResumeOnGesture(ctx: AudioContext): void {
  if (resumeListenerAttached || typeof window === "undefined") return;
  resumeListenerAttached = true;
  const resume = () => {
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    if (ctx.state === "running") {
      window.removeEventListener("pointerdown", resume, true);
      window.removeEventListener("keydown", resume, true);
      resumeListenerAttached = false;
    }
  };
  window.addEventListener("pointerdown", resume, true);
  window.addEventListener("keydown", resume, true);
}

export function getPlaybackContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedContext && sharedContext.state !== "closed") return sharedContext;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedContext = new Ctx({ latencyHint: "interactive" }) as SinkableContext;
    currentSinkId = "";
    if (sharedContext.state === "suspended") {
      void sharedContext.resume().catch(() => {});
      attachResumeOnGesture(sharedContext);
    }
    return sharedContext;
  } catch {
    sharedContext = null;
    return null;
  }
}

/** True when the shared context can route straight to a chosen output device. */
export function playbackContextSupportsSinkId(): boolean {
  const ctx = getPlaybackContext() as SinkableContext | null;
  return Boolean(ctx && typeof ctx.setSinkId === "function");
}

/** Routes all voice playback to `deviceId` ("" = system default). */
export async function setPlaybackOutputDevice(deviceId: string): Promise<boolean> {
  const ctx = getPlaybackContext() as SinkableContext | null;
  if (!ctx || typeof ctx.setSinkId !== "function") return false;
  if (currentSinkId === deviceId) return true;
  const run = async () => {
    try {
      await ctx.setSinkId!(deviceId || "");
      currentSinkId = deviceId;
    } catch {
      // device vanished or permission denied — keep the current route
    }
  };
  pendingSink = (pendingSink ?? Promise.resolve()).then(run);
  await pendingSink;
  return currentSinkId === deviceId;
}

export function ensurePlaybackRunning(): void {
  const ctx = getPlaybackContext();
  if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
}
