"use client";

import type { GtcrnWorkletNode, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import type { AudioProcessorOptions, Room, Track, TrackProcessor } from "livekit-client";
import {
  DEFAULT_SIQ_DSP_CONFIG,
  SIQ_POST_PROCESSOR_ID,
  SIQ_PRE_PROCESSOR_ID,
  SIQ_WORKLET_PROCESSOR_ID,
  SIQ_WORKLET_SOURCE,
  suppressionPctToAttenLimDb,
  type SiqAiEngine,
  type SiqAudioTelemetry,
  type SiqDspConfig,
} from "./siq-audio-worklet";

export type NoiseCancellationMode = "siq" | "krisp" | "gtcrn" | "rnnoise" | "standard" | "off";

type WebWasmMode = "rnnoise" | "gtcrn";
type WorkletKey = WebWasmMode | "siq" | "df3";

export interface LiveConfigurableAudioProcessor
  extends TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  updateSiqConfig?: (config: SiqDspConfig) => void;
  setInputGainPct?: (gainPct: number) => void;
  setBypass?: (bypassed: boolean) => void;
  setTelemetryListener?: (listener: ((telemetry: SiqAudioTelemetry) => void) | null) => void;
  /** Actual sub-engine currently running inside SIQ AI (after any runtime fallback) */
  activeSiqEngine?: SiqAiEngine;
  /** Optional fallback message if a heavier neural tier stepped down during init */
  fallbackNotice?: string | null;
  onPublish?: (room: Room) => Promise<void>;
}

const DF3_PROCESSOR_ID = "deepfilternet-processor";

const loadedWorkletContexts = new WeakMap<AudioContext, Set<WorkletKey>>();
const workletSourceCache = new Map<Exclude<WorkletKey, "siq">, string>();
let cachedRnnoiseWasm: ArrayBuffer | null = null;
let cachedGtcrnWasm: ArrayBuffer | null = null;
let cachedDf3WasmModule: WebAssembly.Module | null = null;
let pendingDf3WasmModule: Promise<WebAssembly.Module> | null = null;

function isValidWasmBinary(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 8) return false;
  const header = new Uint8Array(buf, 0, 4);
  // Standard WebAssembly binary magic number: \0asm
  return header[0] === 0x00 && header[1] === 0x61 && header[2] === 0x73 && header[3] === 0x6d;
}

async function addWorkletModuleFromBlob(ctx: AudioContext, source: string): Promise<void> {
  const blob = new Blob([source], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  try {
    await ctx.audioWorklet.addModule(blobUrl);
  } finally {
    // Give WebView2/Chromium a tick to finish parsing before revoking
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  }
}

async function fetchTextVerified(url: string): Promise<string> {
  const resolved =
    typeof window !== "undefined" ? new URL(url, window.location.origin).href : url;
  const res = await fetch(resolved, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Failed to fetch audio worklet (${res.status}): ${url}`);
  }
  const text = await res.text();
  if (!text || text.trimStart().startsWith("<")) {
    throw new Error(`Invalid audio worklet response (HTML returned instead of JS): ${url}`);
  }
  return text;
}

async function fetchWasmVerified(url: string): Promise<ArrayBuffer> {
  const resolved =
    typeof window !== "undefined" ? new URL(url, window.location.origin).href : url;
  const res = await fetch(resolved, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Failed to fetch WASM model (${res.status}): ${url}`);
  }
  const buf = await res.arrayBuffer();
  if (!isValidWasmBinary(buf)) {
    throw new Error(`Corrupted or non-WASM payload received for ${url}`);
  }
  return buf;
}

async function supportsWasmSimd(): Promise<boolean> {
  try {
    return WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
        253, 15, 253, 98, 11,
      ])
    );
  } catch {
    return false;
  }
}

