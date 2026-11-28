"use client";

import { apiFetch, mediaUrl } from "@/lib/client-api";
import {
  Bell,
  CornerDownLeft,
  FolderPlus,
  Hash,
  Headphones,
  KeyRound,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  Palette,
  Paperclip,
  Plus,
  Search,
  Server,
  Settings,
  Shield,
  Sparkles,
  UserPlus,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, resolveDisplayStatus } from "@siq/shared/components/ui/Avatar";
import { HeaderPanel } from "@siq/shared/components/ui/HeaderPanel";
import type { MessageItem, PublicUser, ServerDetail } from "@siq/shared/lib/types";

export type SearchCategory =
  | "all"
  | "messages"
  | "channels"
  | "people"
  | "servers"
  | "settings";

export interface CommandQuickAction {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  hint?: string;
  icon:
    | "settings"
    | "voice"
    | "appearance"
    | "notifications"
    | "privacy"
    | "friends"
    | "add-friend"
    | "server"
    | "channel"
    | "category"
    | "invite"
    | "roles"
    | "mic";
  onSelect: () => void;
}

export interface ActiveChatSearchContext {
  label: string;
  apiBasePath: string;
}

interface FindConversationPanelProps {
  open: boolean;
  initialCategory?: SearchCategory;
  currentUserId: string;
  members: PublicUser[];
  onlineMemberIds: Set<string>;
  servers: ServerDetail[];
  activeChatContext?: ActiveChatSearchContext | null;
  quickActions?: CommandQuickAction[];
  onClose: () => void;
  onStartDm: (userId: string) => void;
  onSelectServer?: (serverId: string) => void;
  onSelectChannel: (serverId: string, channelId: string) => void;
  onJumpToMessage?: (messageId: string) => void;
}

type FlatCommandItem =
  | { kind: "message"; key: string; message: MessageItem }
  | { kind: "user"; key: string; person: PublicUser }
  | {
      kind: "channel";
      key: string;
      server: ServerDetail;
      channel: ServerDetail["channels"][number];
    }
  | { kind: "server"; key: string; server: ServerDetail }
  | { kind: "action"; key: string; action: CommandQuickAction };

const CATEGORIES: Array<{ id: SearchCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "messages", label: "Messages" },
  { id: "channels", label: "Channels" },
  { id: "people", label: "People" },
  { id: "servers", label: "Servers" },
  { id: "settings", label: "Settings & Actions" },
];

function ActionIcon({ icon }: { icon: CommandQuickAction["icon"] }) {
  switch (icon) {
    case "settings":
      return <Settings className="h-3.5 w-3.5 text-zinc-300" />;
    case "voice":
      return <Headphones className="h-3.5 w-3.5 text-emerald-400" />;
    case "appearance":
      return <Palette className="h-3.5 w-3.5 text-emerald-400" />;
    case "notifications":
      return <Bell className="h-3.5 w-3.5 text-emerald-400" />;
    case "privacy":
      return <Shield className="h-3.5 w-3.5 text-zinc-300" />;
    case "friends":
      return <Users className="h-3.5 w-3.5 text-emerald-400" />;
    case "add-friend":
      return <UserPlus className="h-3.5 w-3.5 text-emerald-400" />;
    case "server":
      return <Plus className="h-3.5 w-3.5 text-emerald-400" />;
    case "channel":
      return <Hash className="h-3.5 w-3.5 text-emerald-400" />;
    case "category":
      return <FolderPlus className="h-3.5 w-3.5 text-zinc-300" />;
    case "invite":
      return <KeyRound className="h-3.5 w-3.5 text-emerald-400" />;
    case "roles":
      return <Sparkles className="h-3.5 w-3.5 text-emerald-400" />;
    case "mic":
      return <Mic className="h-3.5 w-3.5 text-emerald-400" />;
  }
}

function formatMsgDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Result rows cascade in by their position in the keyboard order
function rowEnter(idx: number) {
  return {
    type: "spring" as const,
    stiffness: 520,
    damping: 38,
    delay: 0.04 + Math.min(idx, 14) * 0.018,
  };
}

const ROW_INITIAL = { opacity: 0, y: 6 };
const ROW_ANIMATE = { opacity: 1, y: 0 };
const ACTIVE_ROW_SPRING = { type: "spring" as const, stiffness: 560, damping: 42, mass: 0.7 };

