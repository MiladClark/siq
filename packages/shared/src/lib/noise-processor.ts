"use client";

import type { GtcrnWorkletNode, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import type { AudioProcessorOptions, Room, Track, TrackProcessor } from "livekit-client";
import {
  DEFAULT_SIQ_DSP_CONFIG,
  SIQ_ENGINE_PROCESSOR_ID,
  SIQ_NEURAL_HOP,
  SIQ_WORKLET_SOURCE,
  suppressionPctToAttenLimDb,
  type SiqAiEngine,
  type SiqAudioTelemetry,
  type SiqDspConfig,
  type SiqEngineRole,
  type SiqNeuralState,
} from "./siq-audio-worklet";
import { SIQ_NEURAL_WORKER_SOURCE } from "./siq-neural-worker";

export type NoiseCancellationMode = "siq" | "krisp" | "gtcrn" | "rnnoise" | "standard" | "off";

type WebWasmMode = "rnnoise" | "gtcrn";
type WorkletKey = WebWasmMode | "siq";

/** Live state of the SIQ engine, pushed to the UI whenever it changes. */
export interface SiqEngineStatus {
  requested: SiqAiEngine;
  /** Tier currently doing the work (falls back to "pure" when a neural tier is unavailable) */
  active: SiqAiEngine;
  neuralState: SiqNeuralState;
  /** Human readable reason when the engine stepped down */
  message: string | null;
}

export interface LiveConfigurableAudioProcessor
  extends TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  updateSiqConfig?: (config: SiqDspConfig) => void;
  setInputGainPct?: (gainPct: number) => void;
  setBypass?: (bypassed: boolean) => void;
  setTelemetryListener?: (listener: ((telemetry: SiqAudioTelemetry) => void) | null) => void;
  setStatusListener?: (listener: ((status: SiqEngineStatus) => void) | null) => void;
  /** Actual sub-engine currently running inside SIQ (after any runtime fallback) */
  activeSiqEngine?: SiqAiEngine;
  /** Optional fallback message if a heavier neural tier stepped down */
  fallbackNotice?: string | null;
  onPublish?: (room: Room) => Promise<void>;
}

const DF3_WASM_PATH = "/audio-worklets/df3.wasm";
const NEURAL_LOAD_TIMEOUT_MS = 120_000;
const NEURAL_IDLE_SHUTDOWN_MS = 90_000;

const loadedWorkletContexts = new WeakMap<AudioContext, Set<WorkletKey>>();
const pendingWorkletLoads = new WeakMap<AudioContext, Map<WorkletKey, Promise<void>>>();
const workletSourceCache = new Map<WebWasmMode, string>();
let cachedRnnoiseWasm: ArrayBuffer | null = null;
let cachedGtcrnWasm: ArrayBuffer | null = null;

function absoluteUrl(path: string): string {
  return typeof window !== "undefined" ? new URL(path, window.location.origin).href : path;
}

function isValidWasmBinary(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 8) return false;
  const header = new Uint8Array(buf, 0, 4);
  return header[0] === 0x00 && header[1] === 0x61 && header[2] === 0x73 && header[3] === 0x6d;
}

async function addWorkletModuleFromBlob(ctx: AudioContext, source: string): Promise<void> {
  const blobUrl = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
  try {
    await ctx.audioWorklet.addModule(blobUrl);
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  }
}

async function fetchTextVerified(url: string): Promise<string> {
  const res = await fetch(absoluteUrl(url), { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to fetch audio worklet (${res.status}): ${url}`);
  const text = await res.text();
  if (!text || text.trimStart().startsWith("<")) {
    throw new Error(`Invalid audio worklet response (HTML returned instead of JS): ${url}`);
  }
  return text;
}

async function fetchWasmVerified(url: string): Promise<ArrayBuffer> {
  const res = await fetch(absoluteUrl(url), { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to fetch WASM model (${res.status}): ${url}`);
  const buf = await res.arrayBuffer();
  if (!isValidWasmBinary(buf)) throw new Error(`Corrupted or non-WASM payload received for ${url}`);
  return buf;
}

let simdSupport: boolean | null = null;
function supportsWasmSimd(): boolean {
  if (simdSupport !== null) return simdSupport;
  try {
    simdSupport = WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
        253, 15, 253, 98, 11,
      ])
    );
  } catch {
    simdSupport = false;
  }
  return simdSupport;
}

function isLikelyMobileDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const coarseOnly =
    window.matchMedia?.("(pointer: coarse)").matches &&
    !window.matchMedia?.("(any-pointer: fine)").matches;
  return Boolean(coarseOnly && navigator.maxTouchPoints > 0);
}

/** DeepFilterNet3 needs WASM SIMD + Workers; phones skip it (34 MB model + sustained CPU). */
export function isSiqNeuralSupported(): boolean {
  if (typeof window === "undefined" || typeof Worker === "undefined") return false;
  if (typeof WebAssembly === "undefined" || !supportsWasmSimd()) return false;
  return !isLikelyMobileDevice();
}

async function ensureWorkletModule(ctx: AudioContext, key: WorkletKey): Promise<void> {
  if (!ctx.audioWorklet) throw new Error("AudioWorklet is not available in this context.");

  let loaded = loadedWorkletContexts.get(ctx);
  if (!loaded) {
    loaded = new Set();
    loadedWorkletContexts.set(ctx, loaded);
  }
  if (loaded.has(key)) return;

  let pending = pendingWorkletLoads.get(ctx);
  if (!pending) {
    pending = new Map();
    pendingWorkletLoads.set(ctx, pending);
  }
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const load = (async () => {
    if (key === "siq") {
      await addWorkletModuleFromBlob(ctx, SIQ_WORKLET_SOURCE);
      return;
    }
    const path =
      key === "rnnoise" ? "/audio-worklets/rnnoise-worklet.js" : "/audio-worklets/gtcrn-worklet.js";
    // Blob loading makes the worklet inherit the document CSP ('wasm-unsafe-eval') on Tauri WebView2.
    try {
      let source = workletSourceCache.get(key);
      if (!source) {
        source = await fetchTextVerified(path);
        workletSourceCache.set(key, source);
      }
      await addWorkletModuleFromBlob(ctx, source);
    } catch (blobErr) {
      try {
        await ctx.audioWorklet.addModule(absoluteUrl(path));
      } catch {
        throw blobErr;
      }
    }
  })();

  pending.set(key, load);
  try {
    await load;
    loaded.add(key);
  } finally {
    pending.delete(key);
  }
}

async function getWasmBinary(mode: WebWasmMode): Promise<ArrayBuffer> {
  if (mode === "rnnoise") {
    if (!cachedRnnoiseWasm) {
      try {
        cachedRnnoiseWasm = await fetchWasmVerified(
          supportsWasmSimd() ? "/audio-worklets/rnnoise_simd.wasm" : "/audio-worklets/rnnoise.wasm"
        );
      } catch {
        cachedRnnoiseWasm = await fetchWasmVerified("/audio-worklets/rnnoise.wasm");
      }
    }
    return cachedRnnoiseWasm;
  }
  if (!cachedGtcrnWasm) cachedGtcrnWasm = await fetchWasmVerified("/audio-worklets/gtcrn.wasm");
  return cachedGtcrnWasm;
}

function create48kAudioContextIfNeeded(baseCtx: AudioContext): { ctx: AudioContext; owned: boolean } {
  if (baseCtx.sampleRate === 48000 || typeof window === "undefined") {
    return { ctx: baseCtx, owned: false };
  }
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    return { ctx: new AudioCtx({ sampleRate: 48000, latencyHint: "interactive" }), owned: true };
  } catch {
    return { ctx: baseCtx, owned: false };
  }
}

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "unknown error");
  return raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;
}

/* -------------------------------------------------------------------------------------------- */
/* Neural host: one shared Worker running DeepFilterNet3 for every SIQ processor on the page.    */
/* -------------------------------------------------------------------------------------------- */

