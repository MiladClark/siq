"use client";

import { apiFetch, mediaUrl } from "@/lib/client-api";
import {
  Bell,
  Camera,
  Check,
  Headphones,
  ImagePlus,
  KeyRound,
  Keyboard,
  Lock,
  LogOut,
  Mail,
  Mic,
  Monitor,
  Palette,
  Radio,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  UserCircle,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@siq/shared/components/ui/Avatar";
import { ColorPicker } from "@siq/shared/components/ui/ColorPicker";
import { type CropMode, ImageCropModal } from "@siq/shared/components/ui/ImageCropModal";
import { useSystemNotify } from "@siq/shared/components/ui/NotificationCenter";
import { SelectDropdown } from "@siq/shared/components/ui/SelectDropdown";
import { useVoice } from "@siq/shared/components/voice/VoiceProvider";
import { LiveMicWaveform } from "@siq/shared/components/workspace/LiveMicWaveform";
import type { NoiseCancellationMode } from "@siq/shared/lib/noise-processor";
import {
  APP_FONT_PRESETS,
  APP_THEME_PRESETS,
  DEFAULT_APP_THEME,
  type AppPreferences,
  clearLocalWorkspaceData,
  type MessageDensity,
  type TextScale,
  type VoiceQualityProfile,
} from "@siq/shared/lib/preferences";
import {
  SIQ_DSP_PRESETS,
  suppressionPctToAttenLimDb,
  type SiqAiEngine,
  type SiqHighPassHz,
  type SiqVoiceTone,
} from "@siq/shared/lib/siq-audio-worklet";
import { getSoundPrefs, playSound, setSoundPrefs } from "@siq/shared/lib/sounds";
import { AVATAR_PALETTE, type PrivateUser } from "@siq/shared/lib/types";

export type SettingsTab =
  | "account"
  | "voice"
  | "notifications"
  | "privacy"
  | "appearance";

interface SettingsModalProps {
  open: boolean;
  initialTab?: SettingsTab;
  user: PrivateUser;
  blobReady: boolean;
  appPrefs: AppPreferences;
  desktopSettings?: ReactNode;
  onUpdatePrefs: (patch: Partial<AppPreferences>) => void;
  onResetPrefs: () => void;
  onClose: () => void;
  onUserUpdated: (user: PrivateUser) => void;
  onSignOut: () => void;
}

const NOISE_MODES: Array<{
  id: NoiseCancellationMode;
  title: string;
  badge: string;
  desc: string;
}> = [
  {
    id: "siq",
    title: "SIQ AI",
    badge: "Flagship · Engine v3",
    desc: "SIQ Voice Engine v3: DeepFilterNet3 48 kHz neural AI on its own thread (never stutters your audio), instant spectral fallback, look-ahead voice gate, tone EQ, de-esser and limiter. 100% local.",
  },
  {
    id: "krisp",
    title: "Krisp AI",
    badge: "LiveKit Cloud",
    desc: "Cloud-licensed neural voice isolation via LiveKit Cloud. Auto-falls back to SIQ AI when offline or self-hosted.",
  },
  {
    id: "gtcrn",
    title: "GTCRN Raw",
    badge: "Neural · Standalone",
    desc: "Standalone lightweight GTCRN WASM denoiser without the SIQ studio mastering chain.",
  },
  {
    id: "rnnoise",
    title: "RNNoise Raw",
    badge: "Light · Neural",
    desc: "Featherweight WASM neural filter (~1% CPU) for fan hum and older laptops.",
  },
  {
    id: "standard",
    title: "Standard",
    badge: "WebRTC",
    desc: "Built-in WebRTC noise suppression.",
  },
  {
    id: "off",
    title: "Off",
    badge: "Raw",
    desc: "Unprocessed microphone audio (for studio mics or music).",
  },
];

const SIQ_AI_ENGINE_OPTIONS: Array<{
  id: SiqAiEngine;
  label: string;
  spec: string;
  desc: string;
}> = [
  {
    id: "ultra",
    label: "Ultra AI",
    spec: "DF3 · ~50ms",
    desc: "Best isolation · full-band 48 kHz",
  },
  {
    id: "fast",
    label: "Fast AI",
    spec: "GTCRN · ~35ms",
    desc: "Light neural · voice band",
  },
  {
    id: "pure",
    label: "Spectral",
    spec: "~10ms · DSP",
    desc: "Lowest delay · MCRA + Wiener",
  },
];

const VOICE_QUALITY_PROFILES: Array<{
  id: VoiceQualityProfile;
  title: string;
  bitrate: string;
  desc: string;
}> = [
  {
    id: "low-bandwidth",
    title: "Low-Ping",
    bitrate: "32 kbps",
    desc: "Minimal jitter for constrained or high-ping routes",
  },
  {
    id: "balanced",
    title: "Studio Voice",
    bitrate: "64 kbps",
    desc: "Recommended clarity + packet-loss recovery",
  },
  {
    id: "studio",
    title: "High-Fidelity",
    bitrate: "96 kbps",
    desc: "Full-band studio voice & music (DTX off)",
  },
];

const SIQ_TONE_OPTIONS: Array<{ id: SiqVoiceTone; label: string }> = [
  { id: "natural", label: "Natural" },
  { id: "clarity", label: "Studio Clarity" },
  { id: "warm", label: "Broadcast Warm" },
  { id: "crisp", label: "Crisp Comms" },
];

const SIQ_HPF_OPTIONS: Array<{ hz: SiqHighPassHz; label: string }> = [
  { hz: 0, label: "Off" },
  { hz: 80, label: "80 Hz" },
  { hz: 120, label: "120 Hz" },
];

function formatGainDb(pct: number): string {
  if (pct <= 0) return "-∞ dB";
  const db = 20 * Math.log10(pct / 100);
  const rounded = Math.round(db * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)} dB`;
}

function formatKeybindCode(code: string): string {
  if (!code) return "Unbound";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const map: Record<string, string> = {
    AltLeft: "Left Alt",
    AltRight: "Right Alt",
    ControlLeft: "Left Ctrl",
    ControlRight: "Right Ctrl",
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    Backquote: "` (Tilde)",
    CapsLock: "Caps Lock",
    Space: "Space",
    Tab: "Tab",
  };
  return map[code] ?? code;
}

// --- SIQ Nocturne visual vocabulary (presentation only) ---------------------
const CARD =
  "rounded-2xl border border-white/[0.07] bg-white/[0.03] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]";
const SUBCARD = "rounded-xl border border-white/[0.06] bg-black/20";
const FIELD =
  "w-full rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)] transition-[border-color,box-shadow,background-color] duration-200 hover:border-white/[0.14] focus:border-emerald-500/50 focus:bg-black/35 focus:outline-none focus:ring-4 focus:ring-emerald-500/10";
const LABEL = "block text-xs font-semibold text-zinc-300";
const OPTION =
  "rounded-2xl border text-left transition-[translate,scale,border-color,background-color,box-shadow,color] duration-200 hover:-translate-y-0.5 active:scale-[0.985]";
const OPTION_ON =
  "border-emerald-500/50 bg-emerald-500/[0.09] ring-4 ring-emerald-500/10 shadow-[0_14px_32px_-18px_rgb(var(--siq-accent-rgb)/0.95)]";
const OPTION_OFF =
  "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.14] hover:bg-white/[0.045]";
const CHIP =
  "rounded-xl border transition-[border-color,background-color,color,box-shadow] duration-200";
const CHIP_ON =
  "border-emerald-500/50 bg-emerald-500/15 text-emerald-200 shadow-[0_0_18px_-8px_rgb(var(--siq-accent-rgb)/0.9)]";
const CHIP_OFF =
  "border-white/[0.07] bg-white/[0.03] text-zinc-400 hover:border-white/[0.14] hover:text-zinc-200";
const GHOST_BUTTON =
  "siq-press inline-flex items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.03] font-semibold text-zinc-300 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-50";
const SECTION_ICON =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/[0.12] text-emerald-300 ring-1 ring-inset ring-emerald-500/25";
const SECTION_TITLE = "text-[11px] font-bold uppercase tracking-[0.09em] text-zinc-300";
const VALUE_CHIP =
  "rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] tabular-nums text-emerald-300 ring-1 ring-inset ring-emerald-500/20";
const SEGMENT_TRACK =
  "inline-flex rounded-xl border border-white/[0.07] bg-black/30 p-0.5 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]";
const SEGMENT_PILL =
  "absolute inset-0 -z-10 rounded-[9px] bg-emerald-500/20 shadow-[inset_0_0_0_1px_rgb(var(--siq-accent-rgb)/0.35),0_4px_14px_-6px_rgb(var(--siq-accent-rgb)/0.8)]";
const SEGMENT_SPRING = { type: "spring", stiffness: 520, damping: 40 } as const;

function togglePillClass(on: boolean) {
  return `siq-press inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
    on
      ? "bg-emerald-500/15 text-emerald-300 shadow-[inset_0_0_0_1px_rgb(var(--siq-accent-rgb)/0.4),0_0_18px_-6px_rgb(var(--siq-accent-rgb)/0.8)]"
      : "bg-white/[0.05] text-zinc-400 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] hover:text-zinc-200"
  }`;
}

function StateDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`h-1.5 w-1.5 rounded-full transition-[background-color,box-shadow] duration-200 ${
        on ? "bg-emerald-400 shadow-[0_0_8px_rgb(var(--siq-accent-rgb)/0.9)]" : "bg-zinc-600"
      }`}
    />
  );
}

