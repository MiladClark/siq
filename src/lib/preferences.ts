"use client";

import type { NoiseCancellationMode } from "@/lib/noise-processor";

export type ScreenResolutionOption = "720p" | "1080p" | "1440p" | "source";
export type ScreenFpsOption = 15 | 30 | 60;
export type ScreenModeOption = "motion" | "detail";
export type ScreenCodecOption = "vp9" | "h264" | "vp8";

export interface ScreenShareConfig {
  resolution: ScreenResolutionOption;
  fps: ScreenFpsOption;
  mode: ScreenModeOption;
  codec: ScreenCodecOption;
  bitrateMbps: number;
  shareAudio: boolean;
}

export type MessageDensity = "comfortable" | "compact";
export type TextScale = "sm" | "md" | "lg";

export interface AppPreferences {
  noiseMode: NoiseCancellationMode;
  echoCancellation: boolean;
  autoGainControl: boolean;
  toastsEnabled: boolean;
  messageDensity: MessageDensity;
  textScale: TextScale;
  showMembersSidebar: boolean;
  screenShareConfig: ScreenShareConfig;
}

export const DEFAULT_SCREEN_SHARE_CONFIG: ScreenShareConfig = {
  resolution: "1080p",
  fps: 60,
  mode: "motion",
  codec: "vp9",
  bitrateMbps: 6,
  shareAudio: true,
};

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  noiseMode: "krisp",
  echoCancellation: true,
  autoGainControl: true,
  toastsEnabled: true,
  messageDensity: "comfortable",
  textScale: "md",
  showMembersSidebar: true,
  screenShareConfig: DEFAULT_SCREEN_SHARE_CONFIG,
};

const STORAGE_KEY = "siq_app_prefs_v1";

export function loadAppPreferences(): AppPreferences {
  if (typeof window === "undefined") return DEFAULT_APP_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APP_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      ...DEFAULT_APP_PREFERENCES,
      ...parsed,
      screenShareConfig: {
        ...DEFAULT_SCREEN_SHARE_CONFIG,
        ...(parsed.screenShareConfig ?? {}),
      },
    };
  } catch {
    return DEFAULT_APP_PREFERENCES;
  }
}

export function saveAppPreferences(prefs: AppPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota errors
  }
}

export function clearLocalWorkspaceData(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem("siq_user_volumes_v1");
    window.localStorage.removeItem("siq_ui_sounds_v1");
  } catch {
    // ignore
  }
}
