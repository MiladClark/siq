"use client";

import {
  Bell,
  Camera,
  Check,
  Headphones,
  ImagePlus,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Mic,
  Monitor,
  Palette,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCircle,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { type CropMode, ImageCropModal } from "@/components/ui/ImageCropModal";
import { useSystemNotify } from "@/components/ui/NotificationCenter";
import { useVoice } from "@/components/voice/VoiceProvider";
import type { NoiseCancellationMode } from "@/lib/noise-processor";
import {
  type AppPreferences,
  clearLocalWorkspaceData,
  type MessageDensity,
  type TextScale,
} from "@/lib/preferences";
import { getSoundPrefs, playSound, setSoundPrefs } from "@/lib/sounds";
import { AVATAR_PALETTE, type PrivateUser } from "@/lib/types";

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
    id: "krisp",
    title: "Krisp AI",
    badge: "Best · Cloud",
    desc: "Discord-grade neural voice isolation via LiveKit Cloud. Auto-falls back to RNNoise on local servers.",
  },
  {
    id: "gtcrn",
    title: "GTCRN AI",
    badge: "Open-Source",
    desc: "Modern neural WASM model. Strong mechanical keyboard & ambient suppression everywhere, 100% free.",
  },
  {
    id: "rnnoise",
    title: "RNNoise AI",
    badge: "Ultra-Light",
    desc: "Featherweight WASM filter (~1% CPU). Great for fan hum and low-power laptops.",
  },
  {
    id: "standard",
    title: "Standard",
    badge: "Browser",
    desc: "Built-in WebRTC noise suppression.",
  },
  {
    id: "off",
    title: "Off",
    badge: "Raw",
    desc: "Unprocessed microphone audio (for studio mics or music).",
  },
];

