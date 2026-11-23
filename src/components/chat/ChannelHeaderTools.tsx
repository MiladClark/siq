"use client";

import { Loader2, Pin, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useSystemNotify } from "@/components/ui/NotificationCenter";
import type { MessageItem, PublicUser } from "@/lib/types";

interface ChannelHeaderToolsProps {
  channelId: string;
  channelName: string;
  apiBasePath?: string;
  searchPlaceholder?: string;
  currentUser: PublicUser;
  members: PublicUser[];
  onJumpToMessage: (messageId: string) => void;
  onMessageUnpinned?: (messageId: string) => void;
}

function formatCompactDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ChannelHeaderTools({
  channelId,
  channelName,
  apiBasePath,
  searchPlaceholder,
  currentUser,
  members,
  onJumpToMessage,
  onMessageUnpinned,
}: ChannelHeaderToolsProps) {
  const baseUrl = apiBasePath ?? `/api/channels/${channelId}/messages`;
  const notify = useSystemNotify();

  const [pinsOpen, setPinsOpen] = useState(false);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<MessageItem[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<MessageItem[]>([]);

  const pinsRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);

  // Reset panels on channel switch
  useEffect(() => {
    setPinsOpen(false);
    setPinnedMessages([]);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  }, [channelId]);

  // Close popovers on outside click / Escape
  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (pinsOpen && pinsRef.current && !pinsRef.current.contains(e.target as Node)) {
        setPinsOpen(false);
      }
      if (
        searchOpen &&
        searchRef.current &&
        !searchRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPinsOpen(false);
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [pinsOpen, searchOpen]);

  const loadPins = useCallback(async () => {
    setPinsLoading(true);
    try {
      const res = await fetch(`${baseUrl}?pinned=true`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setPinnedMessages(data.messages ?? []);
    } catch {
      notify({
        kind: "error",
        title: "Pinned Messages",
        message: "Failed to load pinned messages.",
        source: channelName,
      });
    } finally {
      setPinsLoading(false);
    }
  }, [baseUrl, channelName, notify]);

  useEffect(() => {
    if (pinsOpen) {
      void loadPins();
    }
  }, [pinsOpen, loadPins]);

  // Debounced live search
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${baseUrl}?q=${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        setSearchResults(data.messages ?? []);
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setSearchResults([]);
        }
      } finally {
        setSearchLoading(false);
      }
    }, 240);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [baseUrl, searchQuery]);

  async function handleUnpin(msg: MessageItem) {
    try {
      const res = await fetch(`${baseUrl}/${msg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: false }),
      });
      if (res.ok) {
        setPinnedMessages((prev) => prev.filter((m) => m.id !== msg.id));
        onMessageUnpinned?.(msg.id);
      } else {
        const data = await res.json().catch(() => ({}));
        notify({
          kind: "error",
          title: "Unpin Failed",
          message: data.error ?? "Could not unpin message.",
          source: `#${channelName}`,
        });
      }
    } catch {
      notify({
        kind: "error",
        title: "Unpin Failed",
        message: "Network error while unpinning message.",
        source: `#${channelName}`,
      });
    }
  }

  function resolveAuthor(msg: MessageItem) {
    const m = members.find((item) => item.id === msg.author.id);
    return {
      displayName: m?.displayName ?? msg.author.displayName,
      avatarColor: m?.avatarColor ?? msg.author.avatarColor,
      avatarUrl: m ? m.avatarUrl : msg.author.avatarUrl,
    };
  }

  return (
    <div className="flex items-center gap-2">
      {/* Pinned Messages Popover */}
      <div ref={pinsRef} className="relative">
        <button
          type="button"
          onClick={() => setPinsOpen((v) => !v)}
          title="Pinned messages"
          aria-label="Pinned messages"
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all active:scale-95 ${
            pinsOpen
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-white/[0.1] bg-[#18191E] text-zinc-300 hover:border-white/[0.18] hover:text-white"
          }`}
        >
          <Pin className="h-4 w-4" />
        </button>

        <AnimatePresence>
          {pinsOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="absolute right-0 top-10 z-50 w-[340px] max-w-[calc(100vw-2rem)] origin-top-right overflow-hidden rounded-xl border border-white/[0.1] bg-[#14151A] shadow-2xl shadow-black/80"
            >
              <div className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <Pin className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-zinc-100">
                    Pinned Messages
                  </span>
                </div>
                <span className="text-[11px] font-medium tabular-nums text-zinc-500">
                  {pinnedMessages.length}
                </span>
              </div>

              <div className="max-h-[360px] divide-y divide-white/[0.05] overflow-y-auto">
                {pinsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Loading pins...</span>
                  </div>
                ) : pinnedMessages.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-zinc-500">
                    No pinned messages in #{channelName} yet.
                  </div>
                ) : (
                  pinnedMessages.map((msg) => {
                    const author = resolveAuthor(msg);
                    const canUnpin =
                      msg.author.id === currentUser.id || currentUser.role === "admin";
                    return (
                      <div
                        key={msg.id}
                        className="group flex items-start gap-2.5 px-3.5 py-3 transition-colors hover:bg-white/[0.03]"
                      >
                        <Avatar
                          name={author.displayName}
                          color={author.avatarColor}
                          avatarUrl={author.avatarUrl}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              dir="auto"
                              className="truncate text-xs font-semibold text-zinc-100"
                            >
                              {author.displayName}
                            </span>
                            <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                              {formatCompactDate(msg.createdAt)}
                            </span>
                          </div>
                          <p
                            dir="auto"
                            className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-300"
                          >
                            {msg.content || "Attachment"}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onJumpToMessage(msg.id);
                                setPinsOpen(false);
                              }}
                              className="rounded-md border border-white/[0.08] bg-[#18191E] px-2 py-0.5 text-[10px] font-medium text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
                            >
                              Jump
                            </button>
                            {canUnpin && (
                              <button
                                type="button"
                                onClick={() => void handleUnpin(msg)}
                                className="rounded-md px-2 py-0.5 text-[10px] font-medium text-zinc-500 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                              >
                                Unpin
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* In-Channel Search Input + Results Popover */}
      <div ref={searchRef} className="relative hidden sm:block">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            dir="auto"
            value={searchQuery}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            placeholder={searchPlaceholder ?? `Search #${channelName}`}
            className="h-8 w-40 rounded-lg border border-white/[0.1] bg-[#18191E] pl-8 pr-7 text-xs text-zinc-100 placeholder:text-zinc-500 transition-all focus:w-56 focus:border-emerald-500/50 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
              }}
              aria-label="Clear search"
              className="absolute right-2 text-zinc-500 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <AnimatePresence>
          {searchOpen && searchQuery.trim().length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="absolute right-0 top-10 z-50 w-[340px] origin-top-right overflow-hidden rounded-xl border border-white/[0.1] bg-[#14151A] shadow-2xl shadow-black/80"
            >
              <div className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-2">
                <span className="text-[11px] font-medium text-zinc-400">
                  {searchLoading
                    ? "Searching..."
                    : `${searchResults.length} ${searchResults.length === 1 ? "result" : "results"}`}
                </span>
              </div>

              <div className="max-h-[340px] divide-y divide-white/[0.05] overflow-y-auto">
                {searchLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Searching #{channelName}...</span>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-zinc-500">
                    No messages matching &ldquo;{searchQuery.trim()}&rdquo;
                  </div>
                ) : (
                  searchResults.map((msg) => {
                    const author = resolveAuthor(msg);
                    return (
                      <button
                        key={msg.id}
                        type="button"
                        onClick={() => {
                          onJumpToMessage(msg.id);
                          setSearchOpen(false);
                        }}
                        className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        <Avatar
                          name={author.displayName}
                          color={author.avatarColor}
                          avatarUrl={author.avatarUrl}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              dir="auto"
                              className="truncate text-xs font-semibold text-zinc-100"
                            >
                              {author.displayName}
                            </span>
                            <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                              {formatCompactDate(msg.createdAt)}
                            </span>
                          </div>
                          <p
                            dir="auto"
                            className="mt-0.5 line-clamp-2 break-words text-xs text-zinc-400"
                          >
                            {msg.content}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
