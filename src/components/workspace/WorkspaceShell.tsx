"use client";

import {
  Copy,
  Hash,
  Headphones,
  KeyRound,
  LogOut,
  Menu,
  Mic,
  MicOff,
  Monitor,
  Pencil,
  PhoneOff,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  User,
  Users,
  UserX,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { ConnectionState } from "livekit-client";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TextChannelView } from "@/components/chat/TextChannelView";
import { Avatar } from "@/components/ui/Avatar";
import {
  type ContextMenuEntry,
  ContextMenuProvider,
  useContextMenu,
} from "@/components/ui/ContextMenu";
import {
  NotificationBell,
  NotificationToasts,
} from "@/components/ui/NotificationCenter";
import {
  type ProfilePopoverTarget,
  UserProfilePopover,
} from "@/components/ui/UserProfilePopover";
import { ConnectionStatusButton } from "@/components/voice/ConnectionStatusPopover";
import { useVoice, VoiceProvider } from "@/components/voice/VoiceProvider";
import { VoiceStage } from "@/components/voice/VoiceStage";
import { ChannelModal } from "@/components/workspace/ChannelModal";
import { InviteModal } from "@/components/workspace/InviteModal";
import { ProfileModal } from "@/components/workspace/ProfileModal";
import { playSound } from "@/lib/sounds";
import type {
  ChannelItem,
  NotificationItem,
  PrivateUser,
  PublicUser,
  VoiceOccupancyMap,
} from "@/lib/types";

interface WorkspaceShellProps {
  initialUser: PrivateUser;
  initialChannels: ChannelItem[];
  initialMembers: PublicUser[];
  initialVoiceOccupancy: VoiceOccupancyMap;
  initialCapabilities: {
    livekitReady: boolean;
    blobReady: boolean;
  };
}

/** Generous 2-minute online window paired with background Web Worker heartbeat */
const ONLINE_WINDOW_MS = 120 * 1000;