const ROW_CLASS =
  "group relative isolate flex w-full rounded-xl px-2.5 py-2 text-left outline-none transition-colors duration-150";

const SECTION_LABEL_CLASS =
  "mb-1.5 flex items-center gap-1.5 px-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-zinc-500";

export function FindConversationPanel({
  open,
  initialCategory = "all",
  currentUserId,
  members,
  onlineMemberIds,
  servers,
  activeChatContext = null,
  quickActions = [],
  onClose,
  onStartDm,
  onSelectServer,
  onSelectChannel,
  onJumpToMessage,
}: FindConversationPanelProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SearchCategory>(initialCategory);
  const [activeIndex, setActiveIndex] = useState(0);
  const [msgResults, setMsgResults] = useState<MessageItem[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const q = query.trim().toLowerCase();

  // Reset state on open
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCategory(initialCategory);
    setActiveIndex(0);
    setMsgResults([]);
    setMsgLoading(false);
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, initialCategory]);

  const activeApiBasePath = activeChatContext?.apiBasePath ?? null;

  // Debounced live message search inside the current channel or DM
  useEffect(() => {
    if (!open || !activeApiBasePath) {
      setMsgResults([]);
      setMsgLoading(false);
      return;
    }
    if (category !== "all" && category !== "messages") {
      setMsgLoading(false);
      return;
    }
    const trimmed = query.trim();
    if (!trimmed) {
      setMsgResults([]);
      setMsgLoading(false);
      return;
    }

    const controller = new AbortController();
    setMsgLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `${activeApiBasePath}?q=${encodeURIComponent(trimmed)}`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!res.ok) {
          setMsgResults([]);
          return;
        }
        const data = await res.json();
        if (!controller.signal.aborted) setMsgResults(data.messages ?? []);
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setMsgResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setMsgLoading(false);
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, activeApiBasePath, category, query]);

  const showMessages = (category === "all" || category === "messages") && Boolean(activeChatContext);
  const showChannels = category === "all" || category === "channels";
  const showPeople = category === "all" || category === "people";
  const showServers = category === "all" || category === "servers";
  const showSettings = category === "all" || category === "settings";

  const visibleMessages = useMemo(
    () => (showMessages ? msgResults.slice(0, category === "messages" ? 20 : 5) : []),
    [showMessages, msgResults, category]
  );

  const matchingUsers = useMemo(
    () =>
      showPeople
        ? members
            .filter(
              (m) =>
                m.id !== currentUserId &&
                (!q ||
                  m.displayName.toLowerCase().includes(q) ||
                  m.username.toLowerCase().includes(q) ||
                  (m.customActivity && m.customActivity.toLowerCase().includes(q)))
            )
            .slice(0, category === "people" ? 15 : 5)
        : [],
    [showPeople, currentUserId, members, q, category]
  );

  const matchingChannels = useMemo(
    () =>
      showChannels
        ? servers
            .flatMap((s) => s.channels.map((ch) => ({ server: s, channel: ch })))
            .filter(
              ({ server, channel }) =>
                !q ||
                channel.name.toLowerCase().includes(q) ||
                server.name.toLowerCase().includes(q) ||
                (channel.description && channel.description.toLowerCase().includes(q))
            )
            .slice(0, category === "channels" ? 20 : 6)
        : [],
    [showChannels, q, servers, category]
  );

  const matchingServers = useMemo(
    () =>
      showServers
        ? servers
            .filter(
              (s) =>
                !q ||
                s.name.toLowerCase().includes(q) ||
                (s.tag && s.tag.toLowerCase().includes(q))
            )
            .slice(0, category === "servers" ? 15 : 4)
        : [],
    [showServers, q, servers, category]
  );

  const matchingActions = useMemo(
    () =>
      showSettings
        ? quickActions
            .filter(
              (a) =>
                !q ||
                a.label.toLowerCase().includes(q) ||
                (a.description && a.description.toLowerCase().includes(q)) ||
                (a.hint && a.hint.toLowerCase().includes(q)) ||
                (a.keywords && a.keywords.some((kw) => kw.toLowerCase().includes(q)))
            )
            .slice(0, category === "settings" ? 20 : 6)
        : [],
    [showSettings, q, quickActions, category]
  );

  const flatItems = useMemo<FlatCommandItem[]>(() => {
    const items: FlatCommandItem[] = [];
    for (const message of visibleMessages) {
      items.push({ kind: "message", key: `m-${message.id}`, message });
    }
    for (const entry of matchingChannels) {
      items.push({
        kind: "channel",
        key: `c-${entry.channel.id}`,
        server: entry.server,
        channel: entry.channel,
      });
    }
    for (const person of matchingUsers) {
      items.push({ kind: "user", key: `u-${person.id}`, person });
    }
    for (const server of matchingServers) {
      items.push({ kind: "server", key: `s-${server.id}`, server });
    }
    for (const action of matchingActions) {
      items.push({ kind: "action", key: `a-${action.id}`, action });
    }
    return items;
  }, [visibleMessages, matchingChannels, matchingUsers, matchingServers, matchingActions]);

  useEffect(() => {
    setActiveIndex(0);
  }, [q, category, open]);

  function executeItem(item: FlatCommandItem) {
    if (item.kind === "message") {
      onJumpToMessage?.(item.message.id);
    } else if (item.kind === "user") {
      onStartDm(item.person.id);
    } else if (item.kind === "channel") {
      onSelectChannel(item.server.id, item.channel.id);
    } else if (item.kind === "server") {
      onSelectServer?.(item.server.id);
    } else {
      item.action.onSelect();
    }
    onClose();
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || flatItems.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % flatItems.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + flatItems.length) % flatItems.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = flatItems[activeIndex];
      if (chosen) executeItem(chosen);
    }
  }

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmd-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const availableCategories = CATEGORIES.filter(
    (c) => c.id !== "messages" || Boolean(activeChatContext)
  );

  let cursor = 0;

  return (
    <AnimatePresence>
      {open && (
        <HeaderPanel kind="search" label="Universal Smart Search">
            {/* Unified Search Input */}
            <div className="group/search flex shrink-0 items-center gap-3 border-b border-white/[0.07] px-3.5 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-emerald-500/10 shadow-[0_0_20px_-6px_rgb(var(--siq-accent-rgb)/0.75)] ring-1 ring-inset ring-emerald-500/25 transition-shadow duration-300 group-focus-within/search:shadow-[0_0_26px_-4px_rgb(var(--siq-accent-rgb)/0.85)]">
                {msgLoading ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-300" />
                ) : (
                  <Search className="h-4 w-4 shrink-0 text-emerald-300" />
                )}
              </span>
              <input
                ref={inputRef}
                type="text"
                aria-label="Search everything"
                dir="auto"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={
                  category === "messages" && activeChatContext
                    ? `Search messages in ${activeChatContext.label}...`
                    : activeChatContext
                      ? `Search ${activeChatContext.label} or workspace…`
                      : "Search workspace…"
                }
                className="min-w-0 flex-1 bg-transparent text-[15px] font-medium tracking-tight text-zinc-50 placeholder:font-normal placeholder:text-zinc-500 focus:outline-none"
              />
              {query && (
                <motion.button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  initial={{ opacity: 0, scale: 0.6, rotate: -45 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 26 }}
                  className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-200"
                >
                  <X className="h-3.5 w-3.5" />
                </motion.button>
              )}
              <kbd className="hidden rounded-md border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)] sm:inline">
                ESC
              </kbd>
            </div>

            {/* Category Filter Pill Bar */}
            <motion.div
              layoutScroll
              className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/[0.06] bg-black/20 px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {availableCategories.map((cat) => {
                const active = category === cat.id;
                const count =
                  cat.id === "messages" && msgResults.length > 0
                    ? msgResults.length
                    : null;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setCategory(cat.id);
                      inputRef.current?.focus();
                    }}
                    className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-emerald-400/50 ${
                      active ? "text-emerald-100" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="smart-search-cat-pill"
                        transition={{ type: "spring", stiffness: 500, damping: 36 }}
                        className="absolute inset-0 rounded-lg bg-gradient-to-b from-emerald-500/[0.22] to-emerald-500/[0.08] shadow-[0_0_18px_-6px_rgb(var(--siq-accent-rgb)/0.8)] ring-1 ring-inset ring-emerald-500/35"
                      >
                        <span className="absolute inset-x-3 -bottom-2 h-[2px] rounded-full bg-emerald-400 shadow-[0_0_10px_rgb(var(--siq-accent-rgb)/0.9)]" />
                      </motion.span>
                    )}
                    <span className="relative z-10">{cat.label}</span>
                    {count !== null && (
                      <motion.span
                        key={count}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 520, damping: 22 }}
                        className="relative z-10 rounded-full bg-emerald-500/20 px-1.5 text-[9px] font-bold tabular-nums text-emerald-300"
                      >
                        {count}
                      </motion.span>
                    )}
                  </button>
                );
              })}
            </motion.div>

            {/* Categorized Results Viewport */}
            <motion.div
              ref={listRef}
              layoutScroll
              className="min-h-0 max-h-[420px] space-y-4 overflow-y-auto p-3"
            >
              {/* Messages Section */}
              {showMessages && (visibleMessages.length > 0 || category === "messages") && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between px-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-zinc-500">
                      <MessageSquare className="h-3 w-3 shrink-0 text-zinc-600" />
                      <span className="truncate">Messages in {activeChatContext?.label}</span>
                    </p>
                    {msgLoading && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-400">
                        <span aria-hidden="true" className="siq-live-dot !h-1.5 !w-1.5" />
                        Searching...
                      </span>
                    )}
                  </div>
                  {!q && category === "messages" ? (
                    <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-6 text-center text-xs text-zinc-500">
                      Type a word or phrase to search message history in{" "}
                      <span className="font-medium text-zinc-300">{activeChatContext?.label}</span>.
                    </div>
                  ) : visibleMessages.length === 0 && !msgLoading ? (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-center text-xs text-zinc-500">
                      No messages matching &ldquo;{query.trim()}&rdquo;
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {visibleMessages.map((msg) => {
                        const idx = cursor++;
                        const selected = idx === activeIndex;
                        const authorMember = members.find((m) => m.id === msg.author.id);
                        const name = authorMember?.displayName ?? msg.author.displayName;
                        const avatarColor = authorMember?.avatarColor ?? msg.author.avatarColor;
                        const avatarUrl = authorMember ? authorMember.avatarUrl : msg.author.avatarUrl;
                        return (
                          <motion.button
                            key={msg.id}
                            type="button"
                            data-cmd-idx={idx}
                            data-selected={selected}
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => executeItem({ kind: "message", key: `m-${msg.id}`, message: msg })}
                            initial={ROW_INITIAL}
                            animate={ROW_ANIMATE}
                            transition={rowEnter(idx)}
                            className={`${ROW_CLASS} items-start gap-2.5`}
                          >
                            {selected && (
                              <motion.span
                                layoutId="cmdk-active-row"
                                transition={ACTIVE_ROW_SPRING}
                                className="siq-nav-highlight"
                              />
                            )}
                            <span className="relative z-10 mt-0.5">
                              <Avatar name={name} color={avatarColor} avatarUrl={avatarUrl} size="sm" />
                            </span>
                            <div className="relative z-10 min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span dir="auto" className="truncate text-xs font-semibold text-zinc-100 group-data-[selected=true]:text-white">
                                  {name}
                                </span>
                                <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                                  {formatMsgDate(msg.createdAt)}
                                </span>
                              </div>
                              <p dir="auto" className="mt-0.5 line-clamp-2 text-xs text-zinc-400 group-data-[selected=true]:text-zinc-300">
                                {msg.content || (
                                  <span className="inline-flex items-center gap-1 text-zinc-500">
                                    <Paperclip className="h-3 w-3" /> Attachment
                                  </span>
                                )}
                              </p>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Channels Section */}
              {matchingChannels.length > 0 && (
                <div>
                  <p className={SECTION_LABEL_CLASS}>
                    <Hash className="h-3 w-3 text-zinc-600" />
                    Channels
                  </p>
                  <div className="space-y-0.5">
                    {matchingChannels.map(({ server, channel }) => {
                      const idx = cursor++;
                      const selected = idx === activeIndex;
                      return (
                        <motion.button
                          key={channel.id}
                          type="button"
                          data-cmd-idx={idx}
                          data-selected={selected}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() =>
                            executeItem({
                              kind: "channel",
                              key: `c-${channel.id}`,
                              server,
                              channel,
                            })
                          }
                          initial={ROW_INITIAL}
                          animate={ROW_ANIMATE}
                          transition={rowEnter(idx)}
                          className={`${ROW_CLASS} items-center justify-between gap-2.5`}
                        >
                          {selected && (
                            <motion.span
                              layoutId="cmdk-active-row"
                              transition={ACTIVE_ROW_SPRING}
                              className="siq-nav-highlight"
                            />
                          )}
                          <div className="relative z-10 flex min-w-0 items-center gap-2.5">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.04] ring-1 ring-inset ring-white/[0.06] transition-colors duration-150 group-data-[selected=true]:bg-emerald-500/10 group-data-[selected=true]:ring-emerald-500/25">
                              {channel.type === "text" ? (
                                <Hash className="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-colors group-data-[selected=true]:text-emerald-300" />
                              ) : (
                                <Volume2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                              )}
                            </span>
                            <span dir="auto" className="truncate text-xs font-medium text-zinc-100 group-data-[selected=true]:text-white">
                              {channel.name}
                            </span>
                            {channel.isPrivate && (
                              <Lock className="h-3 w-3 shrink-0 text-amber-400/80" />
                            )}
                          </div>
                          <span className="relative z-10 shrink-0 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 ring-1 ring-inset ring-white/[0.05] transition-colors group-data-[selected=true]:bg-white/[0.08] group-data-[selected=true]:text-zinc-300">
                            {server.name}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* People & Direct Messages Section */}
              {matchingUsers.length > 0 && (
                <div>
                  <p className={SECTION_LABEL_CLASS}>
                    <Users className="h-3 w-3 text-zinc-600" />
                    People &amp; Direct Messages
                  </p>
                  <div className="space-y-0.5">
                    {matchingUsers.map((person) => {
                      const idx = cursor++;
                      const selected = idx === activeIndex;
                      const online = onlineMemberIds.has(person.id);
                      return (
                        <motion.button
                          key={person.id}
                          type="button"
                          data-cmd-idx={idx}
                          data-selected={selected}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => executeItem({ kind: "user", key: `u-${person.id}`, person })}
                          initial={ROW_INITIAL}
                          animate={ROW_ANIMATE}
                          transition={rowEnter(idx)}
                          className={`${ROW_CLASS} items-center justify-between gap-2.5`}
                        >
                          {selected && (
                            <motion.span
                              layoutId="cmdk-active-row"
                              transition={ACTIVE_ROW_SPRING}
                              className="siq-nav-highlight"
                            />
                          )}
                          <div className="relative z-10 flex min-w-0 items-center gap-2.5">
                            <Avatar
                              name={person.displayName}
                              color={person.avatarColor}
                              avatarUrl={person.avatarUrl}
                              size="sm"
                              status={resolveDisplayStatus(online, person.presenceStatus)}
                              ringClassName="ring-[#14151a]"
                            />
                            <div className="min-w-0">
                              <span
                                dir="auto"
                                className="block truncate text-xs font-semibold text-zinc-100 group-data-[selected=true]:text-white"
                              >
                                {person.displayName}
                              </span>
                              <span className="block truncate text-[11px] text-zinc-500">
                                @{person.username}
                                {person.customActivity ? ` · ${person.customActivity}` : ""}
                              </span>
                            </div>
                          </div>
                          <MessageSquare className="relative z-10 h-3.5 w-3.5 shrink-0 text-zinc-500 transition-colors duration-200 group-data-[selected=true]:text-emerald-300" />
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Servers Section */}
              {matchingServers.length > 0 && (
                <div>
                  <p className={SECTION_LABEL_CLASS}>
                    <Server className="h-3 w-3 text-zinc-600" />
                    Servers
                  </p>
                  <div className="space-y-0.5">
                    {matchingServers.map((srv) => {
                      const idx = cursor++;
                      const selected = idx === activeIndex;
                      return (
                        <motion.button
                          key={srv.id}
                          type="button"
                          data-cmd-idx={idx}
                          data-selected={selected}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => executeItem({ kind: "server", key: `s-${srv.id}`, server: srv })}
                          initial={ROW_INITIAL}
                          animate={ROW_ANIMATE}
                          transition={rowEnter(idx)}
                          className={`${ROW_CLASS} items-center justify-between gap-2.5`}
                        >
                          {selected && (
                            <motion.span
                              layoutId="cmdk-active-row"
                              transition={ACTIVE_ROW_SPRING}
                              className="siq-nav-highlight"
                            />
                          )}
                          <div className="relative z-10 flex min-w-0 items-center gap-2.5">
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[9px] text-[10px] font-bold text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] ring-1 ring-inset ring-white/10"
                              style={!srv.iconUrl ? { backgroundColor: srv.accentColor } : undefined}
                            >
                              {srv.iconUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={mediaUrl(srv.iconUrl)} alt={srv.name} className="h-full w-full object-cover" />
                              ) : (
                                srv.name.slice(0, 2).toUpperCase()
                              )}
                            </span>
                            <span dir="auto" className="truncate text-xs font-semibold text-zinc-100 group-data-[selected=true]:text-white">
                              {srv.name}
                            </span>
                            {srv.tag && (
                              <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
                                {srv.tag}
                              </span>
                            )}
                          </div>
                          <span className="relative z-10 inline-flex items-center gap-1 text-[10px] text-zinc-500">
                            <Server className="h-3 w-3" />
                            {srv.channels.length} ch
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Settings & Quick Actions Section */}
              {matchingActions.length > 0 && (
                <div>
                  <p className={SECTION_LABEL_CLASS}>
                    <Settings className="h-3 w-3 text-zinc-600" />
                    Settings &amp; Actions
                  </p>
                  <div className="space-y-0.5">
                    {matchingActions.map((action) => {
                      const idx = cursor++;
                      const selected = idx === activeIndex;
                      return (
                        <motion.button
                          key={action.id}
                          type="button"
                          data-cmd-idx={idx}
                          data-selected={selected}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() =>
                            executeItem({ kind: "action", key: `a-${action.id}`, action })
                          }
                          initial={ROW_INITIAL}
                          animate={ROW_ANIMATE}
                          transition={rowEnter(idx)}
                          className={`${ROW_CLASS} items-center justify-between gap-2.5`}
                        >
                          {selected && (
                            <motion.span
                              layoutId="cmdk-active-row"
                              transition={ACTIVE_ROW_SPRING}
                              className="siq-nav-highlight"
                            />
                          )}
                          <div className="relative z-10 flex min-w-0 items-center gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] transition-[background-color,border-color,box-shadow] duration-150 group-data-[selected=true]:border-emerald-500/30 group-data-[selected=true]:bg-emerald-500/10 group-data-[selected=true]:shadow-[0_0_16px_-6px_rgb(var(--siq-accent-rgb)/0.8)]">
                              <ActionIcon icon={action.icon} />
                            </span>
                            <div className="min-w-0">
                              <span className="block truncate text-xs font-medium text-zinc-100 group-data-[selected=true]:text-white">
                                {action.label}
                              </span>
                              {action.description && (
                                <span className="block truncate text-[10px] text-zinc-500">
                                  {action.description}
                                </span>
                              )}
                            </div>
                          </div>
                          {action.hint && (
                            <span className="relative z-10 shrink-0 rounded-md border border-white/[0.07] bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors group-data-[selected=true]:border-white/[0.12] group-data-[selected=true]:text-zinc-200">
                              {action.hint}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {flatItems.length === 0 && !msgLoading && category !== "messages" && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="flex flex-col items-center gap-3 py-9"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-11 w-11 place-items-center rounded-2xl bg-white/[0.04] text-zinc-500 ring-1 ring-inset ring-white/[0.07]"
                  >
                    <Search className="h-5 w-5" />
                  </span>
                  <p className="text-center text-xs text-zinc-500">
                    No results found for &ldquo;{query.trim()}&rdquo;.
                  </p>
                </motion.div>
              )}
            </motion.div>

            {/* Keyboard Footer */}
            <div className="flex shrink-0 items-center border-t border-white/[0.06] bg-black/20 px-3.5 py-2 text-[11px] text-zinc-500">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="rounded-md border border-white/[0.1] bg-white/[0.05] px-1 py-0.5 font-mono text-[9px] text-zinc-300 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]">
                    ↑↓
                  </kbd>
                  <span>Navigate</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="inline-flex items-center rounded-md border border-white/[0.1] bg-white/[0.05] px-1 py-0.5 font-mono text-[9px] text-zinc-300 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]">
                    <CornerDownLeft className="h-2.5 w-2.5" />
                  </kbd>
                  <span>Open</span>
                </span>
              </div>
            </div>
        </HeaderPanel>
      )}
    </AnimatePresence>
  );
}
