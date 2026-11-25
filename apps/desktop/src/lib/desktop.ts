"use client";

import type { VoiceControls } from "@siq/shared/lib/voice-controls";

export function isTauriDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

export async function minimizeDesktopWindow(): Promise<void> {
  if (!isTauriDesktop()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().minimize();
  } catch {
    // ignore
  }
}

export async function toggleMaximizeDesktopWindow(): Promise<boolean> {
  if (!isTauriDesktop()) return false;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.toggleMaximize();
    return await win.isMaximized();
  } catch {
    return false;
  }
}

export async function isDesktopWindowMaximized(): Promise<boolean> {
  if (!isTauriDesktop()) return false;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return await getCurrentWindow().isMaximized();
  } catch {
    return false;
  }
}

export async function hideDesktopWindow(): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().hide();
}

export async function quitDesktopApp(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("desktop_quit");
}

const syncDesktopVoiceState: VoiceControls["syncState"] = async (payload) => {
  if (!isTauriDesktop()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("desktop_sync_voice_state", {
      inVoice: payload.inVoice,
      muted: payload.muted,
      deafened: payload.deafened,
      channelName: payload.channelName,
    });
  } catch {
    // ignore if invoked before IPC ready
  }
};

const subscribeDesktopVoiceShortcuts: VoiceControls["subscribe"] = async (handlers) => {
  if (!isTauriDesktop()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const unlistenMute = await listen("siq://toggle-mute", () => {
      handlers.onToggleMute();
    });
    const unlistenDeafen = await listen("siq://toggle-deafen", () => {
      handlers.onToggleDeafen();
    });
    return () => {
      unlistenMute();
      unlistenDeafen();
    };
  } catch {
    return () => {};
  }
};

export const voiceControls: VoiceControls = {
  syncState: syncDesktopVoiceState,
  subscribe: subscribeDesktopVoiceShortcuts,
};
