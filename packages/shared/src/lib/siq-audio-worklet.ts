"use client";

/**
 * SIQ AI Voice Engine v2 — Studio DSP + Neural Pre/Post AudioWorklets
 *
 * Registers three tightly integrated AudioWorkletProcessors in a single module:
 *
 *  1. `siq-pre-conditioner-processor` (Pre-AI Conditioning Stage):
 *     - Zipper-free smoothed Input Gain (0% – 250%)
 *     - Precision 2nd-order Butterworth High-Pass / DC Blocker (18 / 80 / 120 Hz)
 *     Runs BEFORE DeepFilterNet3 or GTCRN so plosives, desk thumps, and sub-bass
 *     rumble never confuse the neural speech enhancement model.
 *
 *  2. `siq-post-mastering-processor` (2-Input Post-AI Mastering & Telemetry Stage):
 *     - Input 0: AI-denoised signal (DeepFilterNet3 48 kHz or GTCRN)
 *     - Input 1: Pre-AI conditioned dry reference signal
 *     - Optional GTCRN High-Band Air Preservation (>7.6 kHz, 480-sample delay-aligned,
 *       speech-gated so consonants stay airy without leaking background hiss)
 *     - Glitch-free A/B Bypass crossfade (instant Raw vs SIQ AI comparison)
 *     - Neural-Guided Smart Voice Activity Gate (decides on AI-cleaned audio so
 *       mechanical keyboards, mouse clicks, and fans never falsely open the gate)
 *     - Studio Voice Tone EQ (Natural / Studio Clarity / Broadcast Warm / Crisp Comms)
 *     - Dynamic De-Esser (5.5–8.5 kHz sidechain tamer for smooth Clarity/Crisp vocals)
 *     - Sample-rate-safe Soft-Knee Broadcast Compressor with Smart Auto-Makeup
 *       (never amplifies idle silence) + -1 dBFS tanh safety ceiling limiter
 *     - 20 Hz real-time telemetry (true Pre-AI Input dB, Output dB, Noise Floor dB,
 *       Gate state, AI Noise Reduction dB, and total Gain Reduction dB)
 *
 *  3. `siq-voice-studio-processor` (Zero-Latency Studio Pure DSP):
 *     - Upgraded 0-lookahead (~2.67 ms at 48 kHz) 3-band TPT SVF DSP engine
 *     - RMS-aligned Wiener downward expansion, Smart Gate, Tone EQ, De-Esser,
 *       sample-rate-safe Compressor with Smart Auto-Makeup, Safety Limiter,
 *       and instant A/B Bypass for ultra-low-CPU / studio mic scenarios.
 */

export const SIQ_WORKLET_PROCESSOR_ID = "siq-voice-studio-processor";
export const SIQ_PRE_PROCESSOR_ID = "siq-pre-conditioner-processor";
export const SIQ_POST_PROCESSOR_ID = "siq-post-mastering-processor";

export type SiqAiEngine = "ultra" | "fast" | "pure";
export type SiqPresetId = "light" | "balanced" | "studio" | "aggressive";
export type SiqHighPassHz = 0 | 80 | 120;
export type SiqVoiceTone = "natural" | "clarity" | "warm" | "crisp";