async function ensureWorkletModule(ctx: AudioContext, key: WorkletKey): Promise<void> {
  if (!ctx.audioWorklet) {
    throw new Error("AudioWorklet is not available in this context.");
  }

  let set = loadedWorkletContexts.get(ctx);
  if (!set) {
    set = new Set();
    loadedWorkletContexts.set(ctx, set);
  }
  if (set.has(key)) return;

  if (key === "siq") {
    await addWorkletModuleFromBlob(ctx, SIQ_WORKLET_SOURCE);
    set.add(key);
    return;
  }

  const path =
    key === "rnnoise"
      ? "/audio-worklets/rnnoise-worklet.js"
      : key === "gtcrn"
        ? "/audio-worklets/gtcrn-worklet.js"
        : "/audio-worklets/df3-worklet.js";

  // Prefer fetching text + loading via Blob URL so the AudioWorklet reliably inherits
  // the document's 'wasm-unsafe-eval' CSP on Tauri WebView2 custom schemes (tauri.localhost),
  // with direct URL loading as fallback.
  try {
    let source = workletSourceCache.get(key);
    if (!source) {
      source = await fetchTextVerified(path);
      workletSourceCache.set(key, source);
    }
    await addWorkletModuleFromBlob(ctx, source);
  } catch (blobErr) {
    try {
      const resolved =
        typeof window !== "undefined" ? new URL(path, window.location.origin).href : path;
      await ctx.audioWorklet.addModule(resolved);
    } catch {
      throw blobErr;
    }
  }

  set.add(key);
}

async function getWasmBinary(mode: WebWasmMode): Promise<ArrayBuffer> {
  if (mode === "rnnoise") {
    if (!cachedRnnoiseWasm) {
      const useSimd = await supportsWasmSimd();
      try {
        cachedRnnoiseWasm = await fetchWasmVerified(
          useSimd ? "/audio-worklets/rnnoise_simd.wasm" : "/audio-worklets/rnnoise.wasm"
        );
      } catch {
        cachedRnnoiseWasm = await fetchWasmVerified("/audio-worklets/rnnoise.wasm");
      }
    }
    return cachedRnnoiseWasm;
  }

  if (!cachedGtcrnWasm) {
    cachedGtcrnWasm = await fetchWasmVerified("/audio-worklets/gtcrn.wasm");
  }
  return cachedGtcrnWasm;
}

async function getDf3WasmModule(): Promise<WebAssembly.Module> {
  if (cachedDf3WasmModule) return cachedDf3WasmModule;
  if (!pendingDf3WasmModule) {
    pendingDf3WasmModule = (async () => {
      const simd = await supportsWasmSimd();
      if (!simd) {
        throw new Error("WebAssembly SIMD is required for SIQ Ultra AI (DeepFilterNet3).");
      }
      const bytes = await fetchWasmVerified("/audio-worklets/df3.wasm");
      const mod = await WebAssembly.compile(bytes);
      cachedDf3WasmModule = mod;
      return mod;
    })().finally(() => {
      pendingDf3WasmModule = null;
    });
  }
  return pendingDf3WasmModule;
}

function create48kAudioContextIfNeeded(baseCtx: AudioContext): {
  ctx: AudioContext;
  owned: boolean;
} {
  if (baseCtx.sampleRate === 48000 || typeof window === "undefined") {
    return { ctx: baseCtx, owned: false };
  }
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    return {
      ctx: new AudioCtx({ sampleRate: 48000, latencyHint: "interactive" }),
      owned: true,
    };
  } catch {
    return { ctx: baseCtx, owned: false };
  }
}

function waitForWorkletReady(node: AudioWorkletNode, timeoutMs = 4500): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      node.port.onmessage = null;
      reject(new Error("Timed out initializing DeepFilterNet3 WASM processor."));
    }, timeoutMs);

    node.port.onmessage = (event) => {
      if (settled) return;
      const msg = event.data;
      if (!msg) return;
      if (msg.type === "ready") {
        settled = true;
        clearTimeout(timer);
        node.port.onmessage = null;
        resolve();
      } else if (msg.type === "error") {
        settled = true;
        clearTimeout(timer);
        node.port.onmessage = null;
        reject(new Error(msg.message || "DeepFilterNet3 WASM init failed."));
      }
    };
  });
}

/**
 * SIQ AI Engine v2 — Unified Hybrid Neural + Broadcast Studio TrackProcessor.
 *
 * Supports three local tiers under one unified studio console:
 *  - "ultra": Pre-HPF/Gain -> DeepFilterNet3 (48 kHz Full-Band WASM SIMD) -> Post-Mastering + Smart Gate
 *  - "fast":  Pre-HPF/Gain -> GTCRN WASM + 480-sample aligned High-Band Air Recovery -> Post-Mastering + Smart Gate
 *  - "pure":  Zero-latency (~2.67 ms) 3-band TPT SVF Studio DSP + Mastering
 *
 * Automatically steps down (ultra -> fast -> pure) if a neural tier cannot initialize
 * on the current runtime, ensuring voice never drops.
 */
