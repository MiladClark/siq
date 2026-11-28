"use client";

import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
}

interface SelectDropdownProps {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  icon?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

interface MenuCoords {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  placement: "bottom" | "top";
}

/**
 * Portal-positioned, keyboard-accessible, spring-animated Studio Select Dropdown.
 * Measures trigger bounds live and flips upward automatically near viewport bottom
 * so it stays locked precisely in place without modal overflow clipping.
 */
export function SelectDropdown({
  id,
  value,
  options,
  onChange,
  placeholder = "Select an option",
  disabled = false,
  icon,
  ariaLabel,
  className = "",
}: SelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.value === value),
    [options, value]
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();

    // If trigger scrolled completely off-screen, close menu
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setOpen(false);
      return;
    }

    const gap = 6;
    const viewportMargin = 10;
    const estimatedHeight = Math.min(268, options.length * 36 + 14);
    const spaceBelow = window.innerHeight - rect.bottom - viewportMargin;
    const spaceAbove = rect.top - viewportMargin;

    const shouldFlipUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const width = Math.max(rect.width, 140);
    const clampedLeft = Math.max(
      viewportMargin,
      Math.min(rect.left, window.innerWidth - width - viewportMargin)
    );

    if (shouldFlipUp) {
      setCoords({
        left: clampedLeft,
        width,
        bottom: window.innerHeight - rect.top + gap,
        maxHeight: Math.min(268, Math.max(120, spaceAbove - gap)),
        placement: "top",
      });
    } else {
      setCoords({
        left: clampedLeft,
        width,
        top: rect.bottom + gap,
        maxHeight: Math.min(268, Math.max(120, spaceBelow - gap)),
        placement: "bottom",
      });
    }
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handleReposition = () => {
      updatePosition();
    };

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key === "Tab") {
        setOpen(false);
        return;
      }
      if (options.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((curr) => {
          for (let step = 1; step <= options.length; step++) {
            const next = (curr + step) % options.length;
            if (!options[next]?.disabled) return next;
          }
          return curr;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((curr) => {
          for (let step = 1; step <= options.length; step++) {
            const next = (curr - step + options.length) % options.length;
            if (!options[next]?.disabled) return next;
          }
          return curr;
        });
      } else if (e.key === "Home") {
        e.preventDefault();
        const firstEnabled = options.findIndex((o) => !o.disabled);
        if (firstEnabled >= 0) setHighlightedIndex(firstEnabled);
      } else if (e.key === "End") {
        e.preventDefault();
        for (let i = options.length - 1; i >= 0; i--) {
          if (!options[i]?.disabled) {
            setHighlightedIndex(i);
            break;
          }
        }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const opt = options[highlightedIndex];
        if (opt && !opt.disabled) {
          onChange(opt.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };

    window.addEventListener("scroll", handleReposition, { capture: true, passive: true });
    window.addEventListener("resize", handleReposition, { passive: true });
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("scroll", handleReposition, { capture: true });
      window.removeEventListener("resize", handleReposition);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, options, highlightedIndex, onChange, updatePosition]);

  // Keep highlighted option scrolled into view inside tall lists
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const activeEl = menuRef.current.querySelector<HTMLElement>(
      `[data-option-index="${highlightedIndex}"]`
    );
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, open]);

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`group flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-all duration-200 focus:outline-none focus-visible:border-emerald-500/50 focus-visible:ring-2 focus-visible:ring-emerald-500/15 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? "border-emerald-500/55 bg-gradient-to-b from-emerald-500/[0.09] to-emerald-500/[0.03] text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_24px_-10px_rgb(var(--siq-accent-rgb)/0.75)] ring-2 ring-emerald-500/15"
            : "border-white/[0.1] bg-white/[0.04] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_4px_14px_-6px_rgba(0,0,0,0.6)] hover:border-white/[0.18] hover:bg-white/[0.065]"
        } ${className}`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {icon && (
            <span
              className={`shrink-0 transition-colors ${
                open ? "text-emerald-400" : "text-zinc-400 group-hover:text-zinc-300"
              }`}
            >
              {icon}
            </span>
          )}
          <span
            dir="auto"
            className={`truncate ${selectedOption ? "text-zinc-100" : "text-zinc-500"}`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
              {selectedOption.badge}
            </span>
          )}
        </span>

        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180 text-emerald-400" : "text-zinc-400 group-hover:text-zinc-200"
          }`}
        />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && coords && (
              <motion.div
                ref={menuRef}
                id={listboxId}
                role="listbox"
                aria-label={ariaLabel}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                layoutScroll
                initial={{
                  opacity: 0,
                  y: coords.placement === "top" ? 6 : -6,
                  scale: 0.95,
                }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  y: coords.placement === "top" ? 4 : -4,
                  scale: 0.97,
                  transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
                }}
                transition={{ type: "spring", stiffness: 480, damping: 32 }}
                style={{
                  position: "fixed",
                  left: coords.left,
                  width: coords.width,
                  top: coords.top,
                  bottom: coords.bottom,
                  maxHeight: coords.maxHeight,
                  transformOrigin:
                    coords.placement === "top" ? "bottom center" : "top center",
                }}
                className="siq-glass z-[200] overflow-y-auto rounded-2xl p-1.5"
              >
                {options.length === 0 ? (
                  <div className="px-3 py-2.5 text-center text-xs text-zinc-500">
                    No options available
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {options.map((opt, idx) => {
                      const isSelected = opt.value === value;
                      const isHighlighted = idx === highlightedIndex;
                      return (
                        <motion.button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          disabled={opt.disabled}
                          data-option-index={idx}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          onClick={() => {
                            if (opt.disabled) return;
                            onChange(opt.value);
                            setOpen(false);
                            triggerRef.current?.focus();
                          }}
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 560,
                            damping: 36,
                            delay: 0.025 + Math.min(idx, 10) * 0.016,
                          }}
                          className={`relative isolate flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-left text-xs transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                            isSelected
                              ? "bg-emerald-500/[0.1] font-semibold text-emerald-200"
                              : isHighlighted
                                ? "text-zinc-50"
                                : "text-zinc-300 hover:text-zinc-100"
                          }`}
                        >
                          {isHighlighted && !opt.disabled && (
                            <motion.span
                              layoutId={`${listboxId}-highlight`}
                              aria-hidden="true"
                              transition={{ type: "spring", stiffness: 640, damping: 44, mass: 0.6 }}
                              className={`absolute inset-0 -z-10 rounded-[inherit] ring-1 ring-inset ${
                                isSelected
                                  ? "bg-emerald-500/[0.08] ring-emerald-500/30"
                                  : "bg-white/[0.065] ring-white/[0.07]"
                              }`}
                            />
                          )}
                          {isSelected && (
                            <span
                              aria-hidden="true"
                              className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-emerald-400 shadow-[0_0_10px_rgb(var(--siq-accent-rgb)/0.9)]"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span dir="auto" className="truncate">
                                {opt.label}
                              </span>
                              {opt.badge && (
                                <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 ring-1 ring-inset ring-white/[0.05]">
                                  {opt.badge}
                                </span>
                              )}
                            </div>
                            {opt.description && (
                              <p className="mt-0.5 truncate text-[10px] font-normal text-zinc-500">
                                {opt.description}
                              </p>
                            )}
                          </div>

                          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                            {isSelected && (
                              <motion.span
                                initial={{ scale: 0.4, opacity: 0, rotate: -20 }}
                                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                transition={{ type: "spring", stiffness: 500, damping: 22 }}
                              >
                                <Check className="h-3.5 w-3.5 text-emerald-400 drop-shadow-[0_0_6px_rgb(var(--siq-accent-rgb)/0.8)]" />
                              </motion.span>
                            )}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