interface PendingAttach {
  resolve: (frameLength: number) => void;
  reject: (err: Error) => void;
}

class SiqNeuralHost {
  private static instance: SiqNeuralHost | null = null;

  static acquire(): SiqNeuralHost {
    if (!SiqNeuralHost.instance || SiqNeuralHost.instance.dead) {
      SiqNeuralHost.instance = new SiqNeuralHost();
    }
    const host = SiqNeuralHost.instance;
    host.refs++;
    if (host.idleTimer) {
      clearTimeout(host.idleTimer);
      host.idleTimer = null;
    }
    return host;
  }

  private worker: Worker;
  private refs = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingAttach>();
  private dead = false;
  readonly loaded: Promise<void>;

  private constructor() {
    const url = URL.createObjectURL(new Blob([SIQ_NEURAL_WORKER_SOURCE], { type: "text/javascript" }));
    this.worker = new Worker(url, { name: "siq-neural" });
    setTimeout(() => URL.revokeObjectURL(url), 30_000);

    let resolveLoaded: () => void = () => {};
    let rejectLoaded: (err: Error) => void = () => {};
    this.loaded = new Promise<void>((resolve, reject) => {
      resolveLoaded = resolve;
      rejectLoaded = reject;
    });
    // Prevent unhandled-rejection noise; callers observe it through attach()
    this.loaded.catch(() => {});

    const timeout = setTimeout(() => {
      rejectLoaded(new Error("DeepFilterNet3 model download timed out"));
      this.kill();
    }, NEURAL_LOAD_TIMEOUT_MS);

    this.worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as { type?: string; id?: number; message?: string; frameLength?: number };
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "loaded") {
        clearTimeout(timeout);
        resolveLoaded();
      } else if (msg.type === "attached" && typeof msg.id === "number") {
        this.pending.get(msg.id)?.resolve(msg.frameLength ?? SIQ_NEURAL_HOP);
        this.pending.delete(msg.id);
      } else if (msg.type === "error") {
        const err = new Error(msg.message || "SIQ neural worker error");
        if (typeof msg.id === "number" && this.pending.has(msg.id)) {
          this.pending.get(msg.id)?.reject(err);
          this.pending.delete(msg.id);
        } else {
          clearTimeout(timeout);
          rejectLoaded(err);
          this.kill();
        }
      } else if (msg.type === "frame-error") {
        console.warn("[siq-neural] frame error:", msg.message);
      }
    };
    this.worker.onerror = (event) => {
      clearTimeout(timeout);
      rejectLoaded(new Error(event.message || "SIQ neural worker crashed"));
      this.kill();
    };

    this.worker.postMessage({ type: "init", wasmUrl: absoluteUrl(DF3_WASM_PATH), postFilterBeta: 0.02 });
  }

  private kill(): void {
    if (this.dead) return;
    this.dead = true;
    for (const entry of this.pending.values()) entry.reject(new Error("SIQ neural worker stopped"));
    this.pending.clear();
    try {
      this.worker.terminate();
    } catch {
      // ignore
    }
    if (SiqNeuralHost.instance === this) SiqNeuralHost.instance = null;
  }

  async attach(port: MessagePort, attenLim: number): Promise<number> {
    await this.loaded;
    if (this.dead) throw new Error("SIQ neural worker stopped");
    const id = this.nextId++;
    const ready = new Promise<number>((resolve, reject) => {
      this.pending.set(id, { resolve: () => resolve(id), reject });
    });
    this.worker.postMessage({ type: "attach", id, port, attenLim }, [port]);
    return ready;
  }

  configure(id: number, attenLim: number): void {
    if (!this.dead) this.worker.postMessage({ type: "config", id, attenLim });
  }

  detach(id: number): void {
    if (!this.dead) this.worker.postMessage({ type: "detach", id });
  }

  prewarm(attenLim: number): void {
    this.loaded
      .then(() => {
        if (!this.dead) this.worker.postMessage({ type: "prewarm", attenLim });
      })
      .catch(() => {});
  }

  release(): void {
    this.refs = Math.max(0, this.refs - 1);
    if (this.refs === 0 && !this.dead && !this.idleTimer) {
      this.idleTimer = setTimeout(() => {
        this.idleTimer = null;
        if (this.refs === 0) this.kill();
      }, NEURAL_IDLE_SHUTDOWN_MS);
    }
  }
}

