"use client";

import { animate, motion, useMotionValue, usePresence, useReducedMotion } from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type HeaderPanelKind = "search" | "pins" | "notifications" | "invite" | "voice";

/*
 * Liquid header panels — the same physics as the Sileo toast.
 *
 * Two rounded rects are drawn inside an SVG gooey filter: a "pill" that sits exactly behind the
 * trigger button and a "body" for the panel. Blur + alpha threshold melts them into one liquid
 * shape (smooth fillets, no sharp or zero-radius corner anywhere).
 *
 * One spring value drives everything: at 0 the body is folded into the trigger's own rect, at 1 it
 * fills the panel. Opening inflates the button into the panel; closing folds it back into the
 * button (no thin strip is ever left behind, so the filter never produces a stray oval). The
 * content is clipped to the body while it grows, the liquid fades as one piece once it is back
 * inside the button, and only then does the button's own look return (see globals.css).
 */
const ROUNDNESS = 18;
const BLUR = ROUNDNESS * 0.5;
const GAP = 10; // must match the panel offset in globals.css (.siq-header-panel)
const PAD = BLUR * 3 + 12; // blur margin plus room for the open spring's small overshoot
const STRETCH = GAP + BLUR * 2; // how far the pill reaches toward the body when open
const FILL_TOP = "#1B1C24";
const FILL_BOTTOM = "#121319";
const OPEN_SPRING = { type: "spring", bounce: 0.25, duration: 0.6 } as const;
const CLOSE_SPRING = { type: "spring", bounce: 0, duration: 0.42 } as const;
// The folded liquid fades out while the button's own chrome waits (globals.css: 300ms delay)
const LIQUID_FADE = { duration: 0.18, delay: 0.26, ease: "easeOut" } as const;
const TRIGGER_RETURN_MS = 700;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Geometry {
  width: number;
  height: number;
  pill: Rect;
}

function sameGeometry(a: Geometry | null, b: Geometry) {
  return (
    a !== null &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5 &&
    Math.abs(a.pill.x - b.pill.x) < 0.5 &&
    Math.abs(a.pill.y - b.pill.y) < 0.5 &&
    Math.abs(a.pill.w - b.pill.w) < 0.5 &&
    Math.abs(a.pill.h - b.pill.h) < 0.5
  );
}