export interface SiqDspConfig {
  /** SIQ AI engine tier: ultra (DeepFilterNet3 48 kHz), fast (GTCRN + Air), pure (Zero-Latency DSP) */
  aiEngine: SiqAiEngine;
  /** Linear input gain percentage: 0 to 250 (100 = 0 dB unity) */
  inputGainPct: number;
  /** Noise suppression strength: 0 to 100 (maps to DF3 att_lim_db / GTCRN mix / DSP depth) */
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
  /** Soft-knee vocal compressor + -1 dBFS safety limiter */
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
 * Perceptual curve mapping user Suppression Strength (0–100%) to DeepFilterNet3
 * attenuation limit in dB (0 = passthrough, ~23 dB = light, ~61 dB = balanced,
 * ~92 dB = aggressive, 100 = unlimited).
 */
export function suppressionPctToAttenLimDb(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  if (clamped <= 0) return 0;
  if (clamped >= 98) return 100;
  return Math.round(6 + 94 * Math.pow(clamped / 100, 2.15));
}

export interface SiqAudioTelemetry {
  inputDb: number;
  outputDb: number;
  noiseFloorDb: number;
  effectiveThresholdDb: number;
  gateOpen: boolean;
  gainReductionDb: number;
  /** Attenuation specifically achieved by the neural denoiser stage (dB) */
  aiNoiseReductionDb?: number;
  /** True while A/B raw bypass preview is active */
  bypassed?: boolean;
}

export const SIQ_WORKLET_SOURCE = /* js */ `
const EPS = 1e-9;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function linToDb(v) {
  return 20 * Math.log10(v > EPS ? v : EPS);
}

function dbToLin(db) {
  return Math.pow(10, db / 20);
}

/** Standard RBJ Biquad section (Direct Form II Transposed, 0 extra latency) */
class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
    this.z1 = 0; this.z2 = 0;
  }

  reset() {
    this.z1 = 0;
    this.z2 = 0;
  }

  setBypass() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
  }

  setHighPass(sr, freq, q = 0.70710678) {
    const f = clamp(freq, 10, sr * 0.45);
    const w0 = (2 * Math.PI * f) / sr;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = ((1 + cosw0) * 0.5) / a0;
    this.b1 = -(1 + cosw0) / a0;
    this.b2 = ((1 + cosw0) * 0.5) / a0;
    this.a1 = (-2 * cosw0) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  setBandPass(sr, freq, q = 1.4) {
    const f = clamp(freq, 40, sr * 0.45);
    const w0 = (2 * Math.PI * f) / sr;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b1 = 0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * cosw0) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  setPeaking(sr, freq, q, gainDb) {
    if (Math.abs(gainDb) < 0.05) {
      this.setBypass();
      return;
    }
    const f = clamp(freq, 20, sr * 0.45);
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * f) / sr;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * q);
    const a0 = 1 + alpha / A;
    this.b0 = (1 + alpha * A) / a0;
    this.b1 = (-2 * cosw0) / a0;
    this.b2 = (1 - alpha * A) / a0;
    this.a1 = (-2 * cosw0) / a0;
    this.a2 = (1 - alpha / A) / a0;
  }

  setHighShelf(sr, freq, slope, gainDb) {
    if (Math.abs(gainDb) < 0.05) {
      this.setBypass();
      return;
    }
    const f = clamp(freq, 100, sr * 0.45);
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * f) / sr;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = (sinw0 / 2) * Math.sqrt((A + 1 / A) * (1 / slope - 1) + 2);
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
    const a0 = (A + 1) - (A - 1) * cosw0 + twoSqrtAAlpha;
    this.b0 = (A * ((A + 1) + (A - 1) * cosw0 + twoSqrtAAlpha)) / a0;
    this.b1 = (-2 * A * ((A - 1) + (A + 1) * cosw0)) / a0;
    this.b2 = (A * ((A + 1) + (A - 1) * cosw0 - twoSqrtAAlpha)) / a0;
    this.a1 = (2 * ((A - 1) - (A + 1) * cosw0)) / a0;
    this.a2 = ((A + 1) - (A - 1) * cosw0 - twoSqrtAAlpha) / a0;
  }

  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/**
 * Topology-Preserving Transform (Cytomic SVF) crossover splitter.
 * Zero extra latency; low + high sums cleanly without comb-filtering artifacts.
 */
class TptSplit {
  constructor(sr, freq) {
    const f = clamp(freq, 40, sr * 0.42);
    this.g = Math.tan((Math.PI * f) / sr);
    this.k = 1.41421356; // Butterworth damping (Q = 0.7071)
    this.a1 = 1 / (1 + this.g * (this.g + this.k));
    this.a2 = this.g * this.a1;
    this.a3 = this.g * this.a2;
    this.ic1eq = 0;
    this.ic2eq = 0;
  }

  process(v0) {
    const v3 = v0 - this.ic2eq;
    const v1 = this.a1 * this.ic1eq + this.a2 * v3;
    const v2 = this.ic2eq + this.a2 * this.ic1eq + this.a3 * v3;
    this.ic1eq = 2 * v1 - this.ic1eq;
    this.ic2eq = 2 * v2 - this.ic2eq;
    const low = v2;
    const high = v0 - v2;
    return [low, high];
  }
}

/**
 * Shared Studio Voice Mastering Chain:
 * Tone EQ + Dynamic De-Esser (5.5–8.5 kHz) + Sample-Rate-Safe Soft-Knee Compressor
 * with Smart Auto-Makeup + -1 dBFS tanh safety ceiling limiter.
 */
class StudioMasteringChain {
  constructor(sr) {
    this.sr = sr;
    this.voiceTone = "clarity";
    this.deEsserEnabled = true;
    this.compressorEnabled = true;

    this.eqLow = new Biquad();
    this.eqMid = new Biquad();
    this.eqHigh = new Biquad();

    // Dynamic De-Esser: bandpass detector + subtractive sibilance reduction
    this.sibilanceBand = new Biquad();
    this.sibilanceBand.setBandPass(sr, 6800, 1.35);
    this.sibEnv = 1e-4;
    this.bodyEnv = 1e-4;
    this.deEssGain = 1.0;

    // Sample-rate-safe Compressor state
    this.compEnv = 1e-4;
    this.compGain = 1.0;
    this.autoMakeupLin = 1.0;

    this.sibAttack = 1 - Math.exp(-1 / (sr * 0.002));
    this.sibRelease = 1 - Math.exp(-1 / (sr * 0.035));
    this.compEnvAttack = 1 - Math.exp(-1 / (sr * 0.006));
    this.compEnvRelease = 1 - Math.exp(-1 / (sr * 0.11));
    this.compGainAttack = 1 - Math.exp(-1 / (sr * 0.008));
    this.compGainRelease = 1 - Math.exp(-1 / (sr * 0.095));
    this.makeupSmooth = 1 - Math.exp(-1 / (sr * 0.18));

    this.configureToneEq();
  }

  applyConfig(cfg) {
    if (typeof cfg.voiceTone === "string") {
      this.voiceTone = cfg.voiceTone;
      this.configureToneEq();
    }
    if (typeof cfg.deEsser === "boolean") {
      this.deEsserEnabled = cfg.deEsser;
    }
    if (typeof cfg.compressor === "boolean") {
      this.compressorEnabled = cfg.compressor;
    }
  }

  configureToneEq() {
    switch (this.voiceTone) {
      case "clarity":
        this.eqLow.setPeaking(this.sr, 280, 1.1, -2.0);
        this.eqMid.setPeaking(this.sr, 3200, 1.0, 2.5);
        this.eqHigh.setHighShelf(this.sr, 9500, 0.7, -1.0);
        break;
      case "warm":
        this.eqLow.setPeaking(this.sr, 165, 0.9, 2.4);
        this.eqMid.setPeaking(this.sr, 420, 1.2, -1.5);
        this.eqHigh.setPeaking(this.sr, 3500, 1.0, 1.7);
        break;
      case "crisp":
        this.eqLow.setPeaking(this.sr, 250, 1.0, -3.2);
        this.eqMid.setPeaking(this.sr, 2900, 1.1, 3.2);
        this.eqHigh.setHighShelf(this.sr, 8000, 0.7, -2.2);
        break;
      case "natural":
      default:
        this.eqLow.setBypass();
        this.eqMid.setBypass();
        this.eqHigh.setBypass();
        break;
    }
  }

  processSample(x, speechActive) {
    let y = x;

    // 1. Studio Voice Tone EQ
    if (this.voiceTone !== "natural") {
      y = this.eqHigh.process(this.eqMid.process(this.eqLow.process(y)));
    }

    // 2. Dynamic De-Esser (tames harsh 5.5–8.5 kHz 's'/'sh' peaks relative to vocal body)
    if (this.deEsserEnabled) {
      const sib = this.sibilanceBand.process(y);
      const absSib = Math.abs(sib);
      const absBody = Math.abs(y);
      this.sibEnv += (absSib - this.sibEnv) * (absSib > this.sibEnv ? this.sibAttack : this.sibRelease);
      this.bodyEnv += (absBody - this.bodyEnv) * (absBody > this.bodyEnv ? this.sibAttack : this.sibRelease);

      let targetDeEss = 1.0;
      // Trigger only when sibilance is both loud enough (>-36 dBFS) and dominates vocal energy
      if (this.sibEnv > 0.016 && this.sibEnv > this.bodyEnv * 0.34) {
        const excessDb = clamp(linToDb(this.sibEnv / (this.bodyEnv * 0.34 + EPS)), 0, 14);
        const cutDb = Math.min(7.0, excessDb * 0.55);
        targetDeEss = dbToLin(-cutDb);
      }
      this.deEssGain += (targetDeEss - this.deEssGain) * (targetDeEss < this.deEssGain ? this.sibAttack : this.sibRelease);
      // Subtract only the excess sibilant band so vocal body stays untouched
      y = y - sib * (1.0 - this.deEssGain);
    }

    // 3. Sample-rate-safe Soft-Knee Broadcast Compressor + Smart Auto-Makeup
    if (this.compressorEnabled) {
      const absY = Math.abs(y);
      this.compEnv += (absY - this.compEnv) * (absY > this.compEnv ? this.compEnvAttack : this.compEnvRelease);
      const envDb = linToDb(this.compEnv);

      const threshDb = -18.0;
      const kneeDb = 6.0;
      const ratio = 3.0;
      let reductionDb = 0;

      if (envDb > threshDb - kneeDb * 0.5) {
        if (envDb < threshDb + kneeDb * 0.5) {
          const delta = envDb - (threshDb - kneeDb * 0.5);
          reductionDb = ((1 - 1 / ratio) * delta * delta) / (2 * kneeDb);
        } else {
          reductionDb = (envDb - threshDb) * (1 - 1 / ratio);
        }
      }

      const targetCompGain = dbToLin(-reductionDb);
      const slew = targetCompGain < this.compGain ? this.compGainAttack : this.compGainRelease;
      this.compGain += (targetCompGain - this.compGain) * slew;

      // Smart Auto-Makeup: boost gently ONLY during active speech (never raises idle noise floor!)
      const targetMakeupDb = speechActive ? clamp(1.6 + reductionDb * 0.35, 0, 4.5) : 0.0;
      const targetMakeupLin = dbToLin(targetMakeupDb);
      this.autoMakeupLin += (targetMakeupLin - this.autoMakeupLin) * this.makeupSmooth;

      y = y * this.compGain * this.autoMakeupLin;

      // Smooth tanh soft ceiling at ~0.89 (-1 dBFS)
      if (Math.abs(y) > 0.68) {
        y = 0.89 * Math.tanh(y / 0.89);
      }
    } else if (Math.abs(y) > 0.95) {
      y = 0.98 * Math.tanh(y / 0.98);
    }

    return y;
  }
}

/**
 * 1. Pre-AI Conditioner Worklet:
 *    Input Gain (0–250%) + High-Pass Rumble Filter (18 / 80 / 120 Hz).
 */
class SiqPreConditionerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const cfg = (options && options.processorOptions && options.processorOptions.config) || {};
    this.sr = sampleRate || 48000;
    this.destroyed = false;
    this.targetInputGain = 1.0;
    this.currentInputGain = 1.0;
    this.highPassHz = 80;
    this.hpf = new Biquad();
    this.gainSlewCoeff = 1 - Math.exp(-1 / (this.sr * 0.015));

    this.applyConfig(cfg);
    this.currentInputGain = this.targetInputGain;

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (!msg) return;
      if (msg === "destroy" || msg.type === "destroy") {
        this.destroyed = true;
        return;
      }
      if (msg.type === "config" && msg.config) {
        this.applyConfig(msg.config);
      }
    };
  }

  applyConfig(cfg) {
    if (typeof cfg.inputGainPct === "number") {
      this.targetInputGain = clamp(cfg.inputGainPct, 0, 250) / 100;
    }
    if (typeof cfg.highPassHz === "number") {
      this.highPassHz = cfg.highPassHz === 120 ? 120 : cfg.highPassHz === 80 ? 80 : 0;
      this.hpf.setHighPass(this.sr, this.highPassHz > 0 ? this.highPassHz : 18, 0.70710678);
    } else if (this.hpf.b0 === 1 && this.hpf.b1 === 0) {
      this.hpf.setHighPass(this.sr, this.highPassHz > 0 ? this.highPassHz : 18, 0.70710678);
    }
  }

  process(inputs, outputs) {
    if (this.destroyed) return false;
    const inCh = inputs[0] && inputs[0][0];
    const outCh = outputs[0] && outputs[0][0];
    if (!inCh || !outCh) return true;

    for (let i = 0; i < inCh.length; i++) {
      this.currentInputGain += (this.targetInputGain - this.currentInputGain) * this.gainSlewCoeff;
      outCh[i] = this.hpf.process(inCh[i] * this.currentInputGain);
    }
    return true;
  }
}

/**
 * 2. Post-AI Studio Mastering & Telemetry Worklet (2 inputs):
 *    inputs[0]: AI-denoised signal (DeepFilterNet3 48 kHz or GTCRN)
 *    inputs[1]: Pre-AI conditioned dry signal (for accurate telemetry, A/B bypass,
 *               and optional delay-aligned High-Band Air Recovery for GTCRN)
 */
class SiqPostMasteringProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    const cfg = opts.config || {};
    this.sr = sampleRate || 48000;
    this.destroyed = false;

    this.enableAirRecovery = Boolean(opts.enableAirRecovery);
    this.dryDelaySamples = clamp(Math.round(opts.dryDelaySamples || 0), 0, 2048);
    this.dryDelayBuf = new Float32Array(Math.max(1, this.dryDelaySamples));
    this.dryDelayPos = 0;

    // For GTCRN (which has no native attenuation-limit knob), support smooth wet-mix scaling
    this.useWetMixControl = Boolean(opts.useWetMixControl);

    this.suppression = 0.78;
    this.autoGate = true;
    this.gateThresholdDb = -48;
    this.bypassed = false;
    this.bypassMix = 0.0; // 0 = processed, 1 = raw dry bypass

    this.master = new StudioMasteringChain(this.sr);
    this.airHpf = new Biquad();
    this.airHpf.setHighPass(this.sr, 7600, 0.70710678);
    this.speechSplit = new TptSplit(this.sr, 260);

    // Neural-guided voice gate state (operates on AI-cleaned audio!)
    this.cleanEnv = 1e-4;
    this.cleanMidEnv = 1e-4;
    this.cleanFloor = 8e-4;
    this.dryFloor = 2e-3;
    this.gateOpen = false;
    this.gateGain = 0;
    this.gateHoldSamples = 0;

    const blockSec = 128 / this.sr;
    this.envAttack = 1 - Math.exp(-1 / (this.sr * 0.004));
    this.envRelease = 1 - Math.exp(-1 / (this.sr * 0.055));
    this.floorDown = 1 - Math.exp(-blockSec / 0.14);
    this.floorUp = 1 - Math.exp(-blockSec / 2.2);
    this.gateAttackCoeff = 1 - Math.exp(-1 / (this.sr * 0.003));
    this.gateReleaseCoeff = 1 - Math.exp(-1 / (this.sr * 0.145));
    this.gateHoldDuration = Math.round(this.sr * 0.19);
    this.bypassSlew = 1 - Math.exp(-1 / (this.sr * 0.006));

    // 20 Hz Telemetry accumulators
    this.meterCounter = 0;
    this.meterInterval = Math.max(1, Math.round(this.sr / (128 * 20)));
    this.meterDrySq = 0;
    this.meterAiSq = 0;
    this.meterOutSq = 0;
    this.meterSamples = 0;
    this.meterMinGateGain = 1;

    this.applyConfig(cfg);

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (!msg) return;
      if (msg === "destroy" || msg.type === "destroy") {
        this.destroyed = true;
        return;
      }
      if (msg.type === "config" && msg.config) {
        this.applyConfig(msg.config);
      } else if (msg.type === "bypass") {
        this.bypassed = Boolean(msg.value);
      }
    };
  }

  applyConfig(cfg) {
    if (typeof cfg.suppressionStrength === "number") {
      this.suppression = clamp(cfg.suppressionStrength, 0, 100) / 100;
    }
    if (typeof cfg.autoGate === "boolean") {
      this.autoGate = cfg.autoGate;
    }
    if (typeof cfg.gateThresholdDb === "number") {
      this.gateThresholdDb = clamp(cfg.gateThresholdDb, -65, -15);
    }
    this.master.applyConfig(cfg);
  }

  process(inputs, outputs) {
    if (this.destroyed) return false;
    const aiCh = inputs[0] && inputs[0][0];
    const dryCh = (inputs[1] && inputs[1][0]) || aiCh;
    const outCh = outputs[0] && outputs[0][0];
    if (!aiCh || !outCh) return true;

    const len = aiCh.length;
    const sup = this.suppression;
    const gateClosedGain = dbToLin(-34 * Math.max(0.25, sup));

    // Auto gate sits comfortably above the AI's already-quiet residual floor
    const cleanFloorDb = linToDb(this.cleanFloor);
    const autoOpenDb = clamp(cleanFloorDb + 8.5 + sup * 3.5, -58, -28);
    const openThreshDb = this.autoGate ? autoOpenDb : this.gateThresholdDb;
    const closeThreshDb = openThreshDb - 4.5;
    const openThreshLin = dbToLin(openThreshDb);
    const closeThreshLin = dbToLin(closeThreshDb);

    // For GTCRN mode, allow subtle natural blend when user dials suppression below 85%
    const wetMix = this.useWetMixControl ? clamp(0.18 + sup * 0.82, 0, 1) : 1.0;

    let blkCleanSq = 0;
    let blkDrySq = 0;

    for (let i = 0; i < len; i++) {
      const aiSample = aiCh[i];
      const rawDry = dryCh ? dryCh[i] : aiSample;

      // Delay-align dry reference with AI frame latency when needed (e.g. 480 samples for GTCRN)
      let alignedDry = rawDry;
      if (this.dryDelaySamples > 0) {
        alignedDry = this.dryDelayBuf[this.dryDelayPos];
        this.dryDelayBuf[this.dryDelayPos] = rawDry;
        this.dryDelayPos = (this.dryDelayPos + 1) % this.dryDelaySamples;
      }

      this.meterDrySq += alignedDry * alignedDry;
      this.meterAiSq += aiSample * aiSample;
      blkDrySq += alignedDry * alignedDry;
      blkCleanSq += aiSample * aiSample;

      // Speech envelope measured on AI-cleaned audio so non-speech transients never trip gate
      const split = this.speechSplit.process(aiSample);
      const absMidUp = Math.abs(split[1]);
      const absClean = Math.abs(aiSample);
      this.cleanEnv += (absClean - this.cleanEnv) * (absClean > this.cleanEnv ? this.envAttack : this.envRelease);
      this.cleanMidEnv += (absMidUp - this.cleanMidEnv) * (absMidUp > this.cleanMidEnv ? this.envAttack : this.envRelease);

      const detector = Math.max(this.cleanMidEnv * 1.15, this.cleanEnv * 0.9);
      if (this.gateOpen) {
        if (detector < closeThreshLin) {
          if (this.gateHoldSamples > 0) {
            this.gateHoldSamples--;
          } else {
            this.gateOpen = false;
          }
        } else {
          this.gateHoldSamples = this.gateHoldDuration;
        }
      } else if (detector > openThreshLin) {
        this.gateOpen = true;
        this.gateHoldSamples = this.gateHoldDuration;
      }

      const targetGate = this.gateOpen ? 1.0 : gateClosedGain;
      this.gateGain += (targetGate - this.gateGain) * (targetGate > this.gateGain ? this.gateAttackCoeff : this.gateReleaseCoeff);
      if (this.gateGain < this.meterMinGateGain) this.meterMinGateGain = this.gateGain;

      // Optional wet-mix scaling (GTCRN) + Speech-Gated High-Band Air Preservation (>7.6 kHz)
      let y = wetMix < 0.999 ? aiSample * wetMix + alignedDry * (1 - wetMix) : aiSample;

      if (this.enableAirRecovery) {
        const dryAir = this.airHpf.process(alignedDry);
        // Only restore crisp high-frequency consonants when AI confirms speech is active
        const airPresence = clamp((this.cleanMidEnv - openThreshLin * 0.65) / (openThreshLin * 1.8 + EPS), 0, 1);
        y += dryAir * airPresence * 0.48;
      }

      y *= this.gateGain;

      // Studio Voice Mastering (EQ + De-Esser + Sample-Rate-Safe Comp + Limiter)
      y = this.master.processSample(y, this.gateOpen);

      // Glitch-free A/B Bypass crossfade (Raw pre-AI mic vs SIQ AI Mastered)
      const targetBypass = this.bypassed ? 1.0 : 0.0;
      this.bypassMix += (targetBypass - this.bypassMix) * this.bypassSlew;
      const finalSample = this.bypassMix > 0.0005 ? y * (1 - this.bypassMix) + alignedDry * this.bypassMix : y;

      outCh[i] = finalSample;
      this.meterOutSq += finalSample * finalSample;
    }

    for (let ch = 1; ch < outputs[0].length; ch++) {
      outputs[0][ch].set(outCh);
    }

    // Update adaptive floors once per block (freeze upward drift while speech is active)
    const invLen = 1 / len;
    const rmsClean = Math.sqrt(blkCleanSq * invLen);
    const rmsDry = Math.sqrt(blkDrySq * invLen);
    const speechLikely = this.gateOpen && rmsClean > this.cleanFloor * 2.2;

    this.cleanFloor = rmsClean < this.cleanFloor
      ? this.cleanFloor + (rmsClean - this.cleanFloor) * this.floorDown
      : speechLikely
        ? this.cleanFloor
        : this.cleanFloor + (Math.min(rmsClean, 0.04) - this.cleanFloor) * this.floorUp;
    this.cleanFloor = clamp(this.cleanFloor, 8e-5, 0.04);

    this.dryFloor = rmsDry < this.dryFloor
      ? this.dryFloor + (rmsDry - this.dryFloor) * this.floorDown
      : speechLikely
        ? this.dryFloor
        : this.dryFloor + (Math.min(rmsDry, 0.08) - this.dryFloor) * this.floorUp;
    this.dryFloor = clamp(this.dryFloor, 1.2e-4, 0.065);

    this.meterSamples += len;
    this.meterCounter++;
    if (this.meterCounter >= this.meterInterval) {
      const dryRms = Math.sqrt(this.meterDrySq / Math.max(1, this.meterSamples));
      const aiRms = Math.sqrt(this.meterAiSq / Math.max(1, this.meterSamples));
      const outRms = Math.sqrt(this.meterOutSq / Math.max(1, this.meterSamples));
      const dryDb = clamp(linToDb(dryRms), -75, 0);
      const aiDb = clamp(linToDb(aiRms), -75, 0);
      const outDb = clamp(linToDb(outRms), -75, 0);
      const aiReductionDb = this.bypassed ? 0 : clamp(dryDb - aiDb, 0, 45);
      const gateReductionDb = this.bypassed ? 0 : clamp(-linToDb(this.meterMinGateGain), 0, 40);
      const totalReductionDb = this.bypassed ? 0 : clamp(Math.max(aiReductionDb, dryDb - outDb, gateReductionDb), 0, 48);

      this.port.postMessage({
        type: "telemetry",
        inputDb: dryDb,
        outputDb: outDb,
        noiseFloorDb: clamp(linToDb(this.dryFloor), -75, -15),
        effectiveThresholdDb: openThreshDb,
        gateOpen: this.gateOpen,
        gainReductionDb: totalReductionDb,
        aiNoiseReductionDb: aiReductionDb,
        bypassed: this.bypassed,
      });

      this.meterCounter = 0;
      this.meterDrySq = 0;
      this.meterAiSq = 0;
      this.meterOutSq = 0;
      this.meterSamples = 0;
      this.meterMinGateGain = 1;
    }

    return true;
  }
}

/**
 * 3. Zero-Latency Studio Pure DSP Processor (~2.67 ms at 48 kHz, <0.5% CPU):
 *    Upgraded with RMS-aligned Wiener curves, De-Esser, sample-rate-safe Compressor,
 *    Smart Auto-Makeup, and glitch-free A/B Bypass.
 */
class SiqVoiceStudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const cfg = (options && options.processorOptions && options.processorOptions.config) || {};
    this.sr = sampleRate || 48000;
    this.destroyed = false;

    this.targetInputGain = 1;
    this.currentInputGain = 1;
    this.suppression = 0.78;
    this.autoGate = true;
    this.gateThresholdDb = -48;
    this.highPassHz = 80;
    this.bypassed = false;
    this.bypassMix = 0.0;

    this.hpf = new Biquad();
    this.splitLow = new TptSplit(this.sr, 260);
    this.splitHigh = new TptSplit(this.sr, 3800);
    this.master = new StudioMasteringChain(this.sr);

    // RMS-squared per-band envelopes (aligned with block RMS noise floors!)
    this.envLowSq = 1e-8;
    this.envMidSq = 1e-8;
    this.envHighSq = 1e-8;
    this.fullEnvSq = 1e-8;
    this.floorLow = 2e-3;
    this.floorMid = 1.5e-3;
    this.floorHigh = 1.2e-3;
    this.fullFloor = 2e-3;
    this.bandGainLow = 1;
    this.bandGainMid = 1;
    this.bandGainHigh = 1;

    this.gateOpen = false;
    this.gateGain = 0;
    this.gateHoldSamples = 0;

    const blockSec = 128 / this.sr;
    this.gainSlewCoeff = 1 - Math.exp(-1 / (this.sr * 0.015));
    this.envFastAttack = 1 - Math.exp(-1 / (this.sr * 0.004));
    this.envFastRelease = 1 - Math.exp(-1 / (this.sr * 0.055));
    this.bandSmoothAttack = 1 - Math.exp(-1 / (this.sr * 0.006));
    this.bandSmoothRelease = 1 - Math.exp(-1 / (this.sr * 0.075));
    this.floorDown = 1 - Math.exp(-blockSec / 0.14);
    this.floorUp = 1 - Math.exp(-blockSec / 2.2);
    this.gateAttackCoeff = 1 - Math.exp(-1 / (this.sr * 0.003));
    this.gateReleaseCoeff = 1 - Math.exp(-1 / (this.sr * 0.145));
    this.gateHoldDuration = Math.round(this.sr * 0.185);
    this.bypassSlew = 1 - Math.exp(-1 / (this.sr * 0.006));

    this.meterCounter = 0;
    this.meterInterval = Math.max(1, Math.round(this.sr / (128 * 20)));
    this.meterInSq = 0;
    this.meterOutSq = 0;
    this.meterSamples = 0;
    this.meterMinGain = 1;

    this.applyConfig(cfg);
    this.currentInputGain = this.targetInputGain;

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (!msg) return;
      if (msg === "destroy" || msg.type === "destroy") {
        this.destroyed = true;
        return;
      }
      if (msg.type === "config" && msg.config) {
        this.applyConfig(msg.config);
      } else if (msg.type === "bypass") {
        this.bypassed = Boolean(msg.value);
      }
    };
  }

  applyConfig(cfg) {
    if (typeof cfg.inputGainPct === "number") {
      this.targetInputGain = clamp(cfg.inputGainPct, 0, 250) / 100;
    }
    if (typeof cfg.suppressionStrength === "number") {
      this.suppression = clamp(cfg.suppressionStrength, 0, 100) / 100;
    }
    if (typeof cfg.autoGate === "boolean") {
      this.autoGate = cfg.autoGate;
    }
    if (typeof cfg.gateThresholdDb === "number") {
      this.gateThresholdDb = clamp(cfg.gateThresholdDb, -65, -15);
    }
    if (typeof cfg.highPassHz === "number") {
      this.highPassHz = cfg.highPassHz === 120 ? 120 : cfg.highPassHz === 80 ? 80 : 0;
      this.hpf.setHighPass(this.sr, this.highPassHz > 0 ? this.highPassHz : 18, 0.70710678);
    } else if (this.hpf.b0 === 1 && this.hpf.b1 === 0) {
      this.hpf.setHighPass(this.sr, this.highPassHz > 0 ? this.highPassHz : 18, 0.70710678);
    }
    this.master.applyConfig(cfg);
  }

  process(inputs, outputs) {
    if (this.destroyed) return false;
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length || !output || !output.length) return true;

    const inCh = input[0];
    const outCh = output[0];
    const len = inCh.length;

    const sup = this.suppression;
    const minBandGainLow = dbToLin(-30 * sup);
    const minBandGainMid = dbToLin(-22 * sup);
    const minBandGainHigh = dbToLin(-28 * sup);
    const gateClosedGain = dbToLin(-38 * Math.max(0.35, sup));

    let blkLowSq = 0;
    let blkMidSq = 0;
    let blkHighSq = 0;
    let blkFullSq = 0;

    // RMS-aligned Wiener thresholds
    const alphaLow = (1.1 + 2.4 * sup) * (this.floorLow * this.floorLow + 1e-10);
    const alphaMid = (0.9 + 2.0 * sup) * (this.floorMid * this.floorMid + 1e-10);
    const alphaHigh = (1.0 + 2.2 * sup) * (this.floorHigh * this.floorHigh + 1e-10);

    const floorDb = linToDb(this.fullFloor);
    const autoOpenDb = clamp(floorDb + 7.5 + sup * 5.0, -56, -24);
    const openThreshDb = this.autoGate ? autoOpenDb : this.gateThresholdDb;
    const closeThreshDb = openThreshDb - 4.5;
    const openThreshLin = dbToLin(openThreshDb);
    const closeThreshLin = dbToLin(closeThreshDb);

    for (let i = 0; i < len; i++) {
      this.currentInputGain += (this.targetInputGain - this.currentInputGain) * this.gainSlewCoeff;
      const dryX = this.hpf.process(inCh[i] * this.currentInputGain);
      this.meterInSq += dryX * dryX;

      const s1 = this.splitLow.process(dryX);
      const low = s1[0];
      const s2 = this.splitHigh.process(s1[1]);
      const mid = s2[0];
      const high = s2[1];

      const lowSq = low * low;
      const midSq = mid * mid;
      const highSq = high * high;
      const fullSq = dryX * dryX;

      blkLowSq += lowSq;
      blkMidSq += midSq;
      blkHighSq += highSq;
      blkFullSq += fullSq;

      this.envLowSq += (lowSq - this.envLowSq) * (lowSq > this.envLowSq ? this.envFastAttack : this.envFastRelease);
      this.envMidSq += (midSq - this.envMidSq) * (midSq > this.envMidSq ? this.envFastAttack : this.envFastRelease);
      this.envHighSq += (highSq - this.envHighSq) * (highSq > this.envHighSq ? this.envFastAttack : this.envFastRelease);
      this.fullEnvSq += (fullSq - this.fullEnvSq) * (fullSq > this.fullEnvSq ? this.envFastAttack : this.envFastRelease);

      let y = dryX;
      if (sup > 0.01) {
        const speechPresence = this.envMidSq / (this.envMidSq + alphaMid * 1.4 + EPS);
        const lowTarget = Math.max(minBandGainLow, this.envLowSq / (this.envLowSq + alphaLow + EPS));
        const midTarget = Math.max(minBandGainMid, this.envMidSq / (this.envMidSq + alphaMid + EPS));
        const highTarget = Math.max(
          minBandGainHigh,
          Math.min(1, this.envHighSq / (this.envHighSq + alphaHigh + EPS) + speechPresence * 0.22)
        );

        this.bandGainLow += (lowTarget - this.bandGainLow) * (lowTarget > this.bandGainLow ? this.bandSmoothAttack : this.bandSmoothRelease);
        this.bandGainMid += (midTarget - this.bandGainMid) * (midTarget > this.bandGainMid ? this.bandSmoothAttack : this.bandSmoothRelease);
        this.bandGainHigh += (highTarget - this.bandGainHigh) * (highTarget > this.bandGainHigh ? this.bandSmoothAttack : this.bandSmoothRelease);

        y = low * this.bandGainLow + mid * this.bandGainMid + high * this.bandGainHigh;
      }

      const detector = Math.max(Math.sqrt(this.envMidSq) * 1.15, Math.sqrt(this.fullEnvSq) * 0.85);
      if (this.gateOpen) {
        if (detector < closeThreshLin) {
          if (this.gateHoldSamples > 0) {
            this.gateHoldSamples--;
          } else {
            this.gateOpen = false;
          }
        } else {
          this.gateHoldSamples = this.gateHoldDuration;
        }
      } else if (detector > openThreshLin) {
        this.gateOpen = true;
        this.gateHoldSamples = this.gateHoldDuration;
      }

      const targetGate = this.gateOpen ? 1.0 : gateClosedGain;
      this.gateGain += (targetGate - this.gateGain) * (targetGate > this.gateGain ? this.gateAttackCoeff : this.gateReleaseCoeff);
      y *= this.gateGain;

      y = this.master.processSample(y, this.gateOpen);

      const totalGain = this.gateGain * (sup > 0.01 ? this.bandGainMid : 1);
      if (totalGain < this.meterMinGain) this.meterMinGain = totalGain;

      const targetBypass = this.bypassed ? 1.0 : 0.0;
      this.bypassMix += (targetBypass - this.bypassMix) * this.bypassSlew;
      const finalSample = this.bypassMix > 0.0005 ? y * (1 - this.bypassMix) + dryX * this.bypassMix : y;

      outCh[i] = finalSample;
      this.meterOutSq += finalSample * finalSample;
    }

    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(outCh);
    }

    const invLen = 1 / len;
    const rmsLow = Math.sqrt(blkLowSq * invLen);
    const rmsMid = Math.sqrt(blkMidSq * invLen);
    const rmsHigh = Math.sqrt(blkHighSq * invLen);
    const rmsFull = Math.sqrt(blkFullSq * invLen);

    const speechLikely = this.gateOpen && rmsMid > this.floorMid * 2.1;

    this.floorLow = rmsLow < this.floorLow
      ? this.floorLow + (rmsLow - this.floorLow) * this.floorDown
      : speechLikely
        ? this.floorLow
        : this.floorLow + (Math.min(rmsLow, 0.08) - this.floorLow) * this.floorUp;

    this.floorMid = rmsMid < this.floorMid
      ? this.floorMid + (rmsMid - this.floorMid) * this.floorDown
      : speechLikely
        ? this.floorMid
        : this.floorMid + (Math.min(rmsMid, 0.06) - this.floorMid) * this.floorUp;

    this.floorHigh = rmsHigh < this.floorHigh
      ? this.floorHigh + (rmsHigh - this.floorHigh) * this.floorDown
      : speechLikely
        ? this.floorHigh
        : this.floorHigh + (Math.min(rmsHigh, 0.06) - this.floorHigh) * this.floorUp;

    this.fullFloor = rmsFull < this.fullFloor
      ? this.fullFloor + (rmsFull - this.fullFloor) * this.floorDown
      : speechLikely
        ? this.fullFloor
        : this.fullFloor + (Math.min(rmsFull, 0.08) - this.fullFloor) * this.floorUp;

    this.floorLow = clamp(this.floorLow, 1.2e-4, 0.065);
    this.floorMid = clamp(this.floorMid, 1.2e-4, 0.055);
    this.floorHigh = clamp(this.floorHigh, 1.0e-4, 0.055);
    this.fullFloor = clamp(this.fullFloor, 1.2e-4, 0.065);

    this.meterSamples += len;
    this.meterCounter++;
    if (this.meterCounter >= this.meterInterval) {
      const inRms = Math.sqrt(this.meterInSq / Math.max(1, this.meterSamples));
      const outRms = Math.sqrt(this.meterOutSq / Math.max(1, this.meterSamples));
      this.port.postMessage({
        type: "telemetry",
        inputDb: clamp(linToDb(inRms), -75, 0),
        outputDb: clamp(linToDb(outRms), -75, 0),
        noiseFloorDb: clamp(linToDb(this.fullFloor), -75, -15),
        effectiveThresholdDb: openThreshDb,
        gateOpen: this.gateOpen,
        gainReductionDb: this.bypassed ? 0 : clamp(-linToDb(this.meterMinGain), 0, 40),
        bypassed: this.bypassed,
      });
      this.meterCounter = 0;
      this.meterInSq = 0;
      this.meterOutSq = 0;
      this.meterSamples = 0;
      this.meterMinGain = 1;
    }

    return true;
  }
}

registerProcessor("${SIQ_PRE_PROCESSOR_ID}", SiqPreConditionerProcessor);
registerProcessor("${SIQ_POST_PROCESSOR_ID}", SiqPostMasteringProcessor);
registerProcessor("${SIQ_WORKLET_PROCESSOR_ID}", SiqVoiceStudioProcessor);
`;
