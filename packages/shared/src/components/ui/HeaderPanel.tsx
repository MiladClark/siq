"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
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
 * shape (smooth fillets, no sharp or zero-radius corner anywhere). The body grows with Sileo's
 * spring, the pill stretches to meet it, and the content fades in from a blur once the shape
 * has mostly formed. Closing reverses it without bounce.
 */
const ROUNDNESS = 18;
const BLUR = ROUNDNESS * 0.5;
const GAP = 10; // must match the panel offset in globals.css (.siq-header-panel)
const PAD = BLUR * 3;
const FILL_TOP = "#1B1C24";
const FILL_BOTTOM = "#121319";
const OPEN_SPRING = { type: "spring", bounce: 0.25, duration: 0.6 } as const;
const CLOSE_SPRING = { type: "spring", bounce: 0, duration: 0.42 } as const;
// The pill dissolves in the last moments of the close, so the real trigger takes over smoothly
const PILL_FADE = { duration: 0.14, delay: 0.28 } as const;

interface Geometry {
  width: number;
  height: number;
  pill: { x: number; y: number; w: number; h: number };
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
  const reducedMotion = useReducedMotion();
  // The voice panel rises out of the sidebar dock; every other panel drops from the header
  const opensUp = kind === "voice";
  const sectionRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);
  const filterId = `siq-liquid-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const gradientId = `${filterId}-fill`;

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
      const trigger = document.querySelector<HTMLElement>(`[data-header-trigger="${kind}"]`);
      const t = trigger?.getBoundingClientRect();
      const pill = t
        ? { x: (t.left - s.left) / k, y: (t.top - s.top) / k, w: t.width / k, h: t.height / k }
        : {
            x: opensUp ? 0 : width - 32,
            y: opensUp ? height + GAP : -GAP - 32,
            w: 32,
            h: 32,
          };
      const next = { width, height, pill };
      setGeo((prev) => (sameGeometry(prev, next) ? prev : next));
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
  }, [kind, opensUp]);

  // SVG canvas covering both the panel body and the trigger pill (plus blur margin)
  const canvas = geo
    ? (() => {
        const minX = Math.min(0, geo.pill.x) - PAD;
        const minY = Math.min(0, geo.pill.y) - PAD;
        const maxX = Math.max(geo.width, geo.pill.x + geo.pill.w) + PAD;
        const maxY = Math.max(geo.height, geo.pill.y + geo.pill.h) + PAD;
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      })()
    : null;

  // Pill stretches toward the body so the two melt into one shape through the gap
  const stretch = GAP + BLUR * 2;
  const pillClosed = geo && canvas
    ? { x: geo.pill.x - canvas.x, y: geo.pill.y - canvas.y, width: geo.pill.w, height: geo.pill.h }
    : null;
  const pillOpen = geo && canvas && pillClosed
    ? opensUp
      ? { ...pillClosed, y: pillClosed.y - stretch, height: geo.pill.h + stretch }
      : { ...pillClosed, height: geo.pill.h + stretch }
    : null;
  const bodyX = canvas ? -canvas.x : 0;
  const bodyTop = canvas ? -canvas.y : 0;
  const bodyOpen = geo ? { y: bodyTop, height: geo.height, opacity: 1 } : null;
  const bodyClosed = geo
    ? opensUp
      ? { y: bodyTop + geo.height, height: 0, opacity: 0 }
      : { y: bodyTop, height: 0, opacity: 0 }
    : null;

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
      {canvas && pillOpen && pillClosed && bodyOpen && bodyClosed && !reducedMotion && (
        <svg
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
            <motion.rect
              rx={ROUNDNESS}
              ry={ROUNDNESS}
              fill={`url(#${gradientId})`}
              initial={{ ...pillClosed, opacity: 1 }}
              animate={{ ...pillOpen, opacity: 1 }}
              exit={{ ...pillClosed, opacity: 0, transition: { ...CLOSE_SPRING, opacity: PILL_FADE } }}
              transition={OPEN_SPRING}
            />
            <motion.rect
              x={bodyX}
              width={geo?.width ?? 0}
              rx={ROUNDNESS}
              ry={ROUNDNESS}
              fill={`url(#${gradientId})`}
              initial={bodyClosed}
              animate={bodyOpen}
              exit={{ ...bodyClosed, transition: CLOSE_SPRING }}
              transition={OPEN_SPRING}
            />
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
          exit={{ opacity: 0, transition: PILL_FADE }}
        >
          {pillContent}
        </motion.span>
      )}

      <motion.div
        ref={contentRef}
        className={`siq-liquid-content ${reducedMotion ? "siq-liquid-content-static" : ""}`}
        initial={reducedMotion ? false : { opacity: 0, filter: "blur(6px)", y: opensUp ? 6 : -6 }}
        animate={{
          opacity: 1,
          filter: "blur(0px)",
          y: 0,
          transition: { delay: reducedMotion ? 0 : 0.14, duration: 0.34, ease: [0.22, 1, 0.36, 1] },
        }}
        exit={
          reducedMotion
            ? undefined
            : { opacity: 0, filter: "blur(4px)", transition: { duration: 0.12 } }
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
