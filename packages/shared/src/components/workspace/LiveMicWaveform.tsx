"use client";

import { Track } from "livekit-client";
import { Headphones, Mic, SplitSquareHorizontal, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  createNoiseProcessor,
  type LiveConfigurableAudioProcessor,
  type NoiseCancellationMode,
} from "@siq/shared/lib/noise-processor";
import type {
  SiqAiEngine,
  SiqAudioTelemetry,
  SiqDspConfig,
} from "@siq/shared/lib/siq-audio-worklet";

interface MicOptions {
  deviceId: string;
  outputDeviceId: string;
  echoCancellation: boolean;
  autoGainControl: boolean;
  noiseMode: NoiseCancellationMode;
  inputGainPct: number;
  siqDsp: SiqDspConfig;
}

function dbToPercent(db: number): number {
  const clamped = Math.max(-70, Math.min(0, db));
  return ((clamped + 70) / 70) * 100;
}

function formatSiqBadge(mode: NoiseCancellationMode, engine: SiqAiEngine): string {
  if (mode !== "siq") return mode.toUpperCase();
  if (engine === "ultra") return "SIQ ULTRA AI";
  if (engine === "fast") return "SIQ FAST AI";
  return "SIQ PURE";
}

export function LiveMicWaveform(options: MicOptions) {
  const [running, setRunning] = useState(false);
  const [hearMyself, setHearMyself] = useState(false);
  const [rawBypass, setRawBypass] = useState(false);

  const supportsBypass = options.noiseMode === "siq" || options.noiseMode === "krisp";

  return (
    <div className="space-y-2.5 rounded-xl border border-white/[0.08] bg-[#0E0F12] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-zinc-100">Studio Mic Monitor</p>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
              running && rawBypass
                ? "bg-amber-500/20 text-amber-300"
                : "bg-white/[0.06] text-zinc-400"
            }`}
          >
            {running && rawBypass
              ? "RAW BYPASS"
              : formatSiqBadge(options.noiseMode, options.siqDsp.aiEngine)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {supportsBypass && (
            <button
              type="button"
              aria-pressed={rawBypass}
              disabled={!running}
              onClick={() => setRawBypass((prev) => !prev)}
              title="Instant glitch-free A/B compare: toggle between raw mic and SIQ AI processed output"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#16171D] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-amber-400/50 aria-pressed:bg-amber-500/15 aria-pressed:text-amber-200"
            >
              <SplitSquareHorizontal className="h-3.5 w-3.5" aria-hidden />
              {rawBypass ? "A/B: Raw" : "A/B: SIQ AI"}
            </button>
          )}
          <button
            type="button"
            aria-pressed={hearMyself}
            disabled={!running}
            onClick={() => setHearMyself((prev) => !prev)}
            title="Play processed microphone audio back to your headset"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#16171D] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-emerald-400/40 aria-pressed:bg-emerald-500/15 aria-pressed:text-emerald-300"
          >
            {hearMyself ? (
              <Volume2 className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Headphones className="h-3.5 w-3.5" aria-hidden />
            )}
            {hearMyself ? "Sidetone On" : "Hear Myself"}
          </button>
          <button
            type="button"
            aria-pressed={running}
            onClick={() => {
              if (running) {
                setHearMyself(false);
                setRawBypass(false);
              }
              setRunning((prev) => !prev);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#16171D] px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:text-white aria-pressed:border-rose-400/30 aria-pressed:bg-rose-500/15 aria-pressed:text-rose-300"
          >
            <Mic className="h-3.5 w-3.5" aria-hidden />
            {running ? "Stop Test" : "Mic Test"}
          </button>
        </div>
      </div>

      {running ? (
        <MicPreview
          key={[
            options.deviceId,
            options.outputDeviceId,
            options.noiseMode,
            options.noiseMode === "siq" || options.noiseMode === "krisp"
              ? options.siqDsp.aiEngine
              : "",
            options.echoCancellation,
            options.autoGainControl,
          ].join(":")}
          {...options}
          hearMyself={hearMyself}
          rawBypass={rawBypass}
        />
      ) : (
        <div aria-hidden className="space-y-2">
          <div className="grid h-12 items-center rounded-lg border border-white/[0.05] bg-[#090A0C] px-2">
            <span className="h-px bg-white/10" />
          </div>
          <p className="text-[11px] text-zinc-500">
            Click Mic Test to inspect live input dB, AI noise reduction, and A/B compare Raw vs SIQ AI.
          </p>
        </div>
      )}
    </div>
  );
}

function MicPreview({
  deviceId,
  outputDeviceId,
  echoCancellation,
  autoGainControl,
  noiseMode,
  inputGainPct,
  siqDsp,
  hearMyself,
  rawBypass,
}: MicOptions & { hearMyself: boolean; rawBypass: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processorRef = useRef<LiveConfigurableAudioProcessor | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const latestGainRef = useRef(inputGainPct);
  const latestSiqRef = useRef<SiqDspConfig>({ ...siqDsp, inputGainPct });
  const latestBypassRef = useRef(rawBypass);
  latestGainRef.current = inputGainPct;
  latestSiqRef.current = { ...siqDsp, inputGainPct };
  latestBypassRef.current = rawBypass;

  const [status, setStatus] = useState(
    noiseMode === "siq" && siqDsp.aiEngine === "ultra"
      ? "Loading SIQ Ultra AI (DeepFilterNet3 48kHz)…"
      : "Starting microphone…"
  );
  const [error, setError] = useState(false);
  const [telemetry, setTelemetry] = useState<SiqAudioTelemetry | null>(null);
  const [fallbackDb, setFallbackDb] = useState<number>(-70);

  // Hot-update DSP config & gain without restarting the microphone stream
  useEffect(() => {
    const proc = processorRef.current;
    if (!proc) return;
    if (proc.updateSiqConfig) {
      proc.updateSiqConfig({ ...siqDsp, inputGainPct });
    } else if (proc.setInputGainPct) {
      proc.setInputGainPct(inputGainPct);
    }
  }, [siqDsp, inputGainPct]);

  // Glitch-free live A/B Bypass toggle
  useEffect(() => {
    processorRef.current?.setBypass?.(rawBypass);
  }, [rawBypass]);

  // Smoothly toggle sidetone monitoring without glitches
  useEffect(() => {
    const gain = monitorGainRef.current;
    const ctx = audioContextRef.current;
    if (!gain || !ctx) return;
    gain.gain.setTargetAtTime(hearMyself ? 0.92 : 0, ctx.currentTime, 0.02);
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
  }, [hearMyself]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const drawing = canvas?.getContext("2d");
    if (!canvas || !drawing) return;

    let active = true;
    let stream: MediaStream | undefined;
    let audioContext: AudioContext | undefined;
    let processor: LiveConfigurableAudioProcessor | null = null;
    let monitorAudioEl: HTMLAudioElement | null = null;
    let frame = 0;

    function releaseAudio() {
      cancelAnimationFrame(frame);
      processorRef.current = null;
      monitorGainRef.current = null;
      audioContextRef.current = null;
      if (monitorAudioEl) {
        monitorAudioEl.pause();
        monitorAudioEl.srcObject = null;
        monitorAudioEl = null;
      }
      stream?.getTracks().forEach((track) => track.stop());
      processor?.processedTrack?.stop();
      if (processor) {
        processor.setTelemetryListener?.(null);
        void processor.destroy().catch(() => {});
      }
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close().catch(() => {});
      }
      processor = null;
      stream = undefined;
      audioContext = undefined;
    }

    async function start() {
      try {
        const capture = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            echoCancellation,
            autoGainControl,
            noiseSuppression: noiseMode === "standard",
            channelCount: 1,
          },
        });
        if (!active) {
          capture.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = capture;
        const context = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
        audioContext = context;
        audioContextRef.current = context;

        // Krisp requires a LiveKit Cloud room token, so preview runs SIQ AI cleanly locally
        const result = await createNoiseProcessor(noiseMode, {
          isLiveKitCloud: false,
          siqConfig: latestSiqRef.current,
          inputGainPct: latestGainRef.current,
        });
        if (!active) return;

        const track = capture.getAudioTracks()[0];
        let analysisStream = capture;
        if (result.processor) {
          const filter = result.processor;
          filter.setTelemetryListener?.((t) => {
            if (active) setTelemetry(t);
          });
          try {
            await filter.init({ kind: Track.Kind.Audio, track, audioContext: context });
          } catch (err) {
            await filter.destroy();
            throw err;
          }
          if (!active) {
            filter.processedTrack?.stop();
            await filter.destroy();
            return;
          }
          processor = filter;
          processorRef.current = filter;
          if (latestBypassRef.current) {
            filter.setBypass?.(true);
          }
          if (filter.processedTrack) {
            analysisStream = new MediaStream([filter.processedTrack]);
          }
        }

        const source = context.createMediaStreamSource(analysisStream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const monitorGain = context.createGain();
        monitorGain.gain.value = hearMyself ? 0.92 : 0;
        monitorGainRef.current = monitorGain;

        const supportsSinkId =
          typeof HTMLMediaElement !== "undefined" &&
          "setSinkId" in HTMLMediaElement.prototype;

        if (outputDeviceId && supportsSinkId) {
          const dest = context.createMediaStreamDestination();
          analyser.connect(monitorGain);
          monitorGain.connect(dest);
          monitorAudioEl = document.createElement("audio");
          monitorAudioEl.srcObject = dest.stream;
          monitorAudioEl.autoplay = true;
          const setSink = (monitorAudioEl as HTMLAudioElement & {
            setSinkId?: (id: string) => Promise<void>;
          }).setSinkId;
          if (setSink) {
            void setSink.call(monitorAudioEl, outputDeviceId).catch(() => {});
          }
          void monitorAudioEl.play().catch(() => {});
        } else {
          analyser.connect(monitorGain);
          monitorGain.connect(context.destination);
        }

        await context.resume();
        if (!active) return;

        const samples = new Float32Array(analyser.fftSize);
        const activeSub = processor?.activeSiqEngine ?? latestSiqRef.current.aiEngine;
        const srKhz = Math.round(context.sampleRate / 1000);
        const siqLabel =
          activeSub === "ultra"
            ? `SIQ Ultra AI live (DeepFilterNet3 · ${srKhz}kHz Full-Band)`
            : activeSub === "fast"
              ? `SIQ Fast AI live (GTCRN + Air · ${srKhz}kHz · ~10ms)`
              : `SIQ Studio Pure live (${srKhz}kHz · ~2.7ms)`;
        const label =
          result.effectiveMode === "off"
            ? "Raw microphone (no noise filter)"
            : result.effectiveMode === "siq"
              ? processor?.fallbackNotice
                ? `${siqLabel} — ${processor.fallbackNotice}`
                : siqLabel
              : `Active filter: ${result.effectiveMode.toUpperCase()} (${srKhz}kHz)`;
        setStatus(
          noiseMode === "krisp"
            ? `${siqLabel} (Krisp activates live on Cloud voice rooms)`
            : label
        );

        let meterTick = 0;
        function draw() {
          if (!canvas || !drawing) return;
          const { clientWidth, clientHeight } = canvas;
          const dpr = window.devicePixelRatio || 1;
          const width = Math.round(clientWidth * dpr);
          const height = Math.round(clientHeight * dpr);
          if (canvas.width !== width) canvas.width = width;
          if (canvas.height !== height) canvas.height = height;
          analyser.getFloatTimeDomainData(samples);

          meterTick++;
          if (meterTick % 4 === 0) {
            let sumSq = 0;
            for (let i = 0; i < samples.length; i++) {
              sumSq += samples[i] * samples[i];
            }
            const rms = Math.sqrt(sumSq / samples.length);
            const db = Math.max(-70, Math.min(0, 20 * Math.log10(rms + 1e-9)));
            setFallbackDb(db);
          }

          drawing.clearRect(0, 0, width, height);
          drawing.strokeStyle = getComputedStyle(canvas).color;
          drawing.lineWidth = 1.5 * dpr;
          drawing.beginPath();
          for (let index = 0; index < samples.length; index++) {
            const x = (index / (samples.length - 1)) * width;
            const y = height * (0.5 + 0.45 * Math.max(-1, Math.min(1, samples[index] * 2.2)));
            if (index === 0) drawing.moveTo(x, y);
            else drawing.lineTo(x, y);
          }
          drawing.stroke();
          frame = requestAnimationFrame(draw);
        }
        draw();
      } catch (err) {
        releaseAudio();
        if (active) {
          setError(true);
          const detail = err instanceof Error ? err.message : "Unknown audio error";
          setStatus(`Could not start microphone filter: ${detail}`);
        }
      }
    }

    void start();
    return () => {
      active = false;
      releaseAudio();
    };
  }, [deviceId, outputDeviceId, echoCancellation, autoGainControl, noiseMode, siqDsp.aiEngine]);

  const levelDb = telemetry ? telemetry.inputDb : fallbackDb;
  const outputDb = telemetry ? telemetry.outputDb : null;
  const levelPct = dbToPercent(levelDb);
  const outputPct = outputDb !== null ? dbToPercent(outputDb) : null;
  const floorPct = telemetry ? dbToPercent(telemetry.noiseFloorDb) : null;
  const thresholdDb = telemetry
    ? telemetry.effectiveThresholdDb
    : !siqDsp.autoGate
      ? siqDsp.gateThresholdDb
      : null;
  const thresholdPct = thresholdDb !== null ? dbToPercent(thresholdDb) : null;

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`block h-12 w-full rounded-lg border border-white/[0.05] bg-[#090A0C] ${
          rawBypass ? "text-amber-400" : "text-emerald-400"
        }`}
      />

      {/* Live Studio dB VU Meter + Pre-AI Input vs Clean Output + Gate Marker */}
      <div className="space-y-1">
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[#090A0C] ring-1 ring-white/[0.06]">
          {/* Ambient noise floor marker */}
          {floorPct !== null && (
            <div
              className="absolute inset-y-0 left-0 bg-zinc-700/45 transition-all duration-150"
              style={{ width: `${floorPct}%` }}
            />
          )}
          {/* Raw pre-AI input ghost bar (shows how much noise the AI is stripping out) */}
          {telemetry && !rawBypass && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-rose-400/25 transition-[width] duration-75"
              style={{ width: `${levelPct}%` }}
            />
          )}
          {/* Active output level */}
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-75 ${
              (outputDb ?? levelDb) > -4
                ? "bg-rose-400"
                : rawBypass
                  ? "bg-amber-400"
                  : telemetry && !telemetry.gateOpen
                    ? "bg-zinc-500"
                    : "bg-emerald-400"
            }`}
            style={{ width: `${outputPct ?? levelPct}%` }}
          />
          {/* Gate threshold tick */}
          {thresholdPct !== null && !rawBypass && (
            <div
              className="absolute inset-y-0 w-0.5 bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.7)]"
              style={{ left: `${thresholdPct}%` }}
              title={`Gate threshold: ${Math.round(thresholdDb!)} dB`}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] tabular-nums text-zinc-400">
          <div className="flex flex-wrap items-center gap-2">
            <span>In: {Math.round(levelDb)} dB</span>
            {outputDb !== null && (
              <>
                <span className="text-zinc-600">·</span>
                <span>Out: {Math.round(outputDb)} dB</span>
              </>
            )}
            {telemetry && (
              <>
                <span className="text-zinc-600">·</span>
                <span>
                  {typeof telemetry.aiNoiseReductionDb === "number"
                    ? `AI NR: -${Math.round(telemetry.aiNoiseReductionDb)} dB`
                    : `NR: -${Math.round(telemetry.gainReductionDb)} dB`}
                </span>
              </>
            )}
          </div>
          {telemetry && (
            <span
              className={`rounded px-1.5 py-0.5 font-semibold tracking-wide ${
                rawBypass
                  ? "bg-amber-500/20 text-amber-300"
                  : telemetry.gateOpen
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-white/[0.06] text-zinc-400"
              }`}
            >
              {rawBypass ? "RAW MIC" : telemetry.gateOpen ? "VOICE OPEN" : "GATE CLOSED"}
            </span>
          )}
        </div>
      </div>

      <p role="status" className={error ? "text-[11px] text-rose-300" : "text-[11px] text-zinc-400"}>
        {status}
      </p>
    </div>
  );
}
