"use client";

import { apiFetch } from "@/lib/client-api";
import { Loader2, Pin, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { useSystemNotify } from "@/components/ui/NotificationCenter";
import type { MessageItem, PublicUser } from "@/lib/types";

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
        className="siq-header-trigger flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] bg-[#16171D] text-zinc-300 transition-colors hover:border-white/[0.18] hover:text-white"
      >
        <Pin className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {open && (
          <HeaderPanel kind="pins" label="Pinned Messages">
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

            <div className="min-h-0 max-h-[360px] divide-y divide-white/[0.05] overflow-y-auto">
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
                            className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
                          >
                            Jump
                          </button>
                          {canUnpin && (
                            <button
                              type="button"
                              onClick={() => void handleUnpin(msg)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                            >
                              <X className="h-3 w-3" />
                              <span>Unpin</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
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