export class SiqAiTrackProcessor implements LiveConfigurableAudioProcessor {
  readonly name = "siq-ai-voice-processor";
  processedTrack?: MediaStreamTrack;
  activeSiqEngine: SiqAiEngine;
  fallbackNotice: string | null = null;

  private config: SiqDspConfig;
  private bypassed = false;
  private audioContext: AudioContext | null = null;
  private ownsAudioContext = false;

  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private preNode: AudioWorkletNode | null = null;
  private df3Node: AudioWorkletNode | null = null;
  private gtcrnNode: GtcrnWorkletNode | null = null;
  private postNode: AudioWorkletNode | null = null;
  private pureNode: AudioWorkletNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private telemetryListener: ((telemetry: SiqAudioTelemetry) => void) | null = null;

  constructor(initialConfig: SiqDspConfig = DEFAULT_SIQ_DSP_CONFIG) {
    this.config = { ...DEFAULT_SIQ_DSP_CONFIG, ...initialConfig };
    this.activeSiqEngine = this.config.aiEngine;
  }

  setTelemetryListener(listener: ((telemetry: SiqAudioTelemetry) => void) | null): void {
    this.telemetryListener = listener;
  }

  setBypass(bypassed: boolean): void {
    this.bypassed = bypassed;
    this.postNode?.port.postMessage({ type: "bypass", value: bypassed });
    this.pureNode?.port.postMessage({ type: "bypass", value: bypassed });
  }

  updateSiqConfig(config: SiqDspConfig): void {
    this.config = { ...DEFAULT_SIQ_DSP_CONFIG, ...config };
    this.preNode?.port.postMessage({ type: "config", config: this.config });
    this.postNode?.port.postMessage({ type: "config", config: this.config });
    this.pureNode?.port.postMessage({ type: "config", config: this.config });

    if (this.df3Node) {
      const attenDb = suppressionPctToAttenLimDb(this.config.suppressionStrength);
      this.df3Node.port.postMessage({ type: "setEnabled", value: attenDb > 0 });
      if (attenDb > 0) {
        this.df3Node.port.postMessage({ type: "setAttenuationLimit", value: attenDb });
      }
    }
  }

  setInputGainPct(gainPct: number): void {
    this.config = { ...this.config, inputGainPct: gainPct };
    this.preNode?.port.postMessage({ type: "config", config: this.config });
    this.pureNode?.port.postMessage({ type: "config", config: this.config });
  }

  private bindTelemetry(node: AudioWorkletNode): void {
    node.port.onmessage = (event) => {
      const data = event.data;
      if (data && data.type === "telemetry" && this.telemetryListener) {
        this.telemetryListener({
          inputDb: data.inputDb,
          outputDb: data.outputDb,
          noiseFloorDb: data.noiseFloorDb,
          effectiveThresholdDb: data.effectiveThresholdDb,
          gateOpen: data.gateOpen,
          gainReductionDb: data.gainReductionDb,
          aiNoiseReductionDb: data.aiNoiseReductionDb,
          bypassed: data.bypassed,
        });
      }
    };
  }

  private async teardownNodesOnly(): Promise<void> {
    try {
      this.preNode?.port.postMessage({ type: "destroy" });
      this.df3Node?.port.postMessage({ type: "destroy" });
      this.postNode?.port.postMessage({ type: "destroy" });
      this.pureNode?.port.postMessage({ type: "destroy" });
      if (this.postNode) this.postNode.port.onmessage = null;
      if (this.pureNode) this.pureNode.port.onmessage = null;
      if (this.df3Node) this.df3Node.port.onmessage = null;

      this.sourceNode?.disconnect();
      this.preNode?.disconnect();
      this.df3Node?.disconnect();
      this.gtcrnNode?.disconnect();
      this.gtcrnNode?.destroy();
      this.postNode?.disconnect();
      this.pureNode?.disconnect();
      this.destinationNode?.disconnect();
    } catch {
      // ignore teardown errors
    }

    this.sourceNode = null;
    this.preNode = null;
    this.df3Node = null;
    this.gtcrnNode = null;
    this.postNode = null;
    this.pureNode = null;
    this.destinationNode = null;
    this.processedTrack = undefined;
  }

