"use client";

import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  Hash,
  Info,
  Paperclip,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import type { NotificationItem, NotificationKind } from "@/lib/types";

export interface SystemNotifyPayload {
  kind: Exclude<NotificationKind, "message">;
  title: string;
  message: string;
  source?: string;
}

const SystemNotifyContext = createContext<(payload: SystemNotifyPayload) => void>(() => {});

export const SystemNotifyProvider = SystemNotifyContext.Provider;

export function useSystemNotify() {
  return useContext(SystemNotifyContext);
}

function formatShortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncatePreview(text: string, maxChars = 46): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars).trimEnd()}…`;
}

function isSystemKind(kind?: NotificationKind): kind is Exclude<NotificationKind, "message"> {
  return Boolean(kind && kind !== "message");
}

function SystemKindBadge({
  kind,
  size,
}: {
  kind: Exclude<NotificationKind, "message">;
  size: "sm" | "md";
}) {
  const boxSize = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  switch (kind) {
    case "error":
      return (
        <span
          className={`inline-flex ${boxSize} shrink-0 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/15 text-rose-400`}
        >
          <AlertCircle className={iconSize} />
        </span>
      );
    case "warning":
      return (
        <span
          className={`inline-flex ${boxSize} shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-400`}
        >
          <AlertTriangle className={iconSize} />
        </span>
      );
    case "info":
      return (
        <span
          className={`inline-flex ${boxSize} shrink-0 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/15 text-sky-400`}
        >
          <Info className={iconSize} />
        </span>
      );
    case "success":
      return (
        <span
          className={`inline-flex ${boxSize} shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-400`}
        >
          <CheckCircle2 className={iconSize} />
        </span>
      );
  }
}

function getProgressBarClass(kind?: NotificationKind): string {
  switch (kind) {
    case "error":
      return "bg-rose-500";
    case "warning":
      return "bg-amber-400";
    case "info":
      return "bg-sky-400";
    default:
      return "bg-emerald-400";
  }
}

function getUnreadTintClass(kind?: NotificationKind): string {
  switch (kind) {
    case "error":
      return "bg-rose-500/[0.05]";
    case "warning":
      return "bg-amber-500/[0.05]";
    case "info":
      return "bg-sky-500/[0.05]";
    default:
      return "bg-emerald-500/[0.04]";
  }
}

export function NotificationBell({
  notifications,
  onSelectChannel,
  onMarkItemRead,
  onMarkAllRead,
}: {
  notifications: NotificationItem[];
  onSelectChannel: (channelId: string) => void;
  onMarkItemRead?: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const visibleItems = notifications.slice(0, 3);
  const overflowCount = Math.max(0, notifications.length - 3);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        title="Notifications"
        className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-all active:scale-95 ${
          open
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : "border-white/[0.1] bg-[#18191E] text-zinc-300 hover:border-white/[0.18] hover:text-white"
        }`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} unread notifications`}
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-[#18191E]"
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-10 z-50 w-80 origin-top-right overflow-hidden rounded-xl border border-white/[0.1] bg-[#14151A] shadow-2xl shadow-black/75"
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-100">Notifications</span>
                {unreadCount > 0 && (
                  <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-rose-300">
                    {unreadCount}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Mark read</span>
                </button>
              )}
            </div>

            <div className="divide-y divide-white/[0.05]">
              {visibleItems.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-zinc-500">
                  You&apos;re all caught up.
                </div>
              ) : (
                visibleItems.map((item) => {
                  const sysKind = isSystemKind(item.kind) ? item.kind : null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (sysKind) {
                          onMarkItemRead?.(item.id);
                        } else if (item.channelId) {
                          onSelectChannel(item.channelId);
                        }
                        setOpen(false);
                      }}
                      className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.04] ${
                        !item.read ? getUnreadTintClass(item.kind) : ""
                      }`}
                    >
                      {sysKind ? (
                        <SystemKindBadge kind={sysKind} size="sm" />
                      ) : (
                        <Avatar
                          name={item.authorDisplayName}
                          color={item.authorAvatarColor}
                          avatarUrl={item.authorAvatarUrl}
                          size="sm"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            dir="auto"
                            className="truncate text-xs font-semibold text-zinc-100"
                          >
                            {item.authorDisplayName}
                          </span>
                          <span className="shrink-0 text-[10px] font-medium tabular-nums text-zinc-500">
                            {formatShortTime(item.createdAt)}
                          </span>
                        </div>
                        <p
                          dir="auto"
                          className={`mt-0.5 text-xs text-zinc-400 ${
                            sysKind ? "line-clamp-2 leading-relaxed" : "truncate"
                          }`}
                        >
                          {sysKind
                            ? item.content
                            : item.content
                              ? truncatePreview(item.content, 44)
                              : item.hasAttachments
                                ? "Sent an attachment"
                                : "New message"}
                        </p>
                        {item.channelName && (
                          <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium text-zinc-500">
                            {!sysKind && <Hash className="h-2.5 w-2.5" />}
                            <span dir="auto">{item.channelName}</span>
                          </span>
                        )}
                      </div>
                      {!item.read && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {overflowCount > 0 && (
              <div className="border-t border-white/[0.07] bg-[#0E0F12] px-3.5 py-2 text-center text-[11px] font-medium tabular-nums text-zinc-500">
                … and {overflowCount} more {overflowCount === 1 ? "notification" : "notifications"}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const TOAST_DURATION_MS = 5000;

export function NotificationToasts({
  toasts,
  onDismiss,
  onOpenChannel,
}: {
  toasts: NotificationItem[];
  onDismiss: (id: string) => void;
  onOpenChannel: (channelId: string, toastId: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[110] flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2.5"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            onDismiss={() => onDismiss(toast.id)}
            onOpen={() => {
              if (isSystemKind(toast.kind) || !toast.channelId) {
                onDismiss(toast.id);
              } else {
                onOpenChannel(toast.channelId, toast.id);
              }
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
  onOpen,
}: {
  toast: NotificationItem;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const sysKind = isSystemKind(toast.kind) ? toast.kind : null;

  useEffect(() => {
    const timer = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.96 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto relative overflow-hidden rounded-xl border border-white/[0.11] bg-[#14151A]/95 shadow-2xl shadow-black/75 backdrop-blur-md"
    >
      <div
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onOpen();
        }}
        className="flex cursor-pointer items-start gap-3 px-3.5 py-3 pr-8 transition-colors hover:bg-white/[0.03]"
      >
        {sysKind ? (
          <SystemKindBadge kind={sysKind} size="md" />
        ) : (
          <Avatar
            name={toast.authorDisplayName}
            color={toast.authorAvatarColor}
            avatarUrl={toast.authorAvatarUrl}
            size="md"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span dir="auto" className="truncate text-xs font-semibold text-zinc-100">
              {toast.authorDisplayName}
            </span>
            {toast.channelName && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                {!sysKind && <Hash className="h-2.5 w-2.5" />}
                <span dir="auto" className="max-w-[90px] truncate">
                  {toast.channelName}
                </span>
              </span>
            )}
          </div>
          <p
            dir="auto"
            className={`mt-1 text-xs text-zinc-400 ${
              sysKind ? "line-clamp-2 leading-relaxed" : "truncate"
            }`}
          >
            {sysKind ? (
              toast.content
            ) : toast.content ? (
              truncatePreview(toast.content, 38)
            ) : (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                Sent an attachment
              </span>
            )}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="absolute right-2 top-2 rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Animated Progress Bar */}
      <div className="h-[2.5px] w-full bg-white/[0.05]">
        <motion.div
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: TOAST_DURATION_MS / 1000, ease: "linear" }}
          className={`h-full origin-left ${getProgressBarClass(toast.kind)}`}
        />
      </div>
    </motion.div>
  );
}