/**
 * Starts downloading/compiling DeepFilterNet3 in the background (no audio impact) so that
 * joining a voice channel switches to SIQ Ultra AI almost instantly.
 */
export function prewarmSiqNeural(config: Partial<SiqDspConfig> = {}): void {
  if (!isSiqNeuralSupported()) return;
  try {
    const host = SiqNeuralHost.acquire();
    host.prewarm(suppressionPctToAttenLimDb(config.suppressionStrength ?? DEFAULT_SIQ_DSP_CONFIG.suppressionStrength));
    host.release();
  } catch {
    // ignore — the processor will retry on init
  }
}

/* -------------------------------------------------------------------------------------------- */
/* SIQ Voice Engine v3 TrackProcessor                                                            */
/* -------------------------------------------------------------------------------------------- */

/**
 * SIQ Voice Engine v3.
 *  - "ultra": SIQ Spectral starts instantly; DeepFilterNet3 (48 kHz full-band) loads in a Worker
 *             and crossfades in when ready. CPU overload steps back to Spectral seamlessly.
 *  - "fast":  GTCRN neural worklet between the SIQ pre and post stages.
 *  - "pure":  SIQ Spectral (MCRA + Wiener, 8 ms STFT) + look-ahead expander + mastering.
 * The processed track never changes identity, so engine/state changes never renegotiate WebRTC.
 */
export class SiqAiTrackProcessor implements LiveConfigurableAudioProcessor {
  readonly name = "siq-voice-engine-v3";
  processedTrack?: MediaStreamTrack;
  activeSiqEngine: SiqAiEngine;
  fallbackNotice: string | null = null;

  private config: SiqDspConfig;
  private bypassed = false;
  private baseContext: AudioContext | null = null;
  private audioContext: AudioContext | null = null;
  private ownsAudioContext = false;

  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private inputNode: AudioNode | null = null;
  private engineNode: AudioWorkletNode | null = null;
  private preNode: AudioWorkletNode | null = null;
  private gtcrnNode: GtcrnWorkletNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  private telemetryListener: ((telemetry: SiqAudioTelemetry) => void) | null = null;
  private statusListener: ((status: SiqEngineStatus) => void) | null = null;

  private neuralHost: SiqNeuralHost | null = null;
  private neuralId: number | null = null;
  private neuralState: SiqNeuralState = "off";
  private generation = 0;

  constructor(initialConfig: SiqDspConfig = DEFAULT_SIQ_DSP_CONFIG) {
    this.config = { ...DEFAULT_SIQ_DSP_CONFIG, ...initialConfig };
    this.activeSiqEngine = this.config.aiEngine;
  }

  setTelemetryListener(listener: ((telemetry: SiqAudioTelemetry) => void) | null): void {
    this.telemetryListener = listener;
  }

  setStatusListener(listener: ((status: SiqEngineStatus) => void) | null): void {
    this.statusListener = listener;
    if (listener) listener(this.status());
  }

  private status(): SiqEngineStatus {
    return {
      requested: this.config.aiEngine,
      active: this.activeSiqEngine,
      neuralState: this.neuralState,
      message: this.fallbackNotice,
    };
  }

  private emitStatus(): void {
    this.statusListener?.(this.status());
  }

  setBypass(bypassed: boolean): void {
    this.bypassed = bypassed;
    this.engineNode?.port.postMessage({ type: "bypass", value: bypassed });
  }

  updateSiqConfig(config: SiqDspConfig): void {
    this.config = { ...DEFAULT_SIQ_DSP_CONFIG, ...config };
    const msg = { type: "config", config: this.config };
    this.engineNode?.port.postMessage(msg);
    this.preNode?.port.postMessage(msg);
    if (this.neuralHost && this.neuralId !== null) {
      this.neuralHost.configure(this.neuralId, suppressionPctToAttenLimDb(this.config.suppressionStrength));
    }
  }

