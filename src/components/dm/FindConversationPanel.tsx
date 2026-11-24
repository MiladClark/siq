"use client";

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
import { Avatar, resolveDisplayStatus } from "@/components/ui/Avatar";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import type { MessageItem, PublicUser, ServerDetail } from "@/lib/types";

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
        const res = await fetch(
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
            <div className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.08] px-3.5 py-3">
              {msgLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
              ) : (
                <Search className="h-4 w-4 shrink-0 text-emerald-400" />
              )}
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
                className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="rounded-md p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <kbd className="hidden rounded-md border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 sm:inline">
                ESC
              </kbd>
            </div>

            {/* Category Filter Pill Bar */}
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/[0.07] bg-[#0E0F12] px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                    className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      active ? "text-zinc-50" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="smart-search-cat-pill"
                        transition={{ type: "spring", stiffness: 460, damping: 34 }}
                        className="absolute inset-0 rounded-lg border border-emerald-500/35 bg-emerald-500/[0.14]"
                      />
                    )}
                    <span className="relative z-10">{cat.label}</span>
                    {count !== null && (
                      <span className="relative z-10 rounded-full bg-emerald-500/20 px-1.5 text-[9px] font-bold tabular-nums text-emerald-300">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Categorized Results Viewport */}
            <div
              ref={listRef}
              className="min-h-0 max-h-[420px] space-y-4 overflow-y-auto p-3"
            >
              {/* Messages Section */}
              {showMessages && (visibleMessages.length > 0 || category === "messages") && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between px-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Messages in {activeChatContext?.label}
                    </p>
                    {msgLoading && (
                      <span className="text-[10px] text-emerald-400">Searching...</span>
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
                          <button
                            key={msg.id}
                            type="button"
                            data-cmd-idx={idx}
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => executeItem({ kind: "message", key: `m-${msg.id}`, message: msg })}
                            className="relative flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors"
                          >
                            {selected && (
                              <motion.span
                                layoutId="cmdk-active-row"
                                transition={{ type: "spring", stiffness: 460, damping: 34 }}
                                className="absolute inset-0 rounded-xl border border-white/[0.08] bg-white/[0.07]"
                              />
                            )}
                            <span className="relative z-10 mt-0.5">
                              <Avatar name={name} color={avatarColor} avatarUrl={avatarUrl} size="sm" />
                            </span>
                            <div className="relative z-10 min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span dir="auto" className="truncate text-xs font-semibold text-zinc-100">
                                  {name}
                                </span>
                                <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                                  {formatMsgDate(msg.createdAt)}
                                </span>
                              </div>
                              <p dir="auto" className="mt-0.5 line-clamp-2 text-xs text-zinc-400">
                                {msg.content || (
                                  <span className="inline-flex items-center gap-1 text-zinc-500">
                                    <Paperclip className="h-3 w-3" /> Attachment
                                  </span>
                                )}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Channels Section */}
              {matchingChannels.length > 0 && (
                <div>
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Channels
                  </p>
                  <div className="space-y-0.5">
                    {matchingChannels.map(({ server, channel }) => {
                      const idx = cursor++;
                      const selected = idx === activeIndex;
                      return (
                        <button
                          key={channel.id}
                          type="button"
                          data-cmd-idx={idx}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() =>
                            executeItem({
                              kind: "channel",
                              key: `c-${channel.id}`,
                              server,
                              channel,
                            })
                          }
                          className="relative flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors"
                        >
                          {selected && (
                            <motion.span
                              layoutId="cmdk-active-row"
                              transition={{ type: "spring", stiffness: 460, damping: 34 }}
                              className="absolute inset-0 rounded-xl border border-white/[0.08] bg-white/[0.07]"
                            />
                          )}
                          <div className="relative z-10 flex min-w-0 items-center gap-2">
                            {channel.type === "text" ? (
                              <Hash className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                            ) : (
                              <Volume2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                            )}
                            <span dir="auto" className="truncate text-xs font-medium text-zinc-100">
                              {channel.name}
                            </span>
                            {channel.isPrivate && (
                              <Lock className="h-3 w-3 shrink-0 text-amber-400/80" />
                            )}
                          </div>
                          <span className="relative z-10 shrink-0 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                            {server.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* People & Direct Messages Section */}
              {matchingUsers.length > 0 && (
                <div>
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    People &amp; Direct Messages
                  </p>
                  <div className="space-y-0.5">
                    {matchingUsers.map((person) => {
                      const idx = cursor++;
                      const selected = idx === activeIndex;
                      const online = onlineMemberIds.has(person.id);
                      return (
                        <button
                          key={person.id}
                          type="button"
                          data-cmd-idx={idx}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => executeItem({ kind: "user", key: `u-${person.id}`, person })}
                          className="relative flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors"
                        >
                          {selected && (
                            <motion.span
                              layoutId="cmdk-active-row"
                              transition={{ type: "spring", stiffness: 460, damping: 34 }}
                              className="absolute inset-0 rounded-xl border border-white/[0.08] bg-white/[0.07]"
                            />
                          )}
                          <div className="relative z-10 flex min-w-0 items-center gap-2.5">
                            <Avatar
                              name={person.displayName}
                              color={person.avatarColor}
                              avatarUrl={person.avatarUrl}
                              size="sm"
                              status={resolveDisplayStatus(online, person.presenceStatus)}
                              ringClassName="ring-[#101117]"
                            />
                            <div className="min-w-0">
                              <span
                                dir="auto"
                                className="block truncate text-xs font-semibold text-zinc-100"
                              >
                                {person.displayName}
                              </span>
                              <span className="block truncate text-[11px] text-zinc-500">
                                @{person.username}
                                {person.customActivity ? ` · ${person.customActivity}` : ""}
                              </span>
                            </div>
                          </div>
                          <MessageSquare className="relative z-10 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Servers Section */}
              {matchingServers.length > 0 && (
                <div>
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Servers
                  </p>
                  <div className="space-y-0.5">
                    {matchingServers.map((srv) => {
                      const idx = cursor++;
                      const selected = idx === activeIndex;
                      return (
                        <button
                          key={srv.id}
                          type="button"
                          data-cmd-idx={idx}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => executeItem({ kind: "server", key: `s-${srv.id}`, server: srv })}
                          className="relative flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors"
                        >
                          {selected && (
                            <motion.span
                              layoutId="cmdk-active-row"
                              transition={{ type: "spring", stiffness: 460, damping: 34 }}
                              className="absolute inset-0 rounded-xl border border-white/[0.08] bg-white/[0.07]"
                            />
                          )}
                          <div className="relative z-10 flex min-w-0 items-center gap-2.5">
                            <span
                              className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[10px] font-bold text-zinc-950"
                              style={!srv.iconUrl ? { backgroundColor: srv.accentColor } : undefined}
                            >
                              {srv.iconUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={srv.iconUrl} alt={srv.name} className="h-full w-full object-cover" />
                              ) : (
                                srv.name.slice(0, 2).toUpperCase()
                              )}
                            </span>
                            <span dir="auto" className="truncate text-xs font-semibold text-zinc-100">
                              {srv.name}
                            </span>
                            {srv.tag && (
                              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                                {srv.tag}
                              </span>
                            )}
                          </div>
                          <span className="relative z-10 inline-flex items-center gap-1 text-[10px] text-zinc-500">
                            <Server className="h-3 w-3" />
                            {srv.channels.length} ch
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Settings & Quick Actions Section */}
              {matchingActions.length > 0 && (
                <div>
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Settings &amp; Actions
                  </p>
                  <div className="space-y-0.5">
                    {matchingActions.map((action) => {
                      const idx = cursor++;
                      const selected = idx === activeIndex;
                      return (
                        <button
                          key={action.id}
                          type="button"
                          data-cmd-idx={idx}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() =>
                            executeItem({ kind: "action", key: `a-${action.id}`, action })
                          }
                          className="relative flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors"
                        >
                          {selected && (
                            <motion.span
                              layoutId="cmdk-active-row"
                              transition={{ type: "spring", stiffness: 460, damping: 34 }}
                              className="absolute inset-0 rounded-xl border border-white/[0.08] bg-white/[0.07]"
                            />
                          )}
                          <div className="relative z-10 flex min-w-0 items-center gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-[#171820]">
                              <ActionIcon icon={action.icon} />
                            </span>
                            <div className="min-w-0">
                              <span className="block truncate text-xs font-medium text-zinc-100">
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
                            <span className="relative z-10 shrink-0 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-zinc-400">
                              {action.hint}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {flatItems.length === 0 && !msgLoading && category !== "messages" && (
                <p className="py-10 text-center text-xs text-zinc-500">
                  No results found for &ldquo;{query.trim()}&rdquo;.
                </p>
              )}
            </div>

            {/* Keyboard Footer */}
            <div className="flex shrink-0 items-center border-t border-white/[0.07] bg-[#0E0F12] px-3.5 py-2 text-[11px] text-zinc-500">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono text-[9px] text-zinc-300">
                    ↑↓
                  </kbd>
                  <span>Navigate</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="inline-flex items-center rounded border border-white/[0.1] bg-white/[0.04] px-1 py-0.5 font-mono text-[9px] text-zinc-300">
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
