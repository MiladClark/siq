"use client";

import { mediaUrl } from "@/lib/client-api";
import {
  Calendar,
  Check,
  Clock,
  Copy,
  Gamepad2,
  Headphones,
  MessageSquare,
  Monitor,
  Play,
  Plus,
  Send,
  Shield,
  UserCheck,
  UserPlus,
  Volume2,
  X,
} from "lucide-react";
import type { Track } from "livekit-client";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar, type AvatarStatus } from "@siq/shared/components/ui/Avatar";
import { playSound } from "@siq/shared/lib/sounds";
import type { RoleItem } from "@siq/shared/lib/types";

// Profile card springs open beside its anchor, then its sections cascade in
const CARD_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 6 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 480,
      damping: 32,
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 3,
    transition: { duration: 0.13, ease: [0.4, 0, 1, 1] },
  },
};

const SECTION_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 420, damping: 32 },
  },
};

const AVATAR_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.7, y: 6 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 420, damping: 20 },
  },
};

// Approximates the glass surface right below the banner so avatar/status cut-outs read cleanly
const CARD_CUTOUT_RING = "ring-[#1b1c23]";

const BANNER_ACTION_CLASS =
  "siq-press grid h-7 w-7 place-items-center rounded-[9px] bg-black/45 text-zinc-200 ring-1 ring-inset ring-white/10 backdrop-blur-md";

export interface ProfilePopoverTarget {
  id: string;
  displayName: string;
  username?: string;
  avatarColor: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  customActivity?: string | null;
  createdAt?: string | null;
  role?: "admin" | "member";
  online?: boolean;
  status?: AvatarStatus;
  serverTag?: string | null;
  serverRoles?: RoleItem[];
  availableRoles?: RoleItem[];
  canManageRoles?: boolean;
  friendshipStatus?: "friend" | "incoming" | "outgoing" | "none";
  friendshipId?: string | null;
  inVoiceChannelName?: string | null;
  voiceChannelId?: string | null;
  voicePeers?: Array<{
    identity: string;
    name: string;
    avatarColor: string;
    avatarUrl?: string | null;
  }>;
  isScreenSharing?: boolean;
  liveScreenTrack?: Track | null;
  anchorRect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
}

interface UserProfilePopoverProps {
  target: ProfilePopoverTarget | null;
  currentUserId?: string;
  currentVoiceChannelId?: string | null;
  onClose: () => void;
  onWatchStream?: (target: ProfilePopoverTarget) => void;
  onJoinVoice?: (voiceChannelId: string) => void;
  onToggleRole?: (userId: string, roleId: string) => void;
  onAddFriend?: (username: string) => void;
  onAcceptFriend?: (friendshipId: string) => void;
  onQuickMessage?: (userId: string, text: string) => Promise<void>;
  onOpenDm?: (userId: string) => void;
}