  setInputGainPct(gainPct: number): void {
    this.updateSiqConfig({ ...this.config, inputGainPct: gainPct });
  }

  private createEngineNode(ctx: AudioContext, role: SiqEngineRole, neural: boolean): AudioWorkletNode {
    const node = new AudioWorkletNode(ctx, SIQ_ENGINE_PROCESSOR_ID, {
      numberOfInputs: role === "post" ? 2 : 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { role, config: this.config, neural, hop: SIQ_NEURAL_HOP },
    });
    return node;
  }

  private bindEngineMessages(node: AudioWorkletNode): void {
    node.port.onmessage = (event: MessageEvent) => {
      const data = event.data as (SiqAudioTelemetry & { type?: string; reason?: string }) | null;
      if (!data) return;
      if (data.type === "telemetry") {
        if (!this.telemetryListener) return;
        const neuralState =
          this.neuralState === "loading" && data.neuralState === "off" ? "loading" : data.neuralState;
        this.telemetryListener({
          inputDb: data.inputDb,
          outputDb: data.outputDb,
          noiseFloorDb: data.noiseFloorDb,
          effectiveThresholdDb: data.effectiveThresholdDb,
          gateOpen: data.gateOpen,
          gainReductionDb: data.gainReductionDb,
          aiNoiseReductionDb: data.aiNoiseReductionDb,
          bypassed: data.bypassed,
          engine: data.engine,
          neuralState,
          latencyMs: data.latencyMs,
          neuralLoadPct: data.neuralLoadPct,
          underruns: data.underruns,
        });
      } else if (data.type === "neural-active") {
        this.neuralState = "active";
        this.emitStatus();
      } else if (data.type === "neural-overload") {
        this.failNeural(
          data.reason === "cpu"
            ? "Your CPU is too busy for SIQ Ultra AI right now — switched to SIQ Spectral without interrupting your voice."
            : "SIQ Ultra AI could not keep up in real time — switched to SIQ Spectral without interrupting your voice."
        );
      }
    };
  }

  private buildFull(ctx: AudioContext, neural: boolean): void {
    const engine = this.createEngineNode(ctx, "full", neural);
    this.bindEngineMessages(engine);
    engine.connect(this.destinationNode!);
    this.engineNode = engine;
    this.inputNode = engine;
  }

  private async buildFast(ctx: AudioContext): Promise<void> {
    const [worklets, wasmBinary] = await Promise.all([
      import("@sapphi-red/web-noise-suppressor"),
      getWasmBinary("gtcrn"),
      ensureWorkletModule(ctx, "gtcrn"),
    ]);
    const pre = this.createEngineNode(ctx, "pre", false);
    const post = this.createEngineNode(ctx, "post", false);
    const gtcrn = new worklets.GtcrnWorkletNode(ctx, { maxChannels: 1, wasmBinary: wasmBinary.slice(0) });
    this.bindEngineMessages(post);
    pre.connect(gtcrn);
    gtcrn.connect(post, 0, 0);
    pre.connect(post, 0, 1);
    post.connect(this.destinationNode!);
    this.preNode = pre;
    this.gtcrnNode = gtcrn;
    this.engineNode = post;
    this.inputNode = pre;
  }

  private connectSource(track: MediaStreamTrack): void {
    const ctx = this.audioContext;
    if (!ctx || !this.inputNode) return;
    try {
      this.sourceNode?.disconnect();
    } catch {
      // ignore
    }
    this.sourceNode = ctx.createMediaStreamSource(new MediaStream([track]));
    this.sourceNode.connect(this.inputNode);
  }

