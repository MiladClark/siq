"use client";

import { apiFetch } from "@/lib/client-api";
import {
  Check,
  Gamepad2,
  MessageSquare,
  Monitor,
  MoreVertical,
  Phone,
  Search,
  UserMinus,
  UserPlus,
  Users,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Avatar, resolveDisplayStatus } from "@siq/shared/components/ui/Avatar";
import { useSystemNotify } from "@siq/shared/components/ui/NotificationCenter";
import type { ProfilePopoverTarget } from "@siq/shared/components/ui/UserProfilePopover";
import type { FriendItem, PublicUser } from "@siq/shared/lib/types";

export type FriendsTab = "online" | "all" | "pending" | "add";

interface FriendsHubViewProps {
  currentUser: PublicUser;
  friends: FriendItem[];
  allMembers: PublicUser[];
  onlineMemberIds: Set<string>;
  activeTab: FriendsTab;
  getUserVoiceActivity: (userId: string) => {
    inVoice: boolean;
    channelName?: string;
    isScreenSharing: boolean;
  };
  onFriendsChanged: () => void;
  onStartDm: (targetUserId: string) => void;
  onStartDmCall: (targetUserId: string, withVideo: boolean) => void;
  onOpenUserProfile: (target: ProfilePopoverTarget) => void;
}

