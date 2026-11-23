"use client";

import { Hash, MessageSquare, Search, Volume2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Avatar, resolveDisplayStatus } from "@/components/ui/Avatar";
import type { PublicUser, ServerDetail } from "@/lib/types";

interface FindConversationModalProps {
  open: boolean;
  currentUserId: string;
  members: PublicUser[];
  onlineMemberIds: Set<string>;
  servers: ServerDetail[];
  onClose: () => void;
  onStartDm: (userId: string) => void;
  onSelectChannel: (serverId: string, channelId: string) => void;
}

export function FindConversationModal({
  open,
  currentUserId,
  members,
  onlineMemberIds,
  servers,
  onClose,
  onStartDm,
  onSelectChannel,
}: FindConversationModalProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 30);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const q = query.trim().toLowerCase();

  const matchingUsers = members
    .filter(
      (m) =>
        m.id !== currentUserId &&
        (!q ||
          m.displayName.toLowerCase().includes(q) ||
          m.username.toLowerCase().includes(q))
    )
    .slice(0, 8);

  const matchingChannels = servers
    .flatMap((s) =>
      s.channels.map((ch) => ({ server: s, channel: ch }))
    )
    .filter(
      ({ server, channel }) =>
        !q ||
        channel.name.toLowerCase().includes(q) ||
        server.name.toLowerCase().includes(q)
    )
    .slice(0, 8);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onClick={onClose}
          className="fixed inset-0 z-[90] flex items-start justify-center bg-black/75 p-4 pt-[12vh] backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Find or start a conversation"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.11] bg-[#14151A] shadow-2xl shadow-black/80"
          >
            <div className="flex items-center gap-2.5 border-b border-white/[0.08] px-4 py-3">
              <Search className="h-4 w-4 text-emerald-400" />
              <input
                ref={inputRef}
                type="text"
                dir="auto"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Where would you like to go? Search people or channels..."
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[380px] space-y-4 overflow-y-auto p-3">
              {matchingUsers.length > 0 && (
                <div>
                  <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Direct Messages
                  </p>
                  <div className="space-y-0.5">
                    {matchingUsers.map((person) => {
                      const online = onlineMemberIds.has(person.id);
                      return (
                        <button
                          key={person.id}
                          type="button"
                          onClick={() => {
                            onStartDm(person.id);
                            onClose();
                          }}
                          className="flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06]"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar
                              name={person.displayName}
                              color={person.avatarColor}
                              avatarUrl={person.avatarUrl}
                              size="sm"
                              status={resolveDisplayStatus(online, person.presenceStatus)}
                              ringClassName="ring-[#14151A]"
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
                              </span>
                            </div>
                          </div>
                          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {matchingChannels.length > 0 && (
                <div>
                  <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Server Channels
                  </p>
                  <div className="space-y-0.5">
                    {matchingChannels.map(({ server, channel }) => (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => {
                          onSelectChannel(server.id, channel.id);
                          onClose();
                        }}
                        className="flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {channel.type === "text" ? (
                            <Hash className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                          ) : (
                            <Volume2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          )}
                          <span dir="auto" className="truncate text-xs font-medium text-zinc-200">
                            {channel.name}
                          </span>
                        </div>
                        <span className="shrink-0 text-[10px] text-zinc-500">
                          {server.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {matchingUsers.length === 0 && matchingChannels.length === 0 && (
                <p className="py-10 text-center text-xs text-zinc-500">
                  No matching people or channels.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
