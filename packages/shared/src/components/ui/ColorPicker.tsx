"use client";

import { Check, Pipette, SlidersHorizontal } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useEffect, useId, useState } from "react";

type Hsl = { h: number; s: number; l: number };
type Format = "HEX" | "RGB" | "HSL";
type EyeDropperConstructor = new () => { open(): Promise<{ sRGBHex: string }> };

function normalizeHex(input: string) {
  const hex = input.trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(hex)) return `#${[...hex].map((digit) => digit.repeat(2)).join("")}`.toUpperCase();
  return /^[\da-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : null;
}

function readRgb(hex: string) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function readHsl(hex: string): Hsl {
  const [r, g, b] = readRgb(hex).map((channel) => channel / 255);
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const l = (high + low) / 2;
  const range = high - low;
  if (range === 0) return { h: 0, s: 0, l: l * 100 };
  const h = high === r ? (g - b) / range : high === g ? 2 + (b - r) / range : 4 + (r - g) / range;
  return { h: (h * 60 + 360) % 360, s: range / (1 - Math.abs(2 * l - 1)) * 100, l: l * 100 };
}

function hslToHex({ h, s, l }: Hsl) {
  const lightness = l / 100;
  const amplitude = s / 100 * Math.min(lightness, 1 - lightness);
  return `#${[0, 8, 4].map((offset) => {
    const k = (offset + h / 30) % 12;
    const channel = lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * channel).toString(16).padStart(2, "0");
  }).join("")}`.toUpperCase();
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function ColorPicker({
  value,
  onChange,
  label,
  presets,
  disabled = false,
}: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  presets: readonly string[];
  disabled?: boolean;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [format, setFormat] = useState<Format>("HEX");
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ hex: string; hsl: Hsl } | null>(null);
  const [eyeDropper, setEyeDropper] = useState<EyeDropperConstructor | null>(null);
  const hex = normalizeHex(value) ?? "#10B981";
  const hsl = selection?.hex === hex ? selection.hsl : readHsl(hex);

  useEffect(() => {
    const constructor = (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper;
    if (constructor) setEyeDropper(() => constructor);
  }, []);

  function updateColor(color: string, coordinates = readHsl(color)) {
    setSelection({ hex: color, hsl: coordinates });
    if (color !== hex) onChange(color);
  }

  function updateHsl(next: Hsl) {
    setHexDraft(null);
    updateColor(hslToHex(next), next);
  }

  function movePlane(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    updateHsl({
      h: hsl.h,
      s: clampPercent((event.clientX - rect.left) / rect.width * 100),
      l: clampPercent(100 - (event.clientY - rect.top) / rect.height * 100),
    });
  }

  function handlePlaneKeys(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 1;
    const changes: Record<string, [number, number]> = {
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const delta = changes[event.key];
    if (!delta) return;
    event.preventDefault();
    updateHsl({ h: hsl.h, s: clampPercent(hsl.s + delta[0]), l: clampPercent(hsl.l + delta[1]) });
  }

  async function sampleColor() {
    if (!eyeDropper) return;
    try {
      const color = normalizeHex((await new eyeDropper().open()).sRGBHex);
      if (color) {
        setHexDraft(null);
        updateColor(color);
      }
    } catch {
      // The browser lets the user cancel sampling with Escape.
    }
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2.5 disabled:opacity-60">
      <legend className="mb-2 text-xs font-medium text-zinc-300">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((preset) => {
          const color = normalizeHex(preset) ?? preset;
          const active = color === hex;
          return (
            <button
              key={preset}
              type="button"
              aria-label={`Choose ${preset}`}
              aria-pressed={active}
              onClick={() => { setHexDraft(null); updateColor(color); }}
              style={{ backgroundColor: color }}
              className="relative grid size-9 place-items-center rounded-full border border-white/15 shadow-sm transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-200 sm:size-7"
            >
              {active && <Check aria-hidden="true" className="size-3.5 text-white drop-shadow-[0_1px_2px_black]" />}
            </button>
          );
        })}
        <button
          type="button"
          aria-expanded={expanded && !disabled}
          aria-controls={`${id}-editor`}
          onClick={() => setExpanded((open) => !open)}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/[0.1] bg-[#18191e] px-2.5 text-xs font-medium text-zinc-200 hover:border-white/20"
        >
          <SlidersHorizontal aria-hidden="true" className="size-3.5" />
          Custom color
        </button>
      </div>
      {expanded && !disabled && (
        <div id={`${id}-editor`} className="w-full max-w-sm space-y-3 rounded-xl border border-white/[0.1] bg-[#14151a] p-3">
          <div
            tabIndex={0}
            aria-label={`${label} saturation and lightness. Left and right change saturation. Up and down change lightness.`}
            aria-roledescription="two-dimensional color control"
            role="group"
            onKeyDown={handlePlaneKeys}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.focus({ preventScroll: true });
              event.currentTarget.setPointerCapture(event.pointerId);
              movePlane(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) movePlane(event);
            }}
            style={{ backgroundImage: `linear-gradient(in srgb, white, transparent 50%, black), linear-gradient(to right in srgb, #808080, hsl(${hsl.h} 100% 50%))` }}
            className="relative h-32 cursor-crosshair touch-none rounded-lg border border-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            <span aria-hidden="true" style={{ left: `${hsl.s}%`, top: `${100 - hsl.l}%`, backgroundColor: hex }} className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_#14151a]" />
          </div>

          <input type="range" aria-label={`${label} hue`} min={0} max={359} value={Math.min(359, Math.round(hsl.h))} onChange={(event) => updateHsl({ ...hsl, h: event.currentTarget.valueAsNumber })} className="siq-color-hue h-7 w-full cursor-pointer" />

          <div className="flex items-center gap-2">
            <span aria-hidden="true" style={{ backgroundColor: hex }} className="size-8 shrink-0 rounded-lg border border-white/15" />
            <select aria-label="Color format" value={format} onChange={(event) => { setHexDraft(null); setFormat(event.target.value as Format); }} className="h-9 shrink-0 rounded-lg border border-white/[0.1] bg-[#18191e] px-1.5 text-xs text-zinc-300">
              <option>HEX</option>
              <option>RGB</option>
              <option>HSL</option>
            </select>
            {format === "HEX" ? (
              <input
                aria-label={`${label} HEX`}
                aria-invalid={hexDraft !== null && !normalizeHex(hexDraft)}
                autoComplete="off"
                spellCheck={false}
                maxLength={7}
                value={hexDraft ?? hex}
                onChange={(event) => {
                  const draft = event.target.value;
                  setHexDraft(draft);
                  const color = normalizeHex(draft);
                  if (color && draft.replace(/^#/, "").length === 6) updateColor(color);
                }}
                onBlur={() => {
                  const color = hexDraft === null ? null : normalizeHex(hexDraft);
                  if (color && color !== hex) updateColor(color);
                  setHexDraft(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#0e0f12] px-2 font-mono text-xs text-zinc-100 aria-invalid:border-rose-400/60"
              />
            ) : (
              <output className="min-w-0 flex-1 break-words font-mono text-xs text-zinc-200">
                {format === "RGB" ? readRgb(hex).join(", ") : `${Math.round(hsl.h)}°, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%`}
              </output>
            )}
            {eyeDropper && (
              <button type="button" title="Pick color from screen" aria-label="Pick color from screen" onClick={() => void sampleColor()} className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.1] bg-[#18191e] text-zinc-200 hover:border-white/20">
                <Pipette aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </fieldset>
  );
}
