"use client";

import { apiFetch } from "@/lib/client-api";
import { Loader2, Pin, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Avatar } from "@siq/shared/components/ui/Avatar";
import { HeaderPanel } from "@siq/shared/components/ui/HeaderPanel";
import { useSystemNotify } from "@siq/shared/components/ui/NotificationCenter";
import type { MessageItem, PublicUser } from "@siq/shared/lib/types";

interface ChannelHeaderToolsProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  channelId: string;
  channelName: string;
  apiBasePath?: string;
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
  open,
  onToggle,
  onClose,
  channelId,
  channelName,
  apiBasePath,
  currentUser,
  members,
  onJumpToMessage,
  onMessageUnpinned,
}: ChannelHeaderToolsProps) {
  const baseUrl = apiBasePath ?? `/api/channels/${channelId}/messages`;
  const notify = useSystemNotify();

  const [pinsLoading, setPinsLoading] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<MessageItem[]>([]);

  useEffect(() => {
    setPinnedMessages([]);
  }, [baseUrl]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const { signal } = controller;
    setPinsLoading(true);

    async function loadPins() {
      try {
        const res = await apiFetch(`${baseUrl}?pinned=true`, { cache: "no-store", signal });
        if (!res.ok) throw new Error("Could not load pinned messages.");
        const data = await res.json();
        if (!signal.aborted) setPinnedMessages(data.messages ?? []);
      } catch {
        if (!signal.aborted) {
          notify({
            kind: "error",
            title: "Pinned Messages",
            message: "Failed to load pinned messages.",
            source: channelName,
          });
        }
      } finally {
        if (!signal.aborted) setPinsLoading(false);
      }
    }

    void loadPins();
    return () => controller.abort();
  }, [open, baseUrl, channelName, notify]);

  async function handleUnpin(msg: MessageItem) {
    try {
      const res = await apiFetch(`${baseUrl}/${msg.id}`, {
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
    <div className="siq-header-slot">
      <button
        type="button"
        onClick={onToggle}
        title="Pinned messages"
        aria-label="Pinned messages"
        aria-expanded={open}
        aria-controls={open ? "workspace-header-pins" : undefined}
        aria-haspopup="dialog"
        data-header-trigger="pins"
        className="siq-header-trigger siq-press group flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-zinc-300 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white"
      >
        <Pin
          className={`h-4 w-4 transition-transform duration-300 [transition-timing-function:var(--siq-ease-spring)] ${
            open ? "-rotate-45" : "motion-safe:group-hover:-rotate-12"
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <HeaderPanel kind="pins" label="Pinned Messages">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 place-items-center rounded-[9px] bg-emerald-500/10 shadow-[0_0_18px_-6px_rgb(var(--siq-accent-rgb)/0.75)] ring-1 ring-inset ring-emerald-500/25"
                >
                  <Pin className="h-3.5 w-3.5 -rotate-45 text-emerald-300" />
                </span>
                <span className="text-[13px] font-semibold tracking-tight text-zinc-50">
                  Pinned Messages
                </span>
              </div>
              <motion.span
                key={pinnedMessages.length}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 520, damping: 22 }}
                className="min-w-6 rounded-full bg-white/[0.05] px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-zinc-400 ring-1 ring-inset ring-white/[0.07]"
              >
                {pinnedMessages.length}
              </motion.span>
            </div>

            <div className="min-h-0 max-h-[360px] space-y-1.5 overflow-y-auto p-2">
              {pinsLoading ? (
                <div className="space-y-1.5">
                  {[0, 1].map((row) => (
                    <div
                      key={row}
                      aria-hidden="true"
                      className="flex items-start gap-2.5 rounded-xl border border-white/[0.04] bg-white/[0.015] px-3 py-2.5"
                    >
                      <span className="siq-skeleton h-7 w-7 shrink-0 rounded-full" />
                      <div className="flex-1 space-y-2 pt-0.5">
                        <span className="siq-skeleton block h-2.5 w-1/3 rounded-full" />
                        <span className="siq-skeleton block h-2.5 w-4/5 rounded-full" />
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-center gap-2 py-3 text-xs text-zinc-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                    <span>Loading pins...</span>
                  </div>
                </div>
              ) : pinnedMessages.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30, delay: 0.08 }}
                  className="flex flex-col items-center gap-3 px-4 py-7 text-center text-xs text-zinc-500"
                >
                  <span aria-hidden="true" className="siq-hero-tile h-12 w-12 !rounded-2xl">
                    <Pin className="h-5 w-5 -rotate-45" />
                  </span>
                  <span>No pinned messages in #{channelName} yet.</span>
                </motion.div>
              ) : (
                pinnedMessages.map((msg, index) => {
                  const author = resolveAuthor(msg);
                  const canUnpin =
                    msg.author.id === currentUser.id || currentUser.role === "admin";
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 440,
                        damping: 32,
                        delay: 0.06 + Math.min(index, 8) * 0.04,
                      }}
                      className="group relative flex items-start gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 transition-colors duration-150 before:absolute before:inset-y-3 before:left-0 before:w-[2px] before:rounded-r-full before:bg-emerald-400 before:opacity-0 before:shadow-[0_0_10px_rgb(var(--siq-accent-rgb)/0.9)] before:transition-opacity hover:border-white/[0.1] hover:bg-white/[0.045] hover:before:opacity-100"
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
                          {msg.content ||
                            (msg.attachments.length > 0
                              ? `${msg.attachments.length} attachment(s)`
                              : "")}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onJumpToMessage(msg.id);
                              onClose();
                            }}
                            className="siq-press rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-500/20 hover:shadow-[0_0_14px_-4px_rgb(var(--siq-accent-rgb)/0.7)]"
                          >
                            Jump
                          </button>
                          {canUnpin && (
                            <button
                              type="button"
                              onClick={() => void handleUnpin(msg)}
                              className="siq-press inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-rose-500/15 hover:text-rose-300"
                            >
                              <X className="h-3 w-3" />
                              <span>Unpin</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </HeaderPanel>
        )}
      </AnimatePresence>
    </div>
  );
}
