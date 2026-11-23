"use client";

import {
  Camera,
  Check,
  Lock,
  Mail,
  Trash2,
  UserCircle,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { getSoundPrefs, playSound, setSoundPrefs } from "@/lib/sounds";
import { AVATAR_PALETTE, type PrivateUser } from "@/lib/types";

interface ProfileModalProps {
  open: boolean;
  user: PrivateUser;
  blobReady: boolean;
  onClose: () => void;
  onUpdated: (user: PrivateUser) => void;
}

export function ProfileModal({
  open,
  user,
  blobReady,
  onClose,
  onUpdated,
}: ProfileModalProps) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email ?? "");
  const [avatarColor, setAvatarColor] = useState(user.avatarColor);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.45);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(user.displayName);
    setEmail(user.email ?? "");
    setAvatarColor(user.avatarColor);
    setAvatarUrl(user.avatarUrl);
    setError(null);
    const prefs = getSoundPrefs();
    setSoundEnabled(prefs.enabled);
    setSoundVolume(prefs.volume);
  }, [open, user]);

  async function handleAvatarUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (PNG, JPG, WebP).");
      return;
    }
    setUploadingAvatar(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to upload avatar.");
      } else if (data.attachment?.url) {
        setAvatarUrl(data.attachment.url);
      }
    } catch {
      setError("Network error while uploading avatar.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        displayName,
        avatarColor,
        avatarUrl,
      };
      if (email.trim()) {
        body.email = email.trim();
      }

      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update profile.");
        setSaving(false);
        return;
      }
      onUpdated(data.user);
      onClose();
    } catch {
      setError("Network error while updating profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-white/[0.1] bg-[#121316] shadow-2xl shadow-black/70"
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <UserCircle className="h-4 w-4 text-emerald-400" />
                <h2 id="profile-modal-title" className="text-sm font-semibold text-zinc-100">
                  Profile &amp; Audio
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close profile settings"
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              {/* Avatar Preview + Upload */}
              <div className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.07] bg-[#0E0F12] p-3.5">
                <div className="flex min-w-0 items-center gap-3.5">
                  <Avatar
                    name={displayName || user.username}
                    color={avatarColor}
                    avatarUrl={avatarUrl}
                    size="lg"
                    online
                  />
                  <div className="min-w-0">
                    <p dir="auto" className="truncate text-sm font-semibold text-zinc-100">
                      {displayName || user.username}
                    </p>
                    <p className="font-mono text-xs text-zinc-500">@{user.username}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleAvatarUpload(f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploadingAvatar || !blobReady}
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload profile photo"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#18191E] px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-40"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>{uploadingAvatar ? "Uploading..." : "Photo"}</span>
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setAvatarUrl(null)}
                      title="Remove photo"
                      className="rounded-lg border border-white/[0.1] bg-[#18191E] p-1.5 text-zinc-400 hover:border-rose-500/40 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="profile-display-name"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Display name
                </label>
                <input
                  id="profile-display-name"
                  type="text"
                  dir="auto"
                  required
                  maxLength={40}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3.5 py-2 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="profile-email"
                  className="flex items-center justify-between text-xs font-medium text-zinc-300"
                >
                  <span>Email address</span>
                  <span className="inline-flex items-center gap-1 font-normal text-[10px] text-zinc-500">
                    <Lock className="h-2.5 w-2.5" />
                    Private
                  </span>
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                  <input
                    id="profile-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value.toLowerCase())}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-medium text-zinc-300">Avatar accent</span>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_PALETTE.map((hex) => {
                    const selected = avatarColor.toLowerCase() === hex.toLowerCase();
                    return (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setAvatarColor(hex)}
                        aria-label={`Select color ${hex}`}
                        className={`flex h-7 w-7 items-center justify-center rounded-full transition-transform active:scale-95 ${
                          selected ? "ring-2 ring-white ring-offset-2 ring-offset-[#121316]" : ""
                        }`}
                        style={{ backgroundColor: hex }}
                      >
                        {selected && <Check className="h-3.5 w-3.5 text-zinc-950" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* UI Sound Effects Preference */}
              <div className="space-y-2 rounded-lg border border-white/[0.07] bg-[#0E0F12] p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                    {soundEnabled ? (
                      <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <VolumeX className="h-3.5 w-3.5 text-zinc-500" />
                    )}
                    Interface sounds
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !soundEnabled;
                      setSoundEnabled(next);
                      setSoundPrefs({ enabled: next });
                      if (next) playSound("unmute");
                    }}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      soundEnabled
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-white/[0.06] text-zinc-400"
                    }`}
                  >
                    {soundEnabled ? "On" : "Off"}
                  </button>
                </div>

                {soundEnabled && (
                  <div className="flex items-center gap-2.5">
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.05}
                      aria-label="Interface sounds volume"
                      value={soundVolume}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setSoundVolume(v);
                        setSoundPrefs({ volume: v });
                      }}
                      onMouseUp={() => playSound("notification")}
                      className="h-1 flex-1 cursor-pointer accent-emerald-500"
                    />
                    <span className="w-8 text-right font-mono text-[10px] text-zinc-400">
                      {Math.round(soundVolume * 100)}%
                    </span>
                  </div>
                )}
              </div>

              {error && (
                <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-white/[0.1] px-3.5 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingAvatar}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
