"use client";

/**
 * SIQ Voice Engine v3 — real-time audio worklet.
 *
 * One AudioWorkletProcessor (`siq-engine-v3`) runs the whole voice chain on the
 * audio render thread with deterministic, allocation-free per-quantum work:
 *
 *   mic ─► Pre (smoothed input gain + Butterworth HPF)
 *        ─► Noise stage
 *             • SIQ Spectral: 512-pt STFT (75 % overlap, 8 ms) MCRA noise tracking +
 *               decision-directed Wiener gain. Always running, so it is the instant
 *               fallback while the neural model loads or when the CPU is busy.
 *             • SIQ Neural (DeepFilterNet3, 48 kHz full-band): the heavy inference runs
 *               in a dedicated Web Worker, never on the render thread. Frames travel
 *               over a MessagePort and come back into an adaptive jitter buffer that
 *               keeps latency bounded (it trims excess delay and never accumulates lag).
 *        ─► Post (look-ahead voice expander, tone EQ, de-esser, compressor, soft limiter,
 *               glitch-free A/B bypass, 20 Hz telemetry)
 *
 * Roles: "full" (everything above), "pre" + "post" (used around an external neural
 * AudioWorkletNode such as GTCRN).
 */

export const SIQ_ENGINE_PROCESSOR_ID = "siq-engine-v3";
/** DeepFilterNet3 hop size at 48 kHz (10 ms). */
export const SIQ_NEURAL_HOP = 480;
/** DeepFilterNet3 algorithmic delay: (fft 960 − hop 480) + 2 look-ahead hops. */
export const SIQ_NEURAL_ALGO_DELAY = 1440;

export type SiqAiEngine = "ultra" | "fast" | "pure";
export type SiqPresetId = "light" | "balanced" | "studio" | "aggressive";
export type SiqHighPassHz = 0 | 80 | 120;
export type SiqVoiceTone = "natural" | "clarity" | "warm" | "crisp";
export type SiqEngineRole = "full" | "pre" | "post";
export type SiqNeuralState = "off" | "loading" | "priming" | "active" | "degraded";

export interface SiqDspConfig {
  /** SIQ engine tier: ultra (DeepFilterNet3 neural), fast (GTCRN neural), pure (SIQ Spectral DSP) */
  aiEngine: SiqAiEngine;
  /** Linear input gain percentage: 0 to 250 (100 = 0 dB unity) */
  inputGainPct: number;
  /** Noise suppression strength: 0 to 100 */
  suppressionStrength: number;
  /** True = automatically track room floor; False = use manual gateThresholdDb */
  autoGate: boolean;
  /** Manual voice gate open threshold in dBFS (-65 to -15) */
  gateThresholdDb: number;
  /** High-pass rumble filter cutoff in Hz (0 = DC block only, 80, 120) */
  highPassHz: SiqHighPassHz;
  /** Studio vocal EQ contour */
  voiceTone: SiqVoiceTone;
  /** Gentle 5.5–8.5 kHz dynamic sibilance tamer */
  deEsser: boolean;
  /** Soft-knee vocal compressor + soft safety limiter */
  compressor: boolean;
}

export interface SiqPresetSpec {
  id: SiqPresetId;
  label: string;
  desc: string;
  patch: Partial<SiqDspConfig>;
}

