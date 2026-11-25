"use client";

import { AppWindow, Copy, LogOut, Minus, Square, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  hideDesktopWindow,
  isDesktopWindowMaximized,
  isTauriDesktop,
  minimizeDesktopWindow,
  quitDesktopApp,
  toggleMaximizeDesktopWindow,
} from "../lib/desktop";

type CloseAction = "tray" | "quit";
type CloseBehavior = "ask" | CloseAction;

export interface DesktopChrome {
  controls: ReactNode;
  settings: ReactNode;
}

const CLOSE_BEHAVIOR_KEY = "siq_desktop_close_behavior";
const CLOSE_BEHAVIORS: ReadonlyArray<{ value: CloseBehavior; label: string }> = [
  { value: "ask", label: "Ask every time" },
  { value: "tray", label: "Move to system tray" },
  { value: "quit", label: "Quit SIQ" },
];

export function DesktopWindowChrome({ children }: { children: (chrome?: DesktopChrome) => ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const behaviorRef = useRef<CloseBehavior>("ask");
  const [ready, setReady] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [behavior, setBehavior] = useState<CloseBehavior>("ask");
  const [askNextTime, setAskNextTime] = useState(true);
  const [error, setError] = useState(false);

  const updateBehavior = useCallback((next: CloseBehavior) => {
    behaviorRef.current = next;
    setBehavior(next);
    try {
      localStorage.setItem(CLOSE_BEHAVIOR_KEY, next);
    } catch {
      // Keep the selection for this session if storage is unavailable.
    }
  }, []);

  const finishClose = useCallback(async (action: CloseAction, remember = false) => {
    const dialog = dialogRef.current;
    const previousBehavior = behaviorRef.current;
    if (remember) updateBehavior(action);
    try {
      if (action === "tray") {
        dialog?.close();
        await hideDesktopWindow();
      } else {
        await quitDesktopApp();
      }
    } catch {
      updateBehavior(previousBehavior);
      setError(true);
      if (dialog && !dialog.open) dialog.showModal();
    }
  }, [updateBehavior]);

  const requestClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    const choice = behaviorRef.current;
    if (choice !== "ask") {
      void finishClose(choice);
      return;
    }
    setAskNextTime(true);
    setError(false);
    dialog.showModal();
  }, [finishClose]);

  useEffect(() => {
    if (!isTauriDesktop()) return;
    try {
      const stored = localStorage.getItem(CLOSE_BEHAVIOR_KEY);
      if (stored === "tray" || stored === "quit") {
        behaviorRef.current = stored;
        setBehavior(stored);
      }
    } catch {
      // Default to showing the close dialog.
    }
    setReady(true);
    let active = true;
    const updateMaximized = () => {
      void isDesktopWindowMaximized().then((next) => {
        if (active) setMaximized(next);
      });
    };
    const listener = import("@tauri-apps/api/event").then(({ listen }) =>
      listen("siq://close-requested", requestClose),
    ).catch(() => undefined);
    updateMaximized();
    window.addEventListener("resize", updateMaximized);
    return () => {
      active = false;
      window.removeEventListener("resize", updateMaximized);
      void listener.then((unlisten) => unlisten?.());
    };
  }, [requestClose]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.siqWindowMaximized = String(maximized);
    return () => { delete root.dataset.siqWindowMaximized; };
  }, [maximized]);

  if (!ready) return children();

  const chrome: DesktopChrome = {
    controls: (
      <div role="group" aria-label="Window controls" className="siq-desktop-window-controls">
        <button type="button" title="Minimize" aria-label="Minimize window" onClick={() => void minimizeDesktopWindow()}>
          <Minus aria-hidden="true" size={17} />
        </button>
        <button type="button" title={maximized ? "Restore" : "Maximize"} aria-label={maximized ? "Restore window" : "Maximize window"}
          onClick={() => void toggleMaximizeDesktopWindow().then(setMaximized)}>
          {maximized ? <Copy aria-hidden="true" size={15} /> : <Square aria-hidden="true" size={15} />}
        </button>
        <button type="button" className="siq-desktop-close" title="Close SIQ" aria-label="Close SIQ" onClick={requestClose}>
          <X aria-hidden="true" size={18} />
        </button>
      </div>
    ),
    settings: (
      <fieldset className="rounded-2xl border border-white/10 bg-[#0d0e12] px-4 pb-3">
        <legend className="px-1 text-sm font-semibold text-zinc-100">When closing SIQ</legend>
        <div className="flex flex-wrap gap-x-4">
          {CLOSE_BEHAVIORS.map(({ value, label }) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-zinc-300">
              <input type="radio" name="desktop-close-behavior" checked={behavior === value} onChange={() => updateBehavior(value)}
                className="size-4 accent-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    ),
  };

  return (
    <>
      {children(chrome)}
      <dialog ref={dialogRef} className="siq-close-dialog" aria-labelledby="siq-close-title" aria-describedby="siq-close-details">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="siq-close-title" className="text-xl font-semibold tracking-tight text-zinc-100">Close SIQ?</h2>
            <p id="siq-close-details" className="mt-1.5 text-sm leading-relaxed text-zinc-300">Move SIQ to the system tray to stay in voice, or quit the app to disconnect.</p>
          </div>
          <button type="button" autoFocus aria-label="Keep SIQ open" onClick={() => dialogRef.current?.close()}
            className="grid size-11 shrink-0 place-items-center rounded-xl text-zinc-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400">
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <button type="button" role="switch" aria-checked={askNextTime} onClick={() => setAskNextTime(!askNextTime)}
          className="siq-switch mt-4 flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-1 text-left text-sm font-medium text-zinc-200 focus-visible:outline-2 focus-visible:outline-emerald-400">
          Ask every time <span aria-hidden="true" className="siq-switch-track" />
        </button>
        {error && <p role="alert" className="mt-2 text-sm text-rose-200">SIQ couldn’t close. Try again.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void finishClose("tray", !askNextTime)}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 text-sm font-semibold whitespace-nowrap text-zinc-950 hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
            <AppWindow aria-hidden="true" size={16} /> Move to tray
          </button>
          <button type="button" onClick={() => void finishClose("quit", !askNextTime)}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-semibold whitespace-nowrap text-zinc-100 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-emerald-400">
            <LogOut aria-hidden="true" size={16} /> Quit SIQ
          </button>
        </div>
      </dialog>
    </>
  );
}
