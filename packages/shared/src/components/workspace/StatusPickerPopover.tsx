"use client";

import { apiFetch, mediaUrl } from "@/lib/client-api";
import { Check, Gamepad2, Settings, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@siq/shared/components/ui/Avatar";
import { useSystemNotify } from "@siq/shared/components/ui/NotificationCenter";
import type { PresenceStatus, PrivateUser } from "@siq/shared/lib/types";

interface StatusPickerPopoverProps {
  user: PrivateUser;
  onClose: () => void;
  onUserUpdated: (updated: PrivateUser) => void;
  onOpenSettings: () => void;
}

const STATUS_OPTIONS: Array<{
  id: PresenceStatus;
  label: string;
  desc: string;
  dotClass: string;
}> = [
  {
    id: "online",
    label: "Online",
    desc: "Active and visible to friends",
    dotClass: "bg-emerald-400",
  },
  {
    id: "idle",
    label: "Idle",
    desc: "Away from keyboard",
    dotClass: "bg-amber-400",
  },
  {
    id: "dnd",
    label: "Do Not Disturb",
    desc: "Show busy indicator",
    dotClass: "bg-rose-500",
  },
  {
    id: "invisible",
    label: "Invisible",
    desc: "Appear offline while using siq",
    dotClass: "bg-zinc-500",
  },
];

export function StatusPickerPopover({
  user,
  onClose,
  onUserUpdated,
  onOpenSettings,
}: StatusPickerPopoverProps) {
  const notify = useSystemNotify();
  const ref = useRef<HTMLDivElement | null>(null);
  const [activityDraft, setActivityDraft] = useState(user.customActivity ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  async function savePatch(patch: {
    presenceStatus?: PresenceStatus;
    customActivity?: string | null;
  }) {
    setSaving(true);
    // Instant optimistic update
    onUserUpdated({
      ...user,
      presenceStatus: patch.presenceStatus ?? user.presenceStatus,
      customActivity:
        patch.customActivity !== undefined ? patch.customActivity : user.customActivity,
    });

    try {
      const res = await apiFetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        onUserUpdated(data.user);
      } else {
        notify({
          kind: "error",
          title: "Status Update Failed",
          message: data.error ?? "Could not save your status.",
          source: "Profile",
        });
      }
    } catch {
      notify({
        kind: "error",
        title: "Status Update Failed",
        message: "Network error saving status.",
        source: "Profile",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      role="dialog"
      aria-label="Status & activity"
      className="fixed bottom-[72px] left-3 z-[85] w-[280px] max-w-[calc(100vw-24px)] origin-bottom-left overflow-hidden rounded-2xl border border-white/[0.11] bg-[#14151A] shadow-2xl shadow-black/80"
    >
      {/* Mini Banner + Header */}
      <div
        className="h-14 w-full"
        style={
          !user.bannerUrl
            ? {
                background: `linear-gradient(135deg, ${user.avatarColor}45 0%, #14151A 100%)`,
              }
            : {
                backgroundImage: `url(${mediaUrl(user.bannerUrl)})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
        }
      />

      <div className="space-y-3 px-3.5 pb-3.5">
        <div className="-mt-6 flex items-end justify-between">
          <div className="inline-flex rounded-full ring-4 ring-[#14151A]">
            <Avatar
              name={user.displayName}
              color={user.avatarColor}
              avatarUrl={user.avatarUrl}
              size="lg"
              status={user.presenceStatus === "invisible" ? "offline" : user.presenceStatus}
              ringClassName="ring-[#14151A]"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#18191E] px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
          >
            <Settings className="h-3 w-3" />
            <span>Edit Profile</span>
          </button>
        </div>

        <div>
          <p dir="auto" className="truncate text-sm font-semibold text-zinc-100">
            {user.displayName}
          </p>
          <p className="text-[11px] text-zinc-500">@{user.username}</p>
        </div>

        {/* Custom Activity Editor */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const val = activityDraft.trim();
            void savePatch({ customActivity: val || null });
          }}
          className="space-y-1.5 border-t border-white/[0.07] pt-3"
        >
          <label
            htmlFor="quick-activity"
            className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
          >
            <span>Custom Activity</span>
            {user.customActivity && (
              <button
                type="button"
                onClick={() => {
                  setActivityDraft("");
                  void savePatch({ customActivity: null });
                }}
                className="inline-flex items-center gap-0.5 text-[10px] font-medium normal-case text-zinc-400 hover:text-rose-400"
              >
                <X className="h-2.5 w-2.5" /> Clear
              </button>
            )}
          </label>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Gamepad2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                id="quick-activity"
                type="text"
                dir="auto"
                maxLength={120}
                value={activityDraft}
                onChange={(e) => setActivityDraft(e.target.value)}
                placeholder="Playing Valorant, Chilling..."
                className="w-full rounded-lg border border-white/[0.08] bg-[#0E0F12] py-1.5 pl-8 pr-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              title="Save activity"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950 transition-all hover:bg-emerald-400 active:scale-95 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>

        {/* Presence Status Options */}
        <div className="space-y-0.5 border-t border-white/[0.07] pt-2.5">
          {STATUS_OPTIONS.map((opt) => {
            const active = user.presenceStatus === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={saving}
                onClick={() => {
                  void savePatch({ presenceStatus: opt.id });
                  onClose();
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  active
                    ? "bg-white/[0.08] text-zinc-100"
                    : "text-zinc-300 hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${opt.dotClass}`} />
                  <div>
                    <p className="text-xs font-medium">{opt.label}</p>
                    <p className="text-[10px] text-zinc-500">{opt.desc}</p>
                  </div>
                </div>
                {active && <Check className="h-3.5 w-3.5 text-emerald-400" />}
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
