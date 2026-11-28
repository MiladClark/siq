"use client";

import {
  Clipboard,
  Copy,
  Scissors,
  TextSelect,
  Volume2,
} from "lucide-react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { playSound } from "@siq/shared/lib/sounds";

// Glass menu pops out of the exact cursor point, then its rows cascade in
const MENU_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 480,
      damping: 32,
      staggerChildren: 0.016,
      delayChildren: 0.02,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
  },
};

const MENU_ROW_VARIANTS: Variants = {
  hidden: { opacity: 0, x: -6 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 560, damping: 36 },
  },
};

export type ContextMenuEntry =
  | {
      type: "item";
      id: string;
      label: string;
      icon?: ReactNode;
      danger?: boolean;
      disabled?: boolean;
      shortcut?: string;
      onSelect: () => void;
    }
  | {
      type: "divider";
      id: string;
    }
  | {
      type: "header";
      id: string;
      label: string;
    }
  | {
      type: "slider";
      id: string;
      label: string;
      value: number; // 0..2
      min?: number;
      max?: number;
      step?: number;
      onChange: (value: number) => void;
    };

interface ContextMenuState {
  x: number;
  y: number;
  entries: ContextMenuEntry[];
}

interface ContextMenuContextValue {
  openMenu: (
    event: React.MouseEvent | MouseEvent,
    entries: ContextMenuEntry[]
  ) => void;
  closeMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

export function ContextMenuProvider({
  children,
  fallbackEntries,
}: {
  children: ReactNode;
  fallbackEntries?: () => ContextMenuEntry[];
}) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<{ menuKey: string; id: string } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = useCallback(() => {
    setMenu(null);
  }, []);

  const openMenu = useCallback(
    (event: React.MouseEvent | MouseEvent, entries: ContextMenuEntry[]) => {
      event.preventDefault();
      event.stopPropagation();
      if (entries.length === 0) {
        setMenu(null);
        return;
      }
      setPos({ x: event.clientX, y: event.clientY });
      setMenu({ x: event.clientX, y: event.clientY, entries });
    },
    []
  );

  // Globally suppress browser context menu anywhere in the app
  useEffect(() => {
    function handleGlobalContextMenu(e: MouseEvent) {
      if (e.defaultPrevented) return;
      e.preventDefault();

      const target = e.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);

      if (isEditable && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        const hasSelection =
          (target.selectionStart ?? 0) !== (target.selectionEnd ?? 0);
        const selectedText = hasSelection
          ? target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0)
          : "";

        const editableEntries: ContextMenuEntry[] = [
          {
            type: "item",
            id: "edit-cut",
            label: "Cut",
            icon: <Scissors className="h-3.5 w-3.5" />,
            disabled: !hasSelection,
            shortcut: "Ctrl+X",
            onSelect: () => {
              if (!hasSelection) return;
              void navigator.clipboard.writeText(selectedText);
              const start = target.selectionStart ?? 0;
              const end = target.selectionEnd ?? 0;
              const nativeSetter = Object.getOwnPropertyDescriptor(
                Object.getPrototypeOf(target),
                "value"
              )?.set;
              const nextVal = target.value.slice(0, start) + target.value.slice(end);
              nativeSetter?.call(target, nextVal);
              target.dispatchEvent(new Event("input", { bubbles: true }));
              target.setSelectionRange(start, start);
              playSound("copy");
            },
          },
          {
            type: "item",
            id: "edit-copy",
            label: "Copy",
            icon: <Copy className="h-3.5 w-3.5" />,
            disabled: !hasSelection,
            shortcut: "Ctrl+C",
            onSelect: () => {
              if (!hasSelection) return;
              void navigator.clipboard.writeText(selectedText);
              playSound("copy");
            },
          },
          {
            type: "item",
            id: "edit-paste",
            label: "Paste",
            icon: <Clipboard className="h-3.5 w-3.5" />,
            shortcut: "Ctrl+V",
            onSelect: async () => {
              try {
                const clip = await navigator.clipboard.readText();
                const start = target.selectionStart ?? target.value.length;
                const end = target.selectionEnd ?? target.value.length;
                const nativeSetter = Object.getOwnPropertyDescriptor(
                  Object.getPrototypeOf(target),
                  "value"
                )?.set;
                const nextVal =
                  target.value.slice(0, start) + clip + target.value.slice(end);
                nativeSetter?.call(target, nextVal);
                target.dispatchEvent(new Event("input", { bubbles: true }));
                const caret = start + clip.length;
                target.setSelectionRange(caret, caret);
              } catch {
                // clipboard read denied
              }
            },
          },
          { type: "divider", id: "edit-div" },
          {
            type: "item",
            id: "edit-select-all",
            label: "Select All",
            icon: <TextSelect className="h-3.5 w-3.5" />,
            shortcut: "Ctrl+A",
            onSelect: () => {
              target.focus();
              target.select();
            },
          },
        ];

        setPos({ x: e.clientX, y: e.clientY });
        setMenu({ x: e.clientX, y: e.clientY, entries: editableEntries });
        return;
      }

      const selectedWindowText = window.getSelection()?.toString().trim() ?? "";
      const entries: ContextMenuEntry[] = [];
      if (selectedWindowText) {
        entries.push({
          type: "item",
          id: "selection-copy",
          label: "Copy selection",
          icon: <Copy className="h-3.5 w-3.5" />,
          shortcut: "Ctrl+C",
          onSelect: () => {
            void navigator.clipboard.writeText(selectedWindowText);
            playSound("copy");
          },
        });
      }

      const extra = fallbackEntries?.() ?? [];
      if (entries.length > 0 && extra.length > 0) {
        entries.push({ type: "divider", id: "fallback-div" });
      }
      entries.push(...extra);

      if (entries.length > 0) {
        setPos({ x: e.clientX, y: e.clientY });
        setMenu({ x: e.clientX, y: e.clientY, entries });
      } else {
        setMenu(null);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(null);
    }

    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    }