  private async startNeural(generation: number): Promise<void> {
    const host = SiqNeuralHost.acquire();
    this.neuralHost = host;
    this.neuralState = "loading";
    this.emitStatus();
    try {
      const channel = new MessageChannel();
      const id = await host.attach(channel.port2, suppressionPctToAttenLimDb(this.config.suppressionStrength));
      if (generation !== this.generation || !this.engineNode) {
        host.detach(id);
        channel.port1.close();
        return;
      }
      this.neuralId = id;
      this.neuralState = "priming";
      this.engineNode.port.postMessage({ type: "neural-attach", port: channel.port1 }, [channel.port1]);
      this.emitStatus();
    } catch (err) {
      if (generation !== this.generation) return;
      this.failNeural(`SIQ Ultra AI could not start (${friendlyError(err)}) — running SIQ Spectral.`);
    }
  }

  private releaseNeural(): void {
    if (this.neuralHost) {
      if (this.neuralId !== null) this.neuralHost.detach(this.neuralId);
      this.neuralHost.release();
    }
    this.neuralHost = null;
    this.neuralId = null;
  }

  private failNeural(message: string): void {
    this.engineNode?.port.postMessage({ type: "neural-detach" });
    this.releaseNeural();
    this.neuralState = "degraded";
    this.activeSiqEngine = "pure";
    this.fallbackNotice = message;
    console.warn("[siq-voice]", message);
    this.emitStatus();
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    const generation = ++this.generation;
    this.fallbackNotice = null;
    this.neuralState = "off";
    const requested = this.config.aiEngine ?? "ultra";

    const resolved = create48kAudioContextIfNeeded(opts.audioContext);
    this.baseContext = opts.audioContext;
    this.audioContext = resolved.ctx;
    this.ownsAudioContext = resolved.owned;
    const ctx = resolved.ctx;
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});

    await ensureWorkletModule(ctx, "siq");
    this.destinationNode = ctx.createMediaStreamDestination();
    this.destinationNode.channelCount = 1;

    const neuralCapable = requested === "ultra" && isSiqNeuralSupported() && ctx.sampleRate === 48000;
    if (requested === "fast") {
      try {
        await this.buildFast(ctx);
        this.activeSiqEngine = "fast";
      } catch (err) {
        console.warn("[siq-voice] GTCRN unavailable, using SIQ Spectral:", err);
        this.teardownGraph();
        this.destinationNode = ctx.createMediaStreamDestination();
        this.destinationNode.channelCount = 1;
        this.buildFull(ctx, false);
        this.activeSiqEngine = "pure";
        this.fallbackNotice = "SIQ Fast AI is unavailable on this device — running SIQ Spectral.";
      }
    } else {
      this.buildFull(ctx, neuralCapable);
      this.activeSiqEngine = requested === "ultra" && !neuralCapable ? "pure" : requested;
      if (requested === "ultra" && !neuralCapable) {
        this.fallbackNotice = isLikelyMobileDevice()
          ? "SIQ Ultra AI runs on desktop — this phone uses SIQ Spectral (lighter on battery and data)."
          : "SIQ Ultra AI needs WebAssembly SIMD — running SIQ Spectral.";
      }
    }

    if (this.bypassed) this.engineNode?.port.postMessage({ type: "bypass", value: true });
    this.connectSource(opts.track);
    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];

    if (neuralCapable && requested === "ultra") void this.startNeural(generation);
    this.emitStatus();
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    // Mic/device swap: keep the engine (and the warm neural model) alive, only re-bind the source.
    const sameContext = this.ownsAudioContext || opts.audioContext === this.baseContext;
    if (this.audioContext && this.audioContext.state !== "closed" && this.inputNode && sameContext) {
      this.connectSource(opts.track);
      return;
    }
    await this.destroy();
    await this.init(opts);
  }

  private teardownGraph(): void {
    const nodes: Array<AudioNode | null> = [
      this.sourceNode,
      this.preNode,
      this.gtcrnNode,
      this.engineNode,
      this.destinationNode,
    ];
    try {
      this.engineNode?.port.postMessage({ type: "destroy" });
      this.preNode?.port.postMessage({ type: "destroy" });
      if (this.engineNode) this.engineNode.port.onmessage = null;
      this.gtcrnNode?.destroy();
    } catch {
      // ignore
    }
    for (const node of nodes) {
      try {
        node?.disconnect();
      } catch {
        // ignore
      }
    }
    this.sourceNode = null;
    this.preNode = null;
    this.gtcrnNode = null;
    this.engineNode = null;
    this.inputNode = null;
    this.destinationNode = null;
  }

  async destroy(): Promise<void> {
    this.generation++;
    this.releaseNeural();
    this.neuralState = "off";
    this.teardownGraph();
    this.processedTrack = undefined;
    if (this.ownsAudioContext && this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
    this.baseContext = null;
    this.ownsAudioContext = false;
  }
}

