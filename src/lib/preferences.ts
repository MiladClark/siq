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
export type ToastStyle = "liquid" | "classic";
export type AppFontPreset = "geist" | "plex" | "manrope" | "rubik";
export type AppThemeId =
  | "emerald"
  | "cyan"
  | "cobalt"
  | "indigo"
  | "violet"
  | "coral"
  | "amber"
  | "silver";

export interface FontPresetMeta {
  id: AppFontPreset;
  name: string;
  subtitle: string;
  sampleEn: string;
  sampleFa: string;
  cssFamily: string;
}

export const APP_FONT_PRESETS: FontPresetMeta[] = [
  {
    id: "geist",
    name: "Geist × Milad",
    subtitle: "Studio Precision · Default",
    sampleEn: "Crystal voice · 14ms",
    sampleFa: "صدای شفاف استودیویی",
    cssFamily: "var(--font-milad), var(--font-geist-sans), sans-serif",
  },
  {
    id: "plex",
    name: "IBM Plex × Milad",
    subtitle: "Technical · Engineering",
    sampleEn: "Crystal voice · 14ms",
    sampleFa: "صدای شفاف استودیویی",
    cssFamily: "var(--font-milad), var(--font-ibm-plex), sans-serif",
  },
  {
    id: "manrope",
    name: "Manrope × Milad",
    subtitle: "Balanced · Effortless Read",
    sampleEn: "Crystal voice · 14ms",
    sampleFa: "صدای شفاف استودیویی",
    cssFamily: "var(--font-milad), var(--font-manrope), sans-serif",
  },
  {
    id: "rubik",
    name: "Rubik × Milad",
    subtitle: "Soft Geometric · Rounded",
    sampleEn: "Crystal voice · 14ms",
    sampleFa: "صدای شفاف استودیویی",
    cssFamily: "var(--font-milad), var(--font-rubik), sans-serif",
  },
];

export interface ThemePresetMeta {
  id: AppThemeId;
  name: string;
  vibe: string;
  primary: string;
  light: string;
  deep: string;
}

export const APP_THEME_PRESETS: ThemePresetMeta[] = [
  {
    id: "emerald",
    name: "Obsidian Emerald",
    vibe: "Signature Studio",
    primary: "#10B981",
    light: "#34D399",
    deep: "#059669",
  },
  {
    id: "cyan",
    name: "Arctic Cyan",
    vibe: "Crisp Glacial",
    primary: "#06B6D4",
    light: "#22D3EE",
    deep: "#0891B2",
  },
  {
    id: "cobalt",
    name: "Electric Cobalt",
    vibe: "Precision Blue",
    primary: "#4C9AFF",
    light: "#60A5FA",
    deep: "#2563EB",
  },
  {
    id: "indigo",
    name: "Linear Indigo",
    vibe: "Midnight Focus",
    primary: "#7C83FF",
    light: "#A5B4FC",
    deep: "#6366F1",
  },
  {
    id: "violet",
    name: "Smoked Violet",
    vibe: "Muted Amethyst",
    primary: "#9D7BFA",
    light: "#C4B5FD",
    deep: "#7C3AED",
  },
  {
    id: "coral",
    name: "Studio Coral",
    vibe: "Warm Hardware",
    primary: "#F97316",
    light: "#FB923C",
    deep: "#EA580C",
  },
  {
    id: "amber",
    name: "Analog Gold",
    vibe: "VU Meter Amber",
    primary: "#F59E0B",
    light: "#FBBF24",
    deep: "#D97706",
  },
  {
    id: "silver",
    name: "Pure Silver",
    vibe: "Swiss Monochrome",
    primary: "#D4D4D8",
    light: "#FAFAFA",
    deep: "#A1A1AA",
  },
];

export interface AppPreferences {
  noiseMode: NoiseCancellationMode;
  echoCancellation: boolean;
  autoGainControl: boolean;
  toastsEnabled: boolean;
  toastStyle: ToastStyle;
  messageDensity: MessageDensity;
  textScale: TextScale;
  fontPreset: AppFontPreset;
  theme: AppThemeId;
  customAccentHex: string | null;
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
  toastStyle: "liquid",
  messageDensity: "comfortable",
  textScale: "md",
  fontPreset: "geist",
  theme: "emerald",
  customAccentHex: null,
  showMembersSidebar: true,
  screenShareConfig: DEFAULT_SCREEN_SHARE_CONFIG,
};

const STORAGE_KEY = "siq_app_prefs_v1";

function parseHexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  weightB: number
): string {
  const w = Math.max(0, Math.min(1, weightB));
  const r = Math.round(a[0] * (1 - w) + b[0] * w);
  const g = Math.round(a[1] * (1 - w) + b[1] * w);
  const bl = Math.round(a[2] * (1 - w) + b[2] * w);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

export function applyAppearancePreferences(
  prefs: Pick<AppPreferences, "fontPreset" | "theme" | "customAccentHex">
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.font = prefs.fontPreset || "geist";
  root.dataset.theme = prefs.theme || "emerald";

  const rgb = prefs.customAccentHex ? parseHexToRgb(prefs.customAccentHex) : null;
  if (rgb) {
    const primary = `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    const lighter300 = mixRgb(rgb, [255, 255, 255], 0.42);
    const light400 = mixRgb(rgb, [255, 255, 255], 0.22);
    const deep600 = mixRgb(rgb, [0, 0, 0], 0.18);
    root.style.setProperty("--color-emerald-300", lighter300);
    root.style.setProperty("--color-emerald-400", light400);
    root.style.setProperty("--color-emerald-500", primary);
    root.style.setProperty("--color-emerald-600", deep600);
    root.style.setProperty("--siq-accent-rgb", `${rgb[0]} ${rgb[1]} ${rgb[2]}`);
  } else {
    root.style.removeProperty("--color-emerald-300");
    root.style.removeProperty("--color-emerald-400");
    root.style.removeProperty("--color-emerald-500");
    root.style.removeProperty("--color-emerald-600");
    root.style.removeProperty("--siq-accent-rgb");
  }
}

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
  applyAppearancePreferences(prefs);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota errors
  }
}

export function clearLocalWorkspaceData(): void {
  applyAppearancePreferences(DEFAULT_APP_PREFERENCES);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem("siq_user_volumes_v1");
    window.localStorage.removeItem("siq_ui_sounds_v1");
  } catch {
    // ignore
  }
}
