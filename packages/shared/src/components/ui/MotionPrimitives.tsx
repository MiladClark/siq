"use client";

import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { createContext, type ReactNode, useContext, useRef, useState } from "react";

/* ============================================================================
 * 1. SlidingNumber (Motion Primitives inspired odometer digit transitions)
 * ============================================================================ */
export function SlidingNumber({
  value,
  padStart = false,
  className = "",
}: {
  value: number;
  padStart?: boolean;
  className?: string;
}) {
  const formatted = padStart && value < 10 && value >= 0 ? `0${value}` : String(value);
  const chars = formatted.split("");

  return (
    <span className={`inline-flex items-baseline overflow-hidden tabular-nums ${className}`}>
      {chars.map((char, idx) => (
        <span
          key={`${chars.length - idx}-${idx}`}
          className="relative inline-flex h-[1.15em] items-center justify-center overflow-hidden"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={char}
              initial={{ y: "65%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={{ y: "-65%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
              className="inline-block leading-none"
            >
              {char}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

/* ============================================================================
 * 2. SpotlightCard (Crisp hairline radial cursor spotlight — anti-slop studio card)
 * ============================================================================ */
export function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgb(var(--siq-accent-rgb) / 0.12)",
  active = false,
  onContextMenu,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
  active?: boolean;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const mouseX = useMotionValue(-200);
  const mouseY = useMotionValue(-200);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  }

  function handleMouseLeave() {
    mouseX.set(-200);
    mouseY.set(-200);
  }

  const spotlightBg = useMotionTemplate`radial-gradient(240px circle at ${mouseX}px ${mouseY}px, ${spotlightColor}, transparent 75%)`;

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onContextMenu={onContextMenu}
      onClick={onClick}
      className={`group/spot relative overflow-hidden ${className}`}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{ background: spotlightBg }}
      />
      {active && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,rgb(var(--siq-accent-rgb)/0.14),transparent_65%)]"
        />
      )}
      {children}
    </div>
  );
}

/* ============================================================================
 * 3. FloatingDock & DockItem (Motion Primitives macOS-style spring control dock)
 * ============================================================================ */
const DockMouseContext = createContext<MotionValue<number> | null>(null);

export function FloatingDock({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const mouseX = useMotionValue(Infinity);

  return (
    <DockMouseContext.Provider value={mouseX}>
      <motion.div
        onMouseMove={(e) => mouseX.set(e.pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className={`siq-glass inline-flex items-center gap-1.5 rounded-[22px] px-2.5 py-2 ${className}`}
      >
        {children}
      </motion.div>
    </DockMouseContext.Provider>
  );
}

export function DockItem({
  children,
  label,
  onClick,
  active = false,
  danger = false,
  solidDanger = false,
  disabled = false,
  badge,
  className = "",
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  solidDanger?: boolean;
  disabled?: boolean;
  badge?: string;
  className?: string;
}) {
  const mouseX = useContext(DockMouseContext);
  const ref = useRef<HTMLButtonElement | null>(null);
  const [hovered, setHovered] = useState(false);

  const fallbackX = useMotionValue(Infinity);
  const activeMouseX = mouseX ?? fallbackX;

  const distance = useTransform(activeMouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds || val === Infinity) return 200;
    return val - bounds.x - bounds.width / 2;
  });

  const scaleRaw = useTransform(distance, [-110, 0, 110], [1, 1.16, 1]);
  const yRaw = useTransform(distance, [-110, 0, 110], [0, -4, 0]);
  const scale = useSpring(scaleRaw, { mass: 0.12, stiffness: 280, damping: 18 });
  const y = useSpring(yRaw, { mass: 0.12, stiffness: 280, damping: 18 });

  const surfaceClass = solidDanger
    ? "border-rose-400/60 bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_26px_-10px_rgba(244,63,94,0.9)] hover:from-rose-400 hover:to-rose-500"
    : danger
      ? "border-rose-500/45 bg-rose-500/15 text-rose-300 shadow-[0_0_20px_-8px_rgba(244,63,94,0.9)] hover:bg-rose-500/25"
      : active
        ? "border-emerald-500/50 bg-gradient-to-b from-emerald-500/25 to-emerald-500/10 text-emerald-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_22px_-8px_rgb(var(--siq-accent-rgb)/0.9)] hover:from-emerald-500/30"
        : "border-white/[0.08] bg-gradient-to-b from-white/[0.07] to-white/[0.02] text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-white/[0.16] hover:from-white/[0.11] hover:text-white";

  return (
    <div className="relative flex items-center justify-center">
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 3, scale: 0.94 }}
            transition={{ duration: 0.12 }}
            className="siq-glass pointer-events-none absolute -top-10 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-[10px] px-2.5 py-1 text-[11px] font-semibold text-zinc-100"
          >
            {label}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        whileTap={{ scale: 0.92 }}
        style={{ scale, y }}
        aria-label={label}
        className={`relative flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-2xl border px-3.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${surfaceClass} ${className}`}
      >
        {children}
        {badge && (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-[0_0_10px_rgba(244,63,94,0.7)]">
            {badge}
          </span>
        )}
      </motion.button>
    </div>
  );
}

/* ============================================================================
 * 4. StatusPill (Kibo UI inspired live hardware status badge)
 * ============================================================================ */
export function StatusPill({
  label,
  tone = "emerald",
  pulse = false,
  className = "",
}: {
  label: string;
  tone?: "emerald" | "amber" | "rose" | "zinc";
  pulse?: boolean;
  className?: string;
}) {
  const styles = {
    emerald: "border-emerald-500/30 bg-emerald-500/[0.1] text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/[0.1] text-amber-300",
    rose: "border-rose-500/30 bg-rose-500/[0.12] text-rose-300",
    zinc: "border-white/[0.1] bg-white/[0.04] text-zinc-300",
  }[tone];

  const dot = {
    emerald: "bg-emerald-400",
    amber: "bg-amber-400",
    rose: "bg-rose-400",
    zinc: "bg-zinc-400",
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide ${styles} ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dot}`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dot}`} />
      </span>
      <span>{label}</span>
    </span>
  );
}
