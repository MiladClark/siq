"use client";

import { apiFetch, mediaUrl } from "@/lib/client-api";
import { Check, Gamepad2, Settings, X } from "lucide-react";
import { motion, type Variants } from "motion/react";
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
  glowClass: string;
}> = [
  {
    id: "online",
    label: "Online",
    desc: "Active and visible to friends",
    dotClass: "bg-emerald-400",
    glowClass: "shadow-[0_0_10px_rgb(var(--siq-accent-rgb)/0.85)]",
  },
  {
    id: "idle",
    label: "Idle",
    desc: "Away from keyboard",
    dotClass: "bg-amber-400",
    glowClass: "shadow-[0_0_10px_rgba(251,191,36,0.75)]",
  },
  {
    id: "dnd",
    label: "Do Not Disturb",
    desc: "Show busy indicator",
    dotClass: "bg-rose-500",
    glowClass: "shadow-[0_0_10px_rgba(244,63,94,0.8)]",
  },
  {
    id: "invisible",
    label: "Invisible",
    desc: "Appear offline while using siq",
    dotClass: "bg-zinc-500",
    glowClass: "ring-2 ring-inset ring-zinc-300/40",
  },
];

// Card springs up out of the profile dock, then its sections cascade in
const CARD_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 480,
      damping: 32,
      staggerChildren: 0.04,
      delayChildren: 0.04,
    },
  },
  exit: {
    opacity: 0,
    y: 8,
    scale: 0.96,
    transition: { duration: 0.14, ease: [0.4, 0, 1, 1] },
  },
};

const SECTION_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 420, damping: 32 },
  },
};

const LIST_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 420,
      damping: 32,
      staggerChildren: 0.035,
    },
  },
};

