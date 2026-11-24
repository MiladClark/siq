"use client";

import type { GtcrnWorkletNode, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import type { AudioProcessorOptions, Track, TrackProcessor } from "livekit-client";

export type NoiseCancellationMode = "krisp" | "gtcrn" | "rnnoise" | "standard" | "off";

type WebWasmMode = "rnnoise" | "gtcrn";

const loadedWorkletContexts = new WeakMap<AudioContext, Set<WebWasmMode>>();
let cachedRnnoiseWasm: ArrayBuffer | null = null;
let cachedGtcrnWasm: ArrayBuffer | null = null;

async function ensureWorkletModule(ctx: AudioContext, mode: WebWasmMode): Promise<void> {
  let set = loadedWorkletContexts.get(ctx);
  if (!set) {
    set = new Set();
    loadedWorkletContexts.set(ctx, set);
  }
  if (set.has(mode)) return;

  const url =
    mode === "rnnoise"
      ? "/audio-worklets/rnnoise-worklet.js"
      : "/audio-worklets/gtcrn-worklet.js";
  await ctx.audioWorklet.addModule(url);
  set.add(mode);
}

async function getWasmBinary(
  mode: WebWasmMode,
  { loadGtcrn, loadRnnoise }: typeof import("@sapphi-red/web-noise-suppressor")
): Promise<ArrayBuffer> {
  if (mode === "rnnoise") {
    if (!cachedRnnoiseWasm) {
      cachedRnnoiseWasm = await loadRnnoise({
        url: "/audio-worklets/rnnoise.wasm",
        simdUrl: "/audio-worklets/rnnoise_simd.wasm",
      });
    }
    return cachedRnnoiseWasm;
  }

  if (!cachedGtcrnWasm) {
    cachedGtcrnWasm = await loadGtcrn({
      url: "/audio-worklets/gtcrn.wasm",
    });
  }
  return cachedGtcrnWasm;
}

/**
 * LiveKit TrackProcessor wrapping @sapphi-red/web-noise-suppressor (RNNoise or GTCRN WASM).
 * Runs 100% locally in an AudioWorklet — works on both LiveKit Cloud and self-hosted/local Docker.
 */
export class WasmNoiseTrackProcessor
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  readonly name: string;
  readonly mode: WebWasmMode;
  processedTrack?: MediaStreamTrack;

  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: RnnoiseWorkletNode | GtcrnWorkletNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  constructor(mode: WebWasmMode) {
    this.mode = mode;
    this.name = `siq-${mode}-noise-processor`;
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    const ctx = opts.audioContext;
    this.audioContext = ctx;

    const worklets = await import("@sapphi-red/web-noise-suppressor");
    const [wasmBinary] = await Promise.all([
      getWasmBinary(this.mode, worklets),
      ensureWorkletModule(ctx, this.mode),
    ]);

    const stream = new MediaStream([opts.track]);
    this.sourceNode = ctx.createMediaStreamSource(stream);
    this.destinationNode = ctx.createMediaStreamDestination();

    // Clone buffer because WebAssembly instantiation may detach/transfer it
    const binaryCopy = wasmBinary.slice(0);
    this.workletNode =
      this.mode === "rnnoise"
        ? new worklets.RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: binaryCopy })
        : new worklets.GtcrnWorkletNode(ctx, { maxChannels: 1, wasmBinary: binaryCopy });

    this.sourceNode.connect(this.workletNode);
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
      this.workletNode?.disconnect();
      this.workletNode?.destroy();
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

export async function createNoiseProcessor(
  mode: NoiseCancellationMode,
  isLiveKitCloud: boolean
): Promise<{
  processor: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> | null;
  effectiveMode: NoiseCancellationMode;
  notice?: string;
}> {
  if (mode === "off" || mode === "standard") {
    return { processor: null, effectiveMode: mode };
  }

  if (mode === "krisp") {
    if (!isLiveKitCloud) {
      // Krisp requires LiveKit Cloud licensing — fall back cleanly to RNNoise on local Docker
      return {
        processor: new WasmNoiseTrackProcessor("rnnoise"),
        effectiveMode: "rnnoise",
        notice: "Krisp AI requires LiveKit Cloud; switched automatically to RNNoise AI.",
      };
    }

    try {
      const krispMod = await import("@livekit/krisp-noise-filter");
      if (krispMod.isKrispNoiseFilterSupported()) {
        return {
          processor: krispMod.KrispNoiseFilter(),
          effectiveMode: "krisp",
        };
      }
      return {
        processor: new WasmNoiseTrackProcessor("rnnoise"),
        effectiveMode: "rnnoise",
        notice: "Browser does not support Krisp; using RNNoise AI instead.",
      };
    } catch {
      return {
        processor: new WasmNoiseTrackProcessor("rnnoise"),
        effectiveMode: "rnnoise",
        notice: "Could not load Krisp AI; using RNNoise AI instead.",
      };
    }
  }

  return {
    processor: new WasmNoiseTrackProcessor(mode),
    effectiveMode: mode,
  };
}
