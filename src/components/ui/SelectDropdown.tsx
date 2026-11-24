"use client";

import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
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
        className={`siq-bezel-sm group flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? "border-emerald-500/55 bg-[#191B23] text-zinc-50 ring-2 ring-emerald-500/15"
            : "border-white/[0.1] bg-[#16171E] text-zinc-100 hover:border-white/[0.18] hover:bg-[#1A1C24]"
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
                role="listbox"
                aria-label={ariaLabel}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                initial={{
                  opacity: 0,
                  y: coords.placement === "top" ? 6 : -6,
                  scale: 0.97,
                }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  y: coords.placement === "top" ? 4 : -4,
                  scale: 0.97,
                }}
                transition={{ type: "spring", stiffness: 480, damping: 34 }}
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
                className="siq-bezel z-[200] overflow-y-auto rounded-xl border border-white/[0.12] bg-[#111218]/98 p-1.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl"
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
                        <button
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
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            isSelected
                              ? "bg-emerald-500/[0.12] font-semibold text-emerald-200"
                              : isHighlighted
                                ? "bg-white/[0.07] text-zinc-50"
                                : "text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span dir="auto" className="truncate">
                                {opt.label}
                              </span>
                              {opt.badge && (
                                <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
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
                                initial={{ scale: 0.6, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: "spring", stiffness: 500, damping: 28 }}
                              >
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              </motion.span>
                            )}
                          </span>
                        </button>
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
