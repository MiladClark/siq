"use client";

import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  closeDesktopWindowToTray,
  isDesktopWindowMaximized,
  isTauriDesktop,
  minimizeDesktopWindow,
  startDesktopWindowDrag,
  toggleMaximizeDesktopWindow,
} from "../lib/desktop";

export function DesktopTitlebar() {
  const [mountedInDesktop, setMountedInDesktop] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [browserFullscreen, setBrowserFullscreen] = useState(false);

  useEffect(() => {
    const desktop = isTauriDesktop();
    setMountedInDesktop(desktop);
    if (!desktop) return;

    document.documentElement.dataset.desktop = "tauri";
    void isDesktopWindowMaximized().then(setMaximized);

    const onResize = () => {
      void isDesktopWindowMaximized().then(setMaximized);
    };
    const onFsChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setBrowserFullscreen(fs);
      document.documentElement.dataset.desktop = fs ? "tauri-fullscreen" : "tauri";
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, []);

  if (!mountedInDesktop || browserFullscreen) {
    return null;
  }

  return (
    <header
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest("button")) return;
        void startDesktopWindowDrag();
      }}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button")) return;
        void toggleMaximizeDesktopWindow().then(setMaximized);
      }}
      className="flex h-[30px] w-full shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#060608] pl-3 select-none"
    >
      <div className="pointer-events-none flex items-center gap-2">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-[5px] border border-emerald-500/40 bg-emerald-500/15 font-mono text-[9px] font-bold text-emerald-300">
          S
        </span>
        <span className="text-[11px] font-semibold tracking-tight text-zinc-200">siq</span>
        <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-px font-mono text-[9px] tracking-wider text-zinc-500">
          DESKTOP
        </span>
        <span className="hidden font-mono text-[10px] text-zinc-600 sm:inline">
          Ctrl+Shift+M Mute · Ctrl+Shift+D Deafen
        </span>
      </div>

      <div className="flex h-full items-center">
        <button
          type="button"
          onClick={() => void minimizeDesktopWindow()}
          title="Minimize"
          aria-label="Minimize window"
          className="flex h-full w-11 items-center justify-center text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-zinc-100"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => void toggleMaximizeDesktopWindow().then(setMaximized)}
          title={maximized ? "Restore" : "Maximize"}
          aria-label={maximized ? "Restore window" : "Maximize window"}
          className="flex h-full w-11 items-center justify-center text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-zinc-100"
        >
          {maximized ? (
            <Copy className="h-3 w-3 rotate-90" />
          ) : (
            <Square className="h-3 w-3" />
          )}
        </button>

        <button
          type="button"
          onClick={() => void closeDesktopWindowToTray()}
          title="Minimize to System Tray"
          aria-label="Minimize to System Tray"
          className="flex h-full w-11 items-center justify-center text-zinc-400 transition-colors hover:bg-rose-600 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