  private async initUltra(ctx: AudioContext, track: MediaStreamTrack): Promise<void> {
    const [wasmModule] = await Promise.all([
      getDf3WasmModule(),
      ensureWorkletModule(ctx, "df3"),
      ensureWorkletModule(ctx, "siq"),
    ]);

    const attenDb = suppressionPctToAttenLimDb(this.config.suppressionStrength);
    const df3 = new AudioWorkletNode(ctx, DF3_PROCESSOR_ID, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      processorOptions: {
        wasmModule,
        attenuationLimit: attenDb > 0 ? attenDb : 100,
        postFilterBeta: 0.02,
      },
    });
    this.df3Node = df3;

    await waitForWorkletReady(df3);
    if (attenDb <= 0) {
      df3.port.postMessage({ type: "setEnabled", value: false });
    }

    const stream = new MediaStream([track]);
    this.sourceNode = ctx.createMediaStreamSource(stream);
    this.destinationNode = ctx.createMediaStreamDestination();

    this.preNode = new AudioWorkletNode(ctx, SIQ_PRE_PROCESSOR_ID, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { config: this.config },
    });

    this.postNode = new AudioWorkletNode(ctx, SIQ_POST_PROCESSOR_ID, {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        config: this.config,
        enableAirRecovery: false,
        dryDelaySamples: 0,
        useWetMixControl: false,
      },
    });
    this.bindTelemetry(this.postNode);
    if (this.bypassed) {
      this.postNode.port.postMessage({ type: "bypass", value: true });
    }

    // Graph: Source -> Pre (Gain + HPF) -> DF3 -> Post (input 0) -> Dest
    //                                   \-------> Post (input 1: dry telemetry + A/B bypass)
    this.sourceNode.connect(this.preNode);
    this.preNode.connect(df3);
    df3.connect(this.postNode, 0, 0);
    this.preNode.connect(this.postNode, 0, 1);
    this.postNode.connect(this.destinationNode);

    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
    this.activeSiqEngine = "ultra";
  }

  private async initFast(ctx: AudioContext, track: MediaStreamTrack): Promise<void> {
    const [worklets, wasmBinary] = await Promise.all([
      import("@sapphi-red/web-noise-suppressor"),
      getWasmBinary("gtcrn"),
      ensureWorkletModule(ctx, "gtcrn"),
      ensureWorkletModule(ctx, "siq"),
    ]);

    const stream = new MediaStream([track]);
    this.sourceNode = ctx.createMediaStreamSource(stream);
    this.destinationNode = ctx.createMediaStreamDestination();

    this.preNode = new AudioWorkletNode(ctx, SIQ_PRE_PROCESSOR_ID, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { config: this.config },
    });

    const binaryCopy = wasmBinary.slice(0);
    this.gtcrnNode = new worklets.GtcrnWorkletNode(ctx, {
      maxChannels: 1,
      wasmBinary: binaryCopy,
    });

    // GTCRN runs 480-sample (10 ms @ 48 kHz) frames at 16 kHz internal bandwidth.
    // Delay-align dry reference by 480 samples so speech-gated High-Band Air Recovery
    // (>7.6 kHz) and suppression wet-mix have zero comb filtering.
    this.postNode = new AudioWorkletNode(ctx, SIQ_POST_PROCESSOR_ID, {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        config: this.config,
        enableAirRecovery: true,
        dryDelaySamples: 480,
        useWetMixControl: true,
      },
    });
    this.bindTelemetry(this.postNode);
    if (this.bypassed) {
      this.postNode.port.postMessage({ type: "bypass", value: true });
    }

    this.sourceNode.connect(this.preNode);
    this.preNode.connect(this.gtcrnNode);
    this.gtcrnNode.connect(this.postNode, 0, 0);
    this.preNode.connect(this.postNode, 0, 1);
    this.postNode.connect(this.destinationNode);

    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
    this.activeSiqEngine = "fast";
  }

  private async initPure(ctx: AudioContext, track: MediaStreamTrack): Promise<void> {
    await ensureWorkletModule(ctx, "siq");

    const stream = new MediaStream([track]);
    this.sourceNode = ctx.createMediaStreamSource(stream);
    this.destinationNode = ctx.createMediaStreamDestination();

    this.pureNode = new AudioWorkletNode(ctx, SIQ_WORKLET_PROCESSOR_ID, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { config: this.config },
    });
    this.bindTelemetry(this.pureNode);
    if (this.bypassed) {
      this.pureNode.port.postMessage({ type: "bypass", value: true });
    }

    this.sourceNode.connect(this.pureNode);
    this.pureNode.connect(this.destinationNode);
    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
    this.activeSiqEngine = "pure";
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    this.fallbackNotice = null;
    const requested = this.config.aiEngine ?? "ultra";

    // Neural tiers (DeepFilterNet3 & GTCRN) require a 48 kHz AudioContext.
    const needs48k = requested === "ultra" || requested === "fast";
    const resolved = needs48k
      ? create48kAudioContextIfNeeded(opts.audioContext)
      : { ctx: opts.audioContext, owned: false };

    const ctx = resolved.ctx;
    this.audioContext = ctx;
    this.ownsAudioContext = resolved.owned;

    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }

    if (requested === "ultra") {
      try {
        await this.initUltra(ctx, opts.track);
        return;
      } catch (ultraErr) {
        console.warn("[siq-ai] Ultra (DeepFilterNet3) init failed, falling back to Fast AI:", ultraErr);
        await this.teardownNodesOnly();
        try {
          await this.initFast(ctx, opts.track);
          this.fallbackNotice = "SIQ Ultra AI unavailable on this runtime; switched to SIQ Fast AI.";
          return;
        } catch (fastErr) {
          console.warn("[siq-ai] Fast AI fallback failed, falling back to Studio Pure:", fastErr);
          await this.teardownNodesOnly();
          await this.initPure(ctx, opts.track);
          this.fallbackNotice = "SIQ Neural WASM unavailable; switched to SIQ Studio Pure DSP.";
          return;
        }
      }
    }

    if (requested === "fast") {
      try {
        await this.initFast(ctx, opts.track);
        return;
      } catch (fastErr) {
        console.warn("[siq-ai] Fast AI (GTCRN) init failed, falling back to Studio Pure:", fastErr);
        await this.teardownNodesOnly();
        await this.initPure(ctx, opts.track);
        this.fallbackNotice = "SIQ Fast AI unavailable; switched to SIQ Studio Pure DSP.";
        return;
      }
    }

    await this.initPure(ctx, opts.track);
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    await this.teardownNodesOnly();
    try {
      if (this.ownsAudioContext && this.audioContext && this.audioContext.state !== "closed") {
        await this.audioContext.close().catch(() => {});
      }
    } catch {
      // ignore close errors
    }
    this.audioContext = null;
    this.ownsAudioContext = false;
  }
}

