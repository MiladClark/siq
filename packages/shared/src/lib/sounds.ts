"use client";

export type SoundEffectName =
  | "join"
  | "leave"
  | "peer-join"
  | "peer-leave"
  | "mute"
  | "unmute"
  | "deafen"
  | "undeafen"
  | "stream-start"
  | "stream-stop"
  | "notification"
  | "copy";

const SOUND_PATHS: Record<SoundEffectName, string> = {
  join: "/sounds/join.mp3",
  leave: "/sounds/leave.mp3",
  "peer-join": "/sounds/peer-join.mp3",
  "peer-leave": "/sounds/peer-leave.mp3",
  mute: "/sounds/mute.mp3",
  unmute: "/sounds/unmute.mp3",
  deafen: "/sounds/deafen.mp3",
  undeafen: "/sounds/undeafen.mp3",
  "stream-start": "/sounds/stream-start.mp3",
  "stream-stop": "/sounds/stream-stop.mp3",
  notification: "/sounds/notification.mp3",
  copy: "/sounds/copy.mp3",
};

const STORAGE_KEY = "siq_ui_sounds_v1";

interface SoundPrefs {
  enabled: boolean;
  volume: number; // 0..1
}

const DEFAULT_PREFS: SoundPrefs = {
  enabled: true,
  volume: 0.45,
};

const audioPool = new Map<SoundEffectName, HTMLAudioElement>();

export function getSoundPrefs(): SoundPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
    return {
      enabled: parsed.enabled ?? true,
      volume:
        typeof parsed.volume === "number"
          ? Math.max(0, Math.min(1, parsed.volume))
          : DEFAULT_PREFS.volume,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setSoundPrefs(next: Partial<SoundPrefs>): SoundPrefs {
  const merged = { ...getSoundPrefs(), ...next };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // ignore storage quota errors
    }
  }
  return merged;
}

/** Gentle Web Audio sine fallback if MP3 playback fails or isn't cached yet */
function playSoftSynthFallback(name: SoundEffectName, volume: number) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";

    const freqMap: Record<SoundEffectName, [number, number]> = {
      join: [440, 587],
      leave: [440, 330],
      "peer-join": [523, 659],
      "peer-leave": [523, 392],
      mute: [360, 280],
      unmute: [320, 440],
      deafen: [300, 220],
      undeafen: [280, 420],
      "stream-start": [494, 740],
      "stream-stop": [523, 349],
      notification: [587, 784],
      copy: [620, 620],
    };

    const [f1, f2] = freqMap[name];
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(f1, now);
    osc.frequency.exponentialRampToValueAtTime(f2, now + 0.09);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.01, volume * 0.25), now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
    setTimeout(() => void ctx.close().catch(() => {}), 260);
  } catch {
    // ignore if autoplay locked
  }
}

export function playSound(name: SoundEffectName): void {
  if (typeof window === "undefined") return;
  const prefs = getSoundPrefs();
  if (!prefs.enabled || prefs.volume <= 0) return;

  try {
    let base = audioPool.get(name);
    if (!base) {
      base = new Audio(SOUND_PATHS[name]);
      base.preload = "auto";
      audioPool.set(name, base);
    }

    const instance = base.cloneNode(true) as HTMLAudioElement;
    instance.volume = prefs.volume;
    void instance.play().catch(() => {
      playSoftSynthFallback(name, prefs.volume);
    });
  } catch {
    playSoftSynthFallback(name, prefs.volume);
  }
}

/* ============================================================================
 * Incoming Direct Call Ringtone & Call Declined Tone (Clean Web Audio Synth)
 * ============================================================================ */

let ringtoneTimer: ReturnType<typeof setInterval> | null = null;
let ringtoneCtx: AudioContext | null = null;

function playRingtonePulse() {
  if (typeof window === "undefined") return;
  const prefs = getSoundPrefs();
  if (!prefs.enabled || prefs.volume <= 0) return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!ringtoneCtx || ringtoneCtx.state === "closed") {
      ringtoneCtx = new AudioCtx();
    }
    if (ringtoneCtx.state === "suspended") {
      void ringtoneCtx.resume().catch(() => {});
    }

    const ctx = ringtoneCtx;
    const now = ctx.currentTime;
    const peak = Math.max(0.02, Math.min(0.28, prefs.volume * 0.34));

    // Warm 3-note rising studio bell motif (D5 -> F#5 -> A5, soft double cadence)
    const notes: Array<{ freq: number; start: number; dur: number }> = [
      { freq: 587.33, start: 0.0, dur: 0.18 },
      { freq: 739.99, start: 0.14, dur: 0.18 },
      { freq: 880.0, start: 0.28, dur: 0.34 },
      { freq: 739.99, start: 0.68, dur: 0.16 },
      { freq: 880.0, start: 0.82, dur: 0.36 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const gain = ctx.createGain();
      const overtoneGain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      overtone.type = "triangle";
      overtone.frequency.setValueAtTime(note.freq * 2, now + note.start);
      overtoneGain.gain.setValueAtTime(0.12, now + note.start);

      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(peak, now + note.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.dur);

      osc.connect(gain);
      overtone.connect(overtoneGain);
      overtoneGain.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.start);
      osc.stop(now + note.start + note.dur + 0.02);
      overtone.start(now + note.start);
      overtone.stop(now + note.start + note.dur + 0.02);
    }
  } catch {
    // ignore autoplay restriction
  }
}

export function startIncomingRingtone(): void {
  if (typeof window === "undefined") return;
  if (ringtoneTimer !== null) return; // already ringing
  playRingtonePulse();
  ringtoneTimer = setInterval(playRingtonePulse, 2600);
}

export function stopIncomingRingtone(): void {
  if (ringtoneTimer !== null) {
    clearInterval(ringtoneTimer);
    ringtoneTimer = null;
  }
  if (ringtoneCtx && ringtoneCtx.state !== "closed") {
    const ctxToClose = ringtoneCtx;
    ringtoneCtx = null;
    void ctxToClose.close().catch(() => {});
  }
}

/** Soft descending 2-tone chime played when a direct call is declined */
export function playCallDeclinedSound(): void {
  if (typeof window === "undefined") return;
  const prefs = getSoundPrefs();
  if (!prefs.enabled || prefs.volume <= 0) return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const peak = Math.max(0.02, Math.min(0.24, prefs.volume * 0.3));

    const tones: Array<{ freq: number; start: number; dur: number }> = [
      { freq: 440, start: 0, dur: 0.16 },
      { freq: 311.13, start: 0.16, dur: 0.28 },
    ];

    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(tone.freq, now + tone.start);
      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(peak, now + tone.start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + tone.start);
      osc.stop(now + tone.start + tone.dur + 0.02);
    }

    setTimeout(() => void ctx.close().catch(() => {}), 600);
  } catch {
    // ignore
  }
}
