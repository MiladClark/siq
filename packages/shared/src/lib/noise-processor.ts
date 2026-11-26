"use client";

import type { GtcrnWorkletNode, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import type { AudioProcessorOptions, Room, Track, TrackProcessor } from "livekit-client";
import {
  DEFAULT_SIQ_DSP_CONFIG,
  SIQ_WORKLET_PROCESSOR_ID,
  SIQ_WORKLET_SOURCE,
  type SiqAudioTelemetry,
  type SiqDspConfig,
} from "./siq-audio-worklet";

export type NoiseCancellationMode = "siq" | "krisp" | "gtcrn" | "rnnoise" | "standard" | "off";

type WebWasmMode = "rnnoise" | "gtcrn";
type WorkletKey = WebWasmMode | "siq";

export interface LiveConfigurableAudioProcessor
  extends TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  updateSiqConfig?: (config: SiqDspConfig) => void;
  setInputGainPct?: (gainPct: number) => void;
  setTelemetryListener?: (listener: ((telemetry: SiqAudioTelemetry) => void) | null) => void;
  onPublish?: (room: Room) => Promise<void>;
}

const loadedWorkletContexts = new WeakMap<AudioContext, Set<WorkletKey>>();
const workletSourceCache = new Map<WebWasmMode, string>();
let cachedRnnoiseWasm: ArrayBuffer | null = null;
let cachedGtcrnWasm: ArrayBuffer | null = null;

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
    key === "rnnoise" ? "/audio-worklets/rnnoise-worklet.js" : "/audio-worklets/gtcrn-worklet.js";

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
        // Retry non-SIMD binary if SIMD failed
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

/**
 * Custom SIQ Voice Studio TrackProcessor.
 * Zero algorithmic lookahead delay (~2.67 ms native quantum), <0.5% CPU,
 * 100% local, works at any sample rate (44.1 / 48 / 96 kHz) on both Desktop & Web.
 */
export class SiqVoiceTrackProcessor implements LiveConfigurableAudioProcessor {
  readonly name = "siq-voice-studio-processor";
  processedTrack?: MediaStreamTrack;

  private config: SiqDspConfig;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private telemetryListener: ((telemetry: SiqAudioTelemetry) => void) | null = null;

  constructor(initialConfig: SiqDspConfig = DEFAULT_SIQ_DSP_CONFIG) {
    this.config = { ...initialConfig };
  }

  setTelemetryListener(listener: ((telemetry: SiqAudioTelemetry) => void) | null): void {
    this.telemetryListener = listener;
  }

  updateSiqConfig(config: SiqDspConfig): void {
    this.config = { ...config };
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: "config", config: this.config });
    }
  }

  setInputGainPct(gainPct: number): void {
    this.config = { ...this.config, inputGainPct: gainPct };
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: "config", config: this.config });
    }
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    const ctx = opts.audioContext;
    this.audioContext = ctx;
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }

    await ensureWorkletModule(ctx, "siq");

    const stream = new MediaStream([opts.track]);
    this.sourceNode = ctx.createMediaStreamSource(stream);
    this.destinationNode = ctx.createMediaStreamDestination();

    this.workletNode = new AudioWorkletNode(ctx, SIQ_WORKLET_PROCESSOR_ID, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        config: this.config,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      if (data && data.type === "telemetry" && this.telemetryListener) {
        this.telemetryListener({
          inputDb: data.inputDb,
          outputDb: data.outputDb,
          noiseFloorDb: data.noiseFloorDb,
          effectiveThresholdDb: data.effectiveThresholdDb,
          gateOpen: data.gateOpen,
          gainReductionDb: data.gainReductionDb,
        });
      }
    };

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.destinationNode);

    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    try {
      this.workletNode?.port.postMessage({ type: "destroy" });
      if (this.workletNode) this.workletNode.port.onmessage = null;
      this.sourceNode?.disconnect();
      this.workletNode?.disconnect();
      this.destinationNode?.disconnect();
    } catch {
      // ignore teardown errors
    }
    this.sourceNode = null;
    this.workletNode = null;
    this.destinationNode = null;
    this.processedTrack = undefined;
    this.audioContext = null;
  }
}

/**
 * LiveKit TrackProcessor wrapping @sapphi-red/web-noise-suppressor (RNNoise or GTCRN WASM)
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
    // RNNoise & GTCRN WASM frame size = 480 samples (10 ms @ 48 kHz).
    // If Windows OS audio runs at 44.1 kHz, use a dedicated 48 kHz AudioContext so it never breaks.
    let ctx = opts.audioContext;
    this.ownsAudioContext = false;
    if (ctx.sampleRate !== 48000 && typeof window !== "undefined") {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AudioCtx({ sampleRate: 48000, latencyHint: "interactive" });
        this.ownsAudioContext = true;
      } catch {
        ctx = opts.audioContext;
      }
    }
    this.audioContext = ctx;
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

    // Clone buffer because WebAssembly instantiation may detach/transfer it
    const binaryCopy = wasmBinary.slice(0);
    this.workletNode =
      this.mode === "rnnoise"
        ? new worklets.RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: binaryCopy })
        : new worklets.GtcrnWorkletNode(ctx, { maxChannels: 1, wasmBinary: binaryCopy });

    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.workletNode);
    this.workletNode.connect(this.destinationNode);

    const outTrack = this.destinationNode.stream.getAudioTracks()[0];
    this.processedTrack = outTrack;
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
      processor: new SiqVoiceTrackProcessor(siqConfig),
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
        processor: new SiqVoiceTrackProcessor(siqConfig),
        effectiveMode: "siq",
        notice: "Krisp AI requires LiveKit Cloud; switched automatically to SIQ Cancellation.",
      };
    }

    try {
      const krispMod = await import("@livekit/krisp-noise-filter");
      if (krispMod.isKrispNoiseFilterSupported()) {
        const krispFilter = krispMod.KrispNoiseFilter();
        // When input gain is unity (100%), attach Krisp directly with zero extra MediaStream hop.
        // Only add the zero-latency post-GainNode wrapper when custom gain boost/cut is active.
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
        processor: new SiqVoiceTrackProcessor(siqConfig),
        effectiveMode: "siq",
        notice: "Krisp is unsupported on this runtime; using SIQ Cancellation instead.",
      };
    } catch {
      return {
        processor: new SiqVoiceTrackProcessor(siqConfig),
        effectiveMode: "siq",
        notice: "Could not load Krisp AI; using SIQ Cancellation instead.",
      };
    }
  }

  return {
    processor: new WasmNoiseTrackProcessor(mode, inputGainPct),
    effectiveMode: mode,
  };
}