function isMemberOnline(
  member: PublicUser,
  currentUserId: string,
  nowMs: number
): boolean {
  if (member.id === currentUserId) return true;
  return nowMs - new Date(member.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

function WorkspaceInner({
  initialUser,
  initialChannels,
  initialMembers,
  initialVoiceOccupancy,
  initialCapabilities,
  onPresenceRef,
}: WorkspaceShellProps & {
  onPresenceRef: React.MutableRefObject<() => void>;
}) {
  const router = useRouter();
  const voice = useVoice();
  const { openMenu } = useContextMenu();

  const [user, setUser] = useState<PrivateUser>(initialUser);
  const [channels, setChannels] = useState<ChannelItem[]>(initialChannels);
  const [members, setMembers] = useState<PublicUser[]>(initialMembers);
  const [voiceOccupancy, setVoiceOccupancy] =
    useState<VoiceOccupancyMap>(initialVoiceOccupancy);
  const [capabilities, setCapabilities] = useState(initialCapabilities);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [selectedChannelId, setSelectedChannelId] = useState<string>(
    initialChannels.find((c) => c.type === "text")?.id ?? initialChannels[0]?.id ?? ""
  );
  const selectedChannelIdRef = useRef(selectedChannelId);
  selectedChannelIdRef.current = selectedChannelId;

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const lastNotifyCheckRef = useRef<string>(new Date().toISOString());

  const [profilePopover, setProfilePopover] = useState<ProfilePopoverTarget | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [channelModalType, setChannelModalType] = useState<"text" | "voice">("text");
  const [editingChannel, setEditingChannel] = useState<ChannelItem | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const syncPresence = useCallback(async () => {
    try {
      const since = lastNotifyCheckRef.current;
      const res = await fetch(`/api/presence?since=${encodeURIComponent(since)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.members) setMembers(data.members);
      if (data.channels) setChannels(data.channels);
      if (data.voiceOccupancy) setVoiceOccupancy(data.voiceOccupancy);
      if (data.capabilities) setCapabilities(data.capabilities);
      if (data.serverTime) {
        lastNotifyCheckRef.current = data.serverTime;
      }
      setNowMs(Date.now());

      const incoming: NotificationItem[] = data.recentNotifications ?? [];
      if (incoming.length > 0) {
        const fresh = incoming.filter((n) => {
          if (seenNotificationIdsRef.current.has(n.id)) return false;
          seenNotificationIdsRef.current.add(n.id);
          // Skip notifications for messages in the channel the user is actively viewing right now
          const viewingSameChannel =
            document.visibilityState === "visible" &&
            n.channelId === selectedChannelIdRef.current;
          return !viewingSameChannel;
        });

        if (fresh.length > 0) {
          playSound("notification");
          setNotifications((prev) => [...fresh.reverse(), ...prev].slice(0, 30));
          setToasts((prev) => [...prev, ...fresh].slice(-3));
        }
      }
    } catch {
      // ignore transient network error
    }
  }, []);

  onPresenceRef.current = () => {
    void syncPresence();
  };

  // Always-online heartbeat: uses an inline Web Worker so browsers never throttle it on Alt+Tab / background tabs
  useEffect(() => {
    let worker: Worker | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;

    try {
      const blob = new Blob(
        [`setInterval(() => postMessage("tick"), 7000);`],
        { type: "application/javascript" }
      );
      const workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);
      worker.onmessage = () => {
        void syncPresence();
      };
      URL.revokeObjectURL(workerUrl);
    } catch {
      fallbackTimer = setInterval(() => {
        void syncPresence();
      }, 7000);
    }

    // Only mark offline when the user actually closes the tab/browser
    function handlePageHide() {
      try {
        navigator.sendBeacon("/api/presence/offline");
      } catch {
        // ignore
      }
    }
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      worker?.terminate();
      if (fallbackTimer) clearInterval(fallbackTimer);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [syncPresence]);

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");
  const activeChannel =
    channels.find((c) => c.id === selectedChannelId) ?? channels[0] ?? null;

  const onlineMembers = members.filter((m) => isMemberOnline(m, user.id, nowMs));
  const offlineMembers = members.filter((m) => !isMemberOnline(m, user.id, nowMs));

  const isVoiceConnected =
    voice.activeChannel !== null &&
    voice.connectionState !== ConnectionState.Disconnected;

  function selectChannel(channelId: string) {
    setSelectedChannelId(channelId);
    setMobileMenuOpen(false);
    // Mark notifications from that channel as read
    setNotifications((prev) =>
      prev.map((n) => (n.channelId === channelId ? { ...n, read: true } : n))
    );
  }

  async function handleSignOut() {
    if (isVoiceConnected) {
      await voice.leaveVoiceChannel();
    }
    try {
      navigator.sendBeacon("/api/presence/offline");
    } catch {
      // ignore
    }
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function handleUserUpdated(updated: PrivateUser) {
    setUser(updated);
    setMembers((prev) =>
      prev.map((m) =>
        m.id === updated.id
          ? {
              ...m,
              displayName: updated.displayName,
              avatarColor: updated.avatarColor,
              avatarUrl: updated.avatarUrl,
            }
          : m
      )
    );
  }

  function openCreateChannel(type: "text" | "voice") {
    setEditingChannel(null);
    setChannelModalType(type);
    setChannelModalOpen(true);
  }

  function openEditChannel(ch: ChannelItem) {
    setEditingChannel(ch);
    setChannelModalType(ch.type);
    setChannelModalOpen(true);
  }

  function handleChannelSaved(saved: ChannelItem, isEdit: boolean) {
    if (isEdit) {
      setChannels((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    } else {
      setChannels((prev) => [...prev, saved]);
      setSelectedChannelId(saved.id);
    }
  }

  async function handleDeleteChannel(ch: ChannelItem) {
    const confirmed = window.confirm(`Delete "${ch.name}"?`);
    if (!confirmed) return;

    const res = await fetch(`/api/channels/${ch.id}`, { method: "DELETE" });
    if (res.ok) {
      if (voice.activeChannel?.id === ch.id) {
        await voice.leaveVoiceChannel();
      }
      setChannels((prev) => {
        const remaining = prev.filter((c) => c.id !== ch.id);
        if (selectedChannelId === ch.id) {
          setSelectedChannelId(remaining[0]?.id ?? "");
        }
        return remaining;
      });
    }
  }

  function findMemberVoiceChannelName(memberId: string): string | null {
    if (
      voice.activeChannel &&
      voice.participants.some((p) => p.identity === memberId)
    ) {
      return voice.activeChannel.name;
    }
    for (const ch of voiceChannels) {
      const occ = voiceOccupancy[ch.slug] ?? [];
      if (occ.some((o) => o.identity === memberId)) {
        return ch.name;
      }
    }
    return null;
  }

  function findMemberVoiceChannelSlug(memberId: string): string | null {
    if (
      voice.activeChannel &&
      voice.participants.some((p) => p.identity === memberId)
    ) {
      return voice.activeChannel.slug;
    }
    for (const ch of voiceChannels) {
      const occ = voiceOccupancy[ch.slug] ?? [];
      if (occ.some((o) => o.identity === memberId)) {
        return ch.slug;
      }
    }
    return null;
  }

  function openUserCard(
    e: React.MouseEvent<HTMLElement>,
    person: {
      id: string;
      displayName: string;
      username?: string;
      avatarColor: string;
      avatarUrl?: string | null;
      role?: "admin" | "member";
      online?: boolean;
    }
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    const matchedMember = members.find((m) => m.id === person.id);
    const isOnline =
      person.online ??
      (matchedMember ? isMemberOnline(matchedMember, user.id, nowMs) : true);

    setProfilePopover({
      id: person.id,
      displayName: person.displayName,
      username: person.username ?? matchedMember?.username,
      avatarColor: person.avatarColor,
      avatarUrl: person.avatarUrl ?? matchedMember?.avatarUrl ?? null,
      role: person.role ?? matchedMember?.role,
      online: isOnline,
      inVoiceChannelName: findMemberVoiceChannelName(person.id),
      anchorRect: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
    });
  }

  function handleUserContextMenu(
    e: React.MouseEvent<HTMLElement>,
    person: {
      id: string;
      displayName: string;
      username?: string;
      avatarColor: string;
      avatarUrl?: string | null;
      role?: "admin" | "member";
    },
    voiceRoomSlug?: string | null
  ) {
    const isSelf = person.id === user.id;
    const roomSlug = voiceRoomSlug ?? findMemberVoiceChannelSlug(person.id);
    const currentVol = voice.userVolumes[person.id] ?? 1;
    const isLocallyMuted = currentVol === 0;
    const rect = e.currentTarget.getBoundingClientRect();
    const matchedMember = members.find((m) => m.id === person.id);

    const entries: ContextMenuEntry[] = [
      { type: "header", id: "u-hdr", label: person.displayName },
      {
        type: "item",
        id: "u-profile",
        label: "View Profile",
        icon: <User className="h-3.5 w-3.5" />,
        onSelect: () => {
          setProfilePopover({
            id: person.id,
            displayName: person.displayName,
            username: person.username ?? matchedMember?.username,
            avatarColor: person.avatarColor,
            avatarUrl: person.avatarUrl ?? matchedMember?.avatarUrl ?? null,
            role: person.role ?? matchedMember?.role,
            online: matchedMember ? isMemberOnline(matchedMember, user.id, nowMs) : true,
            inVoiceChannelName: findMemberVoiceChannelName(person.id),
            anchorRect: {
              top: rect.top,
              left: rect.left,
              right: rect.right,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            },
          });
        },
      },
    ];

    const uname = person.username ?? matchedMember?.username;
    if (uname) {
      entries.push({
        type: "item",
        id: "u-copy",
        label: "Copy Username",
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => {
          void navigator.clipboard.writeText(`@${uname}`);
          playSound("copy");
        },
      });
    }

    if (!isSelf) {
      entries.push(
        { type: "divider", id: "u-d1" },
        {
          type: "slider",
          id: "u-vol",
          label: "User Volume",
          value: currentVol,
          onChange: (v) => voice.setUserVolume(person.id, v),
        },
        {
          type: "item",
          id: "u-local-mute",
          label: isLocallyMuted ? "Unmute for me" : "Mute for me",
          icon: isLocallyMuted ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" />
          ),
          onSelect: () => voice.toggleLocalMuteUser(person.id),
        }
      );

      if (user.role === "admin" && roomSlug) {
        entries.push(
          { type: "divider", id: "u-d-admin" },
          {
            type: "item",
            id: "u-server-mute",
            label: "Server Mute",
            icon: <MicOff className="h-3.5 w-3.5" />,
            onSelect: () => void voice.serverMuteParticipant(person.id, roomSlug),
          },
          {
            type: "item",
            id: "u-kick",
            label: "Kick from Voice",
            icon: <UserX className="h-3.5 w-3.5" />,
            danger: true,
            onSelect: () => void voice.kickParticipant(person.id, roomSlug),
          }
        );
      }
    }

    openMenu(e, entries);
  }

  function handleChannelContextMenu(
    e: React.MouseEvent<HTMLElement>,
    channel: ChannelItem
  ) {
    const canManage = user.role === "admin" || channel.createdById === user.id;
    const entries: ContextMenuEntry[] = [
      {
        type: "header",
        id: "ch-hdr",
        label: channel.type === "text" ? `#${channel.name}` : channel.name,
      },
      channel.type === "voice"
        ? {
            type: "item",
            id: "ch-join",
            label: "Join Voice",
            icon: <Headphones className="h-3.5 w-3.5" />,
            onSelect: () => {
              selectChannel(channel.id);
              void voice.joinVoiceChannel(channel);
            },
          }
        : {
            type: "item",
            id: "ch-open",
            label: "Open Channel",
            icon: <Hash className="h-3.5 w-3.5" />,
            onSelect: () => selectChannel(channel.id),
          },
      {
        type: "item",
        id: "ch-copy",
        label: "Copy Channel Name",
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => {
          void navigator.clipboard.writeText(channel.name);
          playSound("copy");
        },
      },
    ];

    if (canManage) {
      entries.push(
        { type: "divider", id: "ch-d1" },
        {
          type: "item",
          id: "ch-edit",
          label: "Edit Channel",
          icon: <Pencil className="h-3.5 w-3.5" />,
          onSelect: () => openEditChannel(channel),
        },
        {
          type: "item",
          id: "ch-delete",
          label: "Delete Channel",
          icon: <Trash2 className="h-3.5 w-3.5" />,
          danger: true,
          onSelect: () => void handleDeleteChannel(channel),
        }
      );
    }

    openMenu(e, entries);
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#09090B] text-zinc-100 select-none">
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-black/60 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Left Rail */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0E0F12] transition-transform duration-200 md:static md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Workspace Header */}
        <div className="flex h-14 items-center justify-between border-b border-white/[0.07] px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Headphones className="h-3.5 w-3.5" />
            </div>
            <span className="font-mono text-sm font-semibold tracking-tight text-zinc-100">
              siq
            </span>
          </div>

          <div className="flex items-center gap-1">
            {user.role === "admin" && (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                title="Invite friends"
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-emerald-400"
              >
                <KeyRound className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close sidebar"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Channel Lists */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-2.5 py-4" aria-label="Channels">
          {/* Text Channels */}
          <div>
            <div className="mb-1.5 flex items-center justify-between px-2">
              <span className="text-[11px] font-medium text-zinc-500">Text Channels</span>
              <button
                type="button"
                onClick={() => openCreateChannel("text")}
                title="New text channel"
                className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <ul className="space-y-0.5">
              {textChannels.map((channel) => {
                const selected = activeChannel?.id === channel.id;
                const canManage =
                  user.role === "admin" || channel.createdById === user.id;
                const hasUnread = notifications.some(
                  (n) => !n.read && n.channelId === channel.id
                );

                return (
                  <li
                    key={channel.id}
                    onContextMenu={(e) => handleChannelContextMenu(e, channel)}
                    className="group flex items-center gap-1"
                  >
                    <button
                      type="button"
                      onClick={() => selectChannel(channel.id)}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                        selected
                          ? "bg-white/[0.08] font-medium text-zinc-100"
                          : hasUnread
                            ? "font-medium text-zinc-100 hover:bg-white/[0.04]"
                            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      <Hash
                        className={`h-4 w-4 shrink-0 ${
                          selected ? "text-emerald-400" : "text-zinc-500"
                        }`}
                      />
                      <span dir="auto" className="truncate">
                        {channel.name}
                      </span>
                      {hasUnread && !selected && (
                        <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                      )}
                    </button>

                    {canManage && (
                      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                        <button
                          type="button"
                          onClick={() => openEditChannel(channel)}
                          title="Edit channel"
                          className="rounded p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteChannel(channel)}
                          title="Delete channel"
                          className="rounded p-1 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Voice Channels */}
          <div>
            <div className="mb-1.5 flex items-center justify-between px-2">
              <span className="text-[11px] font-medium text-zinc-500">Voice Channels</span>
              <button
                type="button"
                onClick={() => openCreateChannel("voice")}
                title="New voice channel"
                className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <ul className="space-y-1">
              {voiceChannels.map((channel) => {
                const selected = activeChannel?.id === channel.id;
                const isLiveHere =
                  voice.activeChannel?.id === channel.id && isVoiceConnected;
                const canManage =
                  user.role === "admin" || channel.createdById === user.id;

                const occupants = isLiveHere
                  ? voice.participants.map((p) => ({
                      identity: p.identity,
                      name: p.name,
                      username: p.username,
                      avatarColor: p.avatarColor,
                      avatarUrl: p.avatarUrl,
                      role: p.role,
                      isSpeaking: p.isSpeaking,
                      isMuted: p.isMuted,
                      isScreenSharing: p.isScreenSharing,
                    }))
                  : (voiceOccupancy[channel.slug] ?? []).map((o) => ({
                      identity: o.identity,
                      name: o.name,
                      username: o.username,
                      avatarColor: o.avatarColor,
                      avatarUrl: o.avatarUrl ?? null,
                      role: undefined,
                      isSpeaking: false,
                      isMuted: false,
                      isScreenSharing: false,
                    }));

                return (
                  <li key={channel.id} className="space-y-0.5">
                    <div
                      onContextMenu={(e) => handleChannelContextMenu(e, channel)}
                      className="group flex items-center gap-1"
                    >
                      <button
                        type="button"
                        onClick={() => selectChannel(channel.id)}
                        onDoubleClick={() => {
                          selectChannel(channel.id);
                          void voice.joinVoiceChannel(channel);
                        }}
                        title="Double-click to join voice"
                        className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                          selected
                            ? "bg-white/[0.08] font-medium text-zinc-100"
                            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                        }`}
                      >
                        <Volume2
                          className={`h-4 w-4 shrink-0 ${
                            isLiveHere
                              ? "text-emerald-400"
                              : selected
                                ? "text-zinc-200"
                                : "text-zinc-500"
                          }`}
                        />
                        <span dir="auto" className="truncate">
                          {channel.name}
                        </span>
                        {occupants.length > 0 && (
                          <span className="ml-auto font-mono text-[10px] text-zinc-500">
                            {occupants.length}
                          </span>
                        )}
                      </button>

                      {canManage && (
                        <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                          <button
                            type="button"
                            onClick={() => openEditChannel(channel)}
                            title="Edit channel"
                            className="rounded p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteChannel(channel)}
                            title="Delete channel"
                            className="rounded p-1 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {occupants.length > 0 && (
                      <ul className="space-y-0.5 pl-5 pr-1 pt-0.5">
                        {occupants.map((occ) => (
                          <li key={occ.identity}>
                            <button
                              type="button"
                              onClick={(e) =>
                                openUserCard(e, {
                                  id: occ.identity,
                                  displayName: occ.name,
                                  username: occ.username,
                                  avatarColor: occ.avatarColor,
                                  avatarUrl: occ.avatarUrl,
                                  role: occ.role,
                                  online: true,
                                })
                              }
                              onContextMenu={(e) =>
                                handleUserContextMenu(
                                  e,
                                  {
                                    id: occ.identity,
                                    displayName: occ.name,
                                    username: occ.username,
                                    avatarColor: occ.avatarColor,
                                    avatarUrl: occ.avatarUrl,
                                    role: occ.role,
                                  },
                                  channel.slug
                                )
                              }
                              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-zinc-300 transition-colors hover:bg-white/[0.05]"
                            >
                              <div
                                className={`rounded-full transition-shadow ${
                                  occ.isSpeaking ? "ring-2 ring-emerald-400" : ""
                                }`}
                              >
                                <Avatar
                                  name={occ.name}
                                  color={occ.avatarColor}
                                  avatarUrl={occ.avatarUrl}
                                  size="xs"
                                />
                              </div>
                              <span dir="auto" className="min-w-0 flex-1 truncate text-xs">
                                {occ.name}
                              </span>
                              {occ.isScreenSharing && (
                                <span className="rounded bg-emerald-500/15 px-1 py-0.5 font-mono text-[9px] font-semibold text-emerald-300">
                                  LIVE
                                </span>
                              )}
                              {occ.isMuted && (
                                <MicOff className="h-3 w-3 shrink-0 text-rose-400" />
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        {/* Active Voice Connection Dock with Live Ping Signal Button */}
        <AnimatePresence>
          {isVoiceConnected && voice.activeChannel && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="border-t border-white/[0.07] bg-[#111317] px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <ConnectionStatusButton stats={voice.networkStats} />

                  <button
                    type="button"
                    onClick={() => selectChannel(voice.activeChannel!.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="font-mono text-[11px] font-semibold text-emerald-400">
                      {voice.connectionState === ConnectionState.Connecting
                        ? "Connecting..."
                        : "Voice Connected"}
                    </p>
                    <p dir="auto" className="truncate text-xs font-medium text-zinc-300">
                      {voice.activeChannel.name}
                    </p>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void voice.leaveVoiceChannel()}
                  title="Disconnect"
                  className="rounded-lg p-1.5 text-rose-400 transition-colors hover:bg-rose-500/15"
                >
                  <PhoneOff className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => void voice.toggleMute()}
                  title={voice.isMuted ? "Unmute" : "Mute"}
                  className={`flex items-center justify-center rounded-md py-1.5 text-xs transition-colors ${
                    voice.isMuted
                      ? "bg-rose-500/15 text-rose-300"
                      : "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09]"
                  }`}
                >
                  {voice.isMuted ? (
                    <MicOff className="h-3.5 w-3.5" />
                  ) : (
                    <Mic className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void voice.toggleDeafen()}
                  title={voice.isDeafened ? "Undeafen" : "Deafen"}
                  className={`flex items-center justify-center rounded-md py-1.5 text-xs transition-colors ${
                    voice.isDeafened
                      ? "bg-rose-500/15 text-rose-300"
                      : "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09]"
                  }`}
                >
                  {voice.isDeafened ? (
                    <VolumeX className="h-3.5 w-3.5" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void voice.toggleScreenShare()}
                  title={voice.isScreenSharing ? "Stop share" : "Share screen"}
                  className={`flex items-center justify-center rounded-md py-1.5 text-xs transition-colors ${
                    voice.isScreenSharing
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09]"
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Profile Dock */}
        <div className="border-t border-white/[0.07] bg-[#0B0C0E] p-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-white/[0.05]"
            >
              <Avatar
                name={user.displayName}
                color={user.avatarColor}
                avatarUrl={user.avatarUrl}
                size="md"
                online
              />
              <div className="min-w-0">
                <p dir="auto" className="truncate text-xs font-medium text-zinc-100">
                  {user.displayName}
                </p>
                <p className="truncate font-mono text-[11px] text-zinc-500">
                  @{user.username}
                </p>
              </div>
            </button>

            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                title="Profile & audio settings"
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                title="Sign out"
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#121316]">
        {/* Top Channel Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open channels menu"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] md:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>

            {activeChannel && (
              <>
                {activeChannel.type === "text" ? (
                  <Hash className="h-4 w-4 shrink-0 text-zinc-500" />
                ) : (
                  <Volume2 className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
                <h1 dir="auto" className="truncate text-sm font-semibold text-zinc-100">
                  {activeChannel.name}
                </h1>
                {activeChannel.description && (
                  <span
                    dir="auto"
                    className="hidden truncate border-l border-white/[0.08] pl-3 text-xs text-zinc-500 sm:inline"
                  >
                    {activeChannel.description}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {user.role === "admin" && (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>Invites</span>
              </button>
            )}

            <NotificationBell
              notifications={notifications}
              onSelectChannel={(id) => selectChannel(id)}
              onMarkAllRead={() =>
                setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
              }
            />
          </div>
        </header>

        {/* Active Channel View + Right Members Rail */}
        <div className="flex min-h-0 flex-1 select-text">
          {activeChannel ? (
            activeChannel.type === "text" ? (
              <TextChannelView
                channel={activeChannel}
                currentUser={user}
                blobReady={capabilities.blobReady}
                onOpenUserProfile={setProfilePopover}
              />
            ) : (
              <VoiceStage
                channel={activeChannel}
                currentUser={user}
                livekitReady={capabilities.livekitReady}
                previewOccupants={voiceOccupancy[activeChannel.slug] ?? []}
                onOpenUserProfile={setProfilePopover}
              />
            )
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
              <p className="text-sm text-zinc-400">No channels yet.</p>
              <button
                type="button"
                onClick={() => openCreateChannel("text")}
                className="mt-3 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950"
              >
                Create your first channel
              </button>
            </div>
          )}

          {/* Right Members Rail */}
          <aside className="hidden w-56 shrink-0 flex-col border-l border-white/[0.07] bg-[#0E0F12] p-4 select-none lg:flex">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                <Users className="h-3.5 w-3.5" />
                <span>Members</span>
              </div>
              <span className="font-mono text-[11px] text-zinc-500">
                {onlineMembers.length}/{members.length}
              </span>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto">
              <div>
                <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Online · {onlineMembers.length}
                </p>
                <ul className="space-y-0.5">
                  {onlineMembers.map((member) => (
                    <li key={member.id}>
                      <button
                        type="button"
                        onClick={(e) =>
                          openUserCard(e, {
                            id: member.id,
                            displayName: member.displayName,
                            username: member.username,
                            avatarColor: member.avatarColor,
                            avatarUrl: member.avatarUrl,
                            role: member.role,
                            online: true,
                          })
                        }
                        onContextMenu={(e) =>
                          handleUserContextMenu(e, {
                            id: member.id,
                            displayName: member.displayName,
                            username: member.username,
                            avatarColor: member.avatarColor,
                            avatarUrl: member.avatarUrl,
                            role: member.role,
                          })
                        }
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.05]"
                      >
                        <Avatar
                          name={member.displayName}
                          color={member.avatarColor}
                          avatarUrl={member.avatarUrl}
                          size="sm"
                          online
                        />
                        <div className="min-w-0 flex-1">
                          <p dir="auto" className="truncate font-medium text-zinc-200">
                            {member.displayName}
                          </p>
                          <p className="truncate font-mono text-[10px] text-zinc-500">
                            {member.role === "admin" ? "admin" : `@${member.username}`}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {offlineMembers.length > 0 && (
                <div>
                  <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Offline · {offlineMembers.length}
                  </p>
                  <ul className="space-y-0.5">
                    {offlineMembers.map((member) => (
                      <li key={member.id}>
                        <button
                          type="button"
                          onClick={(e) =>
                            openUserCard(e, {
                              id: member.id,
                              displayName: member.displayName,
                              username: member.username,
                              avatarColor: member.avatarColor,
                              avatarUrl: member.avatarUrl,
                              role: member.role,
                              online: false,
                            })
                          }
                          onContextMenu={(e) =>
                            handleUserContextMenu(e, {
                              id: member.id,
                              displayName: member.displayName,
                              username: member.username,
                              avatarColor: member.avatarColor,
                              avatarUrl: member.avatarUrl,
                              role: member.role,
                            })
                          }
                          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs opacity-55 transition-all hover:bg-white/[0.04] hover:opacity-90"
                        >
                          <Avatar
                            name={member.displayName}
                            color={member.avatarColor}
                            avatarUrl={member.avatarUrl}
                            size="sm"
                            online={false}
                          />
                          <div className="min-w-0 flex-1">
                            <p dir="auto" className="truncate font-medium text-zinc-300">
                              {member.displayName}
                            </p>
                            <p className="truncate font-mono text-[10px] text-zinc-500">
                              @{member.username}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Modals, Popovers & Toast Stack */}
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <ProfileModal
        open={profileOpen}
        user={user}
        blobReady={capabilities.blobReady}
        onClose={() => setProfileOpen(false)}
        onUpdated={handleUserUpdated}
      />
      <ChannelModal
        open={channelModalOpen}
        defaultType={channelModalType}
        editingChannel={editingChannel}
        onClose={() => setChannelModalOpen(false)}
        onSaved={handleChannelSaved}
      />
      <UserProfilePopover
        target={profilePopover}
        onClose={() => setProfilePopover(null)}
      />
      <NotificationToasts
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        onOpenChannel={(channelId, toastId) => {
          selectChannel(channelId);
          setToasts((prev) => prev.filter((t) => t.id !== toastId));
        }}
      />
    </div>
  );
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  const [presenceRef] = useState<{ current: () => void }>(() => ({
    current: () => {},
  }));

  const buildFallbackMenu = useCallback((): ContextMenuEntry[] => {
    return [
      {
        type: "item",
        id: "global-refresh",
        label: "Sync workspace",
        icon: <RefreshCw className="h-3.5 w-3.5" />,
        onSelect: () => presenceRef.current(),
      },
    ];
  }, [presenceRef]);

  return (
    <MotionConfig reducedMotion="user">
      <ContextMenuProvider fallbackEntries={buildFallbackMenu}>
        <VoiceProvider onOccupancyChanged={() => presenceRef.current()}>
          <WorkspaceInner {...props} onPresenceRef={presenceRef} />
        </VoiceProvider>
      </ContextMenuProvider>
    </MotionConfig>
  );
}
