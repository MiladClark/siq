"use client";

import { Check, UserCircle, X } from "@phosphor-icons/react";
import { FormEvent, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { AVATAR_PALETTE, type PublicUser } from "@/lib/types";

interface ProfileModalProps {
  open: boolean;
  user: PublicUser;
  onClose: () => void;
  onUpdated: (user: PublicUser) => void;
}

export function ProfileModal({ open, user, onClose, onUpdated }: ProfileModalProps) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarColor, setAvatarColor] = useState(user.avatarColor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, avatarColor }),
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-white/[0.1] bg-[#121316] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <UserCircle size={18} weight="bold" className="text-emerald-400" />
            <h2 id="profile-modal-title" className="text-sm font-semibold text-zinc-100">
              Profile settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile settings"
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-5">
          <div className="flex items-center gap-4 rounded-lg border border-white/[0.07] bg-[#0E0F12] p-4">
            <Avatar name={displayName || user.username} color={avatarColor} size="lg" online />
            <div className="min-w-0">
              <p dir="auto" className="truncate text-sm font-semibold text-zinc-100">
                {displayName || user.username}
              </p>
              <p className="font-mono text-xs text-zinc-500">@{user.username}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-display-name" className="block text-xs font-medium text-zinc-300">
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
              className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3.5 py-2.5 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
            />
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-zinc-300">Avatar accent</span>
            <div className="flex flex-wrap gap-2.5">
              {AVATAR_PALETTE.map((hex) => {
                const selected = avatarColor.toLowerCase() === hex.toLowerCase();
                return (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setAvatarColor(hex)}
                    aria-label={`Select color ${hex}`}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-95 ${
                      selected ? "ring-2 ring-white ring-offset-2 ring-offset-[#121316]" : ""
                    }`}
                    style={{ backgroundColor: hex }}
                  >
                    {selected && <Check size={14} weight="bold" className="text-zinc-950" />}
                  </button>
                );
              })}
            </div>
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
              disabled={saving}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