/** SVG canvas covering the panel and the trigger pill, plus blur margin (panel coordinates) */
function canvasFor(g: Geometry): Rect {
  const minX = Math.min(0, g.pill.x) - PAD;
  const minY = Math.min(0, g.pill.y) - PAD;
  const maxX = Math.max(g.width, g.pill.x + g.pill.w) + PAD;
  const maxY = Math.max(g.height, g.pill.y + g.pill.h) + PAD;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

function setRect(el: SVGRectElement | null, x: number, y: number, w: number, h: number) {
  if (!el) return;
  el.setAttribute("x", x.toFixed(2));
  el.setAttribute("y", y.toFixed(2));
  el.setAttribute("width", Math.max(0, w).toFixed(2));
  el.setAttribute("height", Math.max(0, h).toFixed(2));
}

function findTrigger(kind: HeaderPanelKind) {
  return document.querySelector<HTMLElement>(`[data-header-trigger="${kind}"]`);
}

const returnTimers = new WeakMap<HTMLElement, number>();

/** Melts the trigger into the liquid pill (see globals.css) */
function captureTrigger(trigger: HTMLElement) {
  window.clearTimeout(returnTimers.get(trigger));
  trigger.dataset.liquid = "on";
}

/** Gives the trigger its own look back, after a delay, once the liquid has folded into it */
function releaseTrigger(trigger: HTMLElement) {
  if (trigger.dataset.liquid !== "on") return;
  trigger.dataset.liquid = "returning";
  window.clearTimeout(returnTimers.get(trigger));
  returnTimers.set(
    trigger,
    window.setTimeout(() => {
      if (trigger.dataset.liquid === "returning") delete trigger.dataset.liquid;
    }, TRIGGER_RETURN_MS)
  );
}

export function HeaderPanel({
  kind,
  label,
  style,
  children,
  pillContent,
}: {
  kind: HeaderPanelKind;
  label: string;
  style?: CSSProperties;
  children: ReactNode;
  /**
   * Drawn on top of the liquid pill. Needed when the panel is portaled above its trigger
   * (voice), so the trigger's icon stays visible; clicks still reach the real trigger.
   */
  pillContent?: ReactNode;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const [isPresent, safeToRemove] = usePresence();
  // The voice panel rises out of the sidebar dock; every other panel drops from the header
  const opensUp = kind === "voice";
  const sectionRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pillRef = useRef<SVGRectElement | null>(null);
  const bodyRef = useRef<SVGRectElement | null>(null);
  const geoRef = useRef<Geometry | null>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);
  // 0 = folded into the trigger, 1 = fully open
  const progress = useMotionValue(0);
  const filterId = `siq-liquid-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const gradientId = `${filterId}-fill`;

  // Draws the liquid shape and clips the content for the current progress
  const paint = useCallback(() => {
    const content = contentRef.current;
    const g = geoRef.current;
    if (reducedMotion) {
      if (content) content.style.clipPath = "";
      return;
    }
    if (!g) return;
    const p = progress.get();
    const c = canvasFor(g);
    const { pill } = g;

    // Body morphs between the trigger's rect and the full panel
    const bx = lerp(pill.x, 0, p);
    const by = lerp(pill.y, 0, p);
    const bw = lerp(pill.w, g.width, p);
    const bh = lerp(pill.h, g.height, p);
    setRect(bodyRef.current, bx - c.x, by - c.y, bw, bh);

    // Pill reaches toward the body so the two melt through the gap
    const reach = STRETCH * Math.min(Math.max(p, 0), 1);
    setRect(
      pillRef.current,
      pill.x - c.x,
      (opensUp ? pill.y - reach : pill.y) - c.y,
      pill.w,
      pill.h + reach
    );

    // Content shows only where the body has grown
    if (content) {
      const top = Math.max(0, by);
      const left = Math.max(0, bx);
      const right = Math.max(0, g.width - (bx + bw));
      const bottom = Math.max(0, g.height - (by + bh));
      content.style.clipPath =
        `inset(${top.toFixed(1)}px ${right.toFixed(1)}px ${bottom.toFixed(1)}px ${left.toFixed(1)}px ` +
        `round ${ROUNDNESS}px)`;
    }
  }, [opensUp, progress, reducedMotion]);

  useEffect(() => progress.on("change", paint), [progress, paint]);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const content = contentRef.current;
    if (!section || !content) return;

    const measure = () => {
      // Layout sizes (offset*) ignore transforms; client rects include them. Dividing by the ratio
      // keeps the pill aligned even while an ancestor is scaled (view transitions, zoom effects).
      const width = section.offsetWidth;
      const height = content.offsetHeight;
      const s = section.getBoundingClientRect();
      const k = width > 0 && s.width > 0 ? s.width / width : 1;
      const t = findTrigger(kind)?.getBoundingClientRect();
      const pill = t
        ? { x: (t.left - s.left) / k, y: (t.top - s.top) / k, w: t.width / k, h: t.height / k }
        : {
            x: opensUp ? 0 : width - 32,
            y: opensUp ? height + GAP : -GAP - 32,
            w: 32,
            h: 32,
          };
      const next = { width, height, pill };
      if (!sameGeometry(geoRef.current, next)) {
        geoRef.current = next;
        setGeo(next);
      }
      paint();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    observer.observe(content);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [kind, opensUp, paint]);

  // Rects are created once the canvas exists; draw them before the browser paints
  useLayoutEffect(() => {
    paint();
  }, [geo, paint]);

  // Open: inflate out of the trigger. Close: fold back in, fade the liquid, then unmount.
  useEffect(() => {
    if (reducedMotion) {
      if (!isPresent) safeToRemove?.();
      return;
    }
    const trigger = findTrigger(kind);

    if (isPresent) {
      if (trigger) captureTrigger(trigger);
      const grow = animate(progress, 1, OPEN_SPRING);
      // Reopened mid-close: bring a half-faded liquid back
      const svg = svgRef.current;
      const show = svg ? animate(svg, { opacity: 1 }, { duration: 0.12 }) : null;
      return () => {
        grow.stop();
        show?.stop();
        if (trigger) releaseTrigger(trigger);
      };
    }

    if (trigger) releaseTrigger(trigger);
    let cancelled = false;
    const fold = animate(progress, 0, CLOSE_SPRING);
    const svg = svgRef.current;
    const fade = svg ? animate(svg, { opacity: 0 }, LIQUID_FADE) : null;
    void Promise.all(fade ? [fold, fade] : [fold]).then(() => {
      if (!cancelled) safeToRemove?.();
    });
    return () => {
      cancelled = true;
      fold.stop();
      fade?.stop();
    };
  }, [isPresent, kind, progress, reducedMotion, safeToRemove]);

  const canvas = geo ? canvasFor(geo) : null;

  return (
    <motion.section
      ref={sectionRef}
      id={`workspace-header-${kind}`}
      data-header-panel={kind}
      data-tauri-drag-region="false"
      role="dialog"
      aria-label={label}
      initial={reducedMotion ? { opacity: 0 } : false}
      animate={reducedMotion ? { opacity: 1 } : undefined}
      exit={reducedMotion ? { opacity: 0, transition: { duration: 0.12 } } : undefined}
      className="siq-header-panel"
      style={style}
    >
      {canvas && !reducedMotion && (
        <svg
          ref={svgRef}
          aria-hidden="true"
          className="siq-liquid-canvas"
          width={canvas.w}
          height={canvas.h}
          viewBox={`0 0 ${canvas.w} ${canvas.h}`}
          style={{ left: canvas.x, top: canvas.y }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={FILL_TOP} />
              <stop offset="100%" stopColor={FILL_BOTTOM} />
            </linearGradient>
            <filter
              id={filterId}
              filterUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={canvas.w}
              height={canvas.h}
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation={BLUR} result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
                result="goo"
              />
              <feComposite in="SourceGraphic" in2="goo" operator="atop" result="shape" />
              <feMorphology in="shape" operator="dilate" radius={1} result="rim" />
              <feFlood floodColor="#ffffff" floodOpacity={0.1} result="rimColor" />
              <feComposite in="rimColor" in2="rim" operator="in" result="outline" />
              <feMerge>
                <feMergeNode in="outline" />
                <feMergeNode in="shape" />
              </feMerge>
            </filter>
          </defs>
          <g filter={`url(#${filterId})`}>
            <rect ref={pillRef} rx={ROUNDNESS} ry={ROUNDNESS} fill={`url(#${gradientId})`} />
            <rect ref={bodyRef} rx={ROUNDNESS} ry={ROUNDNESS} fill={`url(#${gradientId})`} />
          </g>
        </svg>
      )}

      {pillContent && geo && !reducedMotion && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute z-[2] grid place-items-center"
          style={{ left: geo.pill.x, top: geo.pill.y, width: geo.pill.w, height: geo.pill.h }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.12 } }}
          exit={{ opacity: 0, transition: LIQUID_FADE }}
        >
          {pillContent}
        </motion.span>
      )}

      <motion.div
        ref={contentRef}
        className={`siq-liquid-content ${reducedMotion ? "siq-liquid-content-static" : ""}`}
        initial={reducedMotion ? false : { opacity: 0, filter: "blur(6px)" }}
        animate={{
          opacity: 1,
          filter: "blur(0px)",
          transition: { delay: reducedMotion ? 0 : 0.08, duration: 0.3, ease: [0.22, 1, 0.36, 1] },
        }}
        exit={
          reducedMotion
            ? undefined
            : { opacity: 0, filter: "blur(4px)", transition: { duration: 0.14 } }
        }
      >
        {/* Accent light spilling from the trigger side into the panel */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 -z-10 ${
            opensUp
              ? "bg-[radial-gradient(80%_60%_at_0%_100%,rgb(var(--siq-accent-rgb)/0.12),transparent_70%)]"
              : "bg-[radial-gradient(80%_60%_at_100%_0%,rgb(var(--siq-accent-rgb)/0.12),transparent_70%)]"
          }`}
        />
        {children}
      </motion.div>
    </motion.section>
  );
}