    document.addEventListener("contextmenu", handleGlobalContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", closeMenu);

    return () => {
      document.removeEventListener("contextmenu", handleGlobalContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", closeMenu);
    };
  }, [closeMenu, fallbackEntries]);

  // Clamp menu within viewport bounds after measuring
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 10;
    const nextX = Math.min(menu.x, window.innerWidth - rect.width - pad);
    const nextY = Math.min(menu.y, window.innerHeight - rect.height - pad);
    setPos({ x: Math.max(pad, nextX), y: Math.max(pad, nextY) });
  }, [menu]);

  const menuKey = menu ? `${menu.x}-${menu.y}` : null;
  const hoveredId = hovered && hovered.menuKey === menuKey ? hovered.id : null;

  return (
    <ContextMenuContext.Provider value={{ openMenu, closeMenu }}>
      {children}

      <AnimatePresence>
        {menu && (
          <motion.div
            ref={menuRef}
            key={`${menu.x}-${menu.y}`}
            variants={MENU_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            onMouseLeave={() => setHovered(null)}
            style={{
              left: pos.x,
              top: pos.y,
              // Grow out of the cursor point, even when the menu was clamped into view
              transformOrigin: `${menu.x - pos.x}px ${menu.y - pos.y}px`,
            }}
            role="menu"
            className="siq-glass fixed z-[90] min-w-[220px] max-w-[270px] rounded-2xl p-1.5"
          >
            {menu.entries.map((entry) => {
              if (entry.type === "divider") {
                return (
                  <motion.div
                    key={entry.id}
                    variants={MENU_ROW_VARIANTS}
                    className="mx-2 my-1.5 h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent"
                    role="separator"
                  />
                );
              }

              if (entry.type === "header") {
                return (
                  <motion.div
                    key={entry.id}
                    variants={MENU_ROW_VARIANTS}
                    dir="auto"
                    className="flex min-w-0 items-center gap-2 px-2.5 pb-1.5 pt-1 text-[11px] font-semibold text-zinc-400"
                  >
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(var(--siq-accent-rgb)/0.9)]"
                    />
                    <span className="truncate">{entry.label}</span>
                  </motion.div>
                );
              }

              if (entry.type === "slider") {
                return (
                  <motion.div key={entry.id} variants={MENU_ROW_VARIANTS}>
                    <ContextMenuSliderRow entry={entry} />
                  </motion.div>
                );
              }

              const isHovered = hoveredId === entry.id && !entry.disabled;

              return (
                <motion.button
                  key={entry.id}
                  variants={MENU_ROW_VARIANTS}
                  type="button"
                  role="menuitem"
                  disabled={entry.disabled}
                  onMouseEnter={() => {
                    if (menuKey) setHovered({ menuKey, id: entry.id });
                  }}
                  onFocus={() => {
                    if (menuKey) setHovered({ menuKey, id: entry.id });
                  }}
                  onClick={() => {
                    entry.onSelect();
                    closeMenu();
                  }}
                  className={`group relative isolate flex min-h-8 w-full items-center justify-between gap-3 rounded-[10px] px-2 py-1 text-left text-[12.5px] font-medium outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-emerald-400/50 disabled:pointer-events-none disabled:opacity-40 ${
                    entry.danger
                      ? "text-rose-400 hover:text-rose-300"
                      : "text-zinc-300 hover:text-white"
                  }`}
                >
                  {isHovered && (
                    <motion.span
                      layoutId={`siq-context-menu-hl-${menuKey}`}
                      aria-hidden="true"
                      transition={{ type: "spring", stiffness: 640, damping: 44, mass: 0.6 }}
                      className={`absolute inset-0 -z-10 rounded-[inherit] ring-1 ring-inset ${
                        entry.danger
                          ? "bg-gradient-to-r from-rose-500/[0.2] to-rose-500/[0.08] ring-rose-500/25"
                          : "bg-gradient-to-r from-white/[0.09] to-white/[0.045] ring-white/[0.07]"
                      }`}
                    />
                  )}
                  <span className="flex min-w-0 items-center gap-2.5">
                    {entry.icon && (
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-[7px] ring-1 ring-inset transition-colors duration-150 ${
                          entry.danger
                            ? "bg-rose-500/10 text-rose-400 ring-rose-500/15 group-hover:bg-rose-500/20 group-hover:text-rose-300"
                            : "bg-white/[0.04] text-zinc-400 ring-white/[0.05] group-hover:bg-emerald-500/15 group-hover:text-emerald-300 group-hover:ring-emerald-500/25"
                        }`}
                      >
                        {entry.icon}
                      </span>
                    )}
                    <span className="truncate">{entry.label}</span>
                  </span>
                  {entry.shortcut && (
                    <span className="shrink-0 rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-px text-[10px] font-medium tracking-wide text-zinc-500 transition-colors duration-150 group-hover:border-white/[0.12] group-hover:text-zinc-300">
                      {entry.shortcut}
                    </span>
                  )}
                </motion.button>
              );
            })}
            <span
              aria-hidden="true"
              className="siq-edge-light pointer-events-none !absolute -inset-px rounded-[inherit]"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </ContextMenuContext.Provider>
  );
}

function ContextMenuSliderRow({
  entry,
}: {
  entry: Extract<ContextMenuEntry, { type: "slider" }>;
}) {
  const [val, setVal] = useState(entry.value);
  return (
    <div className="my-0.5 space-y-2 rounded-[10px] bg-white/[0.025] px-2.5 py-2 ring-1 ring-inset ring-white/[0.05]">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 font-medium text-zinc-300">
          <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
          {entry.label}
        </span>
        <span className="rounded-md bg-emerald-500/10 px-1.5 py-px text-[11px] font-semibold tabular-nums text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
          {Math.round(val * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={entry.min ?? 0}
        max={entry.max ?? 2}
        step={entry.step ?? 0.05}
        value={val}
        onChange={(e) => {
          const next = Number(e.target.value);
          setVal(next);
          entry.onChange(next);
        }}
        className="h-1.5 w-full cursor-pointer accent-emerald-500"
      />
    </div>
  );
}

export function useContextMenu(): ContextMenuContextValue {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) {
    throw new Error("useContextMenu must be used inside ContextMenuProvider.");
  }
  return ctx;
}