const ROW_VARIANTS: Variants = {
  hidden: { opacity: 0, x: -6 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 520, damping: 34 },
  },
};

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
  const [hoveredStatus, setHoveredStatus] = useState<PresenceStatus | null>(null);

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
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="dialog"
      aria-label="Status & activity"
      className="siq-glass fixed bottom-[72px] left-3 z-[85] w-[280px] max-w-[calc(100vw-24px)] origin-bottom-left overflow-hidden rounded-[20px]"
    >
      {/* Mini Banner + Header */}
      <div
        className="relative h-16 w-full [mask-image:linear-gradient(to_bottom,black_45%,transparent)]"
        style={
          !user.bannerUrl
            ? {
                background: `radial-gradient(90% 120% at 0% 0%, ${user.avatarColor}66 0%, transparent 70%), linear-gradient(135deg, ${user.avatarColor}40 0%, transparent 100%)`,
              }
            : {
                backgroundImage: `url(${mediaUrl(user.bannerUrl)})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
        }
      />

      <div className="space-y-3 px-3.5 pb-3.5">
        <motion.div variants={SECTION_VARIANTS} className="-mt-7 flex items-end justify-between">
          {/* Accent glow ring: gradient halo, then a glass-coloured cut-out gap around the avatar */}
          <div className="relative inline-flex rounded-full bg-gradient-to-br from-emerald-300/80 via-emerald-500/25 to-white/[0.06] p-[5px] shadow-[0_10px_28px_-10px_rgb(var(--siq-accent-rgb)/0.7)]">
            <div className="inline-flex rounded-full ring-[3px] ring-[#1b1c23]">
              <Avatar
                name={user.displayName}
                color={user.avatarColor}
                avatarUrl={user.avatarUrl}
                size="lg"
                status={user.presenceStatus === "invisible" ? "offline" : user.presenceStatus}
                ringClassName="ring-[#1b1c23]"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className="siq-press inline-flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
          >
            <Settings className="h-3 w-3" />
            <span>Edit Profile</span>
          </button>
        </motion.div>

        <motion.div variants={SECTION_VARIANTS}>
          <p dir="auto" className="truncate text-[15px] font-bold tracking-tight text-zinc-50">
            {user.displayName}
          </p>
          <p className="text-[11px] text-zinc-500">@{user.username}</p>
        </motion.div>

        {/* Custom Activity Editor */}
        <motion.form
          variants={SECTION_VARIANTS}
          onSubmit={(e) => {
            e.preventDefault();
            const val = activityDraft.trim();
            void savePatch({ customActivity: val || null });
          }}
          className="space-y-1.5 border-t border-white/[0.06] pt-3"
        >
          <label
            htmlFor="quick-activity"
            className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.09em] text-zinc-500"
          >
            <span>Custom Activity</span>
            {user.customActivity && (
              <button
                type="button"
                onClick={() => {
                  setActivityDraft("");
                  void savePatch({ customActivity: null });
                }}
                className="inline-flex items-center gap-0.5 rounded-md px-1 py-px text-[10px] font-medium normal-case tracking-normal text-zinc-400 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
              >
                <X className="h-2.5 w-2.5" /> Clear
              </button>
            )}
          </label>
          <div className="flex items-center gap-1.5">
            <div className="group relative flex-1">
              <Gamepad2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-emerald-400" />
              <input
                id="quick-activity"
                type="text"
                dir="auto"
                maxLength={120}
                value={activityDraft}
                onChange={(e) => setActivityDraft(e.target.value)}
                placeholder="Playing Valorant, Chilling..."
                className="w-full rounded-[10px] border border-white/[0.08] bg-black/25 py-1.5 pl-8 pr-2.5 text-xs text-zinc-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:bg-black/35 focus:shadow-[0_0_0_3px_rgb(var(--siq-accent-rgb)/0.12)] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              title="Save activity"
              className="siq-cta flex h-7 w-7 shrink-0 items-center justify-center disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
            </button>
          </div>
        </motion.form>

        {/* Presence Status Options */}
        <motion.div
          variants={LIST_VARIANTS}
          onMouseLeave={() => setHoveredStatus(null)}
          className="space-y-0.5 border-t border-white/[0.06] pt-2.5"
        >
          {STATUS_OPTIONS.map((opt) => {
            const active = user.presenceStatus === opt.id;
            const hovered = hoveredStatus === opt.id && !active;
            return (
              <motion.button
                key={opt.id}
                variants={ROW_VARIANTS}
                type="button"
                disabled={saving}
                onMouseEnter={() => setHoveredStatus(opt.id)}
                onFocus={() => setHoveredStatus(opt.id)}
                onClick={() => {
                  void savePatch({ presenceStatus: opt.id });
                  onClose();
                }}
                className={`group relative isolate flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-1.5 text-left outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-emerald-400/50 ${
                  active ? "text-white" : "text-zinc-300 hover:text-zinc-100"
                }`}
              >
                {active && <span aria-hidden="true" className="siq-nav-highlight" />}
                {hovered && (
                  <motion.span
                    layoutId="siq-status-picker-hover"
                    aria-hidden="true"
                    transition={{ type: "spring", stiffness: 620, damping: 44, mass: 0.6 }}
                    className="absolute inset-0 -z-10 rounded-[inherit] bg-white/[0.05] ring-1 ring-inset ring-white/[0.05]"
                  />
                )}
                <div className="flex items-center gap-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/[0.04] ring-1 ring-inset ring-white/[0.06] transition-transform duration-200 [transition-timing-function:var(--siq-ease-spring)] motion-safe:group-hover:scale-110">
                    <span className={`h-2.5 w-2.5 rounded-full ${opt.dotClass} ${opt.glowClass}`} />
                  </span>
                  <div>
                    <p className="text-xs font-medium">{opt.label}</p>
                    <p className="text-[10px] text-zinc-500">{opt.desc}</p>
                  </div>
                </div>
                {active && (
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 22, delay: 0.18 }}
                    className="inline-flex"
                  >
                    <Check className="h-3.5 w-3.5 text-emerald-400 drop-shadow-[0_0_6px_rgb(var(--siq-accent-rgb)/0.8)]" />
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </motion.div>
      </div>
    </motion.div>
  );
}