/** Backward-compatible alias for pure/hybrid SIQ processor imports */
export class SiqVoiceTrackProcessor extends SiqAiTrackProcessor {}

/**
 * LiveKit TrackProcessor wrapping standalone @sapphi-red/web-noise-suppressor (RNNoise or GTCRN WASM)
 * with WebView2-safe Blob module loading, automatic 48 kHz context guarantee, and
 * real-time zero-latency input gain control.
 */
export class WasmNoiseTrackProcessor implements LiveConfigurableAudioProcessor {
  readonly name: string;
  readonly mode: WebWasmMode;
  processedTrack?: MediaStreamTrack;

  private inputGainPct: number;
  private audioContext: AudioContext | null = null;
  private ownsAudioContext = false;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private workletNode: RnnoiseWorkletNode | GtcrnWorkletNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  constructor(mode: WebWasmMode, inputGainPct = 100) {
    this.mode = mode;
    this.inputGainPct = inputGainPct;
    this.name = `siq-${mode}-noise-processor`;
  }

  setInputGainPct(gainPct: number): void {
    this.inputGainPct = gainPct;
    if (this.gainNode && this.audioContext) {
      const target = Math.max(0, Math.min(2.5, gainPct / 100));
      this.gainNode.gain.setTargetAtTime(target, this.audioContext.currentTime, 0.015);
    }
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    const resolved = create48kAudioContextIfNeeded(opts.audioContext);
    const ctx = resolved.ctx;
    this.audioContext = ctx;
    this.ownsAudioContext = resolved.owned;
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }

    const worklets = await import("@sapphi-red/web-noise-suppressor");
    const [wasmBinary] = await Promise.all([
      getWasmBinary(this.mode),
      ensureWorkletModule(ctx, this.mode),
    ]);

    const stream = new MediaStream([opts.track]);
    this.sourceNode = ctx.createMediaStreamSource(stream);
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = Math.max(0, Math.min(2.5, this.inputGainPct / 100));
    this.destinationNode = ctx.createMediaStreamDestination();

    const binaryCopy = wasmBinary.slice(0);
    this.workletNode =
      this.mode === "rnnoise"
        ? new worklets.RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: binaryCopy })
        : new worklets.GtcrnWorkletNode(ctx, { maxChannels: 1, wasmBinary: binaryCopy });

    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.workletNode);
    this.workletNode.connect(this.destinationNode);

    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    try {
      this.sourceNode?.disconnect();
      this.gainNode?.disconnect();
      this.workletNode?.disconnect();
      this.workletNode?.destroy();
      this.destinationNode?.disconnect();
      if (this.ownsAudioContext && this.audioContext && this.audioContext.state !== "closed") {
        await this.audioContext.close().catch(() => {});
      }
    } catch {
      // ignore teardown errors
    }
    this.sourceNode = null;
    this.gainNode = null;
    this.workletNode = null;
    this.destinationNode = null;
    this.processedTrack = undefined;
    this.audioContext = null;
    this.ownsAudioContext = false;
  }
}

/**
 * Featherweight zero-latency Input Gain processor used when user selects Standard or Off
 * with custom microphone gain != 100%.
 */
export class InputGainTrackProcessor implements LiveConfigurableAudioProcessor {
  readonly name = "siq-input-gain-processor";
  processedTrack?: MediaStreamTrack;

  private inputGainPct: number;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  constructor(inputGainPct = 100) {
    this.inputGainPct = inputGainPct;
  }

  setInputGainPct(gainPct: number): void {
    this.inputGainPct = gainPct;
    if (this.gainNode && this.audioContext) {
      const target = Math.max(0, Math.min(2.5, gainPct / 100));
      this.gainNode.gain.setTargetAtTime(target, this.audioContext.currentTime, 0.015);
    }
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    const ctx = opts.audioContext;
    this.audioContext = ctx;
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }

    const stream = new MediaStream([opts.track]);
    this.sourceNode = ctx.createMediaStreamSource(stream);
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = Math.max(0, Math.min(2.5, this.inputGainPct / 100));
    this.destinationNode = ctx.createMediaStreamDestination();

    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.destinationNode);
    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    try {
      this.sourceNode?.disconnect();
      this.gainNode?.disconnect();
      this.destinationNode?.disconnect();
    } catch {
      // ignore teardown errors
    }
    this.sourceNode = null;
    this.gainNode = null;
    this.destinationNode = null;
    this.processedTrack = undefined;
    this.audioContext = null;
  }
}

/**
 * Wraps KrispNoiseFilter with a zero-latency post-GainNode so Input Gain sliders
 * work live even when Krisp AI is active, while forwarding onPublish to Krisp.
 */
class KrispWithGainTrackProcessor implements LiveConfigurableAudioProcessor {
  readonly name = "livekit-noise-filter";
  processedTrack?: MediaStreamTrack;

  private inner: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> & {
    onPublish?: (room: Room) => Promise<void>;
  };
  private inputGainPct: number;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  constructor(
    inner: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> & {
      onPublish?: (room: Room) => Promise<void>;
    },
    inputGainPct = 100
  ) {
    this.inner = inner;
    this.inputGainPct = inputGainPct;
  }

  setInputGainPct(gainPct: number): void {
    this.inputGainPct = gainPct;
    if (this.gainNode && this.audioContext) {
      const target = Math.max(0, Math.min(2.5, gainPct / 100));
      this.gainNode.gain.setTargetAtTime(target, this.audioContext.currentTime, 0.015);
    }
  }