function MiniLiveVideo({ track }: { track: Track }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className="h-full w-full object-cover"
    />
  );
}

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function UserProfilePopover({
  target,
  currentUserId,
  currentVoiceChannelId,
  onClose,
  onWatchStream,
  onJoinVoice,
  onToggleRole,
  onAddFriend,
  onAcceptFriend,
  onQuickMessage,
  onOpenDm,
}: UserProfilePopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [quickMsg, setQuickMsg] = useState("");
  const [sendingQuick, setSendingQuick] = useState(false);

  useEffect(() => {
    setRolePickerOpen(false);
    setQuickMsg("");
    setSendingQuick(false);
  }, [target?.id]);

  useEffect(() => {
    if (!target) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleOutside);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleOutside);
    };
  }, [target, onClose]);

  useLayoutEffect(() => {
    if (!target || !ref.current) return;
    const cardW = ref.current.offsetWidth || 320;
    const cardH = ref.current.offsetHeight || 380;
    const pad = 12;

    let left = target.anchorRect.right + 12;
    if (left + cardW > window.innerWidth - pad) {
      left = target.anchorRect.left - cardW - 12;
    }
    if (left < pad) {
      left = Math.max(
        pad,
        Math.min(target.anchorRect.left, window.innerWidth - cardW - pad)
      );
    }

    let top = target.anchorRect.top - 12;
    if (top + cardH > window.innerHeight - pad) {
      top = window.innerHeight - cardH - pad;
    }
    if (top < pad) top = pad;

    setCoords({ top, left });
  }, [target, rolePickerOpen]);

  const isSelf = Boolean(target && currentUserId && target.id === currentUserId);

  // Grow out of the side that faces the member row / avatar that opened the card
  const cardOrigin =
    target && coords.left < target.anchorRect.left ? "right top" : "left top";

  const resolvedStatus: AvatarStatus =
    target?.status ?? (target?.online ? "online" : "offline");

  const statusLabel =
    resolvedStatus === "online"
      ? "Online"
      : resolvedStatus === "idle"
        ? "Idle"
        : resolvedStatus === "dnd"
          ? "Do Not Disturb"
          : "Offline";

  const statusDotClass =
    resolvedStatus === "online"
      ? "bg-emerald-400"
      : resolvedStatus === "idle"
        ? "bg-amber-400"
        : resolvedStatus === "dnd"
          ? "bg-rose-500"
          : "bg-zinc-600";

  const isInDifferentVoice =
    Boolean(target?.voiceChannelId) &&
    target?.voiceChannelId !== currentVoiceChannelId;

  const assignedRoles = target?.serverRoles ?? [];
  const assignedIds = new Set(assignedRoles.map((r) => r.id));
  const unassignedRoles = (target?.availableRoles ?? []).filter(
    (r) => !r.isDefault && !assignedIds.has(r.id)
  );

  async function handleQuickSend(e: FormEvent) {
    e.preventDefault();
    if (!target || !quickMsg.trim() || !onQuickMessage || sendingQuick) return;
    setSendingQuick(true);
    try {
      await onQuickMessage(target.id, quickMsg.trim());
      setQuickMsg("");
      onClose();
    } finally {
      setSendingQuick(false);
    }
  }

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          ref={ref}
          key={target.id}
          variants={CARD_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{ top: coords.top, left: coords.left, transformOrigin: cardOrigin }}
          role="dialog"
          aria-label={`${target.displayName} profile`}
          className="siq-glass fixed z-[85] w-[320px] overflow-visible rounded-[20px]"
        >
          {/* Banner Image or Accent Gradient */}
          <div
            className="relative h-24 w-full overflow-hidden rounded-t-[19px] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
            style={
              !target.bannerUrl
                ? {
                    background: `radial-gradient(80% 130% at 0% 0%, ${target.avatarColor}70 0%, transparent 72%), radial-gradient(60% 90% at 100% 100%, rgb(var(--siq-accent-rgb) / 0.18), transparent 70%), linear-gradient(135deg, ${target.avatarColor}38 0%, transparent 100%)`,
                  }
                : undefined
            }
          >
            {target.bannerUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl(target.bannerUrl)}
                alt={`${target.displayName} banner`}
                className="h-full w-full object-cover"
              />
            )}
            {/* Top scrim keeps the banner actions legible on bright banners */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/30 to-transparent"
            />

            <div className="absolute right-2.5 top-2.5 flex items-center gap-1">
              {!isSelf && target.friendshipStatus === "none" && target.username && onAddFriend && (
                <button
                  type="button"
                  onClick={() => onAddFriend(target.username!)}
                  title="Add Friend"
                  aria-label="Add Friend"
                  className={`${BANNER_ACTION_CLASS} hover:bg-emerald-500 hover:text-zinc-950 hover:shadow-[0_0_18px_-4px_rgb(var(--siq-accent-rgb)/0.8)]`}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </button>
              )}
              {!isSelf &&
                target.friendshipStatus === "incoming" &&
                target.friendshipId &&
                onAcceptFriend && (
                  <button
                    type="button"
                    onClick={() => onAcceptFriend(target.friendshipId!)}
                    title="Accept Friend Request"
                    aria-label="Accept Friend Request"
                    className="siq-press grid h-7 w-7 place-items-center rounded-[9px] bg-emerald-500/90 text-zinc-950 shadow-[0_0_18px_-4px_rgb(var(--siq-accent-rgb)/0.8)] ring-1 ring-inset ring-white/25 backdrop-blur-md hover:bg-emerald-400"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
              {!isSelf && target.friendshipStatus === "outgoing" && (
                <span
                  title="Friend request pending"
                  className="grid h-7 w-7 place-items-center rounded-[9px] bg-black/45 text-amber-300 ring-1 ring-inset ring-amber-300/20 backdrop-blur-md"
                >
                  <Clock className="h-3.5 w-3.5" />
                </span>
              )}
              {!isSelf && target.friendshipStatus === "friend" && (
                <span
                  title="Friends"
                  className="grid h-7 w-7 place-items-center rounded-[9px] bg-black/45 text-emerald-400 ring-1 ring-inset ring-emerald-400/25 backdrop-blur-md"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                </span>
              )}
              {!isSelf && onOpenDm && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenDm(target.id);
                    onClose();
                  }}
                  title="Open Direct Message"
                  aria-label="Open Direct Message"
                  className={`${BANNER_ACTION_CLASS} hover:bg-black/70 hover:text-emerald-300`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </button>
              )}
              {target.username && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(`@${target.username}`);
                    playSound("copy");
                  }}
                  title="Copy username"
                  aria-label="Copy username"
                  className={`${BANNER_ACTION_CLASS} hover:bg-black/70 hover:text-emerald-300`}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close profile popover"
                className={`${BANNER_ACTION_CLASS} hover:bg-black/70 hover:text-white`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Avatar + Identity */}
          <div className="space-y-3 px-4 pb-4">
            <div className="-mt-11 flex items-end justify-between">
              {/* Accent glow ring: gradient halo, then a glass-coloured cut-out gap around the avatar */}
              <motion.div
                variants={AVATAR_VARIANTS}
                className="relative inline-flex rounded-full bg-gradient-to-br from-emerald-300/85 via-emerald-500/30 to-white/[0.06] p-[6px] shadow-[0_12px_32px_-10px_rgb(var(--siq-accent-rgb)/0.75)]"
              >
                <div className={`inline-flex rounded-full ring-4 ${CARD_CUTOUT_RING}`}>
                  <Avatar
                    name={target.displayName}
                    color={target.avatarColor}
                    avatarUrl={target.avatarUrl}
                    size="xl"
                    status={resolvedStatus}
                    ringClassName={CARD_CUTOUT_RING}
                  />
                </div>
              </motion.div>

              <motion.div variants={SECTION_VARIANTS} className="flex items-center gap-1.5 pb-1">
                {target.role === "admin" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-gradient-to-r from-emerald-500/20 to-emerald-500/[0.06] px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-emerald-300 shadow-[0_0_16px_-6px_rgb(var(--siq-accent-rgb)/0.8)]">
                    <Shield className="h-3 w-3" />
                    Admin
                  </span>
                )}
              </motion.div>
            </div>

            {/* Name & Handle */}
            <motion.div variants={SECTION_VARIANTS}>
              <h3 dir="auto" className="truncate text-[17px] font-bold tracking-tight text-zinc-50">
                {target.displayName}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                {target.username && <span className="font-medium">@{target.username}</span>}
                {target.serverTag && (
                  <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    {target.serverTag}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-zinc-300 ring-1 ring-inset ring-white/[0.06]">
                  <span
                    className={`h-2 w-2 rounded-full ${statusDotClass} ${
                      resolvedStatus === "online"
                        ? "shadow-[0_0_8px_rgb(var(--siq-accent-rgb)/0.9)]"
                        : resolvedStatus === "idle"
                          ? "shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                          : resolvedStatus === "dnd"
                            ? "shadow-[0_0_8px_rgba(244,63,94,0.8)]"
                            : ""
                    }`}
                  />
                  {statusLabel}
                </span>
              </div>
            </motion.div>

            {/* Custom Activity Pill */}
            {target.customActivity && (
              <motion.div
                variants={SECTION_VARIANTS}
                className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.035] px-2.5 py-2 text-xs text-zinc-300"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20">
                  <Gamepad2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                </span>
                <span dir="auto" className="truncate">
                  {target.customActivity}
                </span>
              </motion.div>
            )}

            {/* Embedded Live Stream / Voice Card */}
            {(target.isScreenSharing || target.inVoiceChannelName) && (
              <motion.div
                variants={SECTION_VARIANTS}
                className="overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-3"
              >
                {target.isScreenSharing && (
                  <div className="mb-2.5">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-zinc-200">
                        Streaming
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-rose-500 to-rose-600 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-white shadow-[0_0_12px_rgba(244,63,94,0.55)]">
                        <span aria-hidden="true" className="h-1 w-1 animate-pulse rounded-full bg-white motion-reduce:animate-none" />
                        LIVE
                      </span>
                    </div>
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/[0.07]">
                      {target.liveScreenTrack ? (
                        <MiniLiveVideo track={target.liveScreenTrack} />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[radial-gradient(90%_80%_at_50%_30%,rgb(var(--siq-accent-rgb)/0.1),transparent_70%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.4))] text-zinc-500">
                          <Monitor className="h-6 w-6 text-emerald-400/80 drop-shadow-[0_0_10px_rgb(var(--siq-accent-rgb)/0.6)]" />
                          <span className="text-[11px] font-medium text-zinc-400">
                            Live screen broadcast
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {target.inVoiceChannelName && (
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-zinc-300">
                      <Volume2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span dir="auto" className="truncate font-medium">
                        {target.inVoiceChannelName}
                      </span>
                    </span>
                    {target.voicePeers && target.voicePeers.length > 0 && (
                      <div className="flex shrink-0 -space-x-1.5">
                        {target.voicePeers.slice(0, 4).map((peer, peerIndex) => (
                          <motion.span
                            key={peer.identity}
                            initial={{ opacity: 0, scale: 0.6, x: -4 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            transition={{
                              type: "spring",
                              stiffness: 460,
                              damping: 24,
                              delay: 0.18 + peerIndex * 0.05,
                            }}
                            className="inline-flex rounded-full ring-2 ring-[#1d1e25]"
                          >
                            <Avatar
                              name={peer.name}
                              color={peer.avatarColor}
                              avatarUrl={peer.avatarUrl}
                              size="xs"
                            />
                          </motion.span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Primary Full-Width Action Button */}
                {target.isScreenSharing && onWatchStream ? (
                  <button
                    type="button"
                    onClick={() => {
                      onWatchStream(target);
                      onClose();
                    }}
                    className="siq-cta mt-3 flex w-full items-center justify-center gap-2 px-3.5 py-2 text-xs"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Watch Live Stream</span>
                  </button>
                ) : isInDifferentVoice && target.voiceChannelId && onJoinVoice ? (
                  <button
                    type="button"
                    onClick={() => {
                      onJoinVoice(target.voiceChannelId!);
                      onClose();
                    }}
                    className="siq-press mt-3 flex w-full items-center justify-center gap-2 rounded-[10px] border border-white/[0.1] bg-white/[0.05] px-3.5 py-2 text-xs font-semibold text-zinc-100 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
                  >
                    <Headphones className="h-3.5 w-3.5" />
                    <span>Join Voice</span>
                  </button>
                ) : null}
              </motion.div>
            )}

            {/* Bio / About Me */}
            {target.bio && (
              <motion.div variants={SECTION_VARIANTS} className="space-y-1.5 border-t border-white/[0.06] pt-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-zinc-500">
                  About Me
                </p>
                <p
                  dir="auto"
                  className="whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-300"
                >
                  {target.bio}
                </p>
              </motion.div>
            )}

            {/* Server Role Pills + Quick Assign (+) + Member Since */}
            <motion.div variants={SECTION_VARIANTS} className="space-y-2.5 border-t border-white/[0.06] pt-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {assignedRoles.length > 0 ? (
                  assignedRoles.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium text-zinc-200 transition-colors"
                      style={{
                        borderColor: `color-mix(in srgb, ${r.color} 32%, transparent)`,
                        backgroundColor: `color-mix(in srgb, ${r.color} 9%, transparent)`,
                      }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: r.color, boxShadow: `0 0 8px ${r.color}` }}
                      />
                      <span dir="auto">{r.name}</span>
                      {target.canManageRoles && onToggleRole && (
                        <button
                          type="button"
                          onClick={() => onToggleRole(target.id, r.id)}
                          aria-label={`Remove ${r.name}`}
                          className="-mr-0.5 rounded-full p-px text-zinc-500 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-zinc-300">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          target.role === "admin" ? "#10B981" : target.avatarColor,
                      }}
                    />
                    {target.role === "admin" ? "Admin" : "Member"}
                  </span>
                )}

                {target.canManageRoles &&
                  onToggleRole &&
                  unassignedRoles.length > 0 && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setRolePickerOpen((v) => !v)}
                        title="Add role"
                        aria-label="Add role"
                        className={`siq-press inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300 ${
                          rolePickerOpen
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                            : "border-white/[0.16] bg-white/[0.03] text-zinc-400"
                        }`}
                      >
                        <Plus
                          className={`h-3 w-3 transition-transform duration-200 ${rolePickerOpen ? "rotate-45" : ""}`}
                        />
                      </button>

                      {rolePickerOpen && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.92, y: 6 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ type: "spring", stiffness: 520, damping: 32 }}
                          className="siq-glass absolute bottom-8 left-0 z-30 w-44 origin-bottom-left rounded-xl p-1"
                        >
                          {unassignedRoles.map((r, roleIndex) => (
                            <motion.button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                setRolePickerOpen(false);
                                onToggleRole(target.id, r.id);
                              }}
                              initial={{ opacity: 0, x: -4 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{
                                type: "spring",
                                stiffness: 560,
                                damping: 36,
                                delay: 0.03 + Math.min(roleIndex, 8) * 0.02,
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-200 transition-colors duration-150 hover:bg-white/[0.07] hover:text-white"
                            >
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: r.color, boxShadow: `0 0 8px ${r.color}` }}
                              />
                              <span dir="auto" className="truncate">
                                {r.name}
                              </span>
                            </motion.button>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  )}
              </div>

              {target.createdAt && (
                <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-zinc-500">
                  <Calendar className="h-3 w-3" />
                  <span>Member since {formatMemberSince(target.createdAt)}</span>
                </div>
              )}
            </motion.div>

            {/* Bottom Quick Message Input (Message @user) */}
            {!isSelf && onQuickMessage && (
              <motion.form
                variants={SECTION_VARIANTS}
                onSubmit={handleQuickSend}
                className="flex items-center gap-1.5 rounded-xl border border-white/[0.09] bg-black/25 py-1.5 pl-3 pr-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-emerald-500/50 focus-within:bg-black/35 focus-within:shadow-[0_0_0_3px_rgb(var(--siq-accent-rgb)/0.12)]"
              >
                <input
                  type="text"
                  dir="auto"
                  value={quickMsg}
                  onChange={(e) => setQuickMsg(e.target.value)}
                  disabled={sendingQuick}
                  placeholder={`Message @${target.username ?? target.displayName}`}
                  className="min-h-6 min-w-0 flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                />
                {quickMsg.trim() && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.5, rotate: -30 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 520, damping: 22 }}
                    className="inline-flex"
                  >
                    <button
                      type="submit"
                      disabled={sendingQuick}
                      aria-label="Send quick direct message"
                      className="siq-cta grid h-6 w-6 place-items-center !rounded-lg disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" />
                    </button>
                  </motion.span>
                )}
              </motion.form>
            )}
          </div>
          <span
            aria-hidden="true"
            className="siq-edge-light pointer-events-none !absolute -inset-px rounded-[inherit]"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
