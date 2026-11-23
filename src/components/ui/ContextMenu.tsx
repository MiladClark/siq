"use client";

import {
  Clipboard,
  Copy,
  Scissors,
  TextSelect,
  Volume2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
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
import { playSound } from "@/lib/sounds";

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

  return (
    <ContextMenuContext.Provider value={{ openMenu, closeMenu }}>
      {children}

      <AnimatePresence>
        {menu && (
          <motion.div
            ref={menuRef}
            key={`${menu.x}-${menu.y}`}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -2 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            style={{ left: pos.x, top: pos.y }}
            role="menu"
            className="fixed z-[90] min-w-[210px] max-w-[260px] origin-top-left rounded-xl border border-white/[0.11] bg-[#14151A]/98 p-1.5 shadow-2xl shadow-black/75 backdrop-blur-md"
          >
            {menu.entries.map((entry) => {
              if (entry.type === "divider") {
                return (
                  <div
                    key={entry.id}
                    className="my-1.5 h-px bg-white/[0.07]"
                    role="separator"
                  />
                );
              }

              if (entry.type === "header") {
                return (
                  <div
                    key={entry.id}
                    dir="auto"
                    className="truncate px-2.5 py-1 text-[11px] font-medium text-zinc-500"
                  >
                    {entry.label}
                  </div>
                );
              }

              if (entry.type === "slider") {
                return (
                  <ContextMenuSliderRow key={entry.id} entry={entry} />
                );
              }

              return (
                <button
                  key={entry.id}
                  type="button"
                  role="menuitem"
                  disabled={entry.disabled}
                  onClick={() => {
                    entry.onSelect();
                    closeMenu();
                  }}
                  className={`flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${
                    entry.danger
                      ? "text-rose-400 hover:bg-rose-500/15 hover:text-rose-300"
                      : "text-zinc-200 hover:bg-white/[0.07] hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {entry.icon && (
                      <span className="shrink-0 opacity-80">{entry.icon}</span>
                    )}
                    <span className="truncate">{entry.label}</span>
                  </span>
                  {entry.shortcut && (
                    <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                      {entry.shortcut}
                    </span>
                  )}
                </button>
              );
            })}
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
    <div className="space-y-1.5 rounded-lg px-2.5 py-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 font-medium text-zinc-300">
          <Volume2 className="h-3.5 w-3.5 text-zinc-400" />
          {entry.label}
        </span>
        <span className="font-mono text-[10px] text-zinc-400">
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