export const SIQ_DSP_PRESETS: SiqPresetSpec[] = [
  {
    id: "light",
    label: "Light",
    desc: "Quiet rooms & condenser mics",
    patch: {
      suppressionStrength: 45,
      autoGate: true,
      gateThresholdDb: -54,
      highPassHz: 80,
      voiceTone: "natural",
      deEsser: true,
      compressor: true,
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    desc: "Everyday calls & gaming",
    patch: {
      suppressionStrength: 78,
      autoGate: true,
      gateThresholdDb: -48,
      highPassHz: 80,
      voiceTone: "clarity",
      deEsser: true,
      compressor: true,
    },
  },
  {
    id: "studio",
    label: "Studio",
    desc: "Rich broadcast presence",
    patch: {
      suppressionStrength: 82,
      autoGate: true,
      gateThresholdDb: -46,
      highPassHz: 80,
      voiceTone: "warm",
      deEsser: true,
      compressor: true,
    },
  },
  {
    id: "aggressive",
    label: "Aggressive",
    desc: "Loud fans, AC & keyboards",
    patch: {
      suppressionStrength: 96,
      autoGate: true,
      gateThresholdDb: -40,
      highPassHz: 120,
      voiceTone: "crisp",
      deEsser: true,
      compressor: true,
    },
  },
];

export const DEFAULT_SIQ_DSP_CONFIG: SiqDspConfig = {
  aiEngine: "ultra",
  inputGainPct: 100,
  suppressionStrength: 78,
  autoGate: true,
  gateThresholdDb: -48,
  highPassHz: 80,
  voiceTone: "clarity",
  deEsser: true,
  compressor: true,
};

/**
 * Maps Suppression Strength (0–100 %) to the DeepFilterNet3 attenuation limit (dB).
 * A bounded limit keeps speech natural; 98 %+ means unlimited (100 dB).
 *   45 % → 20 dB · 78 % → 37 dB · 96 % → 48 dB
 */
export function suppressionPctToAttenLimDb(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  if (clamped <= 0) return 0;
  if (clamped >= 98) return 100;
  return Math.round(4 + 46 * Math.pow(clamped / 100, 1.3));
}

export interface SiqAudioTelemetry {
  /** Pre-processing (raw mic after gain/HPF) level */
  inputDb: number;
  /** Final transmitted level */
  outputDb: number;
  /** Room noise floor measured on the raw mic */
  noiseFloorDb: number;
  effectiveThresholdDb: number;
  gateOpen: boolean;
  gainReductionDb: number;
  /** Attenuation achieved by the noise stage (dB) */
  aiNoiseReductionDb?: number;
  /** True while A/B raw bypass preview is active */
  bypassed?: boolean;
  /** Which noise stage is currently audible */
  engine?: "neural" | "spectral" | "external" | "off";
  neuralState?: SiqNeuralState;
  /** Approximate added processing latency of the voice chain (ms) */
  latencyMs?: number;
  /** Neural inference time as % of real time (100 % = overloaded) */
  neuralLoadPct?: number;
  /** Neural jitter-buffer underruns since start */
  underruns?: number;
}

export const SIQ_WORKLET_SOURCE = /* js */ `
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function linToDb(v) { return 20 * Math.log10(v > 1e-9 ? v : 1e-9); }
function dbToLin(db) { return Math.pow(10, db / 20); }
function coef(sr, sec) { return 1 - Math.exp(-1 / (sr * sec)); }
/** RBJ biquad, Direct Form II Transposed. */
class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; this.bypass = true; }
  setBypass() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.bypass = true; }
  set(b0, b1, b2, a0, a1, a2) {
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0; this.bypass = false;
  }
  setHighPass(sr, freq, q) {
    const w0 = (2 * Math.PI * clamp(freq, 10, sr * 0.45)) / sr;
    const c = Math.cos(w0), alpha = Math.sin(w0) / (2 * q);
    this.set((1 + c) * 0.5, -(1 + c), (1 + c) * 0.5, 1 + alpha, -2 * c, 1 - alpha);
  }
  setBandPass(sr, freq, q) {
    const w0 = (2 * Math.PI * clamp(freq, 40, sr * 0.45)) / sr;
    const c = Math.cos(w0), alpha = Math.sin(w0) / (2 * q);
    this.set(alpha, 0, -alpha, 1 + alpha, -2 * c, 1 - alpha);
  }
  setPeaking(sr, freq, q, gainDb) {
    if (Math.abs(gainDb) < 0.05) { this.setBypass(); return; }
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * clamp(freq, 20, sr * 0.45)) / sr;
    const c = Math.cos(w0), alpha = Math.sin(w0) / (2 * q);
    this.set(1 + alpha * A, -2 * c, 1 - alpha * A, 1 + alpha / A, -2 * c, 1 - alpha / A);
  }
  setHighShelf(sr, freq, slope, gainDb) {
    if (Math.abs(gainDb) < 0.05) { this.setBypass(); return; }
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * clamp(freq, 100, sr * 0.45)) / sr;
    const c = Math.cos(w0), s = Math.sin(w0);
    const alpha = (s / 2) * Math.sqrt((A + 1 / A) * (1 / slope - 1) + 2);
    const k = 2 * Math.sqrt(A) * alpha;
    this.set(
      A * ((A + 1) + (A - 1) * c + k), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - k),
      (A + 1) - (A - 1) * c + k, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - k
    );
  }
  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** Iterative radix-2 complex FFT (in place). */
class Fft {
  constructor(n) {
    this.n = n;
    const half = n >> 1;
    this.cos = new Float64Array(half);
    this.sin = new Float64Array(half);
    for (let i = 0; i < half; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((2 * Math.PI * i) / n);
    }
    this.rev = new Uint32Array(n);
    const bits = Math.round(Math.log2(n));
    for (let i = 0; i < n; i++) {
      let r = 0, x = i;
      for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      this.rev[i] = r;
    }
  }
  transform(re, im, inverse) {
    const n = this.n, rev = this.rev, cos = this.cos, sin = this.sin;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    const sgn = inverse ? 1 : -1;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = start + j, b = a + half;
          const wr = cos[k], wi = sgn * sin[k];
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }
}

/** Real-input FFT of size N via one N/2 complex FFT (half the cost of a full complex FFT). */
class RealFft {
  constructor(n) {
    const m = n >> 1;
    this.n = n; this.m = m;
    this.fft = new Fft(m);
    this.zr = new Float64Array(m);
    this.zi = new Float64Array(m);
    this.wr = new Float64Array(m + 1);
    this.wi = new Float64Array(m + 1);
    for (let k = 0; k <= m; k++) {
      this.wr[k] = Math.cos((2 * Math.PI * k) / n);
      this.wi[k] = -Math.sin((2 * Math.PI * k) / n);
    }
  }
  /** x: N real samples → re/im: bins 0..N/2 (unnormalized DFT) */
  forward(x, re, im) {
    const m = this.m, zr = this.zr, zi = this.zi, wr = this.wr, wi = this.wi;
    for (let i = 0; i < m; i++) { zr[i] = x[2 * i]; zi[i] = x[2 * i + 1]; }
    this.fft.transform(zr, zi, false);
    for (let k = 0; k <= m; k++) {
      const k1 = k === m ? 0 : k;
      const k2 = k === 0 || k === m ? 0 : m - k;
      const ar = zr[k1], ai = zi[k1], br = zr[k2], bi = -zi[k2];
      const fer = 0.5 * (ar + br), fei = 0.5 * (ai + bi);
      const fr = 0.5 * (ai - bi), fi = -0.5 * (ar - br);
      re[k] = fer + wr[k] * fr - wi[k] * fi;
      im[k] = fei + wr[k] * fi + wi[k] * fr;
    }
  }
  /** re/im: bins 0..N/2 → x: N real samples (normalized inverse) */
  inverse(re, im, x) {
    const m = this.m, zr = this.zr, zi = this.zi, wr = this.wr, wi = this.wi;
    for (let k = 0; k < m; k++) {
      const ar = re[k], ai = im[k], br = re[m - k], bi = -im[m - k];
      const fer = 0.5 * (ar + br), fei = 0.5 * (ai + bi);
      const dr = 0.5 * (ar - br), di = 0.5 * (ai - bi);
      const cr = wr[k], ci = -wi[k];
      const fr = dr * cr - di * ci, fi = dr * ci + di * cr;
      zr[k] = fer - fi;
      zi[k] = fei + fr;
    }
    this.fft.transform(zr, zi, true);
    const inv = 1 / m;
    for (let i = 0; i < m; i++) { x[2 * i] = zr[i] * inv; x[2 * i + 1] = zi[i] * inv; }
  }
}

/**
 * SIQ Spectral denoiser: 512-point STFT, hop 128 (75 % overlap, sqrt-Hann WOLA),
 * MCRA noise tracking (Doblinger minimum + speech-presence controlled averaging),
 * decision-directed a-priori SNR, parametric Wiener gain with frequency smoothing.
 * Latency: N − H = 384 samples (8 ms at 48 kHz).
 */
class SpectralDenoiser {
  constructor(sr) {
    const N = 512, H = 128, B = N / 2 + 1;
    this.N = N; this.H = H; this.B = B; this.sr = sr;
    this.fft = new RealFft(N);
    this.win = new Float64Array(N);
    for (let i = 0; i < N; i++) this.win[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    this.frame = new Float64Array(N);
    this.td = new Float64Array(N);
    this.ola = new Float64Array(N);
    this.re = new Float64Array(B);
    this.im = new Float64Array(B);
    this.S = new Float64Array(B);
    this.Smin = new Float64Array(B);
    this.Stmp = new Float64Array(B);
    this.noise = new Float64Array(B);
    this.p = new Float64Array(B);
    this.G = new Float64Array(B).fill(1);
    this.Gs = new Float64Array(B).fill(1);
    this.post = new Float64Array(B).fill(1);
    // a-priori speech absence probability q = 0.3 → q / (1 − q)
    this.qRatio = 0.3 / 0.7;
    this.frames = 0;
    const hop = H / sr;
    this.aS = Math.exp(-hop / 0.025);
    this.aD = Math.exp(-hop / 0.25);
    this.aP = Math.exp(-hop / 0.015);
    this.aGuard = Math.exp(-hop / 1.5);
    // MCRA minimum window: ~0.8 s (held up to 2 windows)
    this.minWindow = Math.max(32, Math.round(0.8 / hop));
    this.aDD = 0.975;
    this.binHz = sr / N;
    this.vLo = Math.max(2, Math.round(240 / this.binHz));
    this.vHi = Math.min(B - 2, Math.round(3800 / this.binHz));
    this.vad = 0;
    this.vadCoefUp = 1 - Math.exp(-hop / 0.008);
    this.vadCoefDown = 1 - Math.exp(-hop / 0.08);
    this.setStrength(0.78);
  }
  setStrength(s) {
    this.strength = s;
    this.gMin = dbToLin(-(6 + 24 * s));
  }
  /** input/output: exactly H samples */
  process(input, output) {
    const N = this.N, H = this.H, B = this.B;
    const frame = this.frame, win = this.win, re = this.re, im = this.im, td = this.td;
    frame.copyWithin(0, H);
    for (let i = 0; i < H; i++) frame[N - H + i] = input[i];
    for (let i = 0; i < N; i++) td[i] = frame[i] * win[i];
    this.fft.forward(td, re, im);

    const S = this.S, Smin = this.Smin, Stmp = this.Stmp, noise = this.noise, p = this.p;
    const resetMin = this.frames > 0 && this.frames % this.minWindow === 0;
    const G = this.G, Gs = this.Gs, post = this.post;
    this.frames++;
    const warm = this.frames < 48;
    const warmA = warm ? 1 - 1 / this.frames : 0;
    const gMin = this.gMin, qRatio = this.qRatio, aDD = this.aDD;
    let presence = 0;

    for (let k = 0; k < B; k++) {
      const P = re[k] * re[k] + im[k] * im[k] + 1e-14;
      // MCRA noise tracking: windowed minimum of the smoothed periodogram decides speech
      // presence, and the noise PSD is averaged only where speech is absent (unbiased).
      const Sk = this.aS * S[k] + (1 - this.aS) * P;
      S[k] = Sk;
      if (this.frames === 1) { Smin[k] = Sk; Stmp[k] = Sk; noise[k] = P; }
      else if (resetMin) { Smin[k] = Stmp[k] < Sk ? Stmp[k] : Sk; Stmp[k] = Sk; }
      else {
        if (Sk < Smin[k]) Smin[k] = Sk;
        if (Sk < Stmp[k]) Stmp[k] = Sk;
      }
      const ind = Sk > 5 * Smin[k] ? 1 : 0;
      p[k] = this.aP * p[k] + (1 - this.aP) * ind;
      let ad = this.aD + (1 - this.aD) * p[k];
      // Onset guard: a bin far above the noise estimate barely updates it (speech onsets
      // never leak into the noise PSD), yet slowly rising noise is still learned.
      if (P > 9 * noise[k] && ad < this.aGuard) ad = this.aGuard;
      if (warm && warmA < ad) ad = warmA;
      noise[k] = ad * noise[k] + (1 - ad) * P;

      // Decision-directed a-priori SNR + Wiener gain under speech-presence uncertainty
      const gammaK = P / (noise[k] + 1e-14);
      let xi = aDD * G[k] * G[k] * post[k] + (1 - aDD) * (gammaK > 1 ? gammaK - 1 : 0);
      if (xi < 0.003) xi = 0.003;
      post[k] = gammaK > 1000 ? 1000 : gammaK;
      const gw = xi / (1 + xi);
      G[k] = gw;
      const v = gw * gammaK;
      const pSp = v > 50 ? 1 : 1 / (1 + qRatio * (1 + xi) * Math.exp(-v));
      const g = pSp * gw + (1 - pSp) * gMin;
      Gs[k] = g > gMin ? g : gMin;
      if (k >= this.vLo && k <= this.vHi) presence += p[k];
    }

    for (let k = 0; k < B; k++) { re[k] *= Gs[k]; im[k] *= Gs[k]; }
    this.fft.inverse(re, im, td);

    // sqrt-Hann analysis × synthesis = Hann; Hann at 75 % overlap sums to 2
    const ola = this.ola;
    for (let i = 0; i < N; i++) ola[i] += td[i] * win[i] * 0.5;
    for (let i = 0; i < H; i++) output[i] = ola[i];
    ola.copyWithin(0, H);
    for (let i = N - H; i < N; i++) ola[i] = 0;

    // Voice activity: share of voice-band bins where MCRA detects speech (low in steady noise)
    const meanPresence = presence / (this.vHi - this.vLo + 1);
    const target = clamp((meanPresence - 0.12) * 3.5, 0, 1);
    this.vad += (target - this.vad) * (target > this.vad ? this.vadCoefUp : this.vadCoefDown);
  }
}

/** Tone EQ + dynamic de-esser + soft-knee compressor with smart makeup + soft limiter. */
class StudioMasteringChain {
  constructor(sr) {
    this.sr = sr;
    this.voiceTone = "clarity";
    this.deEsserEnabled = true;
    this.compressorEnabled = true;
    this.eqLow = new Biquad(); this.eqMid = new Biquad(); this.eqHigh = new Biquad();
    this.sib = new Biquad(); this.sib.setBandPass(sr, 6800, 1.35);
    this.sibEnv = 1e-4; this.bodyEnv = 1e-4; this.deEssGain = 1;
    this.compEnv = 1e-4; this.compGain = 1; this.makeup = 1;
    this.sibAttack = coef(sr, 0.002); this.sibRelease = coef(sr, 0.035);
    this.envAttack = coef(sr, 0.006); this.envRelease = coef(sr, 0.11);
    this.gainAttack = coef(sr, 0.008); this.gainRelease = coef(sr, 0.095);
    this.makeupSmooth = coef(sr, 0.25);
    this.configureToneEq();
  }
  applyConfig(cfg) {
    if (typeof cfg.voiceTone === "string" && cfg.voiceTone !== this.voiceTone) {
      this.voiceTone = cfg.voiceTone;
      this.configureToneEq();
    }
    if (typeof cfg.deEsser === "boolean") this.deEsserEnabled = cfg.deEsser;
    if (typeof cfg.compressor === "boolean") this.compressorEnabled = cfg.compressor;
  }
  configureToneEq() {
    const sr = this.sr;
    switch (this.voiceTone) {
      case "clarity":
        this.eqLow.setPeaking(sr, 280, 1.1, -2.0);
        this.eqMid.setPeaking(sr, 3200, 1.0, 2.5);
        this.eqHigh.setHighShelf(sr, 9500, 0.7, -1.0);
        break;
      case "warm":
        this.eqLow.setPeaking(sr, 165, 0.9, 2.4);
        this.eqMid.setPeaking(sr, 420, 1.2, -1.5);
        this.eqHigh.setPeaking(sr, 3500, 1.0, 1.7);
        break;
      case "crisp":
        this.eqLow.setPeaking(sr, 250, 1.0, -3.2);
        this.eqMid.setPeaking(sr, 2900, 1.1, 3.2);
        this.eqHigh.setHighShelf(sr, 8000, 0.7, -2.2);
        break;
      default:
        this.eqLow.setBypass(); this.eqMid.setBypass(); this.eqHigh.setBypass();
    }
  }
  processSample(x, speechActive) {
    let y = x;
    if (!this.eqLow.bypass) y = this.eqLow.process(y);
    if (!this.eqMid.bypass) y = this.eqMid.process(y);
    if (!this.eqHigh.bypass) y = this.eqHigh.process(y);

    if (this.deEsserEnabled) {
      const s = this.sib.process(y);
      const as = Math.abs(s), ab = Math.abs(y);
      this.sibEnv += (as - this.sibEnv) * (as > this.sibEnv ? this.sibAttack : this.sibRelease);
      this.bodyEnv += (ab - this.bodyEnv) * (ab > this.bodyEnv ? this.sibAttack : this.sibRelease);
      let target = 1;
      const ref = this.bodyEnv * 0.34;
      if (this.sibEnv > 0.016 && this.sibEnv > ref) {
        const excess = clamp(linToDb(this.sibEnv / (ref + 1e-9)), 0, 14);
        target = dbToLin(-Math.min(7, excess * 0.55));
      }
      this.deEssGain += (target - this.deEssGain) * (target < this.deEssGain ? this.sibAttack : this.sibRelease);
      y -= s * (1 - this.deEssGain);
    }

    if (this.compressorEnabled) {
      const a = Math.abs(y);
      this.compEnv += (a - this.compEnv) * (a > this.compEnv ? this.envAttack : this.envRelease);
      const envDb = linToDb(this.compEnv);
      const T = -18, K = 6, R = 3;
      let red = 0;
      if (envDb > T - K / 2) {
        if (envDb < T + K / 2) {
          const d = envDb - (T - K / 2);
          red = ((1 - 1 / R) * d * d) / (2 * K);
        } else {
          red = (envDb - T) * (1 - 1 / R);
        }
      }
      const tg = red > 0.01 ? dbToLin(-red) : 1;
      this.compGain += (tg - this.compGain) * (tg < this.compGain ? this.gainAttack : this.gainRelease);
      const mk = speechActive ? dbToLin(clamp(1.5 + red * 0.35, 0, 4.5)) : 1;
      this.makeup += (mk - this.makeup) * this.makeupSmooth;
      y *= this.compGain * this.makeup;
    }

    // Soft limiter: transparent below -1.4 dBFS, smooth ceiling at ~0.98
    const ay = Math.abs(y);
    if (ay > 0.85) {
      const lim = 0.85 + 0.13 * Math.tanh((ay - 0.85) / 0.13);
      y = y < 0 ? -lim : lim;
    }
    return y;
  }
}

const RING = 16384;
const RING_MASK = RING - 1;
const XFADE = 64;
const PRIME = 1;
const PLAY = 2;

class SiqEngineProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    const role = opts.role === "pre" || opts.role === "post" ? opts.role : "full";
    const sr = sampleRate;
    this.role = role;
    this.sr = sr;
    this.alive = true;

    // Pre stage
    this.gainTarget = 1; this.gain = 1;
    this.gainCoef = coef(sr, 0.015);
    this.hpf = new Biquad();
    this.hpfHz = -1;

    // Noise stage
    this.supp = 0.78;
    this.spec = role === "full" ? new SpectralDenoiser(sr) : null;
    this.specLatency = this.spec ? this.spec.N - this.spec.H : 0;
    this.gIn = role === "full" ? new Float32Array(this.spec.H) : null;
    this.gOut = role === "full" ? new Float32Array(this.spec.H) : null;
    this.gIdx = 0;

    // Neural bridge (DeepFilterNet3 in a Worker)
    this.nHop = opts.hop || 480;
    this.nPort = null;
    this.nPool = [];
    this.nAcc = null; this.nAccIdx = 0; this.nSeq = 0;
    this.nRing = new Float32Array(RING); this.nR = 0; this.nW = 0;
    this.nState = 0;
    this.nMix = 0;
    this.nMixStep = 1 / (sr * 0.012);
    this.nTargetMin = this.nHop + 256;
    this.nTarget = this.nTargetMin + 128;
    this.nUnderruns = 0;
    this.nLoad = 0; this.nHighLoadStreak = 0;
    this.nDegraded = false;
    this.nAnnouncedActive = false;
    this.nMinFill = RING; this.nWinBlocks = 0; this.nCleanWindows = 0;
    this.nDrop = 0;
    this.nFillAvg = 0;
    this.nRecentUnderruns = 0; this.nUnderrunWindowBlocks = 0;

    // Post stage: look-ahead voice expander
    const neuralPath = Boolean(opts.neural) || role === "post";
    this.laLen = role === "pre" ? 0 : Math.max(1, Math.round(sr * (neuralPath ? 0.003 : 0.002)));
    this.laBuf = new Float32Array(Math.max(1, this.laLen));
    this.laPos = 0;
    this.autoGate = true; this.gateThresholdDb = -48;
    this.env = 1e-10;
    // Mean-square envelope averaged over a few ms so it tracks RMS (not noise peaks) and
    // compares like-for-like with the RMS floor; look-ahead hides the short attack.
    this.envAtk = coef(sr, 0.004); this.envRel = coef(sr, 0.015);
    this.gateOpen = false; this.gateGain = 0.05; this.gateHold = 0;
    this.gateHoldLen = Math.round(sr * 0.2);
    this.gateOpenCoef = coef(sr, neuralPath ? 0.0015 : 0.001);
    this.gateCloseCoef = coef(sr, 0.1);
    this.cleanFloor = 3e-4; this.dryFloor = 2e-3;
    this.wetPow = 1e-7; this.dryPow = 4e-6;
    const blockSec = 128 / sr;
    this.powSmooth = 1 - Math.exp(-blockSec / 0.06);
    this.floorDown = 1 - Math.exp(-blockSec / 0.15);
    this.floorUp = 1 - Math.exp(-blockSec / 2.5);
    this.master = new StudioMasteringChain(sr);
    this.bypassed = false; this.bypassMix = 0; this.bypassCoef = coef(sr, 0.006);

    // Telemetry
    this.mCount = 0; this.mInterval = Math.max(1, Math.round(sr / (128 * 20)));
    this.mDry = 0; this.mWet = 0; this.mOut = 0; this.mN = 0; this.mMinGate = 1;
    this.engineLabel = role === "post" ? "external" : "spectral";

    this.sPre = new Float32Array(128); this.sWet = new Float32Array(128);
    this.sSpec = new Float32Array(128); this.sZero = new Float32Array(128);

    this.applyConfig(opts.config || {});
    this.gain = this.gainTarget;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  ensureScratch(len) {
    if (this.sPre.length !== len) {
      this.sPre = new Float32Array(len); this.sWet = new Float32Array(len);
      this.sSpec = new Float32Array(len); this.sZero = new Float32Array(len);
    }
  }

  onMessage(msg) {
    if (!msg) return;
    if (msg === "destroy" || msg.type === "destroy") { this.alive = false; this.detachNeural(); return; }
    if (msg.type === "config" && msg.config) this.applyConfig(msg.config);
    else if (msg.type === "bypass") this.bypassed = Boolean(msg.value);
    else if (msg.type === "neural-attach" && msg.port) this.attachNeural(msg.port);
    else if (msg.type === "neural-detach") this.detachNeural();
  }

  applyConfig(cfg) {
    if (typeof cfg.inputGainPct === "number") this.gainTarget = clamp(cfg.inputGainPct, 0, 250) / 100;
    if (typeof cfg.highPassHz === "number" || this.hpfHz < 0) {
      const hz = cfg.highPassHz === 120 ? 120 : cfg.highPassHz === 0 ? 0 : 80;
      if (hz !== this.hpfHz) { this.hpfHz = hz; this.hpf.setHighPass(this.sr, hz > 0 ? hz : 18, 0.70710678); }
    }
    if (typeof cfg.suppressionStrength === "number") {
      this.supp = clamp(cfg.suppressionStrength, 0, 100) / 100;
      if (this.spec) this.spec.setStrength(this.supp);
    }
    if (typeof cfg.autoGate === "boolean") this.autoGate = cfg.autoGate;
    if (typeof cfg.gateThresholdDb === "number") this.gateThresholdDb = clamp(cfg.gateThresholdDb, -65, -15);
    this.master.applyConfig(cfg);
  }

  attachNeural(port) {
    this.detachNeural();
    this.nPort = port;
    this.nPool = [];
    for (let i = 0; i < 12; i++) this.nPool.push(new Float32Array(this.nHop));
    this.nAcc = null; this.nAccIdx = 0;
    this.nR = 0; this.nW = 0; this.nDrop = 0;
    this.nState = PRIME; this.nMix = 0;
    this.nTarget = this.nTargetMin + 128;
    this.nDegraded = false; this.nHighLoadStreak = 0; this.nAnnouncedActive = false;
    this.nMinFill = RING; this.nWinBlocks = 0; this.nCleanWindows = 0;
    port.onmessage = (e) => this.onNeural(e.data);
  }

  detachNeural() {
    if (this.nPort) {
      try { this.nPort.onmessage = null; this.nPort.close(); } catch (e) {}
    }
    this.nPort = null; this.nState = 0; this.nMix = 0; this.nPool = []; this.nAcc = null;
  }

  onNeural(d) {
    if (!d) return;
    const b = d.b;
    if (b) {
      const n = b.length;
      let fill = (this.nW - this.nR) & RING_MASK;
      if (fill + n >= RING - 1) { this.nR = (this.nR + n) & RING_MASK; }
      const ring = this.nRing;
      let w = this.nW;
      for (let i = 0; i < n; i++) { ring[w] = b[i]; w = (w + 1) & RING_MASK; }
      this.nW = w;
      if (n === this.nHop && this.nPool.length < 16) this.nPool.push(b);
      return;
    }
    if (d.t === "st") {
      this.nLoad = d.avg / ((this.nHop / this.sr) * 1000);
      if (this.nLoad > 0.85) this.nHighLoadStreak++; else this.nHighLoadStreak = 0;
      if (this.nHighLoadStreak >= 6 && !this.nDegraded) this.degrade("cpu");
    }
  }

  degrade(reason) {
    this.nDegraded = true;
    this.port.postMessage({ type: "neural-overload", reason });
  }

  runPre(input, out, len) {
    const hpf = this.hpf;
    for (let i = 0; i < len; i++) {
      this.gain += (this.gainTarget - this.gain) * this.gainCoef;
      out[i] = hpf.process(input[i] * this.gain);
    }
  }

  runSpectral(pre, out, len) {
    const spec = this.spec;
    if (len === spec.H && this.gIdx === 0) { spec.process(pre, out); return; }
    // Generic path for non-128 render quanta
    const H = spec.H, gIn = this.gIn, gOut = this.gOut;
    for (let i = 0; i < len; i++) {
      out[i] = gOut[this.gIdx];
      gIn[this.gIdx] = pre[i];
      if (++this.gIdx === H) { spec.process(gIn, gOut); this.gIdx = 0; }
    }
  }

  neuralSend(pre, len) {
    const hop = this.nHop;
    for (let i = 0; i < len; i++) {
      if (!this.nAcc) {
        this.nAcc = this.nPool.pop() || null;
        this.nAccIdx = 0;
        if (!this.nAcc) return; // worker stalled — spectral covers until buffers return
      }
      this.nAcc[this.nAccIdx++] = pre[i];
      if (this.nAccIdx === hop) {
        const buf = this.nAcc;
        this.nAcc = null;
        this.nPort.postMessage({ s: this.nSeq++, b: buf }, [buf.buffer]);
      }
    }
  }

  /** Mixes neural output over the spectral signal in "spec" and writes "wet". */
  neuralMixInto(spec, wet, len) {
    const ring = this.nRing;
    let fill = (this.nW - this.nR) & RING_MASK;

    if (this.nState === PRIME) {
      wet.set(spec);
      if (fill >= this.nTarget + XFADE) {
        this.nState = PLAY;
        if (!this.nAnnouncedActive) { this.nAnnouncedActive = true; this.port.postMessage({ type: "neural-active" }); }
      }
      return;
    }

    // Latency guard: never let the buffer grow into audible lag
    if (fill > 4800 && this.nDrop === 0) this.nDrop = fill - this.nTarget;

    const wantMix = this.nDegraded || this.supp <= 0.001 ? 0 : 1;
    if (fill - XFADE < len) {
      // Underrun: fade out using the reserved tail, spectral takes over, re-prime deeper
      let r = this.nR;
      const avail = Math.min(fill, XFADE);
      const m0 = this.nMix;
      for (let i = 0; i < len; i++) {
        if (i < avail) {
          const m = m0 * (1 - (i + 1) / avail);
          wet[i] = spec[i] + (ring[r] - spec[i]) * m;
          r = (r + 1) & RING_MASK;
        } else {
          wet[i] = spec[i];
        }
      }
      this.nR = r;
      this.nMix = 0;
      this.nState = PRIME;
      this.nUnderruns++; this.nRecentUnderruns++;
      this.nTarget = Math.min(this.nTarget + 192, 2400);
      this.nDrop = 0;
      return;
    }

    this.nFillAvg += (fill - this.nFillAvg) * 0.02;
    if (fill < this.nMinFill) this.nMinFill = fill;

    let r = this.nR;
    let mix = this.nMix;
    const step = this.nMixStep;
    const D = this.nDrop > 0 && fill - XFADE - this.nDrop >= len ? this.nDrop : 0;
    for (let i = 0; i < len; i++) {
      let n = ring[r];
      if (D > 0 && i < XFADE) {
        const a = (i + 1) / XFADE;
        n = n * (1 - a) + ring[(r + D) & RING_MASK] * a;
      } else if (D > 0) {
        n = ring[(r + D) & RING_MASK];
      }
      r = (r + 1) & RING_MASK;
      if (mix < wantMix) { mix += step; if (mix > wantMix) mix = wantMix; }
      else if (mix > wantMix) { mix -= step; if (mix < wantMix) mix = wantMix; }
      wet[i] = spec[i] + (n - spec[i]) * mix;
    }
    if (D > 0) { r = (r + D) & RING_MASK; this.nDrop = 0; }
    this.nR = r;
    this.nMix = mix;

    // Adaptive jitter buffer: every ~1 s trim cushion that was never needed
    if (++this.nWinBlocks >= 375) {
      // Keep a safety margin that grows with observed jitter (nTarget rises on underruns)
      const need = len + XFADE;
      const margin = 96 + (this.nTarget - this.nTargetMin);
      const excess = this.nMinFill - need;
      if (excess > margin + 96 && this.nDrop === 0) this.nDrop = excess - margin;
      if (this.nRecentUnderruns === 0) {
        if (++this.nCleanWindows >= 6) { this.nTarget = Math.max(this.nTargetMin, this.nTarget - 64); this.nCleanWindows = 0; }
      } else {
        this.nCleanWindows = 0;
        if (this.nRecentUnderruns >= 4 && !this.nDegraded) this.degrade("underruns");
      }
      this.nRecentUnderruns = 0;
      this.nMinFill = RING;
      this.nWinBlocks = 0;
    }
  }

  runPost(wet, dry, out, len) {
    const sup = this.supp;
    const closedGain = sup <= 0.001 ? 1 : dbToLin(-(6 + 22 * sup));
    const cleanFloorDb = linToDb(this.cleanFloor);
    const openDb = this.autoGate ? clamp(cleanFloorDb + 9 + 4 * sup, -62, -30) : this.gateThresholdDb;
    const vad = this.spec ? this.spec.vad : 0;
    // Detector works in the mean-square domain so it compares like-for-like with RMS floors
    const openLin = dbToLin(vad > 0.6 ? openDb - 6 : openDb);
    const closeLin = dbToLin(openDb - 4);
    const openSq = openLin * openLin;
    const closeSq = closeLin * closeLin;
    const laLen = this.laLen, laBuf = this.laBuf;
    const master = this.master;
    let wetSq = 0, drySq = 0;

    for (let i = 0; i < len; i++) {
      const w = wet[i];
      const d = dry[i];
      wetSq += w * w; drySq += d * d;

      const w2 = w * w;
      this.env += (w2 - this.env) * (w2 > this.env ? this.envAtk : this.envRel);
      if (this.gateOpen) {
        if (this.env < closeSq) {
          if (this.gateHold > 0) this.gateHold--; else this.gateOpen = false;
        } else {
          this.gateHold = this.gateHoldLen;
        }
      } else if (this.env > openSq) {
        this.gateOpen = true;
        this.gateHold = this.gateHoldLen;
      }
      const tg = this.gateOpen ? 1 : closedGain;
      this.gateGain += (tg - this.gateGain) * (tg > this.gateGain ? this.gateOpenCoef : this.gateCloseCoef);
      if (this.gateGain < this.mMinGate) this.mMinGate = this.gateGain;

      const delayed = laBuf[this.laPos];
      laBuf[this.laPos] = w;
      if (++this.laPos >= laLen) this.laPos = 0;

      let y = master.processSample(delayed * this.gateGain, this.gateOpen);

      const tb = this.bypassed ? 1 : 0;
      this.bypassMix += (tb - this.bypassMix) * this.bypassCoef;
      if (this.bypassMix > 0.0005) y = y * (1 - this.bypassMix) + d * this.bypassMix;
      out[i] = y;
      this.mOut += y * y;
    }

    // Adaptive floors on ~60 ms smoothed power (a minimum of raw 2.7 ms blocks would sit far
    // below the true noise mean); frozen during confirmed speech.
    const inv = 1 / len;
    this.wetPow += (wetSq * inv - this.wetPow) * this.powSmooth;
    this.dryPow += (drySq * inv - this.dryPow) * this.powSmooth;
    const rmsW = Math.sqrt(this.wetPow), rmsD = Math.sqrt(this.dryPow);
    // Freeze on real speech only: the spectral VAD when available, else a clear +12 dB margin
    // (using the gate state here would deadlock: a stuck-low floor keeps the gate open).
    const speech = this.spec ? vad > 0.5 : this.gateOpen && rmsW > this.cleanFloor * 4;
    if (rmsW < this.cleanFloor) this.cleanFloor += (rmsW - this.cleanFloor) * this.floorDown;
    else if (!speech) this.cleanFloor += (Math.min(rmsW, 0.03) - this.cleanFloor) * this.floorUp;
    this.cleanFloor = clamp(this.cleanFloor, 3e-5, 0.03);
    if (rmsD < this.dryFloor) this.dryFloor += (rmsD - this.dryFloor) * this.floorDown;
    else if (!speech) this.dryFloor += (Math.min(rmsD, 0.08) - this.dryFloor) * this.floorUp;
    this.dryFloor = clamp(this.dryFloor, 1e-4, 0.065);

    this.mDry += drySq; this.mWet += wetSq; this.mN += len;
    if (++this.mCount >= this.mInterval) {
      this.emitTelemetry(openDb);
    }
  }

  emitTelemetry(openDb) {
    const n = Math.max(1, this.mN);
    const dryDb = clamp(linToDb(Math.sqrt(this.mDry / n)), -75, 0);
    const wetDb = clamp(linToDb(Math.sqrt(this.mWet / n)), -75, 0);
    const outDb = clamp(linToDb(Math.sqrt(this.mOut / n)), -75, 0);
    const byp = this.bypassed;
    const nr = byp ? 0 : clamp(dryDb - wetDb, 0, 45);
    const gr = byp ? 0 : clamp(Math.max(nr, dryDb - outDb, -linToDb(this.mMinGate)), 0, 48);

    let engine = this.engineLabel;
    let neuralState = "off";
    let latency = this.laLen;
    if (this.role === "full") {
      latency += this.specLatency;
      if (this.supp <= 0.001) { engine = "off"; latency = this.laLen; }
      if (this.nPort) {
        if (this.nDegraded) neuralState = "degraded";
        else if (this.nState === PLAY && this.nMix > 0.5) neuralState = "active";
        else neuralState = this.nAnnouncedActive ? "priming" : "loading";
        if (neuralState === "active") {
          engine = "neural";
          latency = this.laLen + this.nHop / 2 + this.nFillAvg + ${SIQ_NEURAL_ALGO_DELAY};
        }
      }
    }
    this.port.postMessage({
      type: "telemetry",
      inputDb: dryDb,
      outputDb: outDb,
      cleanDb: wetDb,
      noiseFloorDb: clamp(linToDb(this.dryFloor), -75, -15),
      effectiveThresholdDb: openDb,
      gateOpen: this.gateOpen,
      gainReductionDb: gr,
      aiNoiseReductionDb: nr,
      bypassed: byp,
      engine,
      neuralState,
      latencyMs: Math.round((latency / this.sr) * 10000) / 10,
      neuralLoadPct: Math.round(this.nLoad * 100),
      underruns: this.nUnderruns,
    });
    this.mCount = 0; this.mDry = 0; this.mWet = 0; this.mOut = 0; this.mN = 0; this.mMinGate = 1;
  }

  process(inputs, outputs) {
    if (!this.alive) return false;
    const output = outputs[0];
    const out = output && output[0];
    if (!out) return true;
    const len = out.length;
    this.ensureScratch(len);
    const in0 = inputs[0] && inputs[0][0];

    if (this.role === "pre") {
      if (in0) this.runPre(in0, out, len); else out.fill(0);
      for (let ch = 1; ch < output.length; ch++) output[ch].set(out);
      return true;
    }

    let wet, dry;
    if (this.role === "full") {
      const pre = this.sPre;
      if (in0) this.runPre(in0, pre, len); else pre.fill(0);
      dry = pre;
      wet = this.sWet;
      if (this.supp <= 0.001) {
        wet.set(pre);
        if (this.nPort) this.neuralSend(pre, len);
      } else {
        const spec = this.nPort ? this.sSpec : wet;
        this.runSpectral(pre, spec, len);
        if (this.nPort) {
          this.neuralSend(pre, len);
          this.neuralMixInto(spec, wet, len);
        }
      }
    } else {
      const in1 = inputs[1] && inputs[1][0];
      wet = in0 || this.sZero;
      dry = in1 || wet;
    }

    this.runPost(wet, dry, out, len);
    for (let ch = 1; ch < output.length; ch++) output[ch].set(out);
    return true;
  }
}

registerProcessor("${SIQ_ENGINE_PROCESSOR_ID}", SiqEngineProcessor);
`;
