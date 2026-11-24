"use client";

import {
  ChevronDown,
  ChevronRight,
  Copy,
  FolderPlus,
  Gamepad2,
  Hash,
  Headphones,
  KeyRound,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  PanelRight,
  Pencil,
  Phone,
  PhoneOff,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Trash2,
  User,
  UserPlus,
  Users,
  UserX,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { ConnectionState } from "livekit-client";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChannelHeaderTools } from "@/components/chat/ChannelHeaderTools";
import { TextChannelView } from "@/components/chat/TextChannelView";
import { ActiveNowRail } from "@/components/dm/ActiveNowRail";
import { DmConversationView } from "@/components/dm/DmConversationView";
import {
  type ActiveChatSearchContext,
  type CommandQuickAction,
  FindConversationModal,
  type SearchCategory,
} from "@/components/dm/FindConversationModal";
import { FriendsHubView, type FriendsTab } from "@/components/dm/FriendsHubView";
import { AnimatedIconButton } from "@/components/ui/AnimatedIcon";
import {
  MicIcon,
  MicOffIcon,
  PhoneIcon,
  PhoneOffIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
} from "@/components/ui/animated-icons";
import { Avatar, resolveDisplayStatus } from "@/components/ui/Avatar";
import { BarVisualizer } from "@/components/ui/BarVisualizer";
import {
  type ContextMenuEntry,
  ContextMenuProvider,
  useContextMenu,
} from "@/components/ui/ContextMenu";
import { SlidingNumber } from "@/components/ui/MotionPrimitives";
import {
  NotificationBell,
  NotificationToasts,
  type SystemNotifyPayload,
  SystemNotifyProvider,
} from "@/components/ui/NotificationCenter";
import {
  type ProfilePopoverTarget,
  UserProfilePopover,
} from "@/components/ui/UserProfilePopover";
import { VoiceDynamicIsland } from "@/components/ui/VoiceDynamicIsland";
import { ConnectionStatusButton } from "@/components/voice/ConnectionStatusPopover";
import { ScreenShareModal } from "@/components/voice/ScreenShareModal";
import {
  StreamPreviewPopover,
  type StreamPreviewTarget,
} from "@/components/voice/StreamPreviewPopover";
import { useVoice, VoiceProvider } from "@/components/voice/VoiceProvider";
import { VoiceStage } from "@/components/voice/VoiceStage";
import { CategoryModal } from "@/components/workspace/CategoryModal";
import { ChannelModal } from "@/components/workspace/ChannelModal";
import { InviteModal } from "@/components/workspace/InviteModal";
import { ServerCreateJoinModal } from "@/components/workspace/ServerCreateJoinModal";
import { ServerRail } from "@/components/workspace/ServerRail";
import {
  ServerSettingsModal,
  type ServerSettingsTab,
} from "@/components/workspace/ServerSettingsModal";
import {
  SettingsModal,
  type SettingsTab,
} from "@/components/workspace/SettingsModal";
import { StatusPickerPopover } from "@/components/workspace/StatusPickerPopover";
import {
  canUserAccessChannel,
  computeEffectivePermissions,
  EMPTY_PERMISSIONS,
  getMemberRolesInServer,
} from "@/lib/permissions";
import {
  applyAppearancePreferences,
  type AppPreferences,
  DEFAULT_APP_PREFERENCES,
  loadAppPreferences,
  saveAppPreferences,
} from "@/lib/preferences";
import { playSound } from "@/lib/sounds";
import type {
  CategoryItem,
  ChannelItem,
  DmConversationItem,
  FriendItem,
  NotificationItem,
  PrivateUser,
  PublicUser,
  ServerDetail,
  VoiceOccupancyMap,
  VoiceRoomCreatedAtMap,
} from "@/lib/types";

interface WorkspaceShellProps {
  initialUser: PrivateUser;
  initialServers: ServerDetail[];
  initialFriends: FriendItem[];
  initialDmConversations: DmConversationItem[];
  initialMembers: PublicUser[];
  initialVoiceOccupancy: VoiceOccupancyMap;
  initialVoiceRoomCreatedAt: VoiceRoomCreatedAtMap;
  initialCapabilities: {
    livekitReady: boolean;
    blobReady: boolean;
  };
}

const ONLINE_WINDOW_MS = 120 * 1000;