function staggerIn(index: number) {
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: {
      delay: 0.04 + Math.min(index, 10) * 0.035,
      type: "spring" as const,
      stiffness: 420,
      damping: 32,
    },
  };
}

export function SettingsModal({
  open,
  initialTab = "account",
  user,
  blobReady,
  appPrefs,
  desktopSettings,
  onUpdatePrefs,
  onResetPrefs,
  onClose,
  onUserUpdated,
  onSignOut,
}: SettingsModalProps) {
  const voice = useVoice();
  const notify = useSystemNotify();
  const themePreset = APP_THEME_PRESETS.find((preset) => preset.id === appPrefs.theme)
    ?? APP_THEME_PRESETS.find((preset) => preset.id === DEFAULT_APP_THEME);

  const [tab, setTab] = useState<SettingsTab>(initialTab);

  // Account state
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [customActivity, setCustomActivity] = useState(user.customActivity ?? "");
  const [avatarColor, setAvatarColor] = useState(user.avatarColor);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl);
  const [bannerUrl, setBannerUrl] = useState<string | null>(user.bannerUrl);
  const [uploadingMedia, setUploadingMedia] = useState<CropMode | null>(null);
  const [cropRequest, setCropRequest] = useState<{ file: File; mode: CropMode } | null>(
    null
  );
  const [savingAccount, setSavingAccount] = useState(false);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const setAccountMsg = useCallback(
    (msg: { type: "ok" | "err"; text: string } | null) => {
      if (!msg) return;
      notify({
        kind: msg.type === "err" ? "error" : "success",
        title: msg.type === "err" ? "Profile Error" : "Profile Updated",
        message: msg.text,
        source: "Settings",
      });
    },
    [notify]
  );

  const setPasswordMsg = useCallback(
    (msg: { type: "ok" | "err"; text: string } | null) => {
      if (!msg) return;
      notify({
        kind: msg.type === "err" ? "error" : "success",
        title: msg.type === "err" ? "Password Error" : "Password Updated",
        message: msg.text,
        source: "Settings",
      });
    },
    [notify]
  );

  // Sound prefs
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.45);
  const [recordingPtt, setRecordingPtt] = useState(false);

  useEffect(() => {
    if (!recordingPtt) {
      delete document.body.dataset.siqRecordingPtt;
      return;
    }
    document.body.dataset.siqRecordingPtt = "true";
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setRecordingPtt(false);
        return;
      }
      void voice.updateVoiceAudio({ pttKey: e.code });
      setRecordingPtt(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      delete document.body.dataset.siqRecordingPtt;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [recordingPtt, voice]);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const accountDraftRef = useRef<{ userId: string; initialTab: SettingsTab } | null>(null);

  useEffect(() => {
    if (!open) {
      accountDraftRef.current = null;
      setCropRequest(null);
      setRecordingPtt(false);
      return;
    }
    if (
      accountDraftRef.current?.userId === user.id &&
      accountDraftRef.current.initialTab === initialTab
    ) {
      return;
    }
    accountDraftRef.current = { userId: user.id, initialTab };
    setTab(initialTab);
    setDisplayName(user.displayName);
    setEmail(user.email ?? "");
    setBio(user.bio ?? "");
    setCustomActivity(user.customActivity ?? "");
    setAvatarColor(user.avatarColor);
    setAvatarUrl(user.avatarUrl);
    setBannerUrl(user.bannerUrl);
    setAccountMsg(null);
    setPasswordMsg(null);
    setCurrentPassword("");
    setNewPassword("");
    const sp = getSoundPrefs();
    setSoundEnabled(sp.enabled);
    setSoundVolume(sp.volume);
    void voice.refreshDevices();
  }, [open, initialTab, user, voice.refreshDevices]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handlePickImage(file: File, mode: CropMode) {
    if (!file.type.startsWith("image/")) {
      setAccountMsg({ type: "err", text: "Please select an image file." });
      return;
    }
    setAccountMsg(null);
    setCropRequest({ file, mode });
  }

  async function persistProfileMedia(mode: CropMode, url: string | null) {
    const patch = mode === "avatar" ? { avatarUrl: url } : { bannerUrl: url };
    const response = await apiFetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await response.json();
    if (!response.ok || !data.user) {
      throw new Error(data.error ?? "Could not save the profile image.");
    }

    const updated: PrivateUser = data.user;
    if (mode === "avatar") setAvatarUrl(updated.avatarUrl);
    else setBannerUrl(updated.bannerUrl);
    onUserUpdated(updated);
  }

  async function handleCroppedImage(mode: CropMode, file: File) {
    setCropRequest(null);
    if (uploadingMedia || savingAccount) return;
    setUploadingMedia(mode);
    setAccountMsg(null);

    const setMediaUrl = mode === "avatar" ? setAvatarUrl : setBannerUrl;
    const previousUrl = mode === "avatar" ? avatarUrl : bannerUrl;
    const previewUrl = URL.createObjectURL(file);
    setMediaUrl(previewUrl);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiFetch("/api/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok || !data.attachment?.url) {
        throw new Error(data.error ?? "Upload failed.");
      }

      await persistProfileMedia(mode, data.attachment.url);
      setAccountMsg({
        type: "ok",
        text: mode === "avatar" ? "Profile photo updated." : "Banner updated.",
      });
    } catch (error) {
      setMediaUrl((current) => current === previewUrl ? previousUrl : current);
      setAccountMsg({
        type: "err",
        text: error instanceof Error ? error.message : "Network error uploading image.",
      });
    } finally {
      URL.revokeObjectURL(previewUrl);
      setUploadingMedia(null);
    }
  }

  async function handleRemoveMedia(mode: CropMode) {
    if (uploadingMedia || savingAccount) return;
    setUploadingMedia(mode);
    try {
      await persistProfileMedia(mode, null);
    } catch (error) {
      setAccountMsg({
        type: "err",
        text: error instanceof Error ? error.message : "Could not remove the profile image.",
      });
    } finally {
      setUploadingMedia(null);
    }
  }

  async function handleSaveAccount(e: FormEvent) {
    e.preventDefault();
    if (savingAccount || uploadingMedia) return;
    setSavingAccount(true);
    setAccountMsg(null);
    try {
      const body: Record<string, unknown> = {
        displayName,
        avatarColor,
        bio: bio.trim() || null,
        customActivity: customActivity.trim() || null,
      };
      if (avatarUrl === null || !avatarUrl.startsWith("blob:")) {
        body.avatarUrl = avatarUrl;
      }
      if (bannerUrl === null || !bannerUrl.startsWith("blob:")) {
        body.bannerUrl = bannerUrl;
      }
      if (email.trim()) body.email = email.trim();

      const res = await apiFetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setAccountMsg({ type: "err", text: data.error ?? "Failed to update profile." });
      } else {
        onUserUpdated(data.user);
        setAccountMsg({ type: "ok", text: "Profile saved." });
      }
    } catch {
      setAccountMsg({ type: "err", text: "Network error while saving profile." });
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setChangingPassword(true);
    setPasswordMsg(null);
    try {
      const res = await apiFetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordMsg({ type: "err", text: data.error ?? "Could not change password." });
      } else {
        setCurrentPassword("");
        setNewPassword("");
        setPasswordMsg({ type: "ok", text: "Password updated successfully." });
      }
    } catch {
      setPasswordMsg({ type: "err", text: "Network error updating password." });
    } finally {
      setChangingPassword(false);
    }
  }

  const navGroups: Array<{
    title: string;
    items: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }>;
  }> = [
    {
      title: "User Settings",
      items: [
        { id: "account", label: "My Account", icon: <UserCircle className="h-4 w-4" /> },
        { id: "privacy", label: "Data & Privacy", icon: <Shield className="h-4 w-4" /> },
      ],
    },
    {
      title: "App Settings",
      items: [
        { id: "voice", label: "Voice & Video", icon: <Headphones className="h-4 w-4" /> },
        {
          id: "notifications",
          label: "Notifications & Audio",
          icon: <Bell className="h-4 w-4" />,
        },
        { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
      ],
    },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="siq-backdrop fixed inset-0 z-[70] flex items-center justify-center md:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Application settings"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="siq-settings-dialog siq-glass siq-edge-light relative flex h-full w-full max-w-4xl flex-col overflow-hidden md:h-[min(84dvh,700px)] md:flex-row md:rounded-3xl"
          >
            {/* Left Settings Sidebar */}
            <aside className="flex shrink-0 flex-col justify-between border-b border-white/[0.06] bg-black/20 p-3 md:w-[236px] md:border-b-0 md:border-r md:px-4 md:py-5">
              <div>
                <div className="mb-2 flex items-center justify-between pl-2 md:hidden">
                  <span className="text-sm font-bold tracking-tight text-zinc-50">Settings</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => { onClose(); onSignOut(); }} className="siq-press rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20">
                      Log Out
                    </button>
                    <button type="button" onClick={onClose} aria-label="Close settings" className="siq-icon-btn">
                      <X className="size-4" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-1 overflow-x-auto [scrollbar-width:thin] md:block md:space-y-6 md:overflow-visible">
                {navGroups.map((group) => (
                  <div key={group.title} className="shrink-0 space-y-1.5">
                    <p className="siq-section-label !hidden !px-2.5 md:!flex">
                      {group.title}
                    </p>
                    <div className="flex gap-1 md:flex-col md:gap-0.5">
                      {group.items.map((item) => {
                        const active = tab === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setTab(item.id)}
                            data-selected={active}
                            className="siq-nav-item !flex-none whitespace-nowrap !py-2 !text-[13px] font-medium"
                          >
                            {active && (
                              <motion.span
                                layoutId="siq-settings-nav-highlight"
                                className="siq-nav-highlight"
                                transition={{ type: "spring", stiffness: 520, damping: 42 }}
                              />
                            )}
                            <span className="siq-nav-icon">
                              {item.icon}
                            </span>
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                </div>
              </div>

              {/* Bottom Pinned Log Out */}
              <div className="mt-3 hidden border-t border-white/[0.06] pt-3 md:block">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSignOut();
                  }}
                  className="siq-press group flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                >
                  <LogOut className="h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-0.5" />
                  <span>Log Out</span>
                </button>
              </div>
            </aside>

            {/* Right Content Pane */}
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Top Content Header */}
              <div className="hidden h-16 shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent px-7 md:flex">
                <div className="flex min-w-0 items-center gap-3">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={tab}
                      initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.6, rotate: 20 }}
                      transition={{ type: "spring", stiffness: 520, damping: 30 }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-emerald-500/[0.04] text-emerald-300 ring-1 ring-inset ring-emerald-400/30 shadow-[0_10px_24px_-10px_rgb(var(--siq-accent-rgb)/0.8),inset_0_1px_0_rgb(255_255_255/0.12)]"
                    >
                      {navGroups.flatMap((group) => group.items).find((item) => item.id === tab)?.icon}
                    </motion.span>
                  </AnimatePresence>
                  <h2 className="truncate text-lg font-bold tracking-tight text-zinc-50">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={tab}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                        className="inline-block"
                      >
                        {tab === "account"
                          ? "My Account"
                          : tab === "voice"
                            ? "Voice & Video"
                            : tab === "notifications"
                              ? "Notifications & Audio"
                              : tab === "privacy"
                                ? "Data & Privacy"
                                : "Appearance"}
                      </motion.span>
                    </AnimatePresence>
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close settings"
                  className="siq-press flex shrink-0 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-400 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
                >
                  <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide shadow-[inset_0_-1px_0_rgb(0_0_0/0.4)]">ESC</span>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Scrollable Tab Body */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:px-7 md:py-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="mx-auto max-w-xl space-y-7"
                  >
                    {/* ACCOUNT TAB */}
                    {tab === "account" && (
                      <>
                        <form onSubmit={handleSaveAccount} className="space-y-5">
                          {/* Profile Card Preview with Banner + Avatar Croppers */}
                          <div className={`${CARD} overflow-hidden`}>
                            <div
                              className="group/banner relative h-32 w-full overflow-hidden"
                              style={
                                !bannerUrl
                                  ? {
                                      background: `radial-gradient(120% 140% at 0% 0%, ${avatarColor}66 0%, transparent 60%), linear-gradient(135deg, ${avatarColor}38 0%, transparent 100%)`,
                                    }
                                  : undefined
                              }
                            >
                              {bannerUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={mediaUrl(bannerUrl)}
                                  alt="Profile banner"
                                  className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/banner:scale-[1.03]"
                                />
                              )}
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/45 to-transparent"
                              />

                              <input
                                ref={bannerInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handlePickImage(f, "banner");
                                  e.target.value = "";
                                }}
                              />

                              <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={uploadingMedia !== null || savingAccount || !blobReady}
                                  onClick={() => bannerInputRef.current?.click()}
                                  className="siq-press inline-flex items-center gap-1.5 rounded-xl border border-white/[0.15] bg-black/55 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-100 backdrop-blur-md hover:border-emerald-500/50 hover:bg-black/75 hover:text-emerald-300 disabled:opacity-40"
                                >
                                  <ImagePlus className="h-3.5 w-3.5" />
                                  <span>
                                    {uploadingMedia === "banner"
                                      ? "Saving..."
                                      : bannerUrl
                                        ? "Change Banner"
                                        : "Add Banner"}
                                  </span>
                                </button>
                                {bannerUrl && (
                                  <button
                                    type="button"
                                    disabled={uploadingMedia !== null || savingAccount}
                                    onClick={() => void handleRemoveMedia("banner")}
                                    title="Remove banner"
                                    className="siq-press rounded-xl border border-white/[0.15] bg-black/55 p-1.5 text-zinc-300 backdrop-blur-md hover:border-rose-500/50 hover:text-rose-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-end justify-between gap-4 px-4 pb-4">
                              <div className="relative z-10 -mt-8 flex items-end gap-3.5">
                                <div className="relative inline-flex rounded-full shadow-[0_12px_28px_-10px_rgb(0_0_0/0.8)] ring-4 ring-[#17181f]">
                                  <Avatar
                                    name={displayName || user.username}
                                    color={avatarColor}
                                    avatarUrl={avatarUrl}
                                    size="xl"
                                    online
                                    ringClassName="ring-[#17181f]"
                                  />
                                </div>
                                <div className="relative z-10 pb-1">
                                  <div className="flex items-center gap-2">
                                    <p
                                      dir="auto"
                                      className="text-base font-bold tracking-tight text-zinc-50 drop-shadow-sm"
                                    >
                                      {displayName || user.username}
                                    </p>
                                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold capitalize text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                                      {user.role}
                                    </span>
                                  </div>
                                  <p className="text-xs font-medium text-zinc-400 drop-shadow-sm">
                                    @{user.username}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <input
                                  ref={avatarInputRef}
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handlePickImage(f, "avatar");
                                    e.target.value = "";
                                  }}
                                />
                                <button
                                  type="button"
                                  disabled={uploadingMedia !== null || savingAccount || !blobReady}
                                  onClick={() => avatarInputRef.current?.click()}
                                  className={`${GHOST_BUTTON} px-3 py-1.5 text-xs hover:!border-emerald-500/40 hover:!text-emerald-300 disabled:!opacity-40`}
                                >
                                  <Camera className="h-3.5 w-3.5" />
                                  <span>
                                    {uploadingMedia === "avatar"
                                      ? "Saving..."
                                      : "Change Photo"}
                                  </span>
                                </button>
                                {avatarUrl && (
                                  <button
                                    type="button"
                                    disabled={uploadingMedia !== null || savingAccount}
                                    onClick={() => void handleRemoveMedia("avatar")}
                                    title="Remove photo"
                                    className="siq-press rounded-xl border border-white/[0.09] bg-white/[0.03] p-1.5 text-zinc-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <label
                                htmlFor="settings-display-name"
                                className={LABEL}
                              >
                                Display name
                              </label>
                              <input
                                id="settings-display-name"
                                type="text"
                                dir="auto"
                                required
                                maxLength={40}
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className={FIELD}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label
                                htmlFor="settings-email"
                                className="flex items-center justify-between text-xs font-semibold text-zinc-300"
                              >
                                <span>Email address</span>
                                <span className="inline-flex items-center gap-1 text-[10px] font-normal text-zinc-500">
                                  <Lock className="h-2.5 w-2.5" /> Private
                                </span>
                              </label>
                              <div className="relative">
                                <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                                <input
                                  id="settings-email"
                                  type="email"
                                  value={email}
                                  onChange={(e) => setEmail(e.target.value.toLowerCase())}
                                  placeholder="you@example.com"
                                  className={`${FIELD} !pl-9`}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label
                              htmlFor="settings-activity"
                              className={LABEL}
                            >
                              Custom activity
                            </label>
                            <input
                              id="settings-activity"
                              type="text"
                              dir="auto"
                              maxLength={120}
                              value={customActivity}
                              onChange={(e) => setCustomActivity(e.target.value)}
                              placeholder="Playing Valorant, Listening to Lo-fi..."
                              className={FIELD}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label
                              htmlFor="settings-bio"
                              className="flex items-center justify-between text-xs font-semibold text-zinc-300"
                            >
                              <span>About me (Bio)</span>
                              <span className="text-[10px] font-normal tabular-nums text-zinc-500">
                                {bio.length}/220
                              </span>
                            </label>
                            <textarea
                              id="settings-bio"
                              rows={2}
                              dir="auto"
                              maxLength={220}
                              value={bio}
                              onChange={(e) => setBio(e.target.value)}
                              placeholder="Tell your friends a bit about yourself..."
                              className={`${FIELD} resize-none`}
                            />
                          </div>

                          <div className="space-y-2">
                            <span className={LABEL}>
                              Avatar accent color
                            </span>
                            <div className="flex flex-wrap gap-2.5">
                              {AVATAR_PALETTE.map((hex) => {
                                const selected =
                                  avatarColor.toLowerCase() === hex.toLowerCase();
                                return (
                                  <button
                                    key={hex}
                                    type="button"
                                    onClick={() => setAvatarColor(hex)}
                                    className={`flex h-7 w-7 items-center justify-center rounded-full shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] outline-2 outline-offset-2 transition-[scale,outline-color] duration-200 active:scale-95 ${
                                      selected
                                        ? "scale-110 outline-white"
                                        : "outline-transparent hover:scale-110"
                                    }`}
                                    style={{ backgroundColor: hex }}
                                  >
                                    <AnimatePresence initial={false}>
                                      {selected && (
                                        <motion.span
                                          initial={{ opacity: 0, scale: 0.3 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          exit={{ opacity: 0, scale: 0.3 }}
                                          transition={{ type: "spring", stiffness: 600, damping: 26 }}
                                          className="flex"
                                        >
                                          <Check className="h-3.5 w-3.5 text-zinc-950" />
                                        </motion.span>
                                      )}
                                    </AnimatePresence>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="submit"
                              disabled={savingAccount || uploadingMedia !== null}
                              className="siq-cta !rounded-xl px-5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {savingAccount ? "Saving..." : "Save Profile"}
                            </button>
                          </div>
                        </form>

                        {/* Change Password */}
                        <form
                          onSubmit={handleChangePassword}
                          className={`${CARD} space-y-4 p-4 sm:p-5`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={SECTION_ICON}>
                              <KeyRound className="h-3.5 w-3.5" />
                            </span>
                            <h3 className={SECTION_TITLE}>
                              Password &amp; Security
                            </h3>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <label
                                htmlFor="curr-pass"
                                className="block text-xs font-semibold text-zinc-400"
                              >
                                Current password
                              </label>
                              <input
                                id="curr-pass"
                                type="password"
                                required
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="••••••••"
                                className={FIELD}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label
                                htmlFor="new-pass"
                                className="block text-xs font-semibold text-zinc-400"
                              >
                                New password
                              </label>
                              <input
                                id="new-pass"
                                type="password"
                                required
                                minLength={6}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="At least 6 characters"
                                className={FIELD}
                              />
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="submit"
                              disabled={changingPassword}
                              className={`${GHOST_BUTTON} px-4 py-2 text-xs hover:!border-emerald-500/40 hover:!text-emerald-300`}
                            >
                              {changingPassword ? "Updating..." : "Update Password"}
                            </button>
                          </div>
                        </form>
                      </>
                    )}

                    {/* VOICE & VIDEO TAB */}
                    {tab === "voice" && (
                      <>
                        {/* Devices & Master Volumes */}
                        <div className="space-y-4">
                          <div className="flex items-center gap-2.5">
                            <span className={SECTION_ICON}>
                              <Headphones className="h-3.5 w-3.5" />
                            </span>
                            <h3 className={SECTION_TITLE}>
                              Audio &amp; Camera Devices
                            </h3>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <label htmlFor="s-mic" className={LABEL}>
                                Input Device (Mic)
                              </label>
                              <SelectDropdown
                                id="s-mic"
                                ariaLabel="Input Device (Mic)"
                                value={voice.selectedAudioInput}
                                onChange={(v) => void voice.setAudioInput(v)}
                                icon={<Mic className="h-3.5 w-3.5" />}
                                options={[
                                  { value: "", label: "System Default", badge: "Auto" },
                                  ...voice.devices.audioInputs.map((d) => ({
                                    value: d.deviceId,
                                    label: d.label || `Mic ${d.deviceId.slice(0, 6)}`,
                                  })),
                                ]}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label htmlFor="s-out" className={LABEL}>
                                Output Device (Headset)
                              </label>
                              <SelectDropdown
                                id="s-out"
                                ariaLabel="Output Device (Headset)"
                                value={voice.selectedAudioOutput}
                                onChange={(v) => voice.setAudioOutput(v)}
                                icon={<Headphones className="h-3.5 w-3.5" />}
                                options={[
                                  { value: "", label: "System Default", badge: "Auto" },
                                  ...voice.devices.audioOutputs.map((d) => ({
                                    value: d.deviceId,
                                    label: d.label || `Speaker ${d.deviceId.slice(0, 6)}`,
                                  })),
                                ]}
                              />
                            </div>
                          </div>

                          {/* Input Gain & Master Output Volume */}
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className={`${CARD} space-y-2.5 p-3.5`}>
                              <div className="flex items-center justify-between gap-2">
                                <label htmlFor="s-input-gain" className="text-xs font-semibold text-zinc-200">
                                  Input Volume (Mic Gain)
                                </label>
                                <div className="flex items-center gap-1.5">
                                  <span className={VALUE_CHIP}>
                                    {voice.voiceAudio.inputGainPct}% · {formatGainDb(voice.voiceAudio.inputGainPct)}
                                  </span>
                                  {voice.voiceAudio.inputGainPct !== 100 && (
                                    <button
                                      type="button"
                                      onClick={() => void voice.updateVoiceAudio({ inputGainPct: 100 })}
                                      className="siq-press rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-zinc-400 ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.1] hover:text-white"
                                      title="Reset to 100% (0 dB)"
                                    >
                                      0 dB
                                    </button>
                                  )}
                                </div>
                              </div>
                              <input
                                id="s-input-gain"
                                type="range"
                                min={0}
                                max={250}
                                step={5}
                                value={voice.voiceAudio.inputGainPct}
                                onChange={(e) =>
                                  void voice.updateVoiceAudio({ inputGainPct: Number(e.target.value) })
                                }
                                className="h-1.5 w-full cursor-pointer accent-emerald-400 transition-[filter] hover:brightness-110"
                              />
                              <div className="flex justify-between text-[10px] tabular-nums text-zinc-500">
                                <span>0%</span>
                                <span>100% (0 dB)</span>
                                <span>250% (+8 dB)</span>
                              </div>
                            </div>

                            <div className={`${CARD} space-y-2.5 p-3.5`}>
                              <div className="flex items-center justify-between gap-2">
                                <label htmlFor="s-output-vol" className="text-xs font-semibold text-zinc-200">
                                  Output Volume (Master)
                                </label>
                                <div className="flex items-center gap-1.5">
                                  <span className={VALUE_CHIP}>
                                    {voice.voiceAudio.outputVolumePct}%
                                  </span>
                                  {voice.voiceAudio.outputVolumePct !== 100 && (
                                    <button
                                      type="button"
                                      onClick={() => void voice.updateVoiceAudio({ outputVolumePct: 100 })}
                                      className="siq-press rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-zinc-400 ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.1] hover:text-white"
                                      title="Reset to 100%"
                                    >
                                      100%
                                    </button>
                                  )}
                                </div>
                              </div>
                              <input
                                id="s-output-vol"
                                type="range"
                                min={0}
                                max={200}
                                step={5}
                                value={voice.voiceAudio.outputVolumePct}
                                onChange={(e) =>
                                  void voice.updateVoiceAudio({ outputVolumePct: Number(e.target.value) })
                                }
                                className="h-1.5 w-full cursor-pointer accent-emerald-400 transition-[filter] hover:brightness-110"
                              />
                              <div className="flex justify-between text-[10px] tabular-nums text-zinc-500">
                                <span>Mute</span>
                                <span>100%</span>
                                <span>200% Boost</span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label htmlFor="s-cam" className={LABEL}>
                              Camera
                            </label>
                            <SelectDropdown
                              id="s-cam"
                              ariaLabel="Camera"
                              value={voice.selectedVideoInput}
                              onChange={(v) => void voice.setVideoInput(v)}
                              icon={<Camera className="h-3.5 w-3.5" />}
                              options={[
                                { value: "", label: "System Default", badge: "Auto" },
                                ...voice.devices.videoInputs.map((d) => ({
                                  value: d.deviceId,
                                  label: d.label || `Camera ${d.deviceId.slice(0, 6)}`,
                                })),
                              ]}
                            />
                          </div>

                          {/* Live Studio Mic Test + Sidetone */}
                          <LiveMicWaveform
                            deviceId={voice.selectedAudioInput}
                            outputDeviceId={voice.selectedAudioOutput}
                            echoCancellation={voice.echoCancellation}
                            autoGainControl={voice.autoGainControl}
                            noiseMode={voice.noiseMode}
                            inputGainPct={voice.voiceAudio.inputGainPct}
                            siqDsp={voice.voiceAudio.siqDsp}
                          />
                        </div>

                        {/* Noise Cancellation Selector */}
                        <div className="space-y-3.5 border-t border-white/[0.06] pt-6">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <span className={SECTION_ICON}><Sparkles className="h-3.5 w-3.5" /></span>
                              <h3 className={SECTION_TITLE}>
                                Noise Cancellation Engine
                              </h3>
                            </div>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/[0.12] px-2.5 py-0.5 text-[10px] font-bold tracking-wide tabular-nums text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
                              <span aria-hidden="true" className="siq-live-dot !h-1.5 !w-1.5" />
                              Active:{" "}
                              {voice.activeNoiseEngine === "siq"
                                ? voice.activeSiqEngine === "ultra"
                                  ? voice.siqNeuralState === "loading" || voice.siqNeuralState === "priming"
                                    ? "SIQ ULTRA AI · LOADING MODEL"
                                    : "SIQ ULTRA AI · DF3 48kHz"
                                  : voice.activeSiqEngine === "fast"
                                    ? "SIQ FAST AI · GTCRN"
                                    : "SIQ SPECTRAL · ~10ms"
                                : voice.activeNoiseEngine.toUpperCase()}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2">
                            {NOISE_MODES.map((m, index) => {
                              const selected = voice.noiseMode === m.id;
                              return (
                                <motion.button
                                  key={m.id}
                                  type="button"
                                  {...staggerIn(index)}
                                  onClick={() => void voice.setNoiseMode(m.id)}
                                  className={`${OPTION} flex items-start justify-between gap-3 p-3.5 ${
                                    selected
                                      ? OPTION_ON
                                      : OPTION_OFF
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-xs font-bold text-zinc-100">
                                        {m.title}
                                      </span>
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                                          m.id === "siq"
                                            ? "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30"
                                            : "bg-white/[0.06] text-zinc-400 ring-white/[0.06]"
                                        }`}
                                      >
                                        {m.badge}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                                      {m.desc}
                                    </p>
                                  </div>
                                  <span
                                    className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow] duration-200 ${
                                      selected
                                        ? "border-emerald-400 bg-emerald-400 text-zinc-950 shadow-[0_0_14px_-2px_rgb(var(--siq-accent-rgb)/0.9)]"
                                        : "border-zinc-600"
                                    }`}
                                  >
                                    <AnimatePresence initial={false}>
                                      {selected && (
                                        <motion.span
                                          initial={{ opacity: 0, scale: 0.3 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          exit={{ opacity: 0, scale: 0.3 }}
                                          transition={{ type: "spring", stiffness: 600, damping: 26 }}
                                          className="flex"
                                        >
                                          <Check className="h-3 w-3" />
                                        </motion.span>
                                      )}
                                    </AnimatePresence>
                                  </span>
                                </motion.button>
                              );
                            })}
                          </div>

                          {/* SIQ AI Studio Console */}
                          <AnimatePresence initial={false}>
                          {(voice.noiseMode === "siq" || voice.activeNoiseEngine === "siq") && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                              className="overflow-hidden"
                            >
                            <div className="siq-edge-light relative space-y-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.06] to-black/20 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                  <span className={SECTION_ICON}>
                                    <Sliders className="h-3.5 w-3.5" />
                                  </span>
                                  <span className="text-[13px] font-bold tracking-tight text-zinc-50">
                                    SIQ AI Studio Console
                                  </span>
                                </div>
                                <span className="text-[10px] font-medium tabular-nums text-emerald-300/80">
                                  {voice.voiceAudio.siqDsp.aiEngine === "ultra"
                                    ? "DeepFilterNet3 · 48kHz · Worker thread"
                                    : voice.voiceAudio.siqDsp.aiEngine === "fast"
                                      ? "GTCRN neural · 16kHz voice band"
                                      : "SIQ Spectral · MCRA + Wiener · ~10ms"}
                                </span>
                              </div>

                              {/* 3-Tier Neural Core Selector */}
                              <div className="space-y-1.5">
                                <p className="text-[11px] font-semibold text-zinc-300">
                                  Neural Core Mode
                                </p>
                                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                                  {SIQ_AI_ENGINE_OPTIONS.map((eng) => {
                                    const active = voice.voiceAudio.siqDsp.aiEngine === eng.id;
                                    return (
                                      <button
                                        key={eng.id}
                                        type="button"
                                        onClick={() => voice.updateSiqDsp({ aiEngine: eng.id })}
                                        className={`${CHIP} px-3 py-2.5 text-left ${
                                          active
                                            ? CHIP_ON
                                            : CHIP_OFF
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="text-[11px] font-semibold">
                                            {eng.label}
                                          </span>
                                          <span className="font-mono text-[9px] tabular-nums text-zinc-400">
                                            {eng.spec}
                                          </span>
                                        </div>
                                        <p className="mt-0.5 text-[10px] text-zinc-500">
                                          {eng.desc}
                                        </p>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* 4 Quick Presets */}
                              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                                {SIQ_DSP_PRESETS.map((preset) => {
                                  const isMatch =
                                    voice.voiceAudio.siqDsp.suppressionStrength ===
                                      preset.patch.suppressionStrength &&
                                    voice.voiceAudio.siqDsp.voiceTone === preset.patch.voiceTone &&
                                    voice.voiceAudio.siqDsp.highPassHz === preset.patch.highPassHz;
                                  return (
                                    <button
                                      key={preset.id}
                                      type="button"
                                      onClick={() => voice.applySiqPreset(preset.id)}
                                      className={`${CHIP} px-3 py-2.5 text-left ${
                                        isMatch
                                          ? CHIP_ON
                                          : CHIP_OFF
                                      }`}
                                    >
                                      <p className="text-[11px] font-semibold">{preset.label}</p>
                                      <p className="mt-0.5 text-[10px] text-zinc-500">{preset.desc}</p>
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Suppression Strength */}
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <label htmlFor="s-siq-sup" className="text-zinc-300">
                                    AI Noise Suppression Strength
                                  </label>
                                  <span className={VALUE_CHIP}>
                                    {voice.voiceAudio.siqDsp.suppressionStrength}%
                                    {voice.voiceAudio.siqDsp.aiEngine === "ultra"
                                      ? ` · -${suppressionPctToAttenLimDb(voice.voiceAudio.siqDsp.suppressionStrength)} dB`
                                      : ""}
                                  </span>
                                </div>
                                <input
                                  id="s-siq-sup"
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={2}
                                  value={voice.voiceAudio.siqDsp.suppressionStrength}
                                  onChange={(e) =>
                                    voice.updateSiqDsp({
                                      suppressionStrength: Number(e.target.value),
                                    })
                                  }
                                  className="h-1.5 w-full cursor-pointer accent-emerald-400 transition-[filter] hover:brightness-110"
                                />
                              </div>

                              {/* Voice Gate Auto / Manual + Threshold */}
                              <div className={`${SUBCARD} space-y-2.5 p-3.5`}>
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-semibold text-zinc-200">
                                      Smart Voice Gate
                                    </p>
                                    <p className="text-[10px] text-zinc-500">
                                      {voice.voiceAudio.siqDsp.aiEngine === "pure"
                                        ? "Silences background room noise between words without clipping speech."
                                        : "Look-ahead gate driven by the AI-cleaned signal — opens before your first syllable, ignores keyboard clicks and fans."}
                                    </p>
                                  </div>
                                  <div className={`${SEGMENT_TRACK} shrink-0`}>
                                    <button
                                      type="button"
                                      onClick={() => voice.updateSiqDsp({ autoGate: true })}
                                      className={`relative isolate rounded-[9px] px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200 ${
                                        voice.voiceAudio.siqDsp.autoGate
                                          ? "text-emerald-300"
                                          : "text-zinc-400 hover:text-zinc-200"
                                      }`}
                                    >
                                      {voice.voiceAudio.siqDsp.autoGate && (
                                        <motion.span
                                          layoutId="siq-settings-gate-mode"
                                          className={SEGMENT_PILL}
                                          transition={SEGMENT_SPRING}
                                        />
                                      )}
                                      Auto
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => voice.updateSiqDsp({ autoGate: false })}
                                      className={`relative isolate rounded-[9px] px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200 ${
                                        !voice.voiceAudio.siqDsp.autoGate
                                          ? "text-emerald-300"
                                          : "text-zinc-400 hover:text-zinc-200"
                                      }`}
                                    >
                                      {!voice.voiceAudio.siqDsp.autoGate && (
                                        <motion.span
                                          layoutId="siq-settings-gate-mode"
                                          className={SEGMENT_PILL}
                                          transition={SEGMENT_SPRING}
                                        />
                                      )}
                                      Manual
                                    </button>
                                  </div>
                                </div>

                                <AnimatePresence initial={false}>
                                {!voice.voiceAudio.siqDsp.autoGate && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                    className="overflow-hidden"
                                  >
                                  <div className="space-y-1.5 pt-1">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <label htmlFor="s-gate-db" className="font-medium text-zinc-400">
                                        Gate Open Threshold
                                      </label>
                                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-mono tabular-nums text-amber-300 ring-1 ring-inset ring-amber-500/25">
                                        {voice.voiceAudio.siqDsp.gateThresholdDb} dB
                                      </span>
                                    </div>
                                    <input
                                      id="s-gate-db"
                                      type="range"
                                      min={-65}
                                      max={-15}
                                      step={1}
                                      value={voice.voiceAudio.siqDsp.gateThresholdDb}
                                      onChange={(e) =>
                                        voice.updateSiqDsp({
                                          gateThresholdDb: Number(e.target.value),
                                        })
                                      }
                                      className="h-1.5 w-full cursor-pointer accent-amber-400"
                                    />
                                    <div className="flex justify-between text-[10px] tabular-nums text-zinc-500">
                                      <span>-65 dB (Sensitive)</span>
                                      <span>-40 dB</span>
                                      <span>-15 dB (Strict)</span>
                                    </div>
                                  </div>
                                  </motion.div>
                                )}
                                </AnimatePresence>
                              </div>

                              {/* High-Pass Rumble Filter (Pre-AI) */}
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[11px]">
                                  <p className="font-medium text-zinc-300">
                                    Pre-AI High-Pass Rumble Filter
                                  </p>
                                  <span className="text-[10px] text-zinc-500">
                                    Blocks desk thumps &amp; wind before AI
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]">
                                  {SIQ_HPF_OPTIONS.map((opt) => (
                                    <button
                                      key={opt.hz}
                                      type="button"
                                      onClick={() => voice.updateSiqDsp({ highPassHz: opt.hz })}
                                      className={`relative isolate rounded-[9px] py-1.5 text-[11px] font-semibold tabular-nums transition-colors duration-200 ${
                                        voice.voiceAudio.siqDsp.highPassHz === opt.hz
                                          ? "text-emerald-300"
                                          : "text-zinc-400 hover:text-zinc-200"
                                      }`}
                                    >
                                      {voice.voiceAudio.siqDsp.highPassHz === opt.hz && (
                                        <motion.span
                                          layoutId="siq-settings-hpf"
                                          className={SEGMENT_PILL}
                                          transition={SEGMENT_SPRING}
                                        />
                                      )}
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* De-Esser + Broadcast Compressor & Limiter */}
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    voice.updateSiqDsp({
                                      deEsser: !voice.voiceAudio.siqDsp.deEsser,
                                    })
                                  }
                                  className={`${CHIP} flex w-full items-center justify-between px-3 py-2.5 text-xs font-medium ${
                                    voice.voiceAudio.siqDsp.deEsser
                                      ? CHIP_ON
                                      : "border-white/[0.07] bg-black/20 text-zinc-400 hover:border-white/[0.14]"
                                  }`}
                                >
                                  <span className="text-left">
                                    <span className="block text-[11px] font-semibold">De-Esser</span>
                                    <span className="block text-[10px] text-zinc-400">
                                      Tames harsh S / Sh peaks
                                    </span>
                                  </span>
                                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold">
                                    <StateDot on={voice.voiceAudio.siqDsp.deEsser} />
                                    {voice.voiceAudio.siqDsp.deEsser ? "On" : "Off"}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    voice.updateSiqDsp({
                                      compressor: !voice.voiceAudio.siqDsp.compressor,
                                    })
                                  }
                                  className={`${CHIP} flex w-full items-center justify-between px-3 py-2.5 text-xs font-medium ${
                                    voice.voiceAudio.siqDsp.compressor
                                      ? CHIP_ON
                                      : "border-white/[0.07] bg-black/20 text-zinc-400 hover:border-white/[0.14]"
                                  }`}
                                >
                                  <span className="text-left">
                                    <span className="block text-[11px] font-semibold">
                                      Studio Comp &amp; Limiter
                                    </span>
                                    <span className="block text-[10px] text-zinc-400">
                                      Smart leveling &amp; anti-clip
                                    </span>
                                  </span>
                                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold">
                                    <StateDot on={voice.voiceAudio.siqDsp.compressor} />
                                    {voice.voiceAudio.siqDsp.compressor ? "On" : "Off"}
                                  </span>
                                </button>
                              </div>

                              <div className="space-y-1.5">
                                <p className="text-[11px] font-semibold text-zinc-300">
                                  Voice Tone EQ
                                </p>
                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                                  {SIQ_TONE_OPTIONS.map((tone) => (
                                    <button
                                      key={tone.id}
                                      type="button"
                                      onClick={() => voice.updateSiqDsp({ voiceTone: tone.id })}
                                      className={`${CHIP} px-2 py-2 text-[11px] font-semibold ${
                                        voice.voiceAudio.siqDsp.voiceTone === tone.id
                                          ? CHIP_ON
                                          : CHIP_OFF
                                      }`}
                                    >
                                      {tone.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                            </motion.div>
                          )}
                          </AnimatePresence>
                        </div>

                        {/* Input Mode: Voice Activity vs Push-to-Talk */}
                        <div className="space-y-3.5 border-t border-white/[0.06] pt-6">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className={SECTION_ICON}><Keyboard className="h-3.5 w-3.5" /></span>
                              <h3 className={SECTION_TITLE}>
                                Input Mode
                              </h3>
                            </div>
                            {voice.voiceAudio.inputMode === "push-to-talk" && (
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide ring-1 ring-inset transition-[background-color,color,box-shadow] duration-150 ${
                                  voice.isPttActive
                                    ? "bg-emerald-500/25 text-emerald-300 ring-emerald-500/40 shadow-[0_0_18px_-4px_rgb(var(--siq-accent-rgb)/0.9)]"
                                    : "bg-white/[0.06] text-zinc-400 ring-white/[0.08]"
                                }`}
                              >
                                <StateDot on={voice.isPttActive} />
                                {voice.isPttActive ? "TRANSMITTING" : "PTT STANDBY"}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void voice.updateVoiceAudio({ inputMode: "voice-activity" })
                              }
                              className={`${OPTION} p-3.5 ${
                                voice.voiceAudio.inputMode === "voice-activity"
                                  ? OPTION_ON
                                  : OPTION_OFF
                              }`}
                            >
                              <p className="text-xs font-bold text-zinc-100">Voice Activity</p>
                              <p className="mt-0.5 text-[11px] text-zinc-400">
                                Open mic with smart noise gate
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void voice.updateVoiceAudio({ inputMode: "push-to-talk" })
                              }
                              className={`${OPTION} p-3.5 ${
                                voice.voiceAudio.inputMode === "push-to-talk"
                                  ? OPTION_ON
                                  : OPTION_OFF
                              }`}
                            >
                              <p className="text-xs font-bold text-zinc-100">Push-to-Talk</p>
                              <p className="mt-0.5 text-[11px] text-zinc-400">
                                Zero-delay instant transmit key
                              </p>
                            </button>
                          </div>

                          {voice.voiceAudio.inputMode === "push-to-talk" && (
                            <div className={`${CARD} grid grid-cols-1 gap-4 p-4 sm:grid-cols-2`}>
                              <div className="space-y-1.5">
                                <p className="text-[11px] font-semibold text-zinc-300">
                                  Push-to-Talk Shortcut
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setRecordingPtt((prev) => !prev)}
                                  className={`siq-press flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-semibold ${
                                    recordingPtt
                                      ? "border-amber-400/60 bg-amber-500/15 text-amber-200 shadow-[0_0_0_4px_rgb(245_158_11/0.12),0_0_22px_-6px_rgb(245_158_11/0.7)] animate-pulse motion-reduce:animate-none"
                                      : "border-white/[0.09] bg-black/25 font-mono text-zinc-100 hover:border-white/[0.18]"
                                  }`}
                                >
                                  <span>
                                    {recordingPtt
                                      ? "Press any key… (Esc cancels)"
                                      : formatKeybindCode(voice.voiceAudio.pttKey)}
                                  </span>
                                  <span className="text-[10px] font-normal text-zinc-400">
                                    {recordingPtt ? "Listening" : "Edit"}
                                  </span>
                                </button>
                              </div>

                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[11px]">
                                  <label htmlFor="s-ptt-delay" className="text-zinc-300">
                                    Release Delay
                                  </label>
                                  <span className={VALUE_CHIP}>
                                    {voice.voiceAudio.pttReleaseDelayMs} ms
                                  </span>
                                </div>
                                <input
                                  id="s-ptt-delay"
                                  type="range"
                                  min={0}
                                  max={600}
                                  step={20}
                                  value={voice.voiceAudio.pttReleaseDelayMs}
                                  onChange={(e) =>
                                    void voice.updateVoiceAudio({
                                      pttReleaseDelayMs: Number(e.target.value),
                                    })
                                  }
                                  className="h-1.5 w-full cursor-pointer accent-emerald-400 transition-[filter] hover:brightness-110"
                                />
                                <p className="text-[10px] text-zinc-500">
                                  Keeps mic open briefly after release so word endings never cut off.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Voice Quality & Network Resilience */}
                        <div className="space-y-3.5 border-t border-white/[0.06] pt-6">
                          <div className="flex items-center gap-2.5">
                            <span className={SECTION_ICON}><Radio className="h-3.5 w-3.5" /></span>
                            <h3 className={SECTION_TITLE}>
                              Voice Quality &amp; Network Resilience
                            </h3>
                          </div>

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {VOICE_QUALITY_PROFILES.map((profile, index) => {
                              const selected = voice.voiceAudio.voiceQuality === profile.id;
                              return (
                                <motion.button
                                  key={profile.id}
                                  type="button"
                                  {...staggerIn(index)}
                                  onClick={() =>
                                    void voice.updateVoiceAudio({ voiceQuality: profile.id })
                                  }
                                  className={`${OPTION} p-3.5 ${
                                    selected
                                      ? OPTION_ON
                                      : OPTION_OFF
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-xs font-bold text-zinc-100">
                                      {profile.title}
                                    </span>
                                    <span
                                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums ring-1 ring-inset transition-colors duration-200 ${
                                        selected
                                          ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                                          : "bg-white/[0.06] text-zinc-300 ring-white/[0.06]"
                                      }`}
                                    >
                                      {profile.bitrate}
                                    </span>
                                  </div>
                                  <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-400">
                                    {profile.desc}
                                  </p>
                                </motion.button>
                              );
                            })}
                          </div>

                          {/* 2x2 Voice Processing Toggles */}
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className={`${CARD} flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-200 hover:border-white/[0.11]`}>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-zinc-100">
                                  Echo Cancellation (AEC3)
                                </p>
                                <p className="text-[11px] text-zinc-500">
                                  Blocks speaker bleed from echoing back.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  void voice.setEchoCancellation(!voice.echoCancellation)
                                }
                                className={togglePillClass(voice.echoCancellation)}
                              >
                                <StateDot on={voice.echoCancellation} />
                                {voice.echoCancellation ? "On" : "Off"}
                              </button>
                            </div>

                            <div className={`${CARD} flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-200 hover:border-white/[0.11]`}>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-zinc-100">
                                  Auto Gain Control (AGC)
                                </p>
                                <p className="text-[11px] text-zinc-500">
                                  OS-level mic leveling (disable for manual gain).
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  void voice.setAutoGainControl(!voice.autoGainControl)
                                }
                                className={togglePillClass(voice.autoGainControl)}
                              >
                                <StateDot on={voice.autoGainControl} />
                                {voice.autoGainControl ? "On" : "Off"}
                              </button>
                            </div>

                            <div className={`${CARD} flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-200 hover:border-white/[0.11]`}>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <Zap className="h-3 w-3 text-emerald-400" />
                                  <p className="text-xs font-semibold text-zinc-100">
                                    Packet-Loss Recovery (RED)
                                  </p>
                                </div>
                                <p className="text-[11px] text-zinc-500">
                                  Prevents choppy audio on high-ping / lossy routes.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  void voice.updateVoiceAudio({
                                    packetLossRecovery: !voice.voiceAudio.packetLossRecovery,
                                  })
                                }
                                className={togglePillClass(voice.voiceAudio.packetLossRecovery)}
                              >
                                <StateDot on={voice.voiceAudio.packetLossRecovery} />
                                {voice.voiceAudio.packetLossRecovery ? "On" : "Off"}
                              </button>
                            </div>

                            <div className={`${CARD} flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-200 hover:border-white/[0.11]`}>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-zinc-100">
                                  Silence Saver (DTX)
                                </p>
                                <p className="text-[11px] text-zinc-500">
                                  Saves upload bandwidth when you aren&apos;t speaking.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  void voice.updateVoiceAudio({
                                    dtxEnabled: !voice.voiceAudio.dtxEnabled,
                                  })
                                }
                                className={togglePillClass(voice.voiceAudio.dtxEnabled)}
                              >
                                <StateDot on={voice.voiceAudio.dtxEnabled} />
                                {voice.voiceAudio.dtxEnabled ? "On" : "Off"}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Default Screen Share Info */}
                        <div className={`${CARD} flex items-center justify-between gap-3 px-4 py-3.5`}>
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/[0.12] text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
                              <Monitor className="h-4 w-4" />
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-zinc-100">
                                Default Stream Quality
                              </p>
                              <p className="text-[11px] font-medium tabular-nums text-zinc-400">
                                {voice.screenShareConfig.resolution} ·{" "}
                                {voice.screenShareConfig.fps}fps ·{" "}
                                {voice.screenShareConfig.codec.toUpperCase()} ·{" "}
                                {voice.screenShareConfig.bitrateMbps} Mbps
                              </p>
                            </div>
                          </div>
                          <span className="text-[11px] text-zinc-500">
                            Editable in Go Live menu
                          </span>
                        </div>
                      </>
                    )}

                    {/* NOTIFICATIONS & AUDIO TAB */}
                    {tab === "notifications" && (
                      <div className="space-y-4">
                        <div className={`${CARD} flex items-center justify-between gap-3 px-4 py-3.5`}>
                          <div>
                            <p className="text-xs font-semibold text-zinc-100">
                              Message Toast Popups
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              Show compact toast cards with progress bar in the bottom-right
                              corner. Hover to pause &amp; fan out.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                notify({
                                  kind: "info",
                                  title: "Toast 1 · Hover to Pause",
                                  message: "Move cursor over the stack to pause the progress bar.",
                                  source: "Test",
                                });
                                setTimeout(() => {
                                  notify({
                                    kind: "success",
                                    title: "Toast 2 · Stacked Deck",
                                    message: "Multiple notifications stack cleanly and fan out on hover.",
                                    source: "Test",
                                  });
                                }, 350);
                                setTimeout(() => {
                                  notify({
                                    kind: "warning",
                                    title: "Toast 3 · Auto-Dismiss",
                                    message: "Unhover to resume countdown smoothly until dismissed.",
                                    source: "Test",
                                  });
                                }, 700);
                              }}
                              className={`${GHOST_BUTTON} px-2.5 py-1.5 text-[11px] hover:!border-emerald-500/40 hover:!text-emerald-300`}
                            >
                              Test Stack
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdatePrefs({ toastsEnabled: !appPrefs.toastsEnabled })
                              }
                              className={togglePillClass(appPrefs.toastsEnabled)}
                            >
                              <StateDot on={appPrefs.toastsEnabled} />
                              {appPrefs.toastsEnabled ? "On" : "Off"}
                            </button>
                          </div>
                        </div>

                        <div className={`${CARD} flex items-center justify-between gap-3 p-4`}>
                          <div>
                            <p className="text-xs font-semibold text-zinc-100">
                              Toast Animation Style
                            </p>
                            <p className="mt-0.5 text-[11px] text-zinc-500">
                              Choose Sileo liquid SVG-morphing pills or stacked Obsidian cards.
                            </p>
                          </div>
                          <div className={`${SEGMENT_TRACK} shrink-0 items-center`}>
                            <button
                              type="button"
                              onClick={() => onUpdatePrefs({ toastStyle: "liquid" })}
                              className={`relative isolate rounded-[9px] px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200 ${
                                appPrefs.toastStyle === "liquid"
                                  ? "text-emerald-300"
                                  : "text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              {appPrefs.toastStyle === "liquid" && (
                                <motion.span
                                  layoutId="siq-settings-toast-style"
                                  className={SEGMENT_PILL}
                                  transition={SEGMENT_SPRING}
                                />
                              )}
                              Sileo Liquid
                            </button>
                            <button
                              type="button"
                              onClick={() => onUpdatePrefs({ toastStyle: "classic" })}
                              className={`relative isolate rounded-[9px] px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200 ${
                                appPrefs.toastStyle === "classic"
                                  ? "text-emerald-300"
                                  : "text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              {appPrefs.toastStyle === "classic" && (
                                <motion.span
                                  layoutId="siq-settings-toast-style"
                                  className={SEGMENT_PILL}
                                  transition={SEGMENT_SPRING}
                                />
                              )}
                              Obsidian Stack
                            </button>
                          </div>
                        </div>

                        <div className={`${CARD} space-y-4 p-4`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors duration-300 ${
                                  soundEnabled ? "bg-emerald-500/[0.14]" : "bg-white/[0.05]"
                                }`}
                              >
                                {soundEnabled ? (
                                  <Volume2 className="h-4 w-4 text-emerald-400" />
                                ) : (
                                  <VolumeX className="h-4 w-4 text-zinc-500" />
                                )}
                              </span>
                              <div>
                                <p className="text-xs font-semibold text-zinc-100">
                                  Interface Sound Effects
                                </p>
                                <p className="text-[11px] text-zinc-500">
                                  Soft tones for voice join/leave, mute, live stream, and
                                  messages.
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const next = !soundEnabled;
                                setSoundEnabled(next);
                                setSoundPrefs({ enabled: next });
                                if (next) playSound("unmute");
                              }}
                              className={togglePillClass(soundEnabled)}
                            >
                              <StateDot on={soundEnabled} />
                              {soundEnabled ? "On" : "Off"}
                            </button>
                          </div>

                          <AnimatePresence initial={false}>
                          {soundEnabled && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                              className="space-y-4 overflow-hidden"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-zinc-400">Volume</span>
                                <input
                                  type="range"
                                  min={0.05}
                                  max={1}
                                  step={0.05}
                                  value={soundVolume}
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    setSoundVolume(v);
                                    setSoundPrefs({ volume: v });
                                  }}
                                  className="h-1.5 flex-1 cursor-pointer accent-emerald-400"
                                />
                                <span className="w-11 rounded-full bg-emerald-500/10 py-0.5 text-center font-mono text-[11px] font-semibold tabular-nums text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
                                  {Math.round(soundVolume * 100)}%
                                </span>
                              </div>

                              <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
                                {(
                                  [
                                    ["join", "Join Voice"],
                                    ["mute", "Mute"],
                                    ["stream-start", "Go Live"],
                                    ["notification", "Message"],
                                  ] as const
                                ).map(([key, label]) => (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => playSound(key)}
                                    className={`${GHOST_BUTTON} rounded-full px-3 py-1 text-[11px] hover:!border-emerald-500/40 hover:!text-emerald-300`}
                                  >
                                    Test {label}
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                          </AnimatePresence>
                        </div>
                      </div>
                    )}

                    {/* PRIVACY & DATA TAB */}
                    {tab === "privacy" && (
                      <div className="space-y-4">
                        <div className="siq-edge-light relative rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.1] via-emerald-500/[0.03] to-transparent p-4 shadow-[0_18px_40px_-28px_rgb(var(--siq-accent-rgb)/0.9)]">
                          <div className="flex items-center gap-2.5 text-xs font-bold text-emerald-300">
                            <span className={SECTION_ICON}>
                              <ShieldCheck className="h-3.5 w-3.5" />
                            </span>
                            <span>Private Instance Protection</span>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">
                            Your email address is stored strictly server-side and is never
                            exposed to other members in chat, presence, or profile popovers.
                          </p>
                        </div>

                        <div className={`${CARD} p-4 text-xs leading-relaxed text-zinc-400`}>
                          <p className="font-semibold text-zinc-200">
                            Media Transport Encryption
                          </p>
                          <p className="mt-1">
                            Voice, webcam, and screen share streams use WebRTC DTLS-SRTP
                            encryption between your browser and LiveKit. Nothing is recorded
                            by this server.
                          </p>
                        </div>

                        <div className={`${CARD} flex items-center justify-between gap-3 p-4`}>
                          <div>
                            <p className="text-xs font-semibold text-zinc-100">
                              Reset Local Preferences
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              Clears saved per-user volumes, sound settings, and UI
                              preferences on this browser.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              clearLocalWorkspaceData();
                              onResetPrefs();
                              notify({
                                kind: "info",
                                title: "Preferences Reset",
                                message: "Local preferences and user volumes were restored to defaults.",
                                source: "Settings",
                              });
                            }}
                            className={`${GHOST_BUTTON} group shrink-0 px-3 py-1.5 text-xs hover:!border-rose-500/40 hover:!bg-rose-500/10 hover:!text-rose-300`}
                          >
                            <RotateCcw className="h-3.5 w-3.5 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-rotate-180" />
                            <span>Reset</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* APPEARANCE TAB */}
                    {tab === "appearance" && (
                      <div className="space-y-5">
                        {desktopSettings}
                        {/* 8-Color Theme Studio */}
                        <div className={`${CARD} space-y-4 p-4 sm:p-5`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-start gap-3">
                              <span className={`${SECTION_ICON} mt-0.5`}>
                                <Palette className="h-3.5 w-3.5" />
                              </span>
                              <div>
                                <p className="text-[13px] font-bold tracking-tight text-zinc-50">
                                  Accent Theme
                                </p>
                                <p className="mt-0.5 text-[11px] text-zinc-500">
                                  8 calibrated studio palettes — updates the entire workspace live.
                                </p>
                              </div>
                            </div>
                            <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 shadow-[0_0_18px_-8px_rgb(var(--siq-accent-rgb)/0.9)]">
                              {appPrefs.customAccentHex
                                ? "Custom accent"
                                : themePreset?.name}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                            {APP_THEME_PRESETS.map((themeItem, index) => {
                              const active = !appPrefs.customAccentHex && appPrefs.theme === themeItem.id;
                              return (
                                <motion.div key={themeItem.id} {...staggerIn(index)} className="h-full">
                                <motion.button
                                  type="button"
                                  whileHover={{ y: -2 }}
                                  whileTap={{ scale: 0.97 }}
                                  onClick={() => onUpdatePrefs({ theme: themeItem.id, customAccentHex: null })}
                                  className={`group relative flex h-full w-full flex-col justify-between rounded-2xl border p-3 text-left transition-[border-color,background-color,box-shadow] duration-200 ${
                                    active
                                      ? OPTION_ON
                                      : OPTION_OFF
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1">
                                      <span
                                        className="h-4 w-4 rounded-full ring-2 ring-black/40 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110"
                                        style={{ backgroundColor: themeItem.primary }}
                                      />
                                      <span
                                        className="-ml-1.5 h-3.5 w-3.5 rounded-full ring-2 ring-black/50"
                                        style={{ backgroundColor: themeItem.light }}
                                      />
                                      <span
                                        className="-ml-1.5 h-3 w-3 rounded-full ring-2 ring-black/50"
                                        style={{ backgroundColor: themeItem.deep }}
                                      />
                                    </div>

                                    <AnimatePresence initial={false}>
                                      {active && (
                                        <motion.span
                                          initial={{ opacity: 0, scale: 0.3 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          exit={{ opacity: 0, scale: 0.3 }}
                                          transition={{ type: "spring", stiffness: 600, damping: 26 }}
                                          className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 shadow-[0_0_12px_-2px_rgb(var(--siq-accent-rgb)/0.9)]"
                                        >
                                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                                        </motion.span>
                                      )}
                                    </AnimatePresence>
                                  </div>

                                  <div className="mt-2.5">
                                    <p className="truncate text-[11px] font-bold text-zinc-100">
                                      {themeItem.name}
                                    </p>
                                    <p className="truncate text-[10px] text-zinc-500">
                                      {themeItem.vibe}
                                    </p>
                                  </div>
                                  <span
                                    aria-hidden="true"
                                    className="mt-2.5 block h-1 w-full rounded-full opacity-70 transition-opacity duration-200 group-hover:opacity-100"
                                    style={{
                                      background: `linear-gradient(90deg, ${themeItem.deep}, ${themeItem.primary}, ${themeItem.light})`,
                                    }}
                                  />
                                </motion.button>
                                </motion.div>
                              );
                            })}
                          </div>
                          <div className="space-y-2.5 border-t border-white/[0.06] pt-4">
                            <ColorPicker
                              label="Custom app accent"
                              value={appPrefs.customAccentHex ?? themePreset?.primary ?? "#9D7BFA"}
                              onChange={(customAccentHex) => onUpdatePrefs({ customAccentHex })}
                              presets={AVATAR_PALETTE}
                            />
                            {appPrefs.customAccentHex && (
                              <button
                                type="button"
                                onClick={() => onUpdatePrefs({ customAccentHex: null })}
                                className={`${GHOST_BUTTON} group px-3 py-1.5 text-xs`}
                              >
                                <RotateCcw className="h-3.5 w-3.5 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-rotate-180" />
                                Reset to preset
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 4 Local Self-Hosted Typography Presets */}
                        <div className={`${CARD} space-y-4 p-4 sm:p-5`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-start gap-3">
                              <span className={`${SECTION_ICON} mt-0.5`}>
                                <Type className="h-3.5 w-3.5" />
                              </span>
                              <div>
                                <p className="text-[13px] font-bold tracking-tight text-zinc-50">
                                  Typography
                                </p>
                                <p className="mt-0.5 text-[11px] text-zinc-500">
                                  4 bilingual English + فارسی font pairings bundled locally inside the app.
                                </p>
                              </div>
                            </div>
                            <span className="shrink-0 rounded-full border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] font-medium text-zinc-400">
                              LOCAL WOFF2
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {APP_FONT_PRESETS.map((preset, index) => {
                              const active = appPrefs.fontPreset === preset.id;
                              return (
                                <motion.div key={preset.id} {...staggerIn(index)} className="h-full">
                                <motion.button
                                  type="button"
                                  whileHover={{ y: -2 }}
                                  whileTap={{ scale: 0.985 }}
                                  onClick={() => onUpdatePrefs({ fontPreset: preset.id })}
                                  style={{ fontFamily: preset.cssFamily }}
                                  className={`relative flex h-full w-full flex-col justify-between rounded-2xl border p-3.5 text-left transition-[border-color,background-color,box-shadow] duration-200 ${
                                    active
                                      ? OPTION_ON
                                      : OPTION_OFF
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-xs font-bold text-zinc-100">
                                        {preset.name}
                                      </p>
                                      <p className="mt-0.5 text-[10px] text-zinc-500">
                                        {preset.subtitle}
                                      </p>
                                    </div>
                                    <AnimatePresence initial={false}>
                                      {active && (
                                        <motion.span
                                          initial={{ opacity: 0, scale: 0.3 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          exit={{ opacity: 0, scale: 0.3 }}
                                          transition={{ type: "spring", stiffness: 600, damping: 26 }}
                                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 shadow-[0_0_12px_-2px_rgb(var(--siq-accent-rgb)/0.9)]"
                                        >
                                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                                        </motion.span>
                                      )}
                                    </AnimatePresence>
                                  </div>

                                  <div className="mt-3 space-y-1 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2.5 shadow-[inset_0_1px_2px_rgb(0_0_0/0.3)]">
                                    <p className="truncate text-xs font-medium text-zinc-200">
                                      {preset.sampleEn}
                                    </p>
                                    <p
                                      dir="rtl"
                                      className="truncate text-xs font-medium text-zinc-400"
                                    >
                                      {preset.sampleFa}
                                    </p>
                                  </div>
                                </motion.button>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Layout Density & Text Scale */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className={`${CARD} space-y-2.5 p-4`}>
                            <p className="text-xs font-bold text-zinc-200">
                              Message Density
                            </p>
                            <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]">
                              {(["comfortable", "compact"] as MessageDensity[]).map((d) => (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => onUpdatePrefs({ messageDensity: d })}
                                  className={`relative isolate rounded-[9px] px-3 py-2 text-xs font-semibold capitalize transition-colors duration-200 ${
                                    appPrefs.messageDensity === d
                                      ? "text-emerald-300"
                                      : "text-zinc-400 hover:text-zinc-200"
                                  }`}
                                >
                                  {appPrefs.messageDensity === d && (
                                    <motion.span
                                      layoutId="siq-settings-density"
                                      className={SEGMENT_PILL}
                                      transition={SEGMENT_SPRING}
                                    />
                                  )}
                                  {d}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className={`${CARD} space-y-2.5 p-4`}>
                            <p className="text-xs font-bold text-zinc-200">
                              Chat Text Size
                            </p>
                            <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]">
                              {(
                                [
                                  ["sm", "Small"],
                                  ["md", "Default"],
                                  ["lg", "Large"],
                                ] as Array<[TextScale, string]>
                              ).map(([scale, label]) => (
                                <button
                                  key={scale}
                                  type="button"
                                  onClick={() => onUpdatePrefs({ textScale: scale })}
                                  className={`relative isolate rounded-[9px] px-2.5 py-2 text-xs font-semibold transition-colors duration-200 ${
                                    appPrefs.textScale === scale
                                      ? "text-emerald-300"
                                      : "text-zinc-400 hover:text-zinc-200"
                                  }`}
                                >
                                  {appPrefs.textScale === scale && (
                                    <motion.span
                                      layoutId="siq-settings-text-scale"
                                      className={SEGMENT_PILL}
                                      transition={SEGMENT_SPRING}
                                    />
                                  )}
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className={`${CARD} flex items-center justify-between gap-3 px-4 py-3.5`}>
                          <div>
                            <p className="text-xs font-semibold text-zinc-100">
                              Show Members Sidebar
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              Display the right-hand online/offline member rail on desktop.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdatePrefs({
                                showMembersSidebar: !appPrefs.showMembersSidebar,
                              })
                            }
                            className={togglePillClass(appPrefs.showMembersSidebar)}
                          >
                            <StateDot on={appPrefs.showMembersSidebar} />
                            {appPrefs.showMembersSidebar ? "Visible" : "Hidden"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Mobile Log Out button */}
                    <div className="border-t border-white/[0.06] pt-4 md:hidden">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onSignOut();
                        }}
                        className="siq-press flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 py-3 text-xs font-bold text-rose-300 hover:bg-rose-500/15"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Log Out</span>
                      </button>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>

          {/* Interactive Avatar / Banner Cropper */}
          <ImageCropModal
            file={cropRequest?.file ?? null}
            mode={cropRequest?.mode ?? "avatar"}
            onCancel={() => setCropRequest(null)}
            onCropped={(file) => {
              if (cropRequest) {
                void handleCroppedImage(cropRequest.mode, file);
              }
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
