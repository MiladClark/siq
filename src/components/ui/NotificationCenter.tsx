"use client";

import {
  AlertCircle,
  AlertTriangle,
  AtSign,
  CheckCheck,
  CheckCircle2,
  Hash,
  Info,
  Paperclip,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { sileo, Toaster as SileoToaster } from "sileo";
import { useAnimatedIconHover } from "@/components/ui/AnimatedIcon";
import { BellIcon } from "@/components/ui/animated-icons";
import { Avatar } from "@/components/ui/Avatar";
import type { ToastStyle } from "@/lib/preferences";
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
  onSelectNotification,
  onMarkItemRead,
  onMarkAllRead,
}: {
  notifications: NotificationItem[];
  onSelectChannel: (channelId: string) => void;
  onSelectNotification?: (item: NotificationItem) => void;
  onMarkItemRead?: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bellHover = useAnimatedIconHover();

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
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen((v) => !v)}
        {...bellHover.hoverProps}
        aria-label="Notifications"
        title="Notifications"
        className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
          open
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : "border-white/[0.1] bg-[#16171D] text-zinc-300 hover:border-white/[0.18] hover:text-white"
        }`}
      >
        <BellIcon
          ref={bellHover.iconRef}
          size={16}
          className="pointer-events-none inline-flex items-center justify-center"
        />
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} unread notifications`}
            className="absolute right-1.5 top-1.5 flex h-2 w-2"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500 ring-2 ring-[#16171D]" />
          </span>
        )}
      </motion.button>

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
                        } else if (onSelectNotification) {
                          onSelectNotification(item);
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
                            {!sysKind &&
                              (item.dmConversationId ? (
                                <AtSign className="h-2.5 w-2.5" />
                              ) : (
                                <Hash className="h-2.5 w-2.5" />
                              ))}
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
  toastStyle = "liquid",
  onDismiss,
  onOpenChannel,
  onOpenNotification,
}: {
  toasts: NotificationItem[];
  toastStyle?: ToastStyle;
  onDismiss: (id: string) => void;
  onOpenChannel: (channelId: string, toastId: string) => void;
  onOpenNotification?: (item: NotificationItem) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const visibleToasts = toasts.slice(-4);

  // Reset hover lock when the last toast disappears so future toasts never start stuck paused
  useEffect(() => {
    if (visibleToasts.length === 0) {
      setHovered(false);
    }
  }, [visibleToasts.length]);

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const onOpenChannelRef = useRef(onOpenChannel);
  onOpenChannelRef.current = onOpenChannel;
  const onOpenNotificationRef = useRef(onOpenNotification);
  onOpenNotificationRef.current = onOpenNotification;

  // Bridge incoming toasts to Sileo liquid pill toaster when toastStyle === "liquid"
  const sileoIdMapRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (toastStyle !== "liquid") {
      if (sileoIdMapRef.current.size > 0) {
        sileo.clear("bottom-right");
        sileoIdMapRef.current.clear();
      }
      return;
    }

    const activeIds = new Set(toasts.map((t) => t.id));
    // Dismiss any Sileo toast whose backing item was removed (e.g., user opened the channel)
    for (const [itemId, sileoId] of sileoIdMapRef.current.entries()) {
      if (!activeIds.has(itemId)) {
        sileo.dismiss(sileoId);
        sileoIdMapRef.current.delete(itemId);
      }
    }

    for (const toast of toasts) {
      if (sileoIdMapRef.current.has(toast.id)) continue;

      const sysKind = isSystemKind(toast.kind) ? toast.kind : null;
      const title = toast.channelName
        ? `${toast.authorDisplayName} · ${sysKind ? toast.channelName : toast.dmConversationId ? `@${toast.channelName}` : `#${toast.channelName}`}`
        : toast.authorDisplayName;

      const descriptionText = sysKind
        ? toast.content
        : toast.content
          ? truncatePreview(toast.content, 68)
          : "Sent an attachment";

      const isNavigable =
        !sysKind && Boolean(toast.channelId || toast.dmConversationId);

      const opts = {
        title,
        description: (
          <span dir="auto" className="block text-xs leading-relaxed text-zinc-300">
            {descriptionText}
          </span>
        ),
        duration: TOAST_DURATION_MS,
        fill: "#14161D",
        roundness: 18,
        autopilot: { expand: 160, collapse: TOAST_DURATION_MS - 450 },
        ...(isNavigable
          ? {
              button: {
                title: "Open",
                onClick: () => {
                  if (onOpenNotificationRef.current) {
                    onOpenNotificationRef.current(toast);
                  } else if (toast.channelId) {
                    onOpenChannelRef.current(toast.channelId, toast.id);
                  }
                  const sid = sileoIdMapRef.current.get(toast.id);
                  if (sid) sileo.dismiss(sid);
                  sileoIdMapRef.current.delete(toast.id);
                  onDismissRef.current(toast.id);
                },
              },
            }
          : {}),
      };

      let sileoId: string;
      if (sysKind === "error") {
        sileoId = sileo.error(opts);
      } else if (sysKind === "warning") {
        sileoId = sileo.warning(opts);
      } else if (sysKind === "success") {
        sileoId = sileo.success(opts);
      } else if (sysKind === "info") {
        sileoId = sileo.info(opts);
      } else {
        sileoId = sileo.action(opts);
      }

      sileoIdMapRef.current.set(toast.id, sileoId);
    }
  }, [toasts, toastStyle]);

  if (toastStyle === "liquid") {
    return (
      <SileoToaster
        position="bottom-right"
        theme="dark"
        offset={{ bottom: 16, right: 16 }}
        options={{
          fill: "#14161D",
          roundness: 18,
          duration: TOAST_DURATION_MS,
        }}
      />
    );
  }

  const hasToasts = visibleToasts.length > 0;

  return (
    <div
      aria-live="polite"
      onMouseEnter={() => {
        if (hasToasts) setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onPointerLeave={() => setHovered(false)}
      className={`fixed bottom-4 right-4 z-[110] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col items-end ${
        hasToasts ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <AnimatePresence mode="popLayout">
        {visibleToasts.map((toast, idx) => {
          const depthFromFront = visibleToasts.length - 1 - idx;
          const isStacked = !hovered && depthFromFront > 0;
          return (
            <ToastCard
              key={toast.id}
              toast={toast}
              depthFromFront={depthFromFront}
              stacked={isStacked}
              paused={hovered}
              onDismiss={() => onDismissRef.current(toast.id)}
              onOpen={() => {
                if (isSystemKind(toast.kind) || (!toast.channelId && !toast.dmConversationId)) {
                  onDismissRef.current(toast.id);
                } else if (onOpenNotificationRef.current) {
                  onOpenNotificationRef.current(toast);
                  onDismissRef.current(toast.id);
                } else {
                  onOpenChannelRef.current(toast.channelId, toast.id);
                }
              }}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({
  toast,
  depthFromFront,
  stacked,
  paused,
  onDismiss,
  onOpen,
}: {
  toast: NotificationItem;
  depthFromFront: number;
  stacked: boolean;
  paused: boolean;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const sysKind = isSystemKind(toast.kind) ? toast.kind : null;

  // Keep latest callbacks in refs so parent re-renders NEVER restart the toast timer
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const remainingMsRef = useRef<number>(TOAST_DURATION_MS);
  const dismissedRef = useRef<boolean>(false);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (paused || dismissedRef.current) return;

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(100, Math.max(0, now - lastTs));
      lastTs = now;
      remainingMsRef.current = Math.max(0, remainingMsRef.current - dt);

      const ratio = remainingMsRef.current / TOAST_DURATION_MS;
      if (progressBarRef.current) {
        progressBarRef.current.style.transform = `scaleX(${ratio})`;
      }

      if (remainingMsRef.current <= 0) {
        if (!dismissedRef.current) {
          dismissedRef.current = true;
          onDismissRef.current();
        }
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [paused]);

  const stackScale = stacked ? Math.max(0.88, 1 - depthFromFront * 0.045) : 1;
  const stackOpacity = stacked ? Math.max(0.55, 1 - depthFromFront * 0.18) : 1;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 22, scale: 0.94 }}
      animate={{
        opacity: stackOpacity,
        y: 0,
        scale: stackScale,
        marginBottom: stacked ? -56 : depthFromFront === 0 ? 0 : 10,
      }}
      exit={{ opacity: 0, x: 36, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      style={{ zIndex: 20 - depthFromFront }}
      className={`siq-bezel pointer-events-auto relative w-full origin-bottom overflow-hidden rounded-2xl border bg-[#121319]/96 backdrop-blur-xl transition-colors ${
        paused ? "border-white/[0.18]" : "border-white/[0.11]"
      }`}
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
                {!sysKind &&
                  (toast.dmConversationId ? (
                    <AtSign className="h-2.5 w-2.5" />
                  ) : (
                    <Hash className="h-2.5 w-2.5" />
                  ))}
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
        onClick={(e) => {
          e.stopPropagation();
          dismissedRef.current = true;
          onDismissRef.current();
        }}
        aria-label="Dismiss notification"
        className="absolute right-2 top-2 rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Precision RAF Progress Bar (pauses cleanly on hover, resumes smoothly on unhover) */}
      <div className="h-[2.5px] w-full bg-white/[0.05]">
        <div
          ref={progressBarRef}
          style={{ transform: "scaleX(1)" }}
          className={`h-full origin-left will-change-transform ${getProgressBarClass(toast.kind)}`}
        />
      </div>
    </motion.div>
  );
}
