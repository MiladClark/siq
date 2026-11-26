"use client";

import type {
  UpdateActionResult,
  UpdateAvailablePayload,
  UpdateCheckResult,
  UpdateFetchResult,
  UpdateProgress,
} from "@siq/shared/lib/update-types";
import { desktopServerOrigin } from "./client-api";
import { isTauriDesktop } from "./desktop";

const FALLBACK_ORIGIN = desktopServerOrigin || "https://siq-zeta.vercel.app";

export async function checkDesktopUpdates(refresh = false): Promise<UpdateCheckResult> {
  if (!isTauriDesktop()) {
    return {
      ok: false,
      error: "Updates are only available in the SIQ desktop app.",
      currentVersion: "0.0.0",
    };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<UpdateCheckResult>("desktop_check_updates", {
    origin: FALLBACK_ORIGIN,
    refresh,
  });
}

export async function fetchDesktopUpdate(refresh = false): Promise<UpdateFetchResult> {
  if (!isTauriDesktop()) {
    return { ok: false, error: "Updates are only available in the SIQ desktop app." };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<UpdateFetchResult>("desktop_fetch_update", {
    origin: FALLBACK_ORIGIN,
    refresh,
  });
}

export async function getDesktopUpdateState(): Promise<
  [UpdateAvailablePayload | null, UpdateProgress] | null
> {
  if (!isTauriDesktop()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<[UpdateAvailablePayload | null, UpdateProgress]>("desktop_get_update_state");
}

export async function startDesktopUpdate(
  version?: string,
  required?: boolean
): Promise<UpdateActionResult> {
  if (!isTauriDesktop()) {
    return { ok: false, error: "Updates are only available in the SIQ desktop app." };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<UpdateActionResult>("desktop_start_update", {
    origin: FALLBACK_ORIGIN,
    version: version ?? null,
    required: required ?? null,
  });
}

export async function pauseDesktopUpdate(): Promise<UpdateActionResult> {
  if (!isTauriDesktop()) return { ok: false, error: "Desktop runtime unavailable." };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<UpdateActionResult>("desktop_pause_update");
}

export async function resumeDesktopUpdate(): Promise<UpdateActionResult> {
  if (!isTauriDesktop()) return { ok: false, error: "Desktop runtime unavailable." };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<UpdateActionResult>("desktop_resume_update");
}

export async function cancelDesktopUpdate(): Promise<UpdateActionResult> {
  if (!isTauriDesktop()) return { ok: false, error: "Desktop runtime unavailable." };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<UpdateActionResult>("desktop_cancel_update");
}

export async function installDesktopUpdate(): Promise<UpdateActionResult> {
  if (!isTauriDesktop()) return { ok: false, error: "Desktop runtime unavailable." };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<UpdateActionResult>("desktop_install_update");
}

export async function subscribeDesktopUpdates(handlers: {
  onAvailable: (payload: UpdateAvailablePayload) => void;
  onProgress: (progress: UpdateProgress) => void;
}): Promise<() => void> {
  if (!isTauriDesktop()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const [unlistenAvailable, unlistenProgress] = await Promise.all([
    listen<UpdateAvailablePayload>("siq://update-available", (event) => {
      handlers.onAvailable(event.payload);
    }),
    listen<UpdateProgress>("siq://update-progress", (event) => {
      handlers.onProgress(event.payload);
    }),
  ]);
  return () => {
    unlistenAvailable();
    unlistenProgress();
  };
}
