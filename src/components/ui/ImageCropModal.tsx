"use client";

import { Check, Crop, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

export type CropMode = "avatar" | "banner";

interface ImageCropModalProps {
  file: File | null;
  mode: CropMode;
  onCancel: () => void;
  onCropped: (file: File) => void;
}

const FRAME_CONFIG: Record<
  CropMode,
  {
    title: string;
    subtitle: string;
    frameW: number;
    frameH: number;
    outW: number;
    outH: number;
    isCircle: boolean;
  }
> = {
  avatar: {
    title: "Crop Profile Photo",
    subtitle: "Drag to position, scroll or slide to zoom · exported as WebP",
    frameW: 280,
    frameH: 280,
    outW: 512,
    outH: 512,
    isCircle: true,
  },
  banner: {
    title: "Crop Profile Banner",
    subtitle: "Drag to position, scroll or slide to zoom · exported as WebP",
    frameW: 440,
    frameH: 152,
    outW: 1200,
    outH: 414,
    isCircle: false,
  },
};

export function ImageCropModal({
  file,
  mode,
  onCancel,
  onCropped,
}: ImageCropModalProps) {
  const cfg = FRAME_CONFIG[mode];

  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const imgElRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!file) {
      setImgSrc(null);
      setNaturalSize(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Base cover scale so zoom=1 fills the entire crop frame cleanly
  const baseScale = naturalSize
    ? Math.max(cfg.frameW / naturalSize.w, cfg.frameH / naturalSize.h)
    : 1;

  const clampOffset = useCallback(
    (x: number, y: number, targetZoom: number) => {
      if (!naturalSize) return { x: 0, y: 0 };
      const dispW = naturalSize.w * baseScale * targetZoom;
      const dispH = naturalSize.h * baseScale * targetZoom;
      const maxX = Math.max(0, (dispW - cfg.frameW) / 2);
      const maxY = Math.max(0, (dispH - cfg.frameH) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      };
    },
    [baseScale, cfg.frameH, cfg.frameW, naturalSize]
  );

  function updateZoom(nextZoom: number) {
    const clampedZ = Math.max(1, Math.min(3.5, Number(nextZoom.toFixed(2))));
    setZoom(clampedZ);
    setOffset((prev) => clampOffset(prev.x, prev.y, clampedZ));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.origX + dx, dragRef.current.origY + dy, zoom));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.14 : -0.14;
    updateZoom(zoom + delta);
  }

  async function handleConfirm() {
    const img = imgElRef.current;
    if (!img || !naturalSize || !file) return;
    setProcessing(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = cfg.outW;
      canvas.height = cfg.outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setProcessing(false);
        return;
      }

      const scale = baseScale * zoom;
      const dispW = naturalSize.w * scale;
      const dispH = naturalSize.h * scale;

      // Top-left of the image relative to the crop frame
      const imgLeftInFrame = (cfg.frameW - dispW) / 2 + offset.x;
      const imgTopInFrame = (cfg.frameH - dispH) / 2 + offset.y;

      // Map frame rect (0, 0, frameW, frameH) back to source image pixels
      const sx = -imgLeftInFrame / scale;
      const sy = -imgTopInFrame / scale;
      const sw = cfg.frameW / scale;
      const sh = cfg.frameH / scale;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cfg.outW, cfg.outH);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.86)
      );
      if (!blob) {
        setProcessing(false);
        return;
      }

      const outFile = new File([blob], `${mode}-${Date.now()}.webp`, {
        type: "image/webp",
      });
      onCropped(outFile);
    } finally {
      setProcessing(false);
    }
  }

  const dispW = naturalSize ? naturalSize.w * baseScale * zoom : 0;
  const dispH = naturalSize ? naturalSize.h * baseScale * zoom : 0;

  return (
    <AnimatePresence>
      {file && imgSrc && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onCancel}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={cfg.title}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.12] bg-[#121316] shadow-2xl shadow-black/80"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Crop className="h-4 w-4 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">{cfg.title}</h3>
                  <p className="text-[11px] text-zinc-400">{cfg.subtitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCancel}
                aria-label="Close cropper"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Interactive Crop Canvas */}
            <div className="flex flex-col items-center gap-5 bg-[#09090B] px-5 py-6">
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
                style={{
                  width: cfg.frameW,
                  height: cfg.frameH,
                  maxWidth: "100%",
                }}
                className={`relative cursor-grab overflow-hidden border-2 border-emerald-400/80 bg-[#121316] shadow-2xl active:cursor-grabbing touch-none ${
                  cfg.isCircle ? "rounded-full" : "rounded-xl"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgElRef}
                  src={imgSrc}
                  alt="Crop preview"
                  draggable={false}
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
                  }}
                  style={
                    naturalSize
                      ? {
                          width: dispW,
                          height: dispH,
                          left: (cfg.frameW - dispW) / 2 + offset.x,
                          top: (cfg.frameH - dispH) / 2 + offset.y,
                        }
                      : { opacity: 0 }
                  }
                  className="pointer-events-none absolute max-w-none select-none"
                />

                {/* Subtle rule-of-thirds guide lines */}
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-20">
                  <div className="border-b border-r border-white/50" />
                  <div className="border-b border-r border-white/50" />
                  <div className="border-b border-white/50" />
                  <div className="border-b border-r border-white/50" />
                  <div className="border-b border-r border-white/50" />
                  <div className="border-b border-white/50" />
                  <div className="border-r border-white/50" />
                  <div className="border-r border-white/50" />
                  <div />
                </div>
              </div>

              {/* Zoom Bar */}
              <div className="flex w-full max-w-sm items-center gap-3">
                <button
                  type="button"
                  onClick={() => updateZoom(zoom - 0.2)}
                  aria-label="Zoom out"
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={3.5}
                  step={0.02}
                  aria-label="Zoom level"
                  value={zoom}
                  onChange={(e) => updateZoom(Number(e.target.value))}
                  className="h-1.5 flex-1 cursor-pointer accent-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => updateZoom(zoom + 0.2)}
                  aria-label="Zoom in"
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setOffset({ x: 0, y: 0 });
                  }}
                  title="Reset crop"
                  className="rounded-lg border border-white/[0.09] bg-[#18191E] p-1.5 text-zinc-400 hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] bg-[#0E0F12] px-5 py-3.5">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-white/[0.1] px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.05]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processing || !naturalSize}
                onClick={() => void handleConfirm()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{processing ? "Converting WebP..." : "Apply"}</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
