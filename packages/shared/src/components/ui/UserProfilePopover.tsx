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
import { AnimatePresence, motion } from "motion/react";
import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar, type AvatarStatus } from "@siq/shared/components/ui/Avatar";
import { playSound } from "@siq/shared/lib/sounds";
import type { RoleItem } from "@siq/shared/lib/types";

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
          initial={{ opacity: 0, scale: 0.94, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 2 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          style={{ top: coords.top, left: coords.left }}
          role="dialog"
          aria-label={`${target.displayName} profile`}
          className="fixed z-[85] w-[320px] overflow-visible rounded-2xl border border-white/[0.11] bg-[#14151A] shadow-2xl shadow-black/80"
        >
          {/* Banner Image or Accent Gradient */}
          <div
            className="relative h-24 w-full overflow-hidden rounded-t-2xl"
            style={
              !target.bannerUrl
                ? {
                    background: `linear-gradient(135deg, ${target.avatarColor}50 0%, #14151A 100%)`,
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

            <div className="absolute right-2.5 top-2.5 flex items-center gap-1">
              {!isSelf && target.friendshipStatus === "none" && target.username && onAddFriend && (
                <button
                  type="button"
                  onClick={() => onAddFriend(target.username!)}
                  title="Add Friend"
                  aria-label="Add Friend"
                  className="rounded-lg bg-black/55 p-1.5 text-zinc-200 backdrop-blur-xs transition-colors hover:bg-emerald-500 hover:text-zinc-950"
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
                    className="rounded-lg bg-emerald-500/90 p-1.5 text-zinc-950 backdrop-blur-xs transition-colors hover:bg-emerald-400"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
              {!isSelf && target.friendshipStatus === "outgoing" && (
                <span
                  title="Friend request pending"
                  className="rounded-lg bg-black/55 p-1.5 text-amber-300 backdrop-blur-xs"
                >
                  <Clock className="h-3.5 w-3.5" />
                </span>
              )}
              {!isSelf && target.friendshipStatus === "friend" && (
                <span
                  title="Friends"
                  className="rounded-lg bg-black/55 p-1.5 text-emerald-400 backdrop-blur-xs"
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
                  className="rounded-lg bg-black/55 p-1.5 text-zinc-200 backdrop-blur-xs transition-colors hover:bg-black/80 hover:text-emerald-300"
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
                  className="rounded-lg bg-black/55 p-1.5 text-zinc-200 backdrop-blur-xs transition-colors hover:bg-black/80 hover:text-emerald-300"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close profile popover"
                className="rounded-lg bg-black/55 p-1.5 text-zinc-200 backdrop-blur-xs transition-colors hover:bg-black/80 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Avatar + Identity */}
          <div className="space-y-3 px-4 pb-4">
            <div className="-mt-9 flex items-end justify-between">
              <div className="inline-flex rounded-full ring-[5px] ring-[#14151A]">
                <Avatar
                  name={target.displayName}
                  color={target.avatarColor}
                  avatarUrl={target.avatarUrl}
                  size="xl"
                  status={resolvedStatus}
                  ringClassName="ring-[#14151A]"
                />
              </div>

              <div className="flex items-center gap-1.5 pb-1">
                {target.role === "admin" && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-300">
                    <Shield className="h-3 w-3" />
                    Admin
                  </span>
                )}
              </div>
            </div>

            {/* Name & Handle */}
            <div>
              <h3 dir="auto" className="truncate text-base font-bold tracking-tight text-zinc-50">
                {target.displayName}
              </h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                {target.username && <span className="font-medium">@{target.username}</span>}
                {target.serverTag && (
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    {target.serverTag}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
                  <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
                  {statusLabel}
                </span>
              </div>
            </div>

            {/* Custom Activity Pill */}
            {target.customActivity && (
              <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-[#0E0F12] px-2.5 py-2 text-xs text-zinc-300">
                <Gamepad2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span dir="auto" className="truncate">
                  {target.customActivity}
                </span>
              </div>
            )}

            {/* Embedded Live Stream / Voice Card */}
            {(target.isScreenSharing || target.inVoiceChannelName) && (
              <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0E0F12] p-3">
                {target.isScreenSharing && (
                  <div className="mb-2.5">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-zinc-200">
                        Streaming
                      </span>
                      <span className="inline-flex items-center gap-1 rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
                        LIVE
                      </span>
                    </div>
                    <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/[0.07] bg-black">
                      {target.liveScreenTrack ? (
                        <MiniLiveVideo track={target.liveScreenTrack} />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#121316] text-zinc-500">
                          <Monitor className="h-6 w-6 text-emerald-400/70" />
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
                        {target.voicePeers.slice(0, 4).map((peer) => (
                          <span
                            key={peer.identity}
                            className="inline-flex rounded-full ring-2 ring-[#0E0F12]"
                          >
                            <Avatar
                              name={peer.name}
                              color={peer.avatarColor}
                              avatarUrl={peer.avatarUrl}
                              size="xs"
                            />
                          </span>
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
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 shadow-lg shadow-emerald-500/15 transition-all hover:bg-emerald-400 active:scale-[0.98]"
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
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-[#18191E] px-3.5 py-2 text-xs font-semibold text-zinc-100 transition-all hover:border-emerald-500/40 hover:text-emerald-300 active:scale-[0.98]"
                  >
                    <Headphones className="h-3.5 w-3.5" />
                    <span>Join Voice</span>
                  </button>
                ) : null}
              </div>
            )}

            {/* Bio / About Me */}
            {target.bio && (
              <div className="space-y-1 border-t border-white/[0.07] pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  About Me
                </p>
                <p
                  dir="auto"
                  className="whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-300"
                >
                  {target.bio}
                </p>
              </div>
            )}

            {/* Server Role Pills + Quick Assign (+) + Member Since */}
            <div className="space-y-2 border-t border-white/[0.07] pt-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {assignedRoles.length > 0 ? (
                  assignedRoles.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#0E0F12] px-2 py-0.5 text-[11px] font-medium text-zinc-200"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: r.color }}
                      />
                      <span dir="auto">{r.name}</span>
                      {target.canManageRoles && onToggleRole && (
                        <button
                          type="button"
                          onClick={() => onToggleRole(target.id, r.id)}
                          aria-label={`Remove ${r.name}`}
                          className="text-zinc-500 transition-colors hover:text-rose-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#0E0F12] px-2 py-0.5 text-[11px] font-medium text-zinc-300">
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
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.1] bg-[#0E0F12] text-zinc-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
                      >
                        <Plus className="h-3 w-3" />
                      </button>

                      {rolePickerOpen && (
                        <div className="absolute bottom-8 left-0 z-30 w-44 rounded-xl border border-white/[0.11] bg-[#18191E] p-1 shadow-2xl shadow-black/80">
                          {unassignedRoles.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                setRolePickerOpen(false);
                                onToggleRole(target.id, r.id);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/[0.07]"
                            >
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: r.color }}
                              />
                              <span dir="auto" className="truncate">
                                {r.name}
                              </span>
                            </button>
                          ))}
                        </div>
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
            </div>

            {/* Bottom Quick Message Input (Message @user) */}
            {!isSelf && onQuickMessage && (
              <form
                onSubmit={handleQuickSend}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#0E0F12] px-2.5 py-1.5 focus-within:border-emerald-500/50"
              >
                <input
                  type="text"
                  dir="auto"
                  value={quickMsg}
                  onChange={(e) => setQuickMsg(e.target.value)}
                  disabled={sendingQuick}
                  placeholder={`Message @${target.username ?? target.displayName}`}
                  className="min-w-0 flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                />
                {quickMsg.trim() && (
                  <button
                    type="submit"
                    disabled={sendingQuick}
                    aria-label="Send quick direct message"
                    className="rounded-md bg-emerald-500 p-1 text-zinc-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" />
                  </button>
                )}
              </form>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
