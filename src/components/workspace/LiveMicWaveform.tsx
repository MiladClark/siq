"use client";

import { Track } from "livekit-client";
import { Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createNoiseProcessor, type NoiseCancellationMode } from "@/lib/noise-processor";

interface MicOptions {
  deviceId: string;
  echoCancellation: boolean;
  autoGainControl: boolean;
  noiseMode: NoiseCancellationMode;
}

export function LiveMicWaveform(options: MicOptions) {
  const [running, setRunning] = useState(false);

  return (
    <div className="space-y-2 rounded-xl border border-white/[0.08] bg-[#0E0F12] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-200">Live Mic Waveform</p>
        <button
          type="button"
          aria-pressed={running}
          onClick={() => setRunning(!running)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#16171D] px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:text-white aria-pressed:border-rose-400/30 aria-pressed:bg-rose-500/15 aria-pressed:text-rose-300"
        >
          <Mic className="h-3.5 w-3.5" aria-hidden />
          {running ? "Stop Test" : "Mic Test"}
        </button>
      </div>
      {running ? (
        <MicPreview
          key={[
            options.deviceId,
            options.noiseMode,
            options.echoCancellation,
            options.autoGainControl,
          ].join(":")}
          {...options}
        />
      ) : (
        <div aria-hidden className="grid h-12 items-center rounded-md bg-[#090A0C] px-2">
          <span className="h-px bg-white/10" />
        </div>
      )}
    </div>
  );
}

function MicPreview({ deviceId, echoCancellation, autoGainControl, noiseMode }: MicOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Starting microphone…");
  const [error, setError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const drawing = canvas?.getContext("2d");
    if (!canvas || !drawing) return;
    let active = true;
    let stream: MediaStream | undefined;
    let audioContext: AudioContext | undefined;
    let processor: Awaited<ReturnType<typeof createNoiseProcessor>>["processor"] = null;
    let frame = 0;

    function releaseAudio() {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      processor?.processedTrack?.stop();
      if (processor) void processor.destroy().catch(() => {});
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
        const context = new AudioContext({ sampleRate: 48000 });
        audioContext = context;
        // Krisp requires a LiveKit Cloud room. The local preview uses the same RNNoise fallback as local calls.
        const result = await createNoiseProcessor(noiseMode, false);
        if (!active) return;
        const track = capture.getAudioTracks()[0];
        let analysisStream = capture;
        if (result.processor) {
          const filter = result.processor;
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
          if (filter.processedTrack) {
            analysisStream = new MediaStream([filter.processedTrack]);
          }
        }

        const source = context.createMediaStreamSource(analysisStream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const silentOutput = context.createGain();
        silentOutput.gain.value = 0;
        analyser.connect(silentOutput).connect(context.destination);
        await context.resume();
        if (!active) return;
        const samples = new Float32Array(analyser.fftSize);
        const label =
          result.effectiveMode === "off"
            ? "Noise cancellation off"
            : `Active filter: ${result.effectiveMode.toUpperCase()}`;
        setStatus(noiseMode === "krisp" ? "RNNoise preview (Krisp runs on Cloud)" : label);

        function draw() {
          if (!canvas || !drawing) return;
          const { clientWidth, clientHeight } = canvas;
          const dpr = window.devicePixelRatio || 1;
          const width = Math.round(clientWidth * dpr);
          const height = Math.round(clientHeight * dpr);
          if (canvas.width !== width) canvas.width = width;
          if (canvas.height !== height) canvas.height = height;
          analyser.getFloatTimeDomainData(samples);
          drawing.clearRect(0, 0, width, height);
          drawing.strokeStyle = getComputedStyle(canvas).color;
          drawing.lineWidth = 1.5 * dpr;
          drawing.beginPath();
          samples.forEach((sample, index) => {
            const x = (index / (samples.length - 1)) * width;
            const y = height * (0.5 + 0.46 * Math.max(-1, Math.min(1, sample * 2)));
            if (index === 0) drawing.moveTo(x, y);
            else drawing.lineTo(x, y);
          });
          drawing.stroke();
          frame = requestAnimationFrame(draw);
        }
        draw();
      } catch {
        releaseAudio();
        if (active) {
          setError(true);
          setStatus("Could not start the microphone with these settings.");
        }
      }
    }

    void start();
    return () => {
      active = false;
      releaseAudio();
    };
  }, [deviceId, echoCancellation, autoGainControl, noiseMode]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="block h-12 w-full rounded-md bg-[#090A0C] text-emerald-400"
      />
      <p role="status" className={error ? "text-[11px] text-rose-300" : "text-[11px] text-zinc-400"}>
        {status}
      </p>
    </>
  );
}