/** Backward-compatible alias */
export class SiqVoiceTrackProcessor extends SiqAiTrackProcessor {}

/**
 * LiveKit TrackProcessor wrapping @sapphi-red/web-noise-suppressor (RNNoise or GTCRN WASM)
 * with WebView2-safe Blob module loading, a 48 kHz context guarantee and live input gain.
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
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});

    const [worklets, wasmBinary] = await Promise.all([
      import("@sapphi-red/web-noise-suppressor"),
      getWasmBinary(this.mode),
      ensureWorkletModule(ctx, this.mode),
    ]);

    this.sourceNode = ctx.createMediaStreamSource(new MediaStream([opts.track]));
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
    if (this.audioContext && this.audioContext.state !== "closed" && this.gainNode) {
      try {
        this.sourceNode?.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = this.audioContext.createMediaStreamSource(new MediaStream([opts.track]));
      this.sourceNode.connect(this.gainNode);
      return;
    }
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

/** Featherweight input gain processor used for Standard/Off with custom microphone gain. */
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
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    this.sourceNode = ctx.createMediaStreamSource(new MediaStream([opts.track]));
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = Math.max(0, Math.min(2.5, this.inputGainPct / 100));
    this.destinationNode = ctx.createMediaStreamDestination();
    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.destinationNode);
    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    if (this.audioContext && this.audioContext === opts.audioContext && this.gainNode) {
      try {
        this.sourceNode?.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = this.audioContext.createMediaStreamSource(new MediaStream([opts.track]));
      this.sourceNode.connect(this.gainNode);
      return;
    }
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

/** Wraps KrispNoiseFilter with a post GainNode so Input Gain works live while Krisp is active. */
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
    try {
      this.sourceNode?.disconnect();
      this.gainNode?.disconnect();
      this.destinationNode?.disconnect();
    } catch {
      // ignore
    }
    this.audioContext = ctx;
    this.sourceNode = ctx.createMediaStreamSource(new MediaStream([this.inner.processedTrack]));
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = Math.max(0, Math.min(2.5, this.inputGainPct / 100));
    this.destinationNode = ctx.createMediaStreamDestination();
    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.destinationNode);
    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    if (opts.audioContext.state === "suspended") await opts.audioContext.resume().catch(() => {});
    await this.inner.init(opts);
    this.attachGainStage(opts.audioContext);
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.inner.restart(opts);
    this.attachGainStage(opts.audioContext);
  }

  async onPublish(room: Room): Promise<void> {
    if (this.inner.onPublish) await this.inner.onPublish(room);
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
    typeof optionsOrCloud === "boolean" ? { isLiveKitCloud: optionsOrCloud } : optionsOrCloud;

  const siqConfig: SiqDspConfig = {
    ...DEFAULT_SIQ_DSP_CONFIG,
    ...(opts.siqConfig ?? {}),
    inputGainPct: opts.inputGainPct ?? opts.siqConfig?.inputGainPct ?? 100,
  };
  const inputGainPct = siqConfig.inputGainPct;

  if (mode === "siq") {
    return { processor: new SiqAiTrackProcessor(siqConfig), effectiveMode: "siq" };
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
          return { processor: krispFilter as LiveConfigurableAudioProcessor, effectiveMode: "krisp" };
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

  return { processor: new WasmNoiseTrackProcessor(mode, inputGainPct), effectiveMode: mode };
}