function formatVoiceTimer(elapsedMs: number): string {
  const totalSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hrs > 0
    ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}`
    : `${pad(mins)}:${pad(secs)}`;
}

function isMemberOnline(
  member: PublicUser,
  currentUserId: string,
  nowMs: number
): boolean {
  if (member.presenceStatus === "invisible") return false;
  if (member.id === currentUserId) return true;
  return nowMs - new Date(member.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

function pickInitialChannelId(server: ServerDetail | undefined, userId: string): string {
  if (!server) return "";
  const assigned = server.memberRoleIds[userId] ?? [];
  const perms = computeEffectivePermissions({
    userId,
    ownerId: server.ownerId,
    serverRoles: server.roles,
    assignedRoleIds: assigned,
  });
  const accessible = server.channels.filter((ch) =>
    canUserAccessChannel({ channel: ch, permissions: perms, assignedRoleIds: assigned })
  );
  return (
    accessible.find((c) => c.type === "text")?.id ??
    accessible[0]?.id ??
    ""
  );
}

function WorkspaceInner({
  initialUser,
  initialServers,
  initialFriends,
  initialDmConversations,
  initialMembers,
  initialVoiceOccupancy,
  initialVoiceRoomCreatedAt,
  initialCapabilities,
  onPresenceRef,
  onNotifyRef,
}: WorkspaceShellProps & {
  onPresenceRef: React.MutableRefObject<() => void>;
  onNotifyRef: React.MutableRefObject<(payload: SystemNotifyPayload) => void>;
}) {
  const router = useRouter();
  const voice = useVoice();
  const { openMenu } = useContextMenu();

  const [user, setUser] = useState<PrivateUser>(initialUser);
  const [servers, setServers] = useState<ServerDetail[]>(initialServers);
  const [friends, setFriends] = useState<FriendItem[]>(initialFriends);
  const [dmConversations, setDmConversations] =
    useState<DmConversationItem[]>(initialDmConversations);
  const [members, setMembers] = useState<PublicUser[]>(initialMembers);
  const [voiceOccupancy, setVoiceOccupancy] =
    useState<VoiceOccupancyMap>(initialVoiceOccupancy);
  const [voiceRoomCreatedAt, setVoiceRoomCreatedAt] = useState<VoiceRoomCreatedAtMap>(
    initialVoiceRoomCreatedAt
  );
  const [capabilities, setCapabilities] = useState(initialCapabilities);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [timerNowMs, setTimerNowMs] = useState<number>(() => Date.now());
  const [appPrefs, setAppPrefs] = useState<AppPreferences>(DEFAULT_APP_PREFERENCES);

  const appPrefsRef = useRef(appPrefs);
  appPrefsRef.current = appPrefs;

  useEffect(() => {
    const loaded = loadAppPreferences();
    setAppPrefs(loaded);
    applyAppearancePreferences(loaded);
  }, []);

  const updateAppPrefs = useCallback((patch: Partial<AppPreferences>) => {
    setAppPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveAppPreferences(next);
      return next;
    });
  }, []);

  // Navigation state: Home (Friends / DMs) vs Server
  const [viewMode, setViewMode] = useState<"home" | "server">(
    initialServers.length > 0 ? "server" : "home"
  );
  const [activeServerId, setActiveServerId] = useState<string | null>(
    initialServers[0]?.id ?? null
  );
  const [selectedChannelId, setSelectedChannelId] = useState<string>(() =>
    pickInitialChannelId(initialServers[0], initialUser.id)
  );
  const [homeView, setHomeView] = useState<"friends" | "dm">("friends");
  const [friendsTab, setFriendsTab] = useState<FriendsTab>("online");
  const [activeDmId, setActiveDmId] = useState<string | null>(null);
  const [showDmProfileSidebar, setShowDmProfileSidebar] = useState(true);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Refs for presence/notification deduplication
  const navStateRef = useRef({
    viewMode,
    selectedChannelId,
    homeView,
    activeDmId,
  });
  navStateRef.current = { viewMode, selectedChannelId, homeView, activeDmId };

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const recentSystemAlertRef = useRef<{ key: string; at: number } | null>(null);
  const readWatermarkRef = useRef<Map<string, number>>(new Map());
  const lastNotifyCheckRef = useRef<string>(new Date().toISOString());
  const pendingVoiceMoveRef = useRef<{
    userId: string;
    targetSlug: string | null;
    leftSlug: string | null;
    until: number;
  } | null>(null);

  // Popovers & Modals
  const [profilePopover, setProfilePopover] = useState<ProfilePopoverTarget | null>(null);
  const [streamPreview, setStreamPreview] = useState<StreamPreviewTarget | null>(null);
  const streamPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [serverDropdownOpen, setServerDropdownOpen] = useState(false);
  const serverDropdownRef = useRef<HTMLDivElement | null>(null);

  const [jumpTarget, setJumpTarget] = useState<{ messageId: string; nonce: number } | null>(
    null
  );
  const [unpinnedEvent, setUnpinnedEvent] = useState<{
    messageId: string;
    nonce: number;
  } | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteServer, setInviteServer] = useState<{ id: string; name: string } | null>(
    null
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("account");
  const [screenShareModalOpen, setScreenShareModalOpen] = useState(false);
  const [isStageMaximized, setIsStageMaximized] = useState(false);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [channelModalType, setChannelModalType] = useState<"text" | "voice">("text");
  const [channelModalCategoryId, setChannelModalCategoryId] = useState<string | null>(null);
  const [editingChannel, setEditingChannel] = useState<ChannelItem | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [serverCreateJoinOpen, setServerCreateJoinOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [serverSettingsTab, setServerSettingsTab] =
    useState<ServerSettingsTab>("overview");
  const [findConvOpen, setFindConvOpen] = useState(false);
  const [findConvCategory, setFindConvCategory] = useState<SearchCategory>("all");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const openSmartSearch = useCallback((initialCategory: SearchCategory = "all") => {
    setFindConvCategory(initialCategory);
    setFindConvOpen(true);
  }, []);

  // Derived active server, permissions & accessible channels
  const activeServer = useMemo(
    () => servers.find((s) => s.id === activeServerId) ?? servers[0] ?? null,
    [servers, activeServerId]
  );

  const myAssignedRoleIds = useMemo(
    () => (activeServer ? (activeServer.memberRoleIds[user.id] ?? []) : []),
    [activeServer, user.id]
  );

  const myServerPermissions = useMemo(() => {
    if (!activeServer) return EMPTY_PERMISSIONS;
    return computeEffectivePermissions({
      userId: user.id,
      ownerId: activeServer.ownerId,
      serverRoles: activeServer.roles,
      assignedRoleIds: myAssignedRoleIds,
    });
  }, [activeServer, myAssignedRoleIds, user.id]);

  const accessibleServerChannels = useMemo(() => {
    if (!activeServer) return [];
    return activeServer.channels.filter((ch) =>
      canUserAccessChannel({
        channel: ch,
        permissions: myServerPermissions,
        assignedRoleIds: myAssignedRoleIds,
      })
    );
  }, [activeServer, myServerPermissions, myAssignedRoleIds]);

  const allVoiceChannels = useMemo(
    () =>
      servers.flatMap((s) =>
        s.channels
          .filter((c) => c.type === "voice")
          .map((channel) => ({ server: s, channel }))
      ),
    [servers]
  );

  const activeChannel = useMemo(
    () =>
      accessibleServerChannels.find((c) => c.id === selectedChannelId) ??
      accessibleServerChannels[0] ??
      null,
    [accessibleServerChannels, selectedChannelId]
  );

  const activeDm = useMemo(
    () => dmConversations.find((d) => d.id === activeDmId) ?? null,
    [dmConversations, activeDmId]
  );

  const onlineMemberIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) {
      if (isMemberOnline(m, user.id, nowMs)) set.add(m.id);
    }
    return set;
  }, [members, user.id, nowMs]);

  const activeServerMembers = useMemo(() => {
    if (!activeServer) return members;
    const idSet = new Set(activeServer.memberIds);
    return members.filter((m) => idSet.has(m.id));
  }, [activeServer, members]);

  const onlineServerMembers = useMemo(
    () => activeServerMembers.filter((m) => onlineMemberIds.has(m.id)),
    [activeServerMembers, onlineMemberIds]
  );

  const offlineServerMembers = useMemo(
    () => activeServerMembers.filter((m) => !onlineMemberIds.has(m.id)),
    [activeServerMembers, onlineMemberIds]
  );

  const isVoiceConnected =
    voice.activeChannel !== null &&
    voice.connectionState !== ConnectionState.Disconnected;

  // Close server dropdown on outside click
  useEffect(() => {
    if (!serverDropdownOpen) return;
    function onDown(e: MouseEvent) {
      if (
        serverDropdownRef.current &&
        !serverDropdownRef.current.contains(e.target as Node)
      ) {
        setServerDropdownOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setServerDropdownOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [serverDropdownOpen]);

  // Ctrl+K / Cmd+K quick conversation & channel switcher
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setFindConvOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openSettings(tab: SettingsTab = "account") {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  function openServerInvites(srv?: ServerDetail | null) {
    const target = srv ?? activeServer;
    setInviteServer(target ? { id: target.id, name: target.name } : null);
    setInviteOpen(true);
  }

  /** Apply incoming LiveKit occupancy cleanly while preserving optimistic local voice moves */
  const applyVoiceOccupancy = useCallback(
    (incoming: VoiceOccupancyMap | null | undefined) => {
      if (!incoming) return;

      const move = pendingVoiceMoveRef.current;
      if (move && Date.now() < move.until) {
        const patched: VoiceOccupancyMap = {};
        for (const [slug, list] of Object.entries(incoming)) {
          if (slug === move.targetSlug) {
            patched[slug] = list;
          } else {
            patched[slug] = list.filter((o) => o.identity !== move.userId);
          }
        }
        if (move.targetSlug) {
          const targetList = patched[move.targetSlug] ?? [];
          if (!targetList.some((o) => o.identity === move.userId)) {
            patched[move.targetSlug] = [
              ...targetList,
              {
                identity: user.id,
                name: user.displayName,
                username: user.username,
                avatarColor: user.avatarColor,
                avatarUrl: user.avatarUrl,
                isScreenSharing: voice.isScreenSharing,
              },
            ];
          }
        }
        setVoiceOccupancy(patched);
        return;
      }

      if (move && Date.now() >= move.until) {
        pendingVoiceMoveRef.current = null;
      }
      setVoiceOccupancy(incoming);
    },
    [
      user.avatarColor,
      user.avatarUrl,
      user.displayName,
      user.id,
      user.username,
      voice.isScreenSharing,
    ]
  );

  /** Called by TextChannelView (for both channels and DMs) when messages render visibly */
  const handleMessagesSeen = useCallback(
    (feedId: string, messageIds: string[], latestCreatedAt?: string) => {
      for (const id of messageIds) {
        seenNotificationIdsRef.current.add(id);
      }
      if (latestCreatedAt) {
        const ms = new Date(latestCreatedAt).getTime();
        if (!Number.isNaN(ms)) {
          const prev = readWatermarkRef.current.get(feedId) ?? 0;
          if (ms > prev) readWatermarkRef.current.set(feedId, ms);
        }
      }
      setNotifications((prev) => {
        let changed = false;
        const next = prev.map((n) => {
          const matches =
            n.channelId === feedId ||
            n.dmConversationId === feedId ||
            messageIds.includes(n.id);
          if (!n.read && matches) {
            changed = true;
            return { ...n, read: true };
          }
          return n;
        });
        return changed ? next : prev;
      });
      setToasts((prev) =>
        prev.filter(
          (t) =>
            t.channelId !== feedId &&
            t.dmConversationId !== feedId &&
            !messageIds.includes(t.id)
        )
      );
    },
    []
  );

  const syncPresence = useCallback(async () => {
    try {
      const since = lastNotifyCheckRef.current;
      const res = await fetch(`/api/presence?since=${encodeURIComponent(since)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.members) setMembers(data.members);
      if (data.servers) setServers(data.servers);
      if (data.friends) setFriends(data.friends);
      if (data.dmConversations) setDmConversations(data.dmConversations);
      if (data.voiceOccupancy) applyVoiceOccupancy(data.voiceOccupancy);
      if (data.voiceRoomCreatedAt) setVoiceRoomCreatedAt(data.voiceRoomCreatedAt);
      if (data.capabilities) setCapabilities(data.capabilities);
      if (data.serverTime) {
        lastNotifyCheckRef.current = data.serverTime;
      }
      setNowMs(Date.now());

      const incoming: NotificationItem[] = data.recentNotifications ?? [];
      if (incoming.length > 0) {
        const nav = navStateRef.current;
        const fresh = incoming.filter((n) => {
          if (seenNotificationIdsRef.current.has(n.id)) return false;
          seenNotificationIdsRef.current.add(n.id);

          const feedKey = n.dmConversationId || n.channelId;
          const readWatermark = readWatermarkRef.current.get(feedKey) ?? 0;
          const msgMs = new Date(n.createdAt).getTime();
          if (!Number.isNaN(msgMs) && msgMs <= readWatermark) {
            return false;
          }

          if (document.visibilityState === "visible") {
            if (
              n.dmConversationId &&
              nav.viewMode === "home" &&
              nav.homeView === "dm" &&
              nav.activeDmId === n.dmConversationId
            ) {
              return false;
            }
            if (
              !n.dmConversationId &&
              nav.viewMode === "server" &&
              n.channelId === nav.selectedChannelId
            ) {
              return false;
            }
          }
          return true;
        });

        if (fresh.length > 0) {
          playSound("notification");
          setNotifications((prev) => [...fresh.reverse(), ...prev].slice(0, 30));
          if (appPrefsRef.current.toastsEnabled) {
            setToasts((prev) => [...prev, ...fresh].slice(-4));
          }
        }
      }
    } catch {
      // ignore transient heartbeat failure
    }
  }, [applyVoiceOccupancy]);

  const refreshServersNow = useCallback(async () => {
    try {
      const res = await fetch("/api/servers", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.servers) setServers(data.servers);
      }
    } catch {
      // ignore
    }
  }, []);

  const syncVoiceOccupancyOnly = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/voice/occupancy", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      applyVoiceOccupancy(data.voiceOccupancy);
      if (data.voiceRoomCreatedAt) setVoiceRoomCreatedAt(data.voiceRoomCreatedAt);
    } catch {
      // ignore transient poll error
    }
  }, [applyVoiceOccupancy]);

  const pushSystemNotification = useCallback((payload: SystemNotifyPayload) => {
    const cleanMsg = payload.message.trim();
    if (!cleanMsg) return;

    const dedupKey = `${payload.kind}:${payload.title}:${cleanMsg}`;
    const now = Date.now();
    if (
      recentSystemAlertRef.current &&
      recentSystemAlertRef.current.key === dedupKey &&
      now - recentSystemAlertRef.current.at < 1500
    ) {
      return;
    }
    recentSystemAlertRef.current = { key: dedupKey, at: now };

    const item: NotificationItem = {
      id: `sys-${now}-${Math.random().toString(36).slice(2, 7)}`,
      kind: payload.kind,
      channelId: "",
      channelName: payload.source ?? "System",
      authorId: "system",
      authorDisplayName: payload.title,
      authorAvatarColor:
        payload.kind === "error"
          ? "#F43F5E"
          : payload.kind === "warning"
            ? "#F59E0B"
            : payload.kind === "info"
              ? "#0EA5E9"
              : "#10B981",
      authorAvatarUrl: null,
      content: cleanMsg,
      hasAttachments: false,
      createdAt: new Date(now).toISOString(),
      read: false,
    };

    setNotifications((prev) => [item, ...prev].slice(0, 30));
    setToasts((prev) => [...prev, item].slice(-4));
    if (payload.kind === "error" || payload.kind === "warning") {
      playSound("notification");
    }
  }, []);

  onNotifyRef.current = pushSystemNotification;
  onPresenceRef.current = () => {
    void syncVoiceOccupancyOnly();
    void syncPresence();
  };

  // Fast 3s live voice occupancy refresh
  useEffect(() => {
    const timer = setInterval(() => {
      void syncVoiceOccupancyOnly();
    }, 3000);
    return () => clearInterval(timer);
  }, [syncVoiceOccupancyOnly]);

  // 1s ticker for live voice channel session durations
  const hasAnyVoiceActivity =
    Object.values(voiceOccupancy).some((list) => list.length > 0) ||
    voice.participants.length > 0;

  useEffect(() => {
    if (!hasAnyVoiceActivity) return;
    setTimerNowMs(Date.now());
    const t = setInterval(() => setTimerNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasAnyVoiceActivity]);

  const scheduleHideStreamPreview = useCallback(() => {
    if (streamPreviewTimerRef.current) clearTimeout(streamPreviewTimerRef.current);
    streamPreviewTimerRef.current = setTimeout(() => {
      setStreamPreview(null);
    }, 180);
  }, []);

  const cancelHideStreamPreview = useCallback(() => {
    if (streamPreviewTimerRef.current) {
      clearTimeout(streamPreviewTimerRef.current);
      streamPreviewTimerRef.current = null;
    }
  }, []);

  // Mark active view read when returning focus to browser tab
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        const nav = navStateRef.current;
        const activeFeedId =
          nav.viewMode === "home" && nav.homeView === "dm"
            ? nav.activeDmId
            : nav.viewMode === "server"
              ? nav.selectedChannelId
              : null;
        if (activeFeedId) {
          setNotifications((prev) =>
            prev.map((n) =>
              n.channelId === activeFeedId || n.dmConversationId === activeFeedId
                ? { ...n, read: true }
                : n
            )
          );
          setToasts((prev) =>
            prev.filter(
              (t) => t.channelId !== activeFeedId && t.dmConversationId !== activeFeedId
            )
          );
        }
        void syncVoiceOccupancyOnly();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [syncVoiceOccupancyOnly]);

  // Always-online Web Worker heartbeat
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

  // Global ⌘K / Ctrl+K shortcut for Unified Smart Search
  useEffect(() => {
    function handleCommandPaletteKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setFindConvCategory("all");
        setFindConvOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleCommandPaletteKey);
    return () => window.removeEventListener("keydown", handleCommandPaletteKey);
  }, []);

  // Navigation helpers
  function selectServer(serverId: string, specificChannelId?: string) {
    const targetSrv = servers.find((s) => s.id === serverId);
    setViewMode("server");
    setActiveServerId(serverId);
    setServerDropdownOpen(false);
    setMobileMenuOpen(false);
    const nextChId =
      specificChannelId ?? pickInitialChannelId(targetSrv, user.id);
    setSelectedChannelId(nextChId);
    if (nextChId) {
      setNotifications((prev) =>
        prev.map((n) => (n.channelId === nextChId ? { ...n, read: true } : n))
      );
      setToasts((prev) => prev.filter((t) => t.channelId !== nextChId));
    }
  }

  function selectChannel(channelId: string, serverId?: string) {
    if (serverId) {
      setActiveServerId(serverId);
    } else {
      const ownerSrv = servers.find((s) =>
        s.channels.some((c) => c.id === channelId)
      );
      if (ownerSrv) setActiveServerId(ownerSrv.id);
    }
    setViewMode("server");
    setSelectedChannelId(channelId);
    setMobileMenuOpen(false);
    setNotifications((prev) =>
      prev.map((n) => (n.channelId === channelId ? { ...n, read: true } : n))
    );
    setToasts((prev) => prev.filter((t) => t.channelId !== channelId));
  }

  function selectHomeFriends(tab?: FriendsTab) {
    setViewMode("home");
    setHomeView("friends");
    if (tab) setFriendsTab(tab);
    setMobileMenuOpen(false);
  }

  function selectDmConversation(dmId: string) {
    setViewMode("home");
    setHomeView("dm");
    setActiveDmId(dmId);
    setMobileMenuOpen(false);
    setNotifications((prev) =>
      prev.map((n) => (n.dmConversationId === dmId ? { ...n, read: true } : n))
    );
    setToasts((prev) => prev.filter((t) => t.dmConversationId !== dmId));
  }

  function handleOpenNotification(item: NotificationItem) {
    if (item.dmConversationId) {
      selectDmConversation(item.dmConversationId);
    } else if (item.channelId) {
      selectChannel(item.channelId, item.serverId ?? undefined);
    }
  }

  async function ensureDmConversation(
    targetUserId: string
  ): Promise<DmConversationItem | null> {
    const existing = dmConversations.find((c) => c.peer.id === targetUserId);
    if (existing) return existing;

    try {
      const res = await fetch("/api/dms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const data = await res.json();
      if (!res.ok || !data.conversation) {
        pushSystemNotification({
          kind: "error",
          title: "Direct Message",
          message: data.error ?? "Could not start conversation.",
          source: "Direct Messages",
        });
        return null;
      }
      const created: DmConversationItem = data.conversation;
      setDmConversations((prev) => [
        created,
        ...prev.filter((c) => c.id !== created.id),
      ]);
      return created;
    } catch {
      pushSystemNotification({
        kind: "error",
        title: "Direct Message",
        message: "Network error opening direct message.",
        source: "Direct Messages",
      });
      return null;
    }
  }

  async function handleStartDm(targetUserId: string) {
    const conv = await ensureDmConversation(targetUserId);
    if (conv) {
      selectDmConversation(conv.id);
    }
  }

  async function handleQuickMessage(targetUserId: string, text: string) {
    const conv = await ensureDmConversation(targetUserId);
    if (!conv) return;
    const res = await fetch(`/api/dms/${conv.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    if (res.ok) {
      selectDmConversation(conv.id);
      void syncPresence();
    } else {
      const data = await res.json().catch(() => ({}));
      pushSystemNotification({
        kind: "error",
        title: "Direct Message",
        message: data.error ?? "Failed to send message.",
        source: "Direct Messages",
      });
    }
  }

  /** Optimistic smooth voice channel join across any server */
  const handleJoinVoiceChannel = useCallback(
    (targetChannel: ChannelItem, watchIdentity?: string | null) => {
      const prevChannel = voice.activeChannel;
      const seedOccupants = (voiceOccupancy[targetChannel.slug] ?? []).filter(
        (o) => o.identity !== user.id
      );

      pendingVoiceMoveRef.current = {
        userId: user.id,
        targetSlug: targetChannel.slug,
        leftSlug:
          prevChannel && prevChannel.slug !== targetChannel.slug
            ? prevChannel.slug
            : null,
        until: Date.now() + 2600,
      };

      setVoiceOccupancy((prev) => {
        const next: VoiceOccupancyMap = {};
        for (const [slug, list] of Object.entries(prev)) {
          next[slug] = list.filter((o) => o.identity !== user.id);
        }

        if (prevChannel && prevChannel.slug !== targetChannel.slug) {
          next[prevChannel.slug] = voice.participants
            .filter((p) => p.identity !== user.id)
            .map((p) => ({
              identity: p.identity,
              name: p.name,
              username: p.username,
              avatarColor: p.avatarColor,
              avatarUrl: p.avatarUrl,
              isScreenSharing: p.isScreenSharing,
            }));
        }

        const targetExisting = next[targetChannel.slug] ?? [];
        next[targetChannel.slug] = [
          ...targetExisting,
          {
            identity: user.id,
            name: user.displayName,
            username: user.username,
            avatarColor: user.avatarColor,
            avatarUrl: user.avatarUrl,
            isScreenSharing: false,
          },
        ];

        return next;
      });

      void voice.joinVoiceChannel(targetChannel, {
        watchIdentity,
        seedOccupants,
        currentUser: user,
      });
    },
    [user, voice, voiceOccupancy]
  );

  async function handleStartDmCall(targetUserId: string, withVideo: boolean) {
    const conv = await ensureDmConversation(targetUserId);
    if (!conv) return;
    selectDmConversation(conv.id);

    const dmRoomSlug = `dm-${conv.id}`;
    const syntheticVoice: ChannelItem = {
      id: conv.id,
      name: conv.peer.displayName,
      slug: dmRoomSlug,
      type: "voice",
      description: "Direct Call",
      position: 0,
    };

    const seedOccupants = (voiceOccupancy[dmRoomSlug] ?? []).filter(
      (o) => o.identity !== user.id
    );

    void voice.joinVoiceChannel(syntheticVoice, {
      dmConversationId: conv.id,
      startWithVideo: withVideo,
      seedOccupants,
      currentUser: user,
    });
  }

  const handleLeaveVoiceChannel = useCallback(() => {
    const prevChannel = voice.activeChannel;
    if (prevChannel) {
      pendingVoiceMoveRef.current = {
        userId: user.id,
        targetSlug: null,
        leftSlug: prevChannel.slug,
        until: Date.now() + 2600,
      };

      setVoiceOccupancy((prev) => {
        const next: VoiceOccupancyMap = {};
        for (const [slug, list] of Object.entries(prev)) {
          next[slug] = list.filter((o) => o.identity !== user.id);
        }
        next[prevChannel.slug] = voice.participants
          .filter((p) => p.identity !== user.id)
          .map((p) => ({
            identity: p.identity,
            name: p.name,
            username: p.username,
            avatarColor: p.avatarColor,
            avatarUrl: p.avatarUrl,
            isScreenSharing: p.isScreenSharing,
          }));
        return next;
      });
    }

    void voice.leaveVoiceChannel();
  }, [user.id, voice]);

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
              bannerUrl: updated.bannerUrl,
              bio: updated.bio,
              presenceStatus: updated.presenceStatus,
              customActivity: updated.customActivity,
            }
          : m
      )
    );
  }

  // Channel & Category CRUD
  function openCreateChannel(type: "text" | "voice", categoryId: string | null = null) {
    setEditingChannel(null);
    setChannelModalType(type);
    setChannelModalCategoryId(categoryId);
    setChannelModalOpen(true);
  }

  function openEditChannel(ch: ChannelItem) {
    setEditingChannel(ch);
    setChannelModalType(ch.type);
    setChannelModalCategoryId(ch.categoryId ?? null);
    setChannelModalOpen(true);
  }

  function handleChannelSaved(saved: ChannelItem, isEdit: boolean) {
    setServers((prev) =>
      prev.map((srv) => {
        if (srv.id !== (saved.serverId ?? activeServer?.id)) return srv;
        const nextChannels = isEdit
          ? srv.channels.map((c) => (c.id === saved.id ? saved : c))
          : [...srv.channels, saved];
        return { ...srv, channels: nextChannels };
      })
    );
    if (!isEdit) {
      selectChannel(saved.id, saved.serverId ?? activeServer?.id);
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
      setServers((prev) =>
        prev.map((srv) => ({
          ...srv,
          channels: srv.channels.filter((c) => c.id !== ch.id),
        }))
      );
      if (selectedChannelId === ch.id) {
        const remaining = accessibleServerChannels.filter((c) => c.id !== ch.id);
        setSelectedChannelId(remaining[0]?.id ?? "");
      }
    }
  }

  function handleCategorySaved(saved: CategoryItem, isEdit: boolean) {
    setServers((prev) =>
      prev.map((srv) => {
        if (srv.id !== saved.serverId) return srv;
        const nextCats = isEdit
          ? srv.categories.map((c) => (c.id === saved.id ? saved : c))
          : [...srv.categories, saved];
        return { ...srv, categories: nextCats };
      })
    );
  }

  async function handleDeleteCategory(cat: CategoryItem) {
    if (!activeServer) return;
    const confirmed = window.confirm(
      `Delete category "${cat.name}"? Channels inside will remain top-level.`
    );
    if (!confirmed) return;

    const res = await fetch(
      `/api/servers/${activeServer.id}/categories/${cat.id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setServers((prev) =>
        prev.map((srv) =>
          srv.id !== activeServer.id
            ? srv
            : {
                ...srv,
                categories: srv.categories.filter((c) => c.id !== cat.id),
                channels: srv.channels.map((ch) =>
                  ch.categoryId === cat.id ? { ...ch, categoryId: null } : ch
                ),
              }
        )
      );
    }
  }

  async function handleLeaveServer(srv: ServerDetail) {
    const confirmed = window.confirm(`Leave "${srv.name}"?`);
    if (!confirmed) return;
    const res = await fetch(`/api/servers/${srv.id}/leave`, { method: "POST" });
    if (res.ok) {
      const remaining = servers.filter((s) => s.id !== srv.id);
      setServers(remaining);
      if (activeServerId === srv.id) {
        if (remaining.length > 0) {
          selectServer(remaining[0].id);
        } else {
          setActiveServerId(null);
          selectHomeFriends("online");
        }
      }
      pushSystemNotification({
        kind: "info",
        title: "Left Server",
        message: `You left ${srv.name}.`,
        source: "Servers",
      });
    } else {
      const data = await res.json().catch(() => ({}));
      pushSystemNotification({
        kind: "error",
        title: "Leave Server",
        message: data.error ?? "Could not leave server.",
        source: srv.name,
      });
    }
  }

  function handleServerDeleted(deletedId: string) {
    const remaining = servers.filter((s) => s.id !== deletedId);
    setServers(remaining);
    if (activeServerId === deletedId) {
      if (remaining.length > 0) {
        selectServer(remaining[0].id);
      } else {
        setActiveServerId(null);
        selectHomeFriends("online");
      }
    }
    pushSystemNotification({
      kind: "info",
      title: "Server Deleted",
      message: "The server has been removed.",
      source: "Servers",
    });
  }

  // Friend & Role actions from Profile Popover
  async function handleQuickAddFriend(username: string) {
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      pushSystemNotification({
        kind: "success",
        title: data.autoAccepted ? "Friend Added" : "Request Sent",
        message: data.autoAccepted
          ? `You are now friends with @${username}.`
          : `Friend request sent to @${username}.`,
        source: "Friends",
      });
      setProfilePopover((prev) =>
        prev && prev.username === username
          ? {
              ...prev,
              friendshipStatus: data.autoAccepted ? "friend" : "outgoing",
            }
          : prev
      );
      void syncPresence();
    } else {
      pushSystemNotification({
        kind: "error",
        title: "Friend Request",
        message: data.error ?? "Could not send request.",
        source: "Friends",
      });
    }
  }

  async function handleQuickAcceptFriend(friendshipId: string) {
    const res = await fetch(`/api/friends/${friendshipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    if (res.ok) {
      setProfilePopover((prev) =>
        prev && prev.friendshipId === friendshipId
          ? { ...prev, friendshipStatus: "friend" }
          : prev
      );
      void syncPresence();
    }
  }

  async function handleToggleUserRoleFromPopover(targetUserId: string, roleId: string) {
    if (!activeServer) return;
    const currentIds = activeServer.memberRoleIds[targetUserId] ?? [];
    const nextIds = currentIds.includes(roleId)
      ? currentIds.filter((id) => id !== roleId)
      : [...currentIds, roleId];

    const res = await fetch(
      `/api/servers/${activeServer.id}/members/${targetUserId}/roles`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleIds: nextIds }),
      }
    );
    if (res.ok) {
      setServers((prev) =>
        prev.map((s) =>
          s.id !== activeServer.id
            ? s
            : {
                ...s,
                memberRoleIds: {
                  ...s.memberRoleIds,
                  [targetUserId]: nextIds,
                },
              }
        )
      );
      const updatedRoleObjs = activeServer.roles
        .filter((r) => !r.isDefault && nextIds.includes(r.id))
        .sort((a, b) => b.position - a.position);
      setProfilePopover((prev) =>
        prev && prev.id === targetUserId
          ? { ...prev, serverRoles: updatedRoleObjs }
          : prev
      );
    }
  }

  /** Locate which voice channel (across all servers) a user is currently in */
  function findMemberVoiceInfo(memberId: string): {
    server: ServerDetail | null;
    channel: ChannelItem | null;
    isScreenSharing: boolean;
  } {
    if (voice.activeChannel && !voice.activeChannel.slug.startsWith("dm-")) {
      const liveP = voice.participants.find((p) => p.identity === memberId);
      if (liveP) {
        const srv =
          servers.find((s) =>
            s.channels.some((c) => c.id === voice.activeChannel?.id)
          ) ?? null;
        return {
          server: srv,
          channel: voice.activeChannel,
          isScreenSharing: liveP.isScreenSharing,
        };
      }
    }
    for (const { server, channel } of allVoiceChannels) {
      const occ = (voiceOccupancy[channel.slug] ?? []).find(
        (o) => o.identity === memberId
      );
      if (occ) {
        return {
          server,
          channel,
          isScreenSharing: Boolean(occ.isScreenSharing),
        };
      }
    }
    return { server: null, channel: null, isScreenSharing: false };
  }

  function handleWatchUserStream(
    targetUserId: string,
    explicitChannelId?: string | null,
    explicitServerId?: string | null
  ) {
    const info = findMemberVoiceInfo(targetUserId);
    const found = explicitChannelId
      ? allVoiceChannels.find((x) => x.channel.id === explicitChannelId)
      : null;
    const targetChannel = found?.channel ?? info.channel;
    const targetServerId = explicitServerId ?? found?.server.id ?? info.server?.id;

    if (!targetChannel) return;

    selectChannel(targetChannel.id, targetServerId);
    if (voice.activeChannel?.id === targetChannel.id && isVoiceConnected) {
      voice.setWatchTargetIdentity(targetUserId);
    } else {
      handleJoinVoiceChannel(targetChannel, targetUserId);
    }
  }

  function openEnrichedProfilePopover(rawTarget: ProfilePopoverTarget) {
    const matchedMember = members.find((m) => m.id === rawTarget.id);
    const voiceInfo = findMemberVoiceInfo(rawTarget.id);
    const isSelf = rawTarget.id === user.id;
    const isRecentlyActive = matchedMember
      ? isSelf || nowMs - new Date(matchedMember.lastSeenAt).getTime() < ONLINE_WINDOW_MS
      : Boolean(rawTarget.online ?? true);
    const displayStatus = resolveDisplayStatus(
      isRecentlyActive,
      isSelf ? user.presenceStatus : matchedMember?.presenceStatus
    );

    const liveParticipant =
      voiceInfo.channel && voice.activeChannel?.id === voiceInfo.channel.id
        ? voice.participants.find((p) => p.identity === rawTarget.id)
        : undefined;

    const voicePeers = voiceInfo.channel
      ? (voice.activeChannel?.id === voiceInfo.channel.id
          ? voice.participants.map((p) => {
              const pm = members.find((item) => item.id === p.identity);
              return {
                identity: p.identity,
                name: pm?.displayName ?? p.name,
                avatarColor: pm?.avatarColor ?? p.avatarColor,
                avatarUrl: pm ? pm.avatarUrl : p.avatarUrl,
              };
            })
          : (voiceOccupancy[voiceInfo.channel.slug] ?? []).map((o) => {
              const pm = members.find((item) => item.id === o.identity);
              return {
                identity: o.identity,
                name: pm?.displayName ?? o.name,
                avatarColor: pm?.avatarColor ?? o.avatarColor,
                avatarUrl: pm ? pm.avatarUrl : (o.avatarUrl ?? null),
              };
            }))
      : undefined;

    const friendEntry = friends.find((f) => f.user.id === rawTarget.id);
    const friendshipStatus =
      friendEntry?.direction === "friend"
        ? "friend"
        : friendEntry?.direction === "incoming"
          ? "incoming"
          : friendEntry?.direction === "outgoing"
            ? "outgoing"
            : "none";

    const srvRoles =
      viewMode === "server" && activeServer
        ? getMemberRolesInServer(activeServer, rawTarget.id)
        : undefined;
    const canManageRolesHere =
      viewMode === "server" &&
      Boolean(activeServer) &&
      (myServerPermissions.administrator || myServerPermissions.manageRoles);

    setStreamPreview(null);
    setProfilePopover({
      ...rawTarget,
      displayName: matchedMember?.displayName ?? rawTarget.displayName,
      username: matchedMember?.username ?? rawTarget.username,
      avatarColor: matchedMember?.avatarColor ?? rawTarget.avatarColor,
      avatarUrl: matchedMember ? matchedMember.avatarUrl : rawTarget.avatarUrl,
      bannerUrl: matchedMember ? matchedMember.bannerUrl : rawTarget.bannerUrl,
      bio: matchedMember ? matchedMember.bio : rawTarget.bio,
      customActivity: isSelf
        ? user.customActivity
        : matchedMember
          ? matchedMember.customActivity
          : rawTarget.customActivity,
      createdAt: matchedMember?.createdAt ?? rawTarget.createdAt ?? null,
      role: matchedMember?.role ?? rawTarget.role,
      online: displayStatus !== "offline",
      status: displayStatus,
      serverTag: viewMode === "server" ? (activeServer?.tag ?? null) : null,
      serverRoles: srvRoles,
      availableRoles: viewMode === "server" ? activeServer?.roles : undefined,
      canManageRoles: canManageRolesHere,
      friendshipStatus,
      friendshipId: friendEntry?.friendshipId ?? null,
      inVoiceChannelName: voiceInfo.channel?.name ?? rawTarget.inVoiceChannelName ?? null,
      voiceChannelId: voiceInfo.channel?.id ?? rawTarget.voiceChannelId ?? null,
      voicePeers,
      isScreenSharing: voiceInfo.isScreenSharing || Boolean(rawTarget.isScreenSharing),
      liveScreenTrack: liveParticipant?.screenTrack ?? null,
    });
  }

  function openUserCard(
    e: React.MouseEvent<HTMLElement>,
    person: {
      id: string;
      displayName: string;
      username?: string;
      avatarColor: string;
      avatarUrl?: string | null;
      bannerUrl?: string | null;
      role?: "admin" | "member";
      online?: boolean;
    }
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    openEnrichedProfilePopover({
      id: person.id,
      displayName: person.displayName,
      username: person.username,
      avatarColor: person.avatarColor,
      avatarUrl: person.avatarUrl,
      bannerUrl: person.bannerUrl,
      role: person.role,
      online: person.online,
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
    options?: {
      voiceRoomSlug?: string | null;
      allowVolumeControl?: boolean;
    }
  ) {
    const isSelf = person.id === user.id;
    const voiceInfo = findMemberVoiceInfo(person.id);
    const roomSlug = options?.voiceRoomSlug ?? voiceInfo.channel?.slug ?? null;
    const allowVolumeControl = Boolean(options?.allowVolumeControl);
    const currentVol = voice.userVolumes[person.id] ?? 1;
    const isLocallyMuted = currentVol === 0;
    const rect = e.currentTarget.getBoundingClientRect();
    const matchedMember = members.find((m) => m.id === person.id);

    const canMute =
      user.role === "admin" ||
      myServerPermissions.administrator ||
      myServerPermissions.muteMembers;
    const canKick =
      user.role === "admin" ||
      myServerPermissions.administrator ||
      myServerPermissions.kickMembers;

    const entries: ContextMenuEntry[] = [
      {
        type: "header",
        id: "u-hdr",
        label: matchedMember?.displayName ?? person.displayName,
      },
    ];

    if (voiceInfo.isScreenSharing) {
      entries.push({
        type: "item",
        id: "u-watch-live",
        label: "Watch Live Stream",
        icon: <Play className="h-3.5 w-3.5 text-emerald-400" />,
        onSelect: () =>
          handleWatchUserStream(person.id, voiceInfo.channel?.id, voiceInfo.server?.id),
      });
    }

    entries.push({
      type: "item",
      id: "u-profile",
      label: "View Profile",
      icon: <User className="h-3.5 w-3.5" />,
      onSelect: () => {
        openEnrichedProfilePopover({
          id: person.id,
          displayName: person.displayName,
          username: person.username,
          avatarColor: person.avatarColor,
          avatarUrl: person.avatarUrl,
          role: person.role,
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
    });

    if (!isSelf) {
      entries.push({
        type: "item",
        id: "u-dm",
        label: "Message",
        icon: <MessageSquare className="h-3.5 w-3.5" />,
        onSelect: () => void handleStartDm(person.id),
      });
    }

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

    if (!isSelf && allowVolumeControl) {
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
    }

    if (!isSelf && roomSlug && (canMute || canKick)) {
      entries.push({ type: "divider", id: "u-d-admin" });
      if (canMute) {
        entries.push({
          type: "item",
          id: "u-server-mute",
          label: "Server Mute",
          icon: <MicOff className="h-3.5 w-3.5" />,
          onSelect: () => void voice.serverMuteParticipant(person.id, roomSlug),
        });
      }
      if (canKick) {
        entries.push({
          type: "item",
          id: "u-kick",
          label: "Kick from Voice",
          icon: <UserX className="h-3.5 w-3.5" />,
          danger: true,
          onSelect: () => void voice.kickParticipant(person.id, roomSlug),
        });
      }
    }

    openMenu(e, entries);
  }

  function handleChannelContextMenu(
    e: React.MouseEvent<HTMLElement>,
    channel: ChannelItem
  ) {
    const canManage =
      myServerPermissions.administrator ||
      myServerPermissions.manageChannels ||
      channel.createdById === user.id;

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
              handleJoinVoiceChannel(channel);
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

  function handleCategoryContextMenu(
    e: React.MouseEvent<HTMLElement>,
    cat: CategoryItem
  ) {
    const canManage =
      myServerPermissions.administrator || myServerPermissions.manageChannels;
    if (!canManage) return;

    const defaultType = /voice|صدا/i.test(cat.name) ? "voice" : "text";
    openMenu(e, [
      { type: "header", id: "cat-hdr", label: cat.name },
      {
        type: "item",
        id: "cat-add-ch",
        label: "Create Channel Here",
        icon: <Plus className="h-3.5 w-3.5" />,
        onSelect: () => openCreateChannel(defaultType, cat.id),
      },
      {
        type: "item",
        id: "cat-rename",
        label: "Rename Category",
        icon: <Pencil className="h-3.5 w-3.5" />,
        onSelect: () => {
          setEditingCategory(cat);
          setCategoryModalOpen(true);
        },
      },
      { type: "divider", id: "cat-d1" },
      {
        type: "item",
        id: "cat-del",
        label: "Delete Category",
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onSelect: () => void handleDeleteCategory(cat),
      },
    ]);
  }

  function handleServerRailContextMenu(
    e: React.MouseEvent<HTMLElement>,
    srv: ServerDetail
  ) {
    const assigned = srv.memberRoleIds[user.id] ?? [];
    const perms = computeEffectivePermissions({
      userId: user.id,
      ownerId: srv.ownerId,
      serverRoles: srv.roles,
      assignedRoleIds: assigned,
    });
    const isOwner = srv.ownerId === user.id;

    const entries: ContextMenuEntry[] = [
      { type: "header", id: "srv-hdr", label: srv.name },
    ];

    if (perms.administrator || perms.manageServer || perms.createInvites) {
      entries.push({
        type: "item",
        id: "srv-inv",
        label: "Invite People",
        icon: <KeyRound className="h-3.5 w-3.5 text-emerald-400" />,
        onSelect: () => openServerInvites(srv),
      });
    }

    entries.push({
      type: "item",
      id: "srv-set",
      label: "Server Settings",
      icon: <Settings className="h-3.5 w-3.5" />,
      onSelect: () => {
        selectServer(srv.id);
        setServerSettingsTab("overview");
        setServerSettingsOpen(true);
      },
    });

    if (!isOwner) {
      entries.push(
        { type: "divider", id: "srv-d1" },
        {
          type: "item",
          id: "srv-leave",
          label: "Leave Server",
          icon: <LogOut className="h-3.5 w-3.5" />,
          danger: true,
          onSelect: () => void handleLeaveServer(srv),
        }
      );
    }

    openMenu(e, entries);
  }

  // Notification badges for ServerRail
  const incomingRequestsCount = friends.filter((f) => f.direction === "incoming").length;
  const unreadDmCount = notifications.filter(
    (n) => !n.read && Boolean(n.dmConversationId)
  ).length;
  const homeBadgeCount = incomingRequestsCount + unreadDmCount;

  const unreadServerIds = useMemo(() => {
    const set = new Set<string>();
    for (const n of notifications) {
      if (!n.read && !n.dmConversationId && n.channelId) {
        if (n.serverId) {
          set.add(n.serverId);
        } else {
          const srv = servers.find((s) =>
            s.channels.some((c) => c.id === n.channelId)
          );
          if (srv) set.add(srv.id);
        }
      }
    }
    return set;
  }, [notifications, servers]);

  const canManageChannels =
    myServerPermissions.administrator || myServerPermissions.manageChannels;
  const canCreateInvites =
    myServerPermissions.administrator ||
    myServerPermissions.manageServer ||
    myServerPermissions.createInvites;
  const showMembersRail =
    viewMode === "server" && appPrefs.showMembersSidebar && !isStageMaximized;

  // Render helper for a single channel row (Text or Voice)
  function renderChannelItem(channel: ChannelItem) {
    const selected = viewMode === "server" && activeChannel?.id === channel.id;
    const canManageThis =
      canManageChannels || channel.createdById === user.id;

    if (channel.type === "text") {
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
            <span className="relative flex shrink-0 items-center">
              <Hash
                className={`h-4 w-4 ${
                  selected ? "text-emerald-400" : "text-zinc-500"
                }`}
              />
              {channel.isPrivate && (
                <Lock className="absolute -right-1 -top-1 h-2.5 w-2.5 text-amber-400" />
              )}
            </span>
            <span dir="auto" className="truncate">
              {channel.name}
            </span>
            {hasUnread && !selected && (
              <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
            )}
          </button>

          {canManageThis && (
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
    }

    // Voice Channel Row
    const isLiveHere = voice.activeChannel?.id === channel.id && isVoiceConnected;
    const rawOccupants = isLiveHere
      ? voice.participants.map((p) => {
          const occMeta = (voiceOccupancy[channel.slug] ?? []).find(
            (o) => o.identity === p.identity
          );
          return {
            identity: p.identity,
            name: p.name,
            username: p.username,
            avatarColor: p.avatarColor,
            avatarUrl: p.avatarUrl,
            role: p.role,
            isSpeaking: p.isSpeaking,
            isMuted: p.isMuted,
            isScreenSharing: p.isScreenSharing,
            screenTrack: p.screenTrack,
            joinedAt: occMeta?.joinedAt ?? null,
          };
        })
      : (voiceOccupancy[channel.slug] ?? []).map((o) => ({
          identity: o.identity,
          name: o.name,
          username: o.username,
          avatarColor: o.avatarColor,
          avatarUrl: o.avatarUrl ?? null,
          role: undefined,
          isSpeaking: false,
          isMuted: false,
          isScreenSharing: Boolean(o.isScreenSharing),
          screenTrack: null,
          joinedAt: o.joinedAt ?? null,
        }));

    const occupants = rawOccupants.map((occ) => {
      const m = members.find((item) => item.id === occ.identity);
      return {
        ...occ,
        name: m?.displayName ?? occ.name,
        username: m?.username ?? occ.username,
        avatarColor: m?.avatarColor ?? occ.avatarColor,
        avatarUrl: m ? m.avatarUrl : occ.avatarUrl,
        role: m?.role ?? occ.role,
        presenceStatus: m?.presenceStatus,
      };
    });

    const roomStartedAt = voiceRoomCreatedAt[channel.slug] ?? null;

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
              handleJoinVoiceChannel(channel);
            }}
            title="Double-click to join voice"
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
              selected
                ? "bg-white/[0.08] font-medium text-zinc-100"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
            }`}
          >
            <span className="relative flex shrink-0 items-center">
              <Volume2
                className={`h-4 w-4 ${
                  isLiveHere
                    ? "text-emerald-400"
                    : selected
                      ? "text-zinc-200"
                      : "text-zinc-500"
                }`}
              />
              {channel.isPrivate && (
                <Lock className="absolute -right-1 -top-1 h-2.5 w-2.5 text-amber-400" />
              )}
            </span>
            <span dir="auto" className="truncate">
              {channel.name}
            </span>
            {occupants.length > 0 && (
              <span
                className={`ml-auto text-[11px] font-medium tabular-nums ${
                  roomStartedAt ? "text-emerald-400/90" : "text-zinc-500"
                }`}
              >
                {roomStartedAt
                  ? formatVoiceTimer(timerNowMs - roomStartedAt)
                  : occupants.length}
              </span>
            )}
          </button>

          {canManageThis && (
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
                      { voiceRoomSlug: channel.slug, allowVolumeControl: true }
                    )
                  }
                  onMouseEnter={(e) => {
                    if (!occ.isScreenSharing) return;
                    cancelHideStreamPreview();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setStreamPreview({
                      identity: occ.identity,
                      displayName: occ.name,
                      avatarColor: occ.avatarColor,
                      avatarUrl: occ.avatarUrl,
                      status: resolveDisplayStatus(true, occ.presenceStatus),
                      channelId: channel.id,
                      channelName: channel.name,
                      startedAtMs: occ.joinedAt ?? roomStartedAt,
                      liveScreenTrack: occ.screenTrack ?? null,
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
                  onMouseLeave={() => {
                    if (occ.isScreenSharing) scheduleHideStreamPreview();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-zinc-300 transition-colors hover:bg-white/[0.05]"
                >
                  <Avatar
                    name={occ.name}
                    color={occ.avatarColor}
                    avatarUrl={occ.avatarUrl}
                    size="xs"
                    speaking={occ.isSpeaking}
                    speakingOffsetClassName="ring-offset-[#0E0F12]"
                  />
                  <span dir="auto" className="min-w-0 flex-1 truncate text-xs font-medium">
                    {occ.name}
                  </span>
                  {occ.isSpeaking && !occ.isMuted && (
                    <BarVisualizer state="speaking" barCount={4} size="xs" />
                  )}
                  {occ.isScreenSharing && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        openUserCard(e, {
                          id: occ.identity,
                          displayName: occ.name,
                          username: occ.username,
                          avatarColor: occ.avatarColor,
                          avatarUrl: occ.avatarUrl,
                          role: occ.role,
                          online: true,
                        });
                      }}
                      title="Live streaming — hover to preview or click to view"
                      className="rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white shadow-xs transition-transform hover:scale-105"
                    >
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
  }

  // Group server channels by category
  const categoryIdSet = new Set((activeServer?.categories ?? []).map((c) => c.id));
  const uncategorizedChannels = accessibleServerChannels.filter(
    (ch) => !ch.categoryId || !categoryIdSet.has(ch.categoryId)
  );
  const sortedCategories = [...(activeServer?.categories ?? [])].sort(
    (a, b) => a.position - b.position
  );

  // Active DM peer live profile
  const activeDmPeer = activeDm
    ? (members.find((m) => m.id === activeDm.peer.id) ?? activeDm.peer)
    : null;

  // Contextual message search endpoint for the active text channel or DM
  const activeChannelIdForSearch =
    viewMode === "server" && activeChannel?.type === "text"
      ? activeChannel.id
      : null;
  const activeChannelNameForSearch =
    viewMode === "server" && activeChannel?.type === "text"
      ? activeChannel.name
      : null;
  const activeDmIdForSearch =
    viewMode === "home" && homeView === "dm" && activeDm && activeDmPeer
      ? activeDm.id
      : null;
  const activeDmUserForSearch =
    viewMode === "home" && homeView === "dm" && activeDm && activeDmPeer
      ? activeDmPeer.username
      : null;

  const activeChatSearchContext = useMemo<ActiveChatSearchContext | null>(() => {
    if (activeChannelIdForSearch && activeChannelNameForSearch) {
      return {
        label: `#${activeChannelNameForSearch}`,
        apiBasePath: `/api/channels/${activeChannelIdForSearch}/messages`,
      };
    }
    if (activeDmIdForSearch && activeDmUserForSearch) {
      return {
        label: `@${activeDmUserForSearch}`,
        apiBasePath: `/api/dms/${activeDmIdForSearch}/messages`,
      };
    }
    return null;
  }, [
    activeChannelIdForSearch,
    activeChannelNameForSearch,
    activeDmIdForSearch,
    activeDmUserForSearch,
  ]);

  function renderHeaderSmartSearch(placeholder: string) {
    return (
      <AnimatedIconButton
        icon={SearchIcon}
        iconSize={14}
        iconClassName="text-zinc-500 transition-colors group-hover:text-emerald-400"
        onClick={() => openSmartSearch("all")}
        title={`${placeholder} (Ctrl+K)`}
        aria-label="Open smart search"
        className="group flex h-8 items-center justify-between gap-2 rounded-lg border border-white/[0.09] bg-[#16171D] px-2.5 text-left text-xs text-zinc-400 transition-all hover:border-emerald-500/35 hover:bg-[#191B22] hover:text-zinc-200 sm:w-48 lg:w-60"
      >
        <span className="hidden min-w-0 flex-1 truncate sm:inline">{placeholder}</span>
        <kbd className="hidden shrink-0 rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-zinc-500 transition-colors group-hover:border-emerald-500/30 group-hover:text-emerald-300 md:inline">
          ⌘K
        </kbd>
      </AnimatedIconButton>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#09090B] text-zinc-100 select-none">
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-black/65 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Left Navigation Cluster: ServerRail + Secondary Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 flex h-full shrink-0 transition-transform duration-200 md:static md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <ServerRail
          servers={servers}
          viewMode={viewMode}
          activeServerId={activeServer?.id ?? null}
          homeBadgeCount={homeBadgeCount}
          unreadServerIds={unreadServerIds}
          onSelectHome={() => selectHomeFriends()}
          onSelectServer={(id) => selectServer(id)}
          onOpenCreateJoin={() => setServerCreateJoinOpen(true)}
          onServerContextMenu={handleServerRailContextMenu}
        />

        {/* Secondary Sidebar (DMs/Friends in Home mode, Server Channels in Server mode) */}
        <aside className="flex w-[252px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0E0F12]">
          {viewMode === "home" ? (
            <>
              {/* Home Top Search Pill */}
              <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.07] px-3">
                <button
                  type="button"
                  onClick={() => openSmartSearch("people")}
                  className="siq-bezel-sm flex flex-1 items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#14151B] px-3 py-1.5 text-left text-xs text-zinc-400 transition-colors hover:border-white/[0.16] hover:text-zinc-200"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Search className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span className="truncate">Find or start a conversation</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close sidebar"
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] md:hidden"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Friends Nav + Direct Messages List */}
              <nav
                className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3"
                aria-label="Direct messages"
              >
                <AnimatedIconButton
                  icon={UsersIcon}
                  iconSize={16}
                  iconClassName={
                    homeView === "friends" ? "text-emerald-400" : "text-zinc-400"
                  }
                  onClick={() => selectHomeFriends()}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors ${
                    homeView === "friends"
                      ? "bg-white/[0.09] text-zinc-100"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  <span>Friends</span>
                  {incomingRequestsCount > 0 && (
                    <span className="ml-auto rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
                      {incomingRequestsCount}
                    </span>
                  )}
                </AnimatedIconButton>

                <div>
                  <div className="mb-1.5 flex items-center justify-between px-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Direct Messages
                    </span>
                    <AnimatedIconButton
                      icon={PlusIcon}
                      iconSize={14}
                      onClick={() => openSmartSearch("people")}
                      title="Start a Direct Message"
                      className="inline-flex items-center justify-center rounded p-0.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                    />
                  </div>

                  {dmConversations.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/[0.07] px-3 py-5 text-center text-[11px] text-zinc-500">
                      No conversations yet. Click + to message a friend.
                    </div>
                  ) : (
                    <ul className="space-y-0.5">
                      {dmConversations.map((conv) => {
                        const livePeer =
                          members.find((m) => m.id === conv.peer.id) ?? conv.peer;
                        const isOnline = onlineMemberIds.has(livePeer.id);
                        const status = resolveDisplayStatus(
                          isOnline,
                          livePeer.presenceStatus
                        );
                        const voiceInfo = findMemberVoiceInfo(livePeer.id);
                        const dmCallActive =
                          (voiceOccupancy[`dm-${conv.id}`]?.length ?? 0) > 0;
                        const isSelected =
                          homeView === "dm" && activeDmId === conv.id;
                        const hasUnread = notifications.some(
                          (n) => !n.read && n.dmConversationId === conv.id
                        );

                        return (
                          <li key={conv.id}>
                            <button
                              type="button"
                              onClick={() => selectDmConversation(conv.id)}
                              onContextMenu={(e) =>
                                openMenu(e, [
                                  {
                                    type: "header",
                                    id: "dm-h",
                                    label: livePeer.displayName,
                                  },
                                  {
                                    type: "item",
                                    id: "dm-call",
                                    label: "Start Voice Call",
                                    icon: <Phone className="h-3.5 w-3.5" />,
                                    onSelect: () =>
                                      void handleStartDmCall(livePeer.id, false),
                                  },
                                  {
                                    type: "item",
                                    id: "dm-video",
                                    label: "Start Video Call",
                                    icon: <Video className="h-3.5 w-3.5" />,
                                    onSelect: () =>
                                      void handleStartDmCall(livePeer.id, true),
                                  },
                                  {
                                    type: "item",
                                    id: "dm-prof",
                                    label: "View Profile",
                                    icon: <User className="h-3.5 w-3.5" />,
                                    onSelect: () =>
                                      openUserCard(e, {
                                        id: livePeer.id,
                                        displayName: livePeer.displayName,
                                        username: livePeer.username,
                                        avatarColor: livePeer.avatarColor,
                                        avatarUrl: livePeer.avatarUrl,
                                        role: livePeer.role,
                                        online: isOnline,
                                      }),
                                  },
                                ])
                              }
                              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                                isSelected
                                  ? "bg-white/[0.09] text-zinc-100"
                                  : hasUnread
                                    ? "text-zinc-100 hover:bg-white/[0.05]"
                                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                              }`}
                            >
                              <Avatar
                                name={livePeer.displayName}
                                color={livePeer.avatarColor}
                                avatarUrl={livePeer.avatarUrl}
                                size="sm"
                                status={status}
                                ringClassName="ring-[#0E0F12]"
                              />
                              <div className="min-w-0 flex-1">
                                <p
                                  dir="auto"
                                  className={`truncate text-xs ${
                                    isSelected || hasUnread
                                      ? "font-semibold text-zinc-100"
                                      : "font-medium"
                                  }`}
                                >
                                  {livePeer.displayName}
                                </p>
                                <p className="flex items-center gap-1 truncate text-[10px] text-zinc-500">
                                  {dmCallActive ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-400">
                                      <Phone className="h-2.5 w-2.5" />
                                      In call
                                    </span>
                                  ) : voiceInfo.isScreenSharing ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-400">
                                      <Monitor className="h-2.5 w-2.5" />
                                      Sharing screen
                                    </span>
                                  ) : voiceInfo.channel ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-400">
                                      <Volume2 className="h-2.5 w-2.5" />
                                      In voice
                                    </span>
                                  ) : livePeer.customActivity ? (
                                    <span
                                      dir="auto"
                                      className="inline-flex items-center gap-1 truncate text-zinc-400"
                                    >
                                      <Gamepad2 className="h-2.5 w-2.5 shrink-0 text-emerald-400" />
                                      <span className="truncate">
                                        {livePeer.customActivity}
                                      </span>
                                    </span>
                                  ) : conv.lastMessagePreview ? (
                                    <span dir="auto" className="truncate">
                                      {conv.lastMessagePreview}
                                    </span>
                                  ) : (
                                    <span>@{livePeer.username}</span>
                                  )}
                                </p>
                              </div>
                              {hasUnread && !isSelected && (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </nav>
            </>
          ) : (
            <>
              {/* Server Header + Optional Banner + Dropdown Menu */}
              <div ref={serverDropdownRef} className="relative shrink-0">
                {activeServer?.bannerUrl ? (
                  <div
                    onClick={() => setServerDropdownOpen((v) => !v)}
                    className="group relative h-36 w-full cursor-pointer overflow-hidden border-b border-white/[0.08]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeServer.bannerUrl}
                      alt={activeServer.name}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/80 via-black/40 to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/50 to-transparent" />

                    <div className="relative z-10 flex h-12 w-full items-center justify-between px-3.5 text-left">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          dir="auto"
                          className="truncate text-sm font-bold tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
                        >
                          {activeServer.name}
                        </span>
                        {activeServer.tag && (
                          <span className="shrink-0 rounded border border-emerald-500/40 bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300 backdrop-blur-xs drop-shadow-sm">
                            {activeServer.tag}
                          </span>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <ChevronDown
                          className={`h-4 w-4 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-transform ${
                            serverDropdownOpen ? "rotate-180" : ""
                          }`}
                        />
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setMobileMenuOpen(false);
                          }}
                          className="rounded-lg p-1 text-white hover:bg-white/[0.1] md:hidden"
                        >
                          <X className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setServerDropdownOpen((v) => !v)}
                    className="flex h-12 w-full items-center justify-between border-b border-white/[0.07] px-3.5 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        dir="auto"
                        className="truncate text-sm font-bold tracking-tight text-zinc-100"
                      >
                        {activeServer?.name ?? "siq"}
                      </span>
                      {activeServer?.tag && (
                        <span className="shrink-0 rounded border border-emerald-500/35 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300 backdrop-blur-xs">
                          {activeServer.tag}
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <ChevronDown
                        className={`h-4 w-4 text-zinc-300 transition-transform ${
                          serverDropdownOpen ? "rotate-180" : ""
                        }`}
                      />
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setMobileMenuOpen(false);
                        }}
                        className="rounded-lg p-1 text-zinc-300 hover:bg-white/[0.1] md:hidden"
                      >
                        <X className="h-4 w-4" />
                      </span>
                    </div>
                  </button>
                )}

                {/* Server Dropdown Menu */}
                <AnimatePresence>
                  {serverDropdownOpen && activeServer && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.96 }}
                      transition={{ duration: 0.14 }}
                      className={`absolute left-2.5 right-2.5 z-50 rounded-xl border border-white/[0.11] bg-[#14151A]/95 p-1.5 shadow-2xl shadow-black/85 backdrop-blur-md ${
                        activeServer?.bannerUrl ? "top-[52px]" : "top-[calc(100%+6px)]"
                      }`}
                    >
                      {canCreateInvites && (
                        <button
                          type="button"
                          onClick={() => {
                            setServerDropdownOpen(false);
                            openServerInvites(activeServer);
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15"
                        >
                          <span>Invite People</span>
                          <UserPlus className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setServerDropdownOpen(false);
                          setServerSettingsTab("overview");
                          setServerSettingsOpen(true);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.06]"
                      >
                        <span>Server Settings</span>
                        <Settings className="h-3.5 w-3.5 text-zinc-400" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setServerDropdownOpen(false);
                          setServerSettingsTab("roles");
                          setServerSettingsOpen(true);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.06]"
                      >
                        <span>Roles &amp; Permissions</span>
                        <Shield className="h-3.5 w-3.5 text-zinc-400" />
                      </button>

                      {canManageChannels && (
                        <>
                          <div className="my-1 h-px bg-white/[0.07]" />
                          <button
                            type="button"
                            onClick={() => {
                              setServerDropdownOpen(false);
                              openCreateChannel("text", null);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.06]"
                          >
                            <span>Create Channel</span>
                            <Plus className="h-3.5 w-3.5 text-zinc-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setServerDropdownOpen(false);
                              setEditingCategory(null);
                              setCategoryModalOpen(true);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.06]"
                          >
                            <span>Create Category</span>
                            <FolderPlus className="h-3.5 w-3.5 text-zinc-400" />
                          </button>
                        </>
                      )}

                      {activeServer.ownerId !== user.id && (
                        <>
                          <div className="my-1 h-px bg-white/[0.07]" />
                          <button
                            type="button"
                            onClick={() => {
                              setServerDropdownOpen(false);
                              void handleLeaveServer(activeServer);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                          >
                            <span>Leave Server</span>
                            <LogOut className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Collapsible Categorized Channel List */}
              <nav
                className="flex-1 space-y-5 overflow-y-auto px-2.5 py-3.5"
                aria-label="Server channels"
              >
                {/* Uncategorized top-level channels */}
                {uncategorizedChannels.length > 0 && (
                  <ul className="space-y-0.5">
                    {uncategorizedChannels.map((ch) => renderChannelItem(ch))}
                  </ul>
                )}

                {/* Categorized Channels */}
                {sortedCategories.map((cat) => {
                  const catChannels = accessibleServerChannels.filter(
                    (ch) => ch.categoryId === cat.id
                  );
                  const isCollapsed = Boolean(collapsedCategories[cat.id]);
                  const defaultCatType = /voice|صدا/i.test(cat.name) ? "voice" : "text";

                  return (
                    <div key={cat.id}>
                      <div
                        onContextMenu={(e) => handleCategoryContextMenu(e, cat)}
                        className="mb-1.5 flex items-center gap-1.5 px-1.5"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedCategories((prev) => ({
                              ...prev,
                              [cat.id]: !prev[cat.id],
                            }))
                          }
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-3 w-3 shrink-0" />
                          ) : (
                            <ChevronDown className="h-3 w-3 shrink-0" />
                          )}
                          <span dir="auto" className="truncate">
                            {cat.name}
                          </span>
                          <span className="ml-1 h-px flex-1 bg-white/[0.06]" />
                        </button>

                        {canManageChannels && (
                          <button
                            type="button"
                            onClick={() => openCreateChannel(defaultCatType, cat.id)}
                            title={`Create channel in ${cat.name}`}
                            className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {!isCollapsed && (
                        <ul className="space-y-0.5">
                          {catChannels.length === 0 ? (
                            <li className="px-2.5 py-1 text-[11px] text-zinc-600">
                              No channels yet
                            </li>
                          ) : (
                            catChannels.map((ch) => renderChannelItem(ch))
                          )}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </nav>
            </>
          )}

          {/* Persistent Active Voice / DM Call Connection Dock */}
          <AnimatePresence>
            {isVoiceConnected && voice.activeChannel && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="border-t border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.07] to-[#0E1014] px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <ConnectionStatusButton stats={voice.networkStats} />

                    <button
                      type="button"
                      onClick={() => {
                        if (voice.activeChannel!.slug.startsWith("dm-")) {
                          selectDmConversation(voice.activeChannel!.id);
                        } else {
                          selectChannel(voice.activeChannel!.id);
                        }
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-1.5">
                        <p className="text-[11px] font-semibold tracking-tight text-emerald-400">
                          {voice.connectionState === ConnectionState.Connecting
                            ? "Connecting..."
                            : "Voice Live"}
                        </p>
                        {voice.networkStats.lastPingMs !== null && (
                          <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-zinc-400">
                            <SlidingNumber value={voice.networkStats.lastPingMs} />
                            <span>ms</span>
                          </span>
                        )}
                      </div>
                      <p dir="auto" className="truncate text-xs font-medium text-zinc-200">
                        {voice.activeChannel.name}
                      </p>
                    </button>
                  </div>

                  <BarVisualizer
                    state={
                      voice.connectionState === ConnectionState.Connecting
                        ? "connecting"
                        : voice.participants.some((p) => p.isSpeaking)
                          ? "speaking"
                          : voice.isMuted
                            ? "muted"
                            : "listening"
                    }
                    barCount={4}
                    size="xs"
                  />

                  <AnimatedIconButton
                    icon={PhoneOffIcon}
                    iconSize={16}
                    onClick={handleLeaveVoiceChannel}
                    title="Disconnect"
                    className="inline-flex items-center justify-center rounded-lg p-1.5 text-rose-400 transition-colors hover:bg-rose-500/15"
                  />
                </div>

                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <AnimatedIconButton
                    icon={voice.isMuted ? MicOffIcon : MicIcon}
                    iconSize={14}
                    onClick={() => void voice.toggleMute()}
                    title={voice.isMuted ? "Unmute" : "Mute"}
                    className={`flex items-center justify-center rounded-md py-1.5 text-xs transition-colors ${
                      voice.isMuted
                        ? "bg-rose-500/15 text-rose-300"
                        : "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09]"
                    }`}
                  />
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
                    onClick={() => setScreenShareModalOpen(true)}
                    title={voice.isScreenSharing ? "Stream options & stop" : "Share screen"}
                    className={`flex items-center justify-center rounded-md py-1.5 text-xs transition-colors ${
                      voice.isScreenSharing
                        ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                        : "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09]"
                    }`}
                  >
                    <Monitor className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Persistent Bottom Profile Dock */}
          <div className="border-t border-white/[0.07] bg-[#0B0C0E] p-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStatusPickerOpen((v) => !v)}
                title="Set status & custom activity"
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-white/[0.05]"
              >
                <Avatar
                  name={user.displayName}
                  color={user.avatarColor}
                  avatarUrl={user.avatarUrl}
                  size="md"
                  status={
                    user.presenceStatus === "invisible" ? "offline" : user.presenceStatus
                  }
                  ringClassName="ring-[#0B0C0E]"
                />
                <div className="min-w-0">
                  <p dir="auto" className="truncate text-xs font-medium text-zinc-100">
                    {user.displayName}
                  </p>
                  <p dir="auto" className="truncate text-[11px] font-medium text-zinc-500">
                    {user.customActivity ||
                      (user.presenceStatus === "idle"
                        ? "Idle"
                        : user.presenceStatus === "dnd"
                          ? "Do Not Disturb"
                          : user.presenceStatus === "invisible"
                            ? "Invisible"
                            : `@${user.username}`)}
                  </p>
                </div>
              </button>

              <AnimatedIconButton
                icon={SettingsIcon}
                iconSize={16}
                onClick={() => openSettings("account")}
                title="User & App Settings"
                className="inline-flex items-center justify-center rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
              />
            </div>
          </div>
        </aside>
      </div>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#121316]">
        {/* TOP BAR — Dynamic based on Home/Friends, Home/DM, or Server Channel */}
        {viewMode === "home" && homeView === "friends" ? (
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] px-4 md:px-6">
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none]">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] md:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>

              <div className="flex shrink-0 items-center gap-2 pr-2">
                <Users className="h-4 w-4 text-emerald-400" />
                <h1 className="text-sm font-semibold text-zinc-100">Friends</h1>
              </div>

              <span className="h-4 w-px shrink-0 bg-white/[0.1]" />

              <div className="flex shrink-0 items-center gap-1">
                {(
                  [
                    { id: "online", label: "Online" },
                    { id: "all", label: "All" },
                    { id: "pending", label: "Pending" },
                  ] as const
                ).map((t) => {
                  const isTabActive = friendsTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFriendsTab(t.id)}
                      className={`relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        isTabActive ? "text-zinc-50" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {isTabActive && (
                        <motion.span
                          layoutId="friends-active-tab"
                          transition={{ type: "spring", stiffness: 440, damping: 32 }}
                          className="absolute inset-0 rounded-lg border border-white/[0.08] bg-white/[0.09]"
                        />
                      )}
                      <span className="relative z-10">{t.label}</span>
                      {t.id === "pending" && incomingRequestsCount > 0 && (
                        <span className="relative z-10 rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-bold tabular-nums text-white">
                          {incomingRequestsCount}
                        </span>
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setFriendsTab("add")}
                  className={`ml-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    friendsTab === "add"
                      ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                      : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                  }`}
                >
                  Add Friend
                </button>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {renderHeaderSmartSearch("Search friends, settings...")}
              <NotificationBell
                notifications={notifications}
                onSelectChannel={(id) => selectChannel(id)}
                onSelectNotification={handleOpenNotification}
                onMarkItemRead={(id) =>
                  setNotifications((prev) =>
                    prev.map((n) => (n.id === id ? { ...n, read: true } : n))
                  )
                }
                onMarkAllRead={() =>
                  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
                }
              />
            </div>
          </header>
        ) : viewMode === "home" && homeView === "dm" && activeDm && activeDmPeer ? (
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] px-4 md:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] md:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>

              <Avatar
                name={activeDmPeer.displayName}
                color={activeDmPeer.avatarColor}
                avatarUrl={activeDmPeer.avatarUrl}
                size="sm"
                status={resolveDisplayStatus(
                  onlineMemberIds.has(activeDmPeer.id),
                  activeDmPeer.presenceStatus
                )}
                ringClassName="ring-[#121316]"
              />
              <div className="min-w-0">
                <h1 dir="auto" className="truncate text-sm font-semibold text-zinc-100">
                  {activeDmPeer.displayName}
                </h1>
              </div>
              <span className="hidden truncate text-xs text-zinc-500 sm:inline">
                @{activeDmPeer.username}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <AnimatedIconButton
                icon={PhoneIcon}
                iconSize={16}
                onClick={() => void handleStartDmCall(activeDmPeer.id, false)}
                title="Start Voice Call"
                aria-label="Start Voice Call"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] bg-[#18191E] text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
              />
              <button
                type="button"
                onClick={() => void handleStartDmCall(activeDmPeer.id, true)}
                title="Start Video Call"
                aria-label="Start Video Call"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] bg-[#18191E] text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
              >
                <Video className="h-4 w-4" />
              </button>

              <ChannelHeaderTools
                channelId={activeDm.id}
                channelName={activeDmPeer.displayName}
                apiBasePath={`/api/dms/${activeDm.id}/messages`}
                currentUser={user}
                members={members}
                onJumpToMessage={(messageId) =>
                  setJumpTarget({ messageId, nonce: Date.now() })
                }
                onMessageUnpinned={(messageId) =>
                  setUnpinnedEvent({ messageId, nonce: Date.now() })
                }
              />

              <button
                type="button"
                onClick={() => setShowDmProfileSidebar((v) => !v)}
                title={showDmProfileSidebar ? "Hide User Profile" : "Show User Profile"}
                aria-label="Toggle user profile sidebar"
                className={`hidden h-8 w-8 items-center justify-center rounded-lg border transition-colors lg:flex ${
                  showDmProfileSidebar
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-white/[0.1] bg-[#18191E] text-zinc-300 hover:text-white"
                }`}
              >
                <PanelRight className="h-4 w-4" />
              </button>

              {renderHeaderSmartSearch(`Search @${activeDmPeer.username}...`)}

              <NotificationBell
                notifications={notifications}
                onSelectChannel={(id) => selectChannel(id)}
                onSelectNotification={handleOpenNotification}
                onMarkItemRead={(id) =>
                  setNotifications((prev) =>
                    prev.map((n) => (n.id === id ? { ...n, read: true } : n))
                  )
                }
                onMarkAllRead={() =>
                  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
                }
              />
            </div>
          </header>
        ) : (
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
                  {activeChannel.isPrivate && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                      <Lock className="h-2.5 w-2.5" />
                      Private
                    </span>
                  )}
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

            <div className="flex shrink-0 items-center gap-2">
              {activeChannel && activeChannel.type === "text" && (
                <ChannelHeaderTools
                  channelId={activeChannel.id}
                  channelName={activeChannel.name}
                  currentUser={user}
                  members={members}
                  onJumpToMessage={(messageId) =>
                    setJumpTarget({ messageId, nonce: Date.now() })
                  }
                  onMessageUnpinned={(messageId) =>
                    setUnpinnedEvent({ messageId, nonce: Date.now() })
                  }
                />
              )}

              {canCreateInvites && activeServer && (
                <button
                  type="button"
                  onClick={() => openServerInvites(activeServer)}
                  className="hidden h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#18191E] px-3 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-300 sm:inline-flex"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Invite</span>
                </button>
              )}

              {renderHeaderSmartSearch(
                activeChannel && activeChannel.type === "text"
                  ? `Search #${activeChannel.name}...`
                  : "Search channels, settings..."
              )}

              <NotificationBell
                notifications={notifications}
                onSelectChannel={(id) => selectChannel(id)}
                onSelectNotification={handleOpenNotification}
                onMarkItemRead={(id) =>
                  setNotifications((prev) =>
                    prev.map((n) => (n.id === id ? { ...n, read: true } : n))
                  )
                }
                onMarkAllRead={() =>
                  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
                }
              />
            </div>
          </header>
        )}

        {/* MAIN VIEWPORT */}
        <div className="flex min-h-0 flex-1 select-text">
          {viewMode === "home" && homeView === "friends" ? (
            <>
              <FriendsHubView
                currentUser={user}
                friends={friends}
                allMembers={members}
                onlineMemberIds={onlineMemberIds}
                activeTab={friendsTab}
                getUserVoiceActivity={(uid) => {
                  const vi = findMemberVoiceInfo(uid);
                  return {
                    inVoice: Boolean(vi.channel),
                    channelName: vi.channel?.name,
                    isScreenSharing: vi.isScreenSharing,
                  };
                }}
                onFriendsChanged={() => void syncPresence()}
                onStartDm={(uid) => void handleStartDm(uid)}
                onStartDmCall={(uid, withVideo) => void handleStartDmCall(uid, withVideo)}
                onOpenUserProfile={openEnrichedProfilePopover}
              />
              <ActiveNowRail
                friends={friends}
                servers={servers}
                members={members}
                onlineMemberIds={onlineMemberIds}
                voiceOccupancy={voiceOccupancy}
                onJoinVoice={(serverId, ch) => {
                  selectChannel(ch.id, serverId);
                  handleJoinVoiceChannel(ch);
                }}
                onWatchStream={(serverId, ch, streamerId) =>
                  handleWatchUserStream(streamerId, ch.id, serverId)
                }
                onStartDm={(uid) => void handleStartDm(uid)}
              />
            </>
          ) : viewMode === "home" && homeView === "dm" && activeDm ? (
            <DmConversationView
              conversation={activeDm}
              currentUser={user}
              members={members}
              servers={servers}
              onlineMemberIds={onlineMemberIds}
              voiceOccupancy={voiceOccupancy}
              blobReady={capabilities.blobReady}
              showProfileSidebar={showDmProfileSidebar}
              density={appPrefs.messageDensity}
              textScale={appPrefs.textScale}
              jumpTarget={jumpTarget}
              unpinnedEvent={unpinnedEvent}
              onStartCall={(withVideo) =>
                void handleStartDmCall(activeDm.peer.id, withVideo)
              }
              onLeaveCall={handleLeaveVoiceChannel}
              onOpenScreenShareModal={() => setScreenShareModalOpen(true)}
              onOpenUserProfile={openEnrichedProfilePopover}
              onSelectServer={(sid) => selectServer(sid)}
              onMessagesSeen={handleMessagesSeen}
            />
          ) : activeChannel ? (
            activeChannel.type === "text" ? (
              <TextChannelView
                channel={activeChannel}
                currentUser={user}
                members={members}
                blobReady={capabilities.blobReady}
                canSendMessages={
                  myServerPermissions.administrator || myServerPermissions.sendMessages
                }
                canManageMessages={
                  myServerPermissions.administrator || myServerPermissions.manageMessages
                }
                density={appPrefs.messageDensity}
                textScale={appPrefs.textScale}
                jumpTarget={jumpTarget}
                unpinnedEvent={unpinnedEvent}
                onOpenUserProfile={openEnrichedProfilePopover}
                onMessagesSeen={handleMessagesSeen}
              />
            ) : (
              <VoiceStage
                channel={activeChannel}
                currentUser={user}
                members={members}
                livekitReady={capabilities.livekitReady}
                previewOccupants={voiceOccupancy[activeChannel.slug] ?? []}
                isStageMaximized={isStageMaximized}
                onToggleMaximize={() => setIsStageMaximized((v) => !v)}
                onOpenScreenShareModal={() => setScreenShareModalOpen(true)}
                onOpenVoiceSettings={() => openSettings("voice")}
                onOpenUserProfile={openEnrichedProfilePopover}
                onJoinVoiceChannel={(ch) => handleJoinVoiceChannel(ch)}
                onLeaveVoiceChannel={handleLeaveVoiceChannel}
              />
            )
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
              <p className="text-sm text-zinc-400">
                {activeServer
                  ? "No accessible channels in this server yet."
                  : "Create or join a server to get started."}
              </p>
              {activeServer && canManageChannels ? (
                <button
                  type="button"
                  onClick={() => openCreateChannel("text")}
                  className="mt-3 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950"
                >
                  Create your first channel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setServerCreateJoinOpen(true)}
                  className="mt-3 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950"
                >
                  Create or Join Server
                </button>
              )}
            </div>
          )}

          {/* Right Server Members Rail */}
          {showMembersRail && (
            <aside className="hidden w-56 shrink-0 flex-col border-l border-white/[0.07] bg-[#0E0F12] p-4 select-none lg:flex">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                  <Users className="h-3.5 w-3.5" />
                  <span>Members</span>
                </div>
                <span className="text-[11px] font-medium tabular-nums text-zinc-500">
                  {onlineServerMembers.length}/{activeServerMembers.length}
                </span>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto">
                <div>
                  <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Online · {onlineServerMembers.length}
                  </p>
                  <ul className="space-y-0.5">
                    {onlineServerMembers.map((member) => {
                      const voiceInfo = findMemberVoiceInfo(member.id);
                      const topRole = activeServer
                        ? getMemberRolesInServer(activeServer, member.id)[0]
                        : undefined;
                      return (
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
                              status={resolveDisplayStatus(true, member.presenceStatus)}
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                dir="auto"
                                style={topRole ? { color: topRole.color } : undefined}
                                className="truncate font-medium text-zinc-200"
                              >
                                {member.displayName}
                              </p>
                              <p dir="auto" className="truncate text-[11px] text-zinc-500">
                                {member.customActivity
                                  ? member.customActivity
                                  : topRole
                                    ? topRole.name
                                    : member.role === "admin"
                                      ? "Admin"
                                      : `@${member.username}`}
                              </p>
                            </div>
                            {voiceInfo.isScreenSharing && (
                              <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
                                LIVE
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {offlineServerMembers.length > 0 && (
                  <div>
                    <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      Offline · {offlineServerMembers.length}
                    </p>
                    <ul className="space-y-0.5">
                      {offlineServerMembers.map((member) => {
                        const topRole = activeServer
                          ? getMemberRolesInServer(activeServer, member.id)[0]
                          : undefined;
                        return (
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
                                <p className="truncate text-[11px] text-zinc-500">
                                  {topRole ? topRole.name : `@${member.username}`}
                                </p>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Modals, Popovers & Toast Stack */}
      <InviteModal
        open={inviteOpen}
        serverId={inviteServer?.id ?? activeServer?.id ?? null}
        serverName={inviteServer?.name ?? activeServer?.name ?? null}
        onClose={() => setInviteOpen(false)}
      />

      <SettingsModal
        open={settingsOpen}
        initialTab={settingsTab}
        user={user}
        blobReady={capabilities.blobReady}
        appPrefs={appPrefs}
        onUpdatePrefs={updateAppPrefs}
        onResetPrefs={() => setAppPrefs(DEFAULT_APP_PREFERENCES)}
        onClose={() => setSettingsOpen(false)}
        onUserUpdated={handleUserUpdated}
        onSignOut={() => void handleSignOut()}
      />

      <ServerCreateJoinModal
        open={serverCreateJoinOpen}
        onClose={() => setServerCreateJoinOpen(false)}
        onServersUpdated={(updatedList, focusId) => {
          setServers(updatedList);
          if (focusId) {
            const targetSrv = updatedList.find((s) => s.id === focusId);
            setViewMode("server");
            setActiveServerId(focusId);
            setSelectedChannelId(pickInitialChannelId(targetSrv, user.id));
          }
        }}
      />

      <ServerSettingsModal
        open={serverSettingsOpen}
        initialTab={serverSettingsTab}
        server={activeServer}
        currentUser={user}
        members={members}
        permissions={myServerPermissions}
        blobReady={capabilities.blobReady}
        onClose={() => setServerSettingsOpen(false)}
        onRefreshServers={refreshServersNow}
        onServerDeleted={handleServerDeleted}
      />

      <CategoryModal
        open={categoryModalOpen}
        serverId={activeServer?.id ?? null}
        editingCategory={editingCategory}
        onClose={() => setCategoryModalOpen(false)}
        onSaved={handleCategorySaved}
      />

      <ChannelModal
        open={channelModalOpen}
        serverId={activeServer?.id ?? null}
        defaultType={channelModalType}
        defaultCategoryId={channelModalCategoryId}
        categories={sortedCategories}
        roles={activeServer?.roles ?? []}
        editingChannel={editingChannel}
        onClose={() => setChannelModalOpen(false)}
        onSaved={handleChannelSaved}
      />

      <VoiceDynamicIsland
        visible={Boolean(
          isVoiceConnected &&
            voice.activeChannel &&
            !(
              viewMode === "server" &&
              activeChannel?.type === "voice" &&
              activeChannel.id === voice.activeChannel.id
            ) &&
            !(
              viewMode === "home" &&
              homeView === "dm" &&
              voice.activeChannel.slug.startsWith("dm-") &&
              activeDmId === voice.activeChannel.id
            )
        )}
        onReturnToStage={() => {
          if (!voice.activeChannel) return;
          if (voice.activeChannel.slug.startsWith("dm-")) {
            selectDmConversation(voice.activeChannel.id);
          } else {
            selectChannel(voice.activeChannel.id);
          }
        }}
        onOpenScreenShareModal={() => setScreenShareModalOpen(true)}
        onLeaveVoice={handleLeaveVoiceChannel}
      />

      <FindConversationModal
        open={findConvOpen}
        initialCategory={findConvCategory}
        currentUserId={user.id}
        members={members}
        onlineMemberIds={onlineMemberIds}
        servers={servers}
        activeChatContext={activeChatSearchContext}
        quickActions={
          [
            {
              id: "settings-appearance",
              label: "Appearance, Themes & Local Fonts",
              description: "Switch among 8 dark color themes, 4 local fonts, density & scale",
              keywords: [
                "theme",
                "color",
                "font",
                "appearance",
                "ui",
                "dark",
                "scale",
                "density",
                "تم",
                "رنگ",
                "فونت",
                "ظاهر",
                "استایل",
              ],
              hint: "Settings",
              icon: "appearance",
              onSelect: () => openSettings("appearance"),
            },
            {
              id: "settings-account",
              label: "Account, Profile & Avatar",
              description: "Edit display name, bio, custom status, avatar & banner",
              keywords: [
                "account",
                "profile",
                "avatar",
                "banner",
                "bio",
                "username",
                "status",
                "پروفایل",
                "اکانت",
                "حساب",
                "آواتار",
              ],
              hint: "Settings",
              icon: "settings",
              onSelect: () => openSettings("account"),
            },
            {
              id: "settings-voice",
              label: "Voice, Audio & Noise Cancellation",
              description: "Microphone, speakers, Krisp/RNNoise filter & push-to-talk",
              keywords: [
                "voice",
                "audio",
                "mic",
                "microphone",
                "speaker",
                "noise",
                "volume",
                "sound",
                "ویس",
                "صدا",
                "میکروفون",
                "نویز",
              ],
              hint: "Settings",
              icon: "voice",
              onSelect: () => openSettings("voice"),
            },
            {
              id: "settings-notifications",
              label: "Notifications, Sounds & Toast Test",
              description: "Configure desktop alerts, sound effects & test toast stacking",
              keywords: [
                "notifications",
                "notify",
                "toast",
                "sound",
                "alert",
                "bell",
                "test",
                "نوتیف",
                "نوتیفیکیشن",
                "اعلان",
                "صدای پیام",
              ],
              hint: "Settings",
              icon: "notifications",
              onSelect: () => openSettings("notifications"),
            },
            {
              id: "settings-privacy",
              label: "Privacy, Security & Password",
              description: "Change password, session security & local cache controls",
              keywords: [
                "privacy",
                "security",
                "password",
                "cache",
                "reset",
                "امنیت",
                "رمز",
                "حریم خصوصی",
              ],
              hint: "Settings",
              icon: "privacy",
              onSelect: () => openSettings("privacy"),
            },
            {
              id: "friends-hub",
              label: "Friends & Direct Messages",
              description: "View online friends, pending requests & private chats",
              keywords: ["friends", "dm", "home", "online", "دوستان", "پیام خصوصی", "خانه"],
              hint: "Home",
              icon: "friends",
              onSelect: () => selectHomeFriends("online"),
            },
            {
              id: "add-friend",
              label: "Add a Friend",
              description: "Send a friend request by username",
              keywords: ["add friend", "request", "invite", "افزودن دوست", "دوست جدید"],
              hint: "Friends",
              icon: "add-friend",
              onSelect: () => selectHomeFriends("add"),
            },
            {
              id: "create-join-server",
              label: "Create or Join a Server",
              description: "Start a new server or join with an invite code",
              keywords: ["create server", "join server", "new server", "ساخت سرور", "ورود به سرور"],
              hint: "Server",
              icon: "server",
              onSelect: () => setServerCreateJoinOpen(true),
            },
            ...(activeServer
              ? ([
                  {
                    id: "server-settings",
                    label: `Server Settings — ${activeServer.name}`,
                    description: "Edit server name, icon, overview & members",
                    keywords: ["server settings", "manage server", "تنظیمات سرور", activeServer.name],
                    hint: activeServer.name,
                    icon: "settings",
                    onSelect: () => {
                      setServerSettingsTab("overview");
                      setServerSettingsOpen(true);
                    },
                  },
                  {
                    id: "server-roles",
                    label: `Roles & Permissions — ${activeServer.name}`,
                    description: "Configure server roles, colors & access permissions",
                    keywords: ["roles", "permissions", "admin", "نقش", "دسترسی", activeServer.name],
                    hint: activeServer.name,
                    icon: "roles",
                    onSelect: () => {
                      setServerSettingsTab("roles");
                      setServerSettingsOpen(true);
                    },
                  },
                  ...(canCreateInvites
                    ? ([
                        {
                          id: "server-invite",
                          label: `Invite People to ${activeServer.name}`,
                          description: "Generate or copy a server invite link",
                          keywords: ["invite", "link", "code", "دعوت", "لینک دعوت"],
                          hint: activeServer.name,
                          icon: "invite",
                          onSelect: () => openServerInvites(activeServer),
                        },
                      ] satisfies CommandQuickAction[])
                    : []),
                  ...(canManageChannels
                    ? ([
                        {
                          id: "create-channel",
                          label: `Create Channel in ${activeServer.name}`,
                          description: "Add a new text or voice channel",
                          keywords: ["create channel", "new channel", "text", "voice", "ساخت کانال", "کانال جدید"],
                          hint: activeServer.name,
                          icon: "channel",
                          onSelect: () => openCreateChannel("text", null),
                        },
                        {
                          id: "create-category",
                          label: `Create Category in ${activeServer.name}`,
                          description: "Group server channels under a new category",
                          keywords: ["create category", "new category", "گروه کانال", "دسته‌بندی"],
                          hint: activeServer.name,
                          icon: "category",
                          onSelect: () => {
                            setEditingCategory(null);
                            setCategoryModalOpen(true);
                          },
                        },
                      ] satisfies CommandQuickAction[])
                    : []),
                ] satisfies CommandQuickAction[])
              : []),
            ...(isVoiceConnected
              ? ([
                  {
                    id: "voice-toggle-mute",
                    label: voice.isMuted ? "Unmute Microphone" : "Mute Microphone",
                    description: `Active in ${voice.activeChannel?.name ?? "voice"}`,
                    keywords: ["mute", "unmute", "mic", "میوت", "میکروفون"],
                    hint: "Voice",
                    icon: "mic",
                    onSelect: () => void voice.toggleMute(),
                  },
                  {
                    id: "voice-toggle-deafen",
                    label: voice.isDeafened ? "Undeafen Audio" : "Deafen Audio",
                    description: "Toggle incoming voice sound & microphone",
                    keywords: ["deafen", "undeafen", "audio", "دیفن", "قطع صدا"],
                    hint: "Voice",
                    icon: "voice",
                    onSelect: () => void voice.toggleDeafen(),
                  },
                  {
                    id: "voice-screen-share",
                    label: voice.isScreenSharing ? "Screen Share Options" : "Share Screen",
                    description: "Configure stream resolution, FPS & audio",
                    keywords: ["screen", "share", "stream", "live", "استریم", "اشتراک صفحه"],
                    hint: "Voice",
                    icon: "voice",
                    onSelect: () => setScreenShareModalOpen(true),
                  },
                  {
                    id: "voice-leave",
                    label: "Disconnect from Voice",
                    description: `Leave ${voice.activeChannel?.name ?? "current voice room"}`,
                    keywords: ["leave", "disconnect", "hangup", "خروج از ویس", "قطع تماس"],
                    hint: "Voice",
                    icon: "voice",
                    onSelect: () => handleLeaveVoiceChannel(),
                  },
                ] satisfies CommandQuickAction[])
              : []),
          ] satisfies CommandQuickAction[]
        }
        onClose={() => setFindConvOpen(false)}
        onStartDm={(uid) => void handleStartDm(uid)}
        onSelectServer={(sid) => selectServer(sid)}
        onSelectChannel={(sid, cid) => selectChannel(cid, sid)}
        onJumpToMessage={(messageId) =>
          setJumpTarget({ messageId, nonce: Date.now() })
        }
      />

      <ScreenShareModal
        open={screenShareModalOpen}
        onClose={() => setScreenShareModalOpen(false)}
      />

      <UserProfilePopover
        target={profilePopover}
        currentUserId={user.id}
        currentVoiceChannelId={voice.activeChannel?.id ?? null}
        onClose={() => setProfilePopover(null)}
        onWatchStream={(target) =>
          handleWatchUserStream(target.id, target.voiceChannelId)
        }
        onJoinVoice={(voiceChannelId) => {
          const found = allVoiceChannels.find((x) => x.channel.id === voiceChannelId);
          if (found) {
            selectChannel(found.channel.id, found.server.id);
            handleJoinVoiceChannel(found.channel);
          }
        }}
        onToggleRole={(uid, rid) => void handleToggleUserRoleFromPopover(uid, rid)}
        onAddFriend={(uname) => void handleQuickAddFriend(uname)}
        onAcceptFriend={(fid) => void handleQuickAcceptFriend(fid)}
        onQuickMessage={handleQuickMessage}
        onOpenDm={(uid) => void handleStartDm(uid)}
      />

      <AnimatePresence>
        {streamPreview && (
          <StreamPreviewPopover
            target={streamPreview}
            onMouseEnter={cancelHideStreamPreview}
            onMouseLeave={scheduleHideStreamPreview}
            onWatchStream={(target) => {
              setStreamPreview(null);
              handleWatchUserStream(target.identity, target.channelId);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {statusPickerOpen && (
          <StatusPickerPopover
            user={user}
            onClose={() => setStatusPickerOpen(false)}
            onUserUpdated={handleUserUpdated}
            onOpenSettings={() => openSettings("account")}
          />
        )}
      </AnimatePresence>

      <NotificationToasts
        toasts={toasts}
        toastStyle={appPrefs.toastStyle}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        onOpenChannel={(channelId, toastId) => {
          selectChannel(channelId);
          setToasts((prev) => prev.filter((t) => t.id !== toastId));
        }}
        onOpenNotification={handleOpenNotification}
      />
    </div>
  );
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  const [presenceRef] = useState<{ current: () => void }>(() => ({
    current: () => {},
  }));
  const [notifyRef] = useState<{
    current: (payload: SystemNotifyPayload) => void;
  }>(() => ({
    current: () => {},
  }));

  const notify = useCallback(
    (payload: SystemNotifyPayload) => {
      notifyRef.current(payload);
    },
    [notifyRef]
  );

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
      <SystemNotifyProvider value={notify}>
        <ContextMenuProvider fallbackEntries={buildFallbackMenu}>
          <VoiceProvider onOccupancyChanged={() => presenceRef.current()}>
            <WorkspaceInner
              {...props}
              onPresenceRef={presenceRef}
              onNotifyRef={notifyRef}
            />
          </VoiceProvider>
        </ContextMenuProvider>
      </SystemNotifyProvider>
    </MotionConfig>
  );
}