export function SettingsModal({
  open,
  initialTab = "account",
  user,
  blobReady,
  appPrefs,
  onUpdatePrefs,
  onResetPrefs,
  onClose,
  onUserUpdated,
  onSignOut,
}: SettingsModalProps) {
  const voice = useVoice();
  const notify = useSystemNotify();

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

  // Mic test state
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const micTestCleanupRef = useRef<(() => void) | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      micTestCleanupRef.current?.();
      micTestCleanupRef.current = null;
      setMicTesting(false);
      setMicLevel(0);
      setCropRequest(null);
      return;
    }
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

  async function toggleMicTest() {
    if (micTesting) {
      micTestCleanupRef.current?.();
      micTestCleanupRef.current = null;
      setMicTesting(false);
      setMicLevel(0);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: voice.selectedAudioInput || undefined,
          echoCancellation: voice.echoCancellation,
          autoGainControl: voice.autoGainControl,
          noiseSuppression: voice.noiseMode !== "off",
        },
      });
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      let rafId = 0;

      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const norm = (data[i] - 128) / 128;
          sum += norm * norm;
        }
        const rms = Math.sqrt(sum / data.length);
        setMicLevel(Math.min(100, Math.round(rms * 380)));
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);

      micTestCleanupRef.current = () => {
        cancelAnimationFrame(rafId);
        src.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => {});
      };
      setMicTesting(true);
    } catch {
      setMicTesting(false);
      notify({
        kind: "error",
        title: "Microphone Error",
        message: "Could not access microphone for test.",
        source: "Settings",
      });
    }
  }

  function handlePickImage(file: File, mode: CropMode) {
    if (!file.type.startsWith("image/")) {
      setAccountMsg({ type: "err", text: "Please select an image file." });
      return;
    }
    setAccountMsg(null);
    setCropRequest({ file, mode });
  }

  /** Instantly apply cropped WebP preview (0ms), then upload & persist cleanly */
  async function handleCroppedImage(
    mode: CropMode,
    result: { file: File; previewUrl: string }
  ) {
    setCropRequest(null);
    setUploadingMedia(mode);
    setAccountMsg(null);

    // 1. Instant optimistic UI update across the entire workspace
    if (mode === "avatar") {
      setAvatarUrl(result.previewUrl);
      onUserUpdated({ ...user, avatarUrl: result.previewUrl, displayName, avatarColor, bannerUrl });
    } else {
      setBannerUrl(result.previewUrl);
      onUserUpdated({ ...user, bannerUrl: result.previewUrl, displayName, avatarColor, avatarUrl });
    }

    try {
      const formData = new FormData();
      formData.append("file", result.file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.attachment?.url) {
        setAccountMsg({ type: "err", text: uploadData.error ?? "Upload failed." });
        return;
      }

      const persistedUrl: string = uploadData.attachment.url;
      const patchBody =
        mode === "avatar" ? { avatarUrl: persistedUrl } : { bannerUrl: persistedUrl };

      const saveRes = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      const saveData = await saveRes.json();
      if (saveRes.ok && saveData.user) {
        if (mode === "avatar") setAvatarUrl(saveData.user.avatarUrl);
        else setBannerUrl(saveData.user.bannerUrl);
        onUserUpdated(saveData.user);
        setAccountMsg({
          type: "ok",
          text: mode === "avatar" ? "Profile photo updated (WebP)." : "Banner updated (WebP).",
        });
      }
    } catch {
      setAccountMsg({ type: "err", text: "Network error uploading image." });
    } finally {
      setUploadingMedia(null);
    }
  }

  async function handleRemoveMedia(mode: CropMode) {
    const patchBody = mode === "avatar" ? { avatarUrl: null } : { bannerUrl: null };
    if (mode === "avatar") {
      setAvatarUrl(null);
      onUserUpdated({ ...user, avatarUrl: null, displayName, avatarColor, bannerUrl });
    } else {
      setBannerUrl(null);
      onUserUpdated({ ...user, bannerUrl: null, displayName, avatarColor, avatarUrl });
    }

    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        onUserUpdated(data.user);
      }
    } catch {
      // ignore
    }
  }

  async function handleSaveAccount(e: FormEvent) {
    e.preventDefault();
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

      const res = await fetch("/api/auth/me", {
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
      const res = await fetch("/api/auth/password", {
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
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 backdrop-blur-xs sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Application settings"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-[min(84dvh,700px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/[0.11] bg-[#121316] shadow-2xl shadow-black/80 md:flex-row"
          >
            {/* Left Settings Sidebar */}
            <aside className="flex shrink-0 flex-col justify-between border-b border-white/[0.07] bg-[#0E0F12] p-3 md:w-[228px] md:border-b-0 md:border-r md:p-4">
              <div className="space-y-5 overflow-x-auto md:overflow-visible">
                <div className="flex items-center justify-between px-2 md:hidden">
                  <span className="text-xs font-semibold text-zinc-200">Settings</span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg p-1 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {navGroups.map((group) => (
                  <div key={group.title} className="space-y-1">
                    <p className="hidden px-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 md:block">
                      {group.title}
                    </p>
                    <div className="flex gap-1 md:flex-col">
                      {group.items.map((item) => {
                        const active = tab === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setTab(item.id)}
                            className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                              active
                                ? "bg-white/[0.09] text-zinc-100"
                                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                            }`}
                          >
                            <span className={active ? "text-emerald-400" : "text-zinc-500"}>
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

              {/* Bottom Pinned Log Out */}
              <div className="mt-3 hidden border-t border-white/[0.07] pt-3 md:block">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSignOut();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log Out</span>
                </button>
              </div>
            </aside>

            {/* Right Content Pane */}
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Top Content Header */}
              <div className="hidden h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-6 md:flex">
                <h2 className="text-sm font-semibold text-zinc-100">
                  {tab === "account"
                    ? "My Account"
                    : tab === "voice"
                      ? "Voice & Video"
                      : tab === "notifications"
                        ? "Notifications & Audio"
                        : tab === "privacy"
                          ? "Data & Privacy"
                          : "Appearance"}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close settings"
                  className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#18191E] px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:border-white/[0.18] hover:text-white"
                >
                  <span className="text-[10px] font-semibold tracking-wide">ESC</span>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Scrollable Tab Body */}
              <div className="flex-1 overflow-y-auto p-5 md:p-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.14 }}
                    className="mx-auto max-w-xl space-y-6"
                  >
                    {/* ACCOUNT TAB */}
                    {tab === "account" && (
                      <>
                        <form onSubmit={handleSaveAccount} className="space-y-5">
                          {/* Profile Card Preview with Banner + Avatar Croppers */}
                          <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0E0F12]">
                            <div
                              className="group/banner relative h-28 w-full overflow-hidden"
                              style={
                                !bannerUrl
                                  ? {
                                      background: `linear-gradient(135deg, ${avatarColor}45 0%, #0E0F12 100%)`,
                                    }
                                  : undefined
                              }
                            >
                              {bannerUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={bannerUrl}
                                  alt="Profile banner"
                                  className="h-full w-full object-cover"
                                />
                              )}

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
                                  disabled={uploadingMedia !== null || !blobReady}
                                  onClick={() => bannerInputRef.current?.click()}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.15] bg-black/65 px-2.5 py-1.5 text-[11px] font-medium text-zinc-100 backdrop-blur-sm transition-colors hover:border-emerald-500/50 hover:bg-black/85 hover:text-emerald-300 disabled:opacity-40"
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
                                    onClick={() => void handleRemoveMedia("banner")}
                                    title="Remove banner"
                                    className="rounded-lg border border-white/[0.15] bg-black/65 p-1.5 text-zinc-300 backdrop-blur-sm hover:border-rose-500/50 hover:text-rose-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-end justify-between gap-4 px-4 pb-4">
                              <div className="-mt-8 flex items-end gap-3.5">
                                <div className="relative inline-flex rounded-full ring-4 ring-[#0E0F12]">
                                  <Avatar
                                    name={displayName || user.username}
                                    color={avatarColor}
                                    avatarUrl={avatarUrl}
                                    size="xl"
                                    online
                                    ringClassName="ring-[#0E0F12]"
                                  />
                                </div>
                                <div className="pb-1">
                                  <div className="flex items-center gap-2">
                                    <p
                                      dir="auto"
                                      className="text-sm font-semibold text-zinc-100"
                                    >
                                      {displayName || user.username}
                                    </p>
                                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold capitalize text-emerald-300">
                                      {user.role}
                                    </span>
                                  </div>
                                  <p className="text-xs font-medium text-zinc-500">
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
                                  disabled={uploadingMedia !== null || !blobReady}
                                  onClick={() => avatarInputRef.current?.click()}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-40"
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
                                    onClick={() => void handleRemoveMedia("avatar")}
                                    title="Remove photo"
                                    className="rounded-lg border border-white/[0.1] bg-[#18191E] p-1.5 text-zinc-400 hover:border-rose-500/40 hover:text-rose-400"
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
                                className="block text-xs font-medium text-zinc-300"
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
                                className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label
                                htmlFor="settings-email"
                                className="flex items-center justify-between text-xs font-medium text-zinc-300"
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
                                  className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label
                              htmlFor="settings-activity"
                              className="block text-xs font-medium text-zinc-300"
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
                              className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label
                              htmlFor="settings-bio"
                              className="flex items-center justify-between text-xs font-medium text-zinc-300"
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
                              className="w-full resize-none rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                            />
                          </div>

                          <div className="space-y-2">
                            <span className="block text-xs font-medium text-zinc-300">
                              Avatar accent color
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {AVATAR_PALETTE.map((hex) => {
                                const selected =
                                  avatarColor.toLowerCase() === hex.toLowerCase();
                                return (
                                  <button
                                    key={hex}
                                    type="button"
                                    onClick={() => setAvatarColor(hex)}
                                    className={`flex h-7 w-7 items-center justify-center rounded-full transition-transform active:scale-95 ${
                                      selected
                                        ? "ring-2 ring-white ring-offset-2 ring-offset-[#121316]"
                                        : ""
                                    }`}
                                    style={{ backgroundColor: hex }}
                                  >
                                    {selected && <Check className="h-3.5 w-3.5 text-zinc-950" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="submit"
                              disabled={savingAccount || uploadingMedia !== null}
                              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
                            >
                              {savingAccount ? "Saving..." : "Save Profile"}
                            </button>
                          </div>
                        </form>

                        {/* Change Password */}
                        <form
                          onSubmit={handleChangePassword}
                          className="space-y-4 border-t border-white/[0.07] pt-6"
                        >
                          <div className="flex items-center gap-2">
                            <KeyRound className="h-4 w-4 text-zinc-400" />
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                              Password &amp; Security
                            </h3>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <label
                                htmlFor="curr-pass"
                                className="block text-xs text-zinc-400"
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
                                className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label
                                htmlFor="new-pass"
                                className="block text-xs text-zinc-400"
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
                                className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="submit"
                              disabled={changingPassword}
                              className="rounded-lg border border-white/[0.12] bg-[#18191E] px-4 py-2 text-xs font-medium text-zinc-100 transition-colors hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-50"
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
                        {/* Devices */}
                        <div className="space-y-3">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                            Audio &amp; Camera Devices
                          </h3>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <label htmlFor="s-mic" className="block text-xs text-zinc-300">
                                Input Device (Mic)
                              </label>
                              <select
                                id="s-mic"
                                value={voice.selectedAudioInput}
                                onChange={(e) => void voice.setAudioInput(e.target.value)}
                                className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-2 text-xs text-zinc-100"
                              >
                                <option value="">System Default</option>
                                {voice.devices.audioInputs.map((d) => (
                                  <option key={d.deviceId} value={d.deviceId}>
                                    {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1.5">
                              <label htmlFor="s-out" className="block text-xs text-zinc-300">
                                Output Device (Headset)
                              </label>
                              <select
                                id="s-out"
                                value={voice.selectedAudioOutput}
                                onChange={(e) => voice.setAudioOutput(e.target.value)}
                                className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-2 text-xs text-zinc-100"
                              >
                                <option value="">System Default</option>
                                {voice.devices.audioOutputs.map((d) => (
                                  <option key={d.deviceId} value={d.deviceId}>
                                    {d.label || `Speaker ${d.deviceId.slice(0, 6)}`}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label htmlFor="s-cam" className="block text-xs text-zinc-300">
                              Camera
                            </label>
                            <select
                              id="s-cam"
                              value={voice.selectedVideoInput}
                              onChange={(e) => void voice.setVideoInput(e.target.value)}
                              className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-2 text-xs text-zinc-100"
                            >
                              <option value="">System Default</option>
                              {voice.devices.videoInputs.map((d) => (
                                <option key={d.deviceId} value={d.deviceId}>
                                  {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Live Mic Test */}
                          <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0E0F12] p-3">
                            <button
                              type="button"
                              onClick={() => void toggleMicTest()}
                              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                                micTesting
                                  ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                                  : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                              }`}
                            >
                              <Mic className="h-3.5 w-3.5" />
                              <span>{micTesting ? "Stop Test" : "Mic Test"}</span>
                            </button>
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                              <div
                                className="h-full rounded-full bg-emerald-400 transition-all duration-75"
                                style={{ width: `${micLevel}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* AI Noise Cancellation Selector */}
                        <div className="space-y-3 border-t border-white/[0.07] pt-5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Sparkles className="h-4 w-4 text-emerald-400" />
                              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                                AI Noise Cancellation
                              </h3>
                            </div>
                            <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-300">
                              Active: {voice.activeNoiseEngine.toUpperCase()}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2">
                            {NOISE_MODES.map((m) => {
                              const selected = voice.noiseMode === m.id;
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => void voice.setNoiseMode(m.id)}
                                  className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                                    selected
                                      ? "border-emerald-500/50 bg-emerald-500/10"
                                      : "border-white/[0.07] bg-[#0E0F12] hover:border-white/[0.14]"
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold text-zinc-100">
                                        {m.title}
                                      </span>
                                      <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                                        {m.badge}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                                      {m.desc}
                                    </p>
                                  </div>
                                  <span
                                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                      selected
                                        ? "border-emerald-400 bg-emerald-400 text-zinc-950"
                                        : "border-zinc-600"
                                    }`}
                                  >
                                    {selected && <Check className="h-3 w-3" />}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Voice Processing Toggles (AEC + AGC) */}
                        <div className="space-y-2.5 border-t border-white/[0.07] pt-5">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                            Voice Processing
                          </h3>

                          <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-[#0E0F12] px-4 py-3">
                            <div>
                              <p className="text-xs font-medium text-zinc-100">
                                Echo Cancellation (AEC3)
                              </p>
                              <p className="text-[11px] text-zinc-500">
                                Prevents speaker or headset bleed from echoing back to friends.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                void voice.setEchoCancellation(!voice.echoCancellation)
                              }
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                voice.echoCancellation
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-white/[0.06] text-zinc-400"
                              }`}
                            >
                              {voice.echoCancellation ? "On" : "Off"}
                            </button>
                          </div>

                          <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-[#0E0F12] px-4 py-3">
                            <div>
                              <p className="text-xs font-medium text-zinc-100">
                                Automatic Gain Control (AGC)
                              </p>
                              <p className="text-[11px] text-zinc-500">
                                Keeps your microphone loudness consistent automatically.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                void voice.setAutoGainControl(!voice.autoGainControl)
                              }
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                voice.autoGainControl
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-white/[0.06] text-zinc-400"
                              }`}
                            >
                              {voice.autoGainControl ? "On" : "Off"}
                            </button>
                          </div>
                        </div>

                        {/* Default Screen Share Info */}
                        <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-[#0E0F12] px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Monitor className="h-4 w-4 text-emerald-400" />
                            <div>
                              <p className="text-xs font-medium text-zinc-100">
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
                        <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-[#0E0F12] px-4 py-3.5">
                          <div>
                            <p className="text-xs font-medium text-zinc-100">
                              Message Toast Popups
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              Show compact toast cards with progress bar in the bottom-right
                              corner.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdatePrefs({ toastsEnabled: !appPrefs.toastsEnabled })
                            }
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                              appPrefs.toastsEnabled
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-white/[0.06] text-zinc-400"
                            }`}
                          >
                            {appPrefs.toastsEnabled ? "On" : "Off"}
                          </button>
                        </div>

                        <div className="space-y-4 rounded-xl border border-white/[0.07] bg-[#0E0F12] p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {soundEnabled ? (
                                <Volume2 className="h-4 w-4 text-emerald-400" />
                              ) : (
                                <VolumeX className="h-4 w-4 text-zinc-500" />
                              )}
                              <div>
                                <p className="text-xs font-medium text-zinc-100">
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
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                soundEnabled
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-white/[0.06] text-zinc-400"
                              }`}
                            >
                              {soundEnabled ? "On" : "Off"}
                            </button>
                          </div>

                          {soundEnabled && (
                            <>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-zinc-400">Volume</span>
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
                                  className="h-1.5 flex-1 cursor-pointer accent-emerald-500"
                                />
                                <span className="w-9 text-right text-xs font-semibold tabular-nums text-zinc-400">
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
                                    className="rounded-lg border border-white/[0.09] bg-[#18191E] px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
                                  >
                                    Test {label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* PRIVACY & DATA TAB */}
                    {tab === "privacy" && (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                            <ShieldCheck className="h-4 w-4" />
                            <span>Private Instance Protection</span>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">
                            Your email address is stored strictly server-side and is never
                            exposed to other members in chat, presence, or profile popovers.
                          </p>
                        </div>

                        <div className="rounded-xl border border-white/[0.07] bg-[#0E0F12] p-4 text-xs leading-relaxed text-zinc-400">
                          <p className="font-semibold text-zinc-200">
                            Media Transport Encryption
                          </p>
                          <p className="mt-1">
                            Voice, webcam, and screen share streams use WebRTC DTLS-SRTP
                            encryption between your browser and LiveKit. Nothing is recorded
                            by this server.
                          </p>
                        </div>

                        <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-[#0E0F12] p-4">
                          <div>
                            <p className="text-xs font-medium text-zinc-100">
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
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-rose-500/40 hover:text-rose-300"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Reset</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* APPEARANCE TAB */}
                    {tab === "appearance" && (
                      <div className="space-y-4">
                        <div className="space-y-2 rounded-xl border border-white/[0.07] bg-[#0E0F12] p-4">
                          <p className="text-xs font-medium text-zinc-200">Message Density</p>
                          <div className="grid grid-cols-2 gap-2">
                            {(["comfortable", "compact"] as MessageDensity[]).map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => onUpdatePrefs({ messageDensity: d })}
                                className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors ${
                                  appPrefs.messageDensity === d
                                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                                    : "border-white/[0.08] bg-[#18191E] text-zinc-400 hover:text-zinc-200"
                                }`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2 rounded-xl border border-white/[0.07] bg-[#0E0F12] p-4">
                          <p className="text-xs font-medium text-zinc-200">Chat Text Size</p>
                          <div className="grid grid-cols-3 gap-2">
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
                                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                                  appPrefs.textScale === scale
                                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                                    : "border-white/[0.08] bg-[#18191E] text-zinc-400 hover:text-zinc-200"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-[#0E0F12] px-4 py-3.5">
                          <div>
                            <p className="text-xs font-medium text-zinc-100">
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
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                              appPrefs.showMembersSidebar
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-white/[0.06] text-zinc-400"
                            }`}
                          >
                            {appPrefs.showMembersSidebar ? "Visible" : "Hidden"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Mobile Log Out button */}
                    <div className="border-t border-white/[0.07] pt-4 md:hidden">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onSignOut();
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 py-2.5 text-xs font-semibold text-rose-300"
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
            onCropped={(res) => {
              if (cropRequest) {
                void handleCroppedImage(cropRequest.mode, res);
              }
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
