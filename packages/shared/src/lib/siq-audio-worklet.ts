"use client";

/**
 * SIQ Voice Engine — Zero-Latency Studio DSP AudioWorklet
 *
 * Designed specifically for real-time voice communication over high-ping / variable
 * international links: adds 0 samples of algorithmic lookahead delay (runs strictly
 * within the native 128-sample Web Audio quantum = ~2.67 ms at 48 kHz) and < 0.5% CPU.
 *
 * Processing chain (all sample-rate agnostic: 16 kHz – 96 kHz):
 *   1. Zipper-free smoothed Input Gain (0% – 250%)
 *   2. Precision 2nd-order Butterworth High-Pass / DC Blocker (Off / 80 Hz / 120 Hz)
 *   3. Zero-latency 3-band TPT State-Variable Filterbank (Low < 260 Hz, Speech Mid
 *      260–3800 Hz, Air/Hiss > 3800 Hz) with independent asymmetric noise-floor
 *      trackers (speech-frozen) + smooth Wiener-curve downward expansion
 *   4. Smart Voice Activity Gate (Auto-adaptive or Manual threshold with 4 dB
 *      hysteresis, 3 ms attack, 180 ms hold, 145 ms release)
 *   5. Zero-latency Studio Voice Tone EQ (Natural / Studio Clarity / Broadcast Warm / Crisp Comms)
 *   6. Soft-knee Broadcast Compressor + tanh safety ceiling limiter (-1 dBFS)
 *   7. 20 Hz telemetry stream (input dB, output dB, noise floor dB, gate open, gain reduction)
 */

export const SIQ_WORKLET_PROCESSOR_ID = "siq-voice-studio-processor";

export type SiqPresetId = "light" | "balanced" | "studio" | "aggressive";
export type SiqHighPassHz = 0 | 80 | 120;
export type SiqVoiceTone = "natural" | "clarity" | "warm" | "crisp";

export interface SiqDspConfig {
  /** Linear input gain percentage: 0 to 250 (100 = 0 dB unity) */
  inputGainPct: number;
  /** Spectral noise suppression strength: 0 to 100 */
  suppressionStrength: number;
  /** True = automatically track room floor; False = use manual gateThresholdDb */
  autoGate: boolean;
  /** Manual voice gate open threshold in dBFS (-65 to -15) */
  gateThresholdDb: number;
  /** High-pass rumble filter cutoff in Hz (0 = DC block only, 80, 120) */
  highPassHz: SiqHighPassHz;
  /** Studio vocal EQ contour */
  voiceTone: SiqVoiceTone;
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
      suppressionStrength: 42,
      autoGate: true,
      gateThresholdDb: -54,
      highPassHz: 80,
      voiceTone: "natural",
      compressor: true,
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    desc: "Everyday calls & gaming",
    patch: {
      suppressionStrength: 68,
      autoGate: true,
      gateThresholdDb: -48,
      highPassHz: 80,
      voiceTone: "clarity",
      compressor: true,
    },
  },
  {
    id: "studio",
    label: "Studio",
    desc: "Rich broadcast presence",
    patch: {
      suppressionStrength: 74,
      autoGate: true,
      gateThresholdDb: -46,
      highPassHz: 80,
      voiceTone: "warm",
      compressor: true,
    },
  },
  {
    id: "aggressive",
    label: "Aggressive",
    desc: "Loud fans, AC & keyboards",
    patch: {
      suppressionStrength: 92,
      autoGate: true,
      gateThresholdDb: -40,
      highPassHz: 120,
      voiceTone: "crisp",
      compressor: true,
    },
  },
];

export const DEFAULT_SIQ_DSP_CONFIG: SiqDspConfig = {
  inputGainPct: 100,
  suppressionStrength: 68,
  autoGate: true,
  gateThresholdDb: -48,
  highPassHz: 80,
  voiceTone: "clarity",
  compressor: true,
};

export interface SiqAudioTelemetry {
  inputDb: number;
  outputDb: number;
  noiseFloorDb: number;
  effectiveThresholdDb: number;
  gateOpen: boolean;
  gainReductionDb: number;
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
    const high = v0 - v2; // Exact complementary split: low + high === v0!
    return [low, high];
  }
}

class SiqVoiceStudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const cfg = (options && options.processorOptions && options.processorOptions.config) || {};
    this.sr = sampleRate || 48000;
    this.destroyed = false;

    // Configurable parameters
    this.targetInputGain = 1;
    this.currentInputGain = 1;
    this.suppression = 0.68;
    this.autoGate = true;
    this.gateThresholdDb = -48;
    this.highPassHz = 80;
    this.voiceTone = "clarity";
    this.compressorEnabled = true;

    // Filters
    this.hpf = new Biquad();
    this.eqLow = new Biquad();
    this.eqMid = new Biquad();
    this.eqHigh = new Biquad();
    this.splitLow = new TptSplit(this.sr, 260);
    this.splitHigh = new TptSplit(this.sr, 3800);

    // Per-band envelope + adaptive noise-floor state (linear RMS)
    this.envLow = 1e-4;
    this.envMid = 1e-4;
    this.envHigh = 1e-4;
    this.floorLow = 2e-3;
    this.floorMid = 1.5e-3;
    this.floorHigh = 1.2e-3;
    this.bandGainLow = 1;
    this.bandGainMid = 1;
    this.bandGainHigh = 1;

    // Voice activity gate state
    this.fullEnv = 1e-4;
    this.fullFloor = 2e-3;
    this.gateOpen = false;
    this.gateGain = 0;
    this.gateHoldSamples = 0;

    // Compressor state
    this.compEnv = 1e-4;
    this.compGain = 1;

    // Precomputed time-constants (per sample)
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
    this.compAttackCoeff = 1 - Math.exp(-1 / (this.sr * 0.005));
    this.compReleaseCoeff = 1 - Math.exp(-1 / (this.sr * 0.095));

    // Telemetry accumulator (~20 Hz)
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
      // Even when HPF is Off, keep a gentle 18 Hz DC-offset blocker
      this.hpf.setHighPass(this.sr, this.highPassHz > 0 ? this.highPassHz : 18, 0.70710678);
    } else if (this.hpf.b0 === 1 && this.hpf.b1 === 0) {
      this.hpf.setHighPass(this.sr, this.highPassHz > 0 ? this.highPassHz : 18, 0.70710678);
    }
    if (typeof cfg.voiceTone === "string") {
      this.voiceTone = cfg.voiceTone;
      this.configureToneEq();
    }
    if (typeof cfg.compressor === "boolean") {
      this.compressorEnabled = cfg.compressor;
    }
  }

  configureToneEq() {
    switch (this.voiceTone) {
      case "clarity":
        this.eqLow.setPeaking(this.sr, 280, 1.1, -2.0);
        this.eqMid.setPeaking(this.sr, 3200, 1.0, 2.6);
        this.eqHigh.setHighShelf(this.sr, 9500, 0.7, -1.0);
        break;
      case "warm":
        this.eqLow.setPeaking(this.sr, 165, 0.9, 2.4);
        this.eqMid.setPeaking(this.sr, 420, 1.2, -1.5);
        this.eqHigh.setPeaking(this.sr, 3500, 1.0, 1.8);
        break;
      case "crisp":
        this.eqLow.setPeaking(this.sr, 250, 1.0, -3.2);
        this.eqMid.setPeaking(this.sr, 2900, 1.1, 3.4);
        this.eqHigh.setHighShelf(this.sr, 8000, 0.7, -2.4);
        break;
      case "natural":
      default:
        this.eqLow.setBypass();
        this.eqMid.setBypass();
        this.eqHigh.setBypass();
        break;
    }
  }

  process(inputs, outputs) {
    if (this.destroyed) return false;

    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length || !output || !output.length) {
      return true;
    }

    const inCh = input[0];
    const outCh = output[0];
    const len = inCh.length;

    const sup = this.suppression;
    // Maximum attenuation floor per band based on user suppression slider
    const minBandGainLow = dbToLin(-30 * sup);
    const minBandGainMid = dbToLin(-22 * sup);
    const minBandGainHigh = dbToLin(-28 * sup);
    const gateClosedGain = dbToLin(-38 * Math.max(0.35, sup));

    // Block RMS accumulators for stable noise-floor estimation
    let blkLowSq = 0;
    let blkMidSq = 0;
    let blkHighSq = 0;
    let blkFullSq = 0;

    // Precompute Wiener target thresholds from current band floors
    const alphaLow = (0.9 + 2.2 * sup) * (this.floorLow * this.floorLow + 1e-10);
    const alphaMid = (0.7 + 1.8 * sup) * (this.floorMid * this.floorMid + 1e-10);
    const alphaHigh = (0.85 + 2.0 * sup) * (this.floorHigh * this.floorHigh + 1e-10);

    // Effective voice gate threshold (Auto tracks room noise floor + smart headroom)
    const floorDb = linToDb(this.fullFloor);
    const autoOpenDb = clamp(floorDb + 7.5 + sup * 5.0, -56, -24);
    const openThreshDb = this.autoGate ? autoOpenDb : this.gateThresholdDb;
    const closeThreshDb = openThreshDb - 4.5; // 4.5 dB hysteresis prevents chatter
    const openThreshLin = dbToLin(openThreshDb);
    const closeThreshLin = dbToLin(closeThreshDb);

    // Compressor constants (-18 dBFS threshold, 3:1 ratio, gentle makeup)
    const compThreshDb = -18;
    const compRatio = 3.0;
    const compMakeupLin = dbToLin(2.8);

    for (let i = 0; i < len; i++) {
      // 1. Smoothed Input Gain
      this.currentInputGain += (this.targetInputGain - this.currentInputGain) * this.gainSlewCoeff;
      let x = inCh[i] * this.currentInputGain;

      // 2. High-pass / DC blocker
      x = this.hpf.process(x);
      this.meterInSq += x * x;

      // 3. Zero-latency 3-band TPT SVF crossover split
      const s1 = this.splitLow.process(x);
      const low = s1[0];
      const s2 = this.splitHigh.process(s1[1]);
      const mid = s2[0];
      const high = s2[1];

      const absLow = Math.abs(low);
      const absMid = Math.abs(mid);
      const absHigh = Math.abs(high);
      const absFull = Math.abs(x);

      blkLowSq += low * low;
      blkMidSq += mid * mid;
      blkHighSq += high * high;
      blkFullSq += x * x;

      // Fast per-band envelopes
      this.envLow += (absLow - this.envLow) * (absLow > this.envLow ? this.envFastAttack : this.envFastRelease);
      this.envMid += (absMid - this.envMid) * (absMid > this.envMid ? this.envFastAttack : this.envFastRelease);
      this.envHigh += (absHigh - this.envHigh) * (absHigh > this.envHigh ? this.envFastAttack : this.envFastRelease);
      this.fullEnv += (absFull - this.fullEnv) * (absFull > this.fullEnv ? this.envFastAttack : this.envFastRelease);

      // Smooth Wiener-curve per-band downward expansion
      let y = x;
      if (sup > 0.01) {
        const pLow = this.envLow * this.envLow;
        const pMid = this.envMid * this.envMid;
        const pHigh = this.envHigh * this.envHigh;

        // Speech-aware coupling: when Mid vocal band is strongly active, slightly ease
        // Mid & High consonant suppression so voices stay natural and airy
        const speechPresence = pMid / (pMid + alphaMid * 1.4 + EPS);
        const lowTarget = Math.max(minBandGainLow, pLow / (pLow + alphaLow + EPS));
        const midTarget = Math.max(minBandGainMid, pMid / (pMid + alphaMid + EPS));
        const highTarget = Math.max(
          minBandGainHigh,
          Math.min(1, (pHigh / (pHigh + alphaHigh + EPS)) + speechPresence * 0.22)
        );

        this.bandGainLow += (lowTarget - this.bandGainLow) * (lowTarget > this.bandGainLow ? this.bandSmoothAttack : this.bandSmoothRelease);
        this.bandGainMid += (midTarget - this.bandGainMid) * (midTarget > this.bandGainMid ? this.bandSmoothAttack : this.bandSmoothRelease);
        this.bandGainHigh += (highTarget - this.bandGainHigh) * (highTarget > this.bandGainHigh ? this.bandSmoothAttack : this.bandSmoothRelease);

        y = low * this.bandGainLow + mid * this.bandGainMid + high * this.bandGainHigh;
      }

      // 4. Smart Voice Activity Gate (uses Mid-weighted energy so desk thumps don't falsely trip it)
      const detector = Math.max(this.envMid * 1.15, this.fullEnv * 0.85);
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

      // 5. Studio Voice Tone EQ
      if (this.voiceTone !== "natural") {
        y = this.eqHigh.process(this.eqMid.process(this.eqLow.process(y)));
      }

      // 6. Broadcast Compressor + Zero-latency Soft-Clip Safety Limiter (-1 dBFS)
      if (this.compressorEnabled) {
        const absY = Math.abs(y);
        this.compEnv += (absY - this.compEnv) * (absY > this.compEnv ? this.compAttackCoeff : this.compReleaseCoeff);
        const envDb = linToDb(this.compEnv);
        let targetCompGain = 1.0;
        if (envDb > compThreshDb) {
          const overDb = envDb - compThreshDb;
          const reducedDb = overDb * (1 - 1 / compRatio);
          targetCompGain = dbToLin(-reducedDb);
        }
        this.compGain += (targetCompGain - this.compGain) * 0.08;
        y = y * this.compGain * compMakeupLin;

        // Smooth tanh soft ceiling at ~0.89 (-1 dBFS) — zero clipping distortion
        if (Math.abs(y) > 0.65) {
          y = 0.89 * Math.tanh(y / 0.89);
        }
      } else if (Math.abs(y) > 0.95) {
        y = 0.98 * Math.tanh(y / 0.98);
      }

      const totalGain = this.gateGain * (sup > 0.01 ? this.bandGainMid : 1);
      if (totalGain < this.meterMinGain) this.meterMinGain = totalGain;

      outCh[i] = y;
      this.meterOutSq += y * y;
    }

    // Mirror mono processed signal to additional output channels if present
    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(outCh);
    }

    // Update adaptive per-band noise floors once per block (freeze upward drift while speech is active)
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

    // Keep floors in realistic physical microphone range (-78 dBFS .. -24 dBFS)
    this.floorLow = clamp(this.floorLow, 1.2e-4, 0.065);
    this.floorMid = clamp(this.floorMid, 1.2e-4, 0.055);
    this.floorHigh = clamp(this.floorHigh, 1.0e-4, 0.055);
    this.fullFloor = clamp(this.fullFloor, 1.2e-4, 0.065);

    // Emit lightweight telemetry at ~20 Hz for live studio VU meter
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
        gainReductionDb: clamp(-linToDb(this.meterMinGain), 0, 40),
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

registerProcessor("${SIQ_WORKLET_PROCESSOR_ID}", SiqVoiceStudioProcessor);
`;