export function FriendsHubView({
  currentUser,
  friends,
  allMembers,
  onlineMemberIds,
  activeTab,
  getUserVoiceActivity,
  onFriendsChanged,
  onStartDm,
  onStartDmCall,
  onOpenUserProfile,
}: FriendsHubViewProps) {
  const notify = useSystemNotify();
  const [filter, setFilter] = useState("");
  const [addUsername, setAddUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenuId]);

  const acceptedFriends = friends.filter((f) => f.direction === "friend");
  const onlineFriends = acceptedFriends.filter((f) => onlineMemberIds.has(f.user.id));
  const pendingItems = friends.filter(
    (f) => f.direction === "incoming" || f.direction === "outgoing"
  );

  const normalizedFilter = filter.trim().toLowerCase();
  const visibleFriends = (activeTab === "online" ? onlineFriends : acceptedFriends).filter(
    (f) =>
      !normalizedFilter ||
      f.user.displayName.toLowerCase().includes(normalizedFilter) ||
      f.user.username.toLowerCase().includes(normalizedFilter)
  );

  const visiblePending = pendingItems.filter(
    (f) =>
      !normalizedFilter ||
      f.user.displayName.toLowerCase().includes(normalizedFilter) ||
      f.user.username.toLowerCase().includes(normalizedFilter)
  );

  const friendOrPendingUserIds = new Set(friends.map((f) => f.user.id));
  const suggestedPeople = allMembers
    .filter((m) => m.id !== currentUser.id && !friendOrPendingUserIds.has(m.id))
    .slice(0, 8);

  async function sendFriendRequest(usernameToAdd: string) {
    const clean = usernameToAdd.trim().replace(/^@+/, "");
    if (!clean || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify({
          kind: "error",
          title: "Friend Request",
          message: data.error ?? "Could not send friend request.",
          source: "Friends",
        });
        return;
      }
      setAddUsername("");
      notify({
        kind: "success",
        title: data.autoAccepted ? "Friend Added" : "Request Sent",
        message: data.autoAccepted
          ? `You and ${data.friend?.user?.displayName ?? clean} are now friends.`
          : `Friend request sent to @${clean}.`,
        source: "Friends",
      });
      onFriendsChanged();
    } catch {
      notify({
        kind: "error",
        title: "Friend Request",
        message: "Network error sending request.",
        source: "Friends",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFriendAction(
    friendshipId: string,
    action: "accept" | "decline" | "remove"
  ) {
    try {
      const res =
        action === "remove"
          ? await apiFetch(`/api/friends/${friendshipId}`, { method: "DELETE" })
          : await apiFetch(`/api/friends/${friendshipId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notify({
          kind: "error",
          title: "Friends",
          message: data.error ?? "Action failed.",
          source: "Friends",
        });
        return;
      }
      setOpenMenuId(null);
      if (action === "accept") {
        notify({
          kind: "success",
          title: "Friend Accepted",
          message: "You are now friends.",
          source: "Friends",
        });
      }
      onFriendsChanged();
    } catch {
      notify({
        kind: "error",
        title: "Friends",
        message: "Network error updating friendship.",
        source: "Friends",
      });
    }
  }

  function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    void sendFriendRequest(addUsername);
  }

  if (activeTab === "add") {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Add Friend</h2>
            <p className="mt-1 text-xs text-zinc-400">
              You can add friends with their <span className="text-zinc-200">@username</span>.
            </p>

            <form
              onSubmit={handleAddSubmit}
              className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.1] bg-[#0E0F12] p-2 transition-colors focus-within:border-emerald-500/50"
            >
              <input
                type="text"
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
                placeholder="Enter a username (e.g. reza)"
                className="flex-1 bg-transparent px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={submitting || !addUsername.trim()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>{submitting ? "Sending..." : "Send Friend Request"}</span>
              </button>
            </form>
          </div>

          {suggestedPeople.length > 0 && (
            <div className="border-t border-white/[0.07] pt-6">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                People in your servers
              </p>
              <div className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.07] bg-[#0E0F12]">
                {suggestedPeople.map((person) => {
                  const isOnline = onlineMemberIds.has(person.id);
                  return (
                    <div
                      key={person.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar
                          name={person.displayName}
                          color={person.avatarColor}
                          avatarUrl={person.avatarUrl}
                          size="md"
                          status={resolveDisplayStatus(isOnline, person.presenceStatus)}
                        />
                        <div className="min-w-0">
                          <p dir="auto" className="truncate text-sm font-medium text-zinc-100">
                            {person.displayName}
                          </p>
                          <p className="truncate text-xs text-zinc-500">@{person.username}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void sendFriendRequest(person.username)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-500/45 hover:text-emerald-300"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search Bar */}
      <div className="border-b border-white/[0.06] px-5 py-3.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            dir="auto"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search friends..."
            className="w-full rounded-lg border border-white/[0.08] bg-[#0E0F12] py-2 pl-9 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Friend / Pending List */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {activeTab === "pending" ? (
          <>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 tabular-nums">
              Pending — {visiblePending.length}
            </p>
            {visiblePending.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#18191E] text-zinc-500">
                  <Users className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-medium text-zinc-300">
                  No pending friend requests
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Incoming and outgoing friend requests will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {visiblePending.map((item) => {
                  const isOnline = onlineMemberIds.has(item.user.id);
                  return (
                    <div
                      key={item.friendshipId}
                      className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-white/[0.03]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar
                          name={item.user.displayName}
                          color={item.user.avatarColor}
                          avatarUrl={item.user.avatarUrl}
                          size="md"
                          status={resolveDisplayStatus(isOnline, item.user.presenceStatus)}
                          ringClassName="ring-[#121316]"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              dir="auto"
                              className="truncate text-sm font-semibold text-zinc-100"
                            >
                              {item.user.displayName}
                            </span>
                            <span className="truncate text-xs text-zinc-500">
                              @{item.user.username}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400">
                            {item.direction === "incoming"
                              ? "Incoming Friend Request"
                              : "Outgoing Friend Request"}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {item.direction === "incoming" && (
                          <button
                            type="button"
                            onClick={() => void handleFriendAction(item.friendshipId, "accept")}
                            title="Accept"
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 transition-colors hover:bg-emerald-500 hover:text-zinc-950"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleFriendAction(item.friendshipId, "decline")}
                          title={item.direction === "incoming" ? "Decline" : "Cancel request"}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-[#18191E] text-zinc-400 transition-colors hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 tabular-nums">
              {activeTab === "online" ? "Online" : "All Friends"} — {visibleFriends.length}
            </p>
            {visibleFriends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#18191E] text-zinc-500">
                  <Users className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-medium text-zinc-300">
                  {activeTab === "online" ? "No friends online right now" : "No friends added yet"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Click Add Friend above to connect by @username.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {visibleFriends.map((item) => {
                  const isOnline = onlineMemberIds.has(item.user.id);
                  const status = resolveDisplayStatus(isOnline, item.user.presenceStatus);
                  const voiceAct = getUserVoiceActivity(item.user.id);
                  const menuOpen = openMenuId === item.friendshipId;

                  return (
                    <div
                      key={item.friendshipId}
                      onClick={() => onStartDm(item.user.id)}
                      className="group relative flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            onOpenUserProfile({
                              id: item.user.id,
                              displayName: item.user.displayName,
                              username: item.user.username,
                              avatarColor: item.user.avatarColor,
                              avatarUrl: item.user.avatarUrl,
                              bannerUrl: item.user.bannerUrl,
                              bio: item.user.bio,
                              customActivity: item.user.customActivity,
                              createdAt: item.user.createdAt,
                              role: item.user.role,
                              online: isOnline,
                              status,
                              anchorRect: {
                                top: rect.top,
                                left: rect.left,
                                right: rect.right,
                                bottom: rect.bottom,
                                width: rect.width,
                                height: rect.height,
                              },
                            });
                          }}
                          className="inline-flex rounded-full focus:outline-none"
                        >
                          <Avatar
                            name={item.user.displayName}
                            color={item.user.avatarColor}
                            avatarUrl={item.user.avatarUrl}
                            size="md"
                            status={status}
                            ringClassName="ring-[#121316]"
                          />
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              dir="auto"
                              className="truncate text-sm font-semibold text-zinc-100"
                            >
                              {item.user.displayName}
                            </span>
                            <span className="hidden truncate text-xs text-zinc-500 group-hover:inline">
                              @{item.user.username}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
                            {voiceAct.isScreenSharing ? (
                              <>
                                <Monitor className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                <span className="truncate text-emerald-300">
                                  Sharing their screen
                                </span>
                              </>
                            ) : voiceAct.inVoice ? (
                              <>
                                <Volume2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                <span className="truncate text-emerald-300">
                                  In voice{voiceAct.channelName ? ` · ${voiceAct.channelName}` : ""}
                                </span>
                              </>
                            ) : item.user.customActivity ? (
                              <>
                                <Gamepad2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                <span dir="auto" className="truncate">
                                  {item.user.customActivity}
                                </span>
                              </>
                            ) : (
                              <span>
                                {status === "online"
                                  ? "Online"
                                  : status === "idle"
                                    ? "Idle"
                                    : status === "dnd"
                                      ? "Do Not Disturb"
                                      : "Offline"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div
                        className="relative flex shrink-0 items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onStartDm(item.user.id)}
                          title="Message"
                          aria-label={`Message ${item.user.displayName}`}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-[#18191E] text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>

                        <div ref={menuOpen ? menuRef : null} className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenMenuId((curr) =>
                                curr === item.friendshipId ? null : item.friendshipId
                              )
                            }
                            title="More actions"
                            aria-label="More friend actions"
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-[#18191E] text-zinc-300 transition-colors hover:border-white/[0.18] hover:text-white"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>

                          <AnimatePresence>
                            {menuOpen && (
                              <motion.div
                                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                                transition={{ duration: 0.13 }}
                                className="absolute right-0 top-10 z-40 w-48 rounded-xl border border-white/[0.1] bg-[#14151A] p-1.5 shadow-2xl shadow-black/80"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    onStartDmCall(item.user.id, true);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.07]"
                                >
                                  <Video className="h-3.5 w-3.5 text-zinc-400" />
                                  <span>Start Video Call</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    onStartDmCall(item.user.id, false);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.07]"
                                >
                                  <Phone className="h-3.5 w-3.5 text-zinc-400" />
                                  <span>Start Voice Call</span>
                                </button>
                                <div className="my-1 h-px bg-white/[0.07]" />
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleFriendAction(item.friendshipId, "remove")
                                  }
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                                >
                                  <UserMinus className="h-3.5 w-3.5" />
                                  <span>Remove Friend</span>
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