  private attachGainStage(ctx: AudioContext): void {
    if (!this.inner.processedTrack) {
      this.processedTrack = undefined;
      return;
    }
    this.sourceNode?.disconnect();
    this.gainNode?.disconnect();
    this.destinationNode?.disconnect();

    this.audioContext = ctx;
    const stream = new MediaStream([this.inner.processedTrack]);
    this.sourceNode = ctx.createMediaStreamSource(stream);
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = Math.max(0, Math.min(2.5, this.inputGainPct / 100));
    this.destinationNode = ctx.createMediaStreamDestination();

    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.destinationNode);
    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    if (opts.audioContext.state === "suspended") {
      await opts.audioContext.resume().catch(() => {});
    }
    await this.inner.init(opts);
    this.attachGainStage(opts.audioContext);
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.inner.restart(opts);
    this.attachGainStage(opts.audioContext);
  }

  async onPublish(room: Room): Promise<void> {
    if (this.inner.onPublish) {
      await this.inner.onPublish(room);
    }
  }

  async destroy(): Promise<void> {
    try {
      this.sourceNode?.disconnect();
      this.gainNode?.disconnect();
      this.destinationNode?.disconnect();
    } catch {
      // ignore
    }
    this.sourceNode = null;
    this.gainNode = null;
    this.destinationNode = null;
    this.audioContext = null;
    this.processedTrack = undefined;
    await this.inner.destroy();
  }
}

export interface CreateNoiseProcessorOptions {
  isLiveKitCloud: boolean;
  siqConfig?: SiqDspConfig;
  inputGainPct?: number;
}

export async function createNoiseProcessor(
  mode: NoiseCancellationMode,
  optionsOrCloud: boolean | CreateNoiseProcessorOptions
): Promise<{
  processor: LiveConfigurableAudioProcessor | null;
  effectiveMode: NoiseCancellationMode;
  notice?: string;
}> {
  const opts: CreateNoiseProcessorOptions =
    typeof optionsOrCloud === "boolean"
      ? { isLiveKitCloud: optionsOrCloud }
      : optionsOrCloud;

  const siqConfig: SiqDspConfig = {
    ...DEFAULT_SIQ_DSP_CONFIG,
    ...(opts.siqConfig ?? {}),
    inputGainPct: opts.inputGainPct ?? opts.siqConfig?.inputGainPct ?? 100,
  };
  const inputGainPct = siqConfig.inputGainPct;

  if (mode === "siq") {
    return {
      processor: new SiqAiTrackProcessor(siqConfig),
      effectiveMode: "siq",
    };
  }

  if (mode === "off" || mode === "standard") {
    return {
      processor: inputGainPct !== 100 ? new InputGainTrackProcessor(inputGainPct) : null,
      effectiveMode: mode,
    };
  }

  if (mode === "krisp") {
    if (!opts.isLiveKitCloud) {
      return {
        processor: new SiqAiTrackProcessor(siqConfig),
        effectiveMode: "siq",
        notice: "Krisp AI requires LiveKit Cloud; switched automatically to SIQ AI.",
      };
    }

    try {
      const krispMod = await import("@livekit/krisp-noise-filter");
      if (krispMod.isKrispNoiseFilterSupported()) {
        const krispFilter = krispMod.KrispNoiseFilter();
        if (inputGainPct === 100) {
          return {
            processor: krispFilter as LiveConfigurableAudioProcessor,
            effectiveMode: "krisp",
          };
        }
        return {
          processor: new KrispWithGainTrackProcessor(krispFilter, inputGainPct),
          effectiveMode: "krisp",
        };
      }
      return {
        processor: new SiqAiTrackProcessor(siqConfig),
        effectiveMode: "siq",
        notice: "Krisp is unsupported on this runtime; using SIQ AI instead.",
      };
    } catch {
      return {
        processor: new SiqAiTrackProcessor(siqConfig),
        effectiveMode: "siq",
        notice: "Could not load Krisp AI; using SIQ AI instead.",
      };
    }
  }

  return {
    processor: new WasmNoiseTrackProcessor(mode, inputGainPct),
    effectiveMode: mode,
  };
}
