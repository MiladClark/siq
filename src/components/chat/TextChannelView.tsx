"use client";

import {
  ArrowDown,
  Check,
  Copy,
  Download,
  ExternalLink,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Hash,
  Loader2,
  Maximize2,
  Paperclip,
  Pencil,
  Pin,
  Reply,
  Send,
  Share2,
  Smile,
  SmilePlus,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  ClipboardEvent,
  DragEvent,
  FormEvent,
  Fragment,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Avatar } from "@/components/ui/Avatar";
import { type ContextMenuEntry, useContextMenu } from "@/components/ui/ContextMenu";
import {
  EmojiPickerPopover,
  QUICK_REACTION_EMOJIS,
} from "@/components/ui/EmojiPickerPopover";
import { SlidingNumber } from "@/components/ui/MotionPrimitives";
import { useSystemNotify } from "@/components/ui/NotificationCenter";
import type { ProfilePopoverTarget } from "@/components/ui/UserProfilePopover";
import { convertImageFileToWebP } from "@/lib/image-webp";
import type { MessageDensity, TextScale } from "@/lib/preferences";
import { playSound } from "@/lib/sounds";
import type {
  ChannelItem,
  MessageAttachment,
  MessageItem,
  MessageReactionSummary,
  PublicUser,
} from "@/lib/types";

interface TextChannelViewProps {
  channel: ChannelItem;
  currentUser: PublicUser;
  members: PublicUser[];
  blobReady: boolean;
  isDm?: boolean;
  canSendMessages?: boolean;
  canManageMessages?: boolean;
  density?: MessageDensity;
  textScale?: TextScale;
  jumpTarget?: { messageId: string; nonce: number } | null;
  unpinnedEvent?: { messageId: string; nonce: number } | null;
  onOpenUserProfile: (target: ProfilePopoverTarget) => void;
  onMessagesSeen?: (
    channelId: string,
    messageIds: string[],
    latestCreatedAt?: string
  ) => void;
}

interface ChannelCacheEntry {
  messages: MessageItem[];
  hasMore: boolean;
  hydrated: boolean;
}

/** Persistent in-memory cache across channel switches — zero skeleton flash, race-safe */
const channelMessageCache = new Map<string, ChannelCacheEntry>();

function sortMessagesChronologically(items: MessageItem[]): MessageItem[] {
  const byId = new Map<string, MessageItem>();
  for (const m of items) {
    byId.set(m.id, m);
  }
  return Array.from(byId.values()).sort((a, b) => {
    const dt = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (dt !== 0) return dt;
    return a.id.localeCompare(b.id);
  });
}

/** Reconcile a fresh tail (latest 80 from server) with any older paginated messages in cache.
 *  Automatically picks up new messages AND removes messages deleted while away. */
function reconcileWithFreshTail(
  existing: MessageItem[],
  freshTail: MessageItem[],
  freshHasMore: boolean
): { messages: MessageItem[]; hasMore: boolean } {
  if (freshTail.length === 0) {
    return { messages: [], hasMore: false };
  }
  const tailStartMs = new Date(freshTail[0].createdAt).getTime();
  const tailIds = new Set(freshTail.map((m) => m.id));
  const preservedOlder = existing.filter(
    (m) => !tailIds.has(m.id) && new Date(m.createdAt).getTime() < tailStartMs
  );
  const merged = sortMessagesChronologically([...preservedOlder, ...freshTail]);
  // If we already preserved older pages beyond the tail, keep previous hasMore knowledge
  return {
    messages: merged,
    hasMore: preservedOlder.length > 0 ? true : freshHasMore,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getCalendarDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDateDivider(iso: string): string {
  const target = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  ).getTime();
  const diffDays = Math.round((startOfToday - startOfTarget) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return target.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: target.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function getFileCategory(att: MessageAttachment): {
  icon: ReactNode;
  badge: string;
  accent: string;
} {
  const ext = att.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = att.contentType.toLowerCase();

  if (
    ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext) ||
    mime.includes("zip") ||
    mime.includes("compressed") ||
    mime.includes("archive")
  ) {
    return {
      icon: <FileArchive className="h-5 w-5" />,
      badge: ext ? ext.toUpperCase() : "ARCHIVE",
      accent: "border-amber-500/25 bg-amber-500/10 text-amber-300",
    };
  }
  if (
    ["mp4", "mkv", "webm", "mov", "avi", "m4v"].includes(ext) ||
    mime.startsWith("video/")
  ) {
    return {
      icon: <FileVideo className="h-5 w-5" />,
      badge: ext ? ext.toUpperCase() : "VIDEO",
      accent: "border-sky-500/25 bg-sky-500/10 text-sky-300",
    };
  }
  if (
    ["mp3", "wav", "ogg", "flac", "m4a", "aac"].includes(ext) ||
    mime.startsWith("audio/")
  ) {
    return {
      icon: <FileAudio className="h-5 w-5" />,
      badge: ext ? ext.toUpperCase() : "AUDIO",
      accent: "border-rose-500/25 bg-rose-500/10 text-rose-300",
    };
  }
  if (
    [
      "js",
      "ts",
      "tsx",
      "jsx",
      "py",
      "go",
      "rs",
      "java",
      "c",
      "cpp",
      "cs",
      "json",
      "yaml",
      "yml",
      "html",
      "css",
      "sql",
      "sh",
    ].includes(ext)
  ) {
    return {
      icon: <FileCode className="h-5 w-5" />,
      badge: ext.toUpperCase(),
      accent: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    };
  }
  if (["xls", "xlsx", "csv", "ods"].includes(ext) || mime.includes("spreadsheet")) {
    return {
      icon: <FileSpreadsheet className="h-5 w-5" />,
      badge: ext ? ext.toUpperCase() : "SHEET",
      accent: "border-teal-500/25 bg-teal-500/10 text-teal-300",
    };
  }
  if (
    ["pdf", "doc", "docx", "txt", "md", "rtf"].includes(ext) ||
    mime.includes("pdf") ||
    mime.startsWith("text/")
  ) {
    return {
      icon: <FileText className="h-5 w-5" />,
      badge: ext ? ext.toUpperCase() : "DOC",
      accent: "border-zinc-500/30 bg-zinc-500/15 text-zinc-200",
    };
  }

  return {
    icon: <File className="h-5 w-5" />,
    badge: ext ? ext.toUpperCase().slice(0, 6) : "FILE",
    accent: "border-white/[0.1] bg-white/[0.05] text-zinc-300",
  };
}

function getDownloadHref(att: MessageAttachment): string {
  return `/api/download?url=${encodeURIComponent(att.url)}&name=${encodeURIComponent(att.name)}`;
}

function triggerDirectDownload(att: MessageAttachment) {
  const link = document.createElement("a");
  link.href = getDownloadHref(att);
  link.download = att.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function renderLinkifiedText(text: string): ReactNode[] {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("http://") || part.startsWith("https://")) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 underline decoration-emerald-500/40 underline-offset-2 hover:text-emerald-300"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function TextChannelView({
  channel,
  currentUser,
  members,
  blobReady,
  isDm = false,
  canSendMessages = true,
  canManageMessages = false,
  density = "comfortable",
  textScale = "md",
  jumpTarget = null,
  unpinnedEvent = null,
  onOpenUserProfile,
  onMessagesSeen,
}: TextChannelViewProps) {
  const { openMenu } = useContextMenu();
  const notify = useSystemNotify();
  const getMessagesBaseUrl = useCallback(
    (id: string) =>
      isDm ? `/api/dms/${id}/messages` : `/api/channels/${id}/messages`,
    [isDm]
  );
  const channelLabel = isDm ? `@${channel.name}` : `#${channel.name}`;
  const textSizeClass =
    textScale === "sm"
      ? "text-[13px]"
      : textScale === "lg"
        ? "text-[15.5px]"
        : "text-sm";

  const cachedInitial = channelMessageCache.get(channel.id);
  const [messages, setMessages] = useState<MessageItem[]>(
    cachedInitial?.hydrated ? cachedInitial.messages : []
  );
  const [hasMore, setHasMore] = useState<boolean>(cachedInitial?.hasMore ?? false);
  const [loading, setLoading] = useState<boolean>(!cachedInitial?.hydrated);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [unseenBelowCount, setUnseenBelowCount] = useState(0);
  const [composerText, setComposerText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [emojiPicker, setEmojiPicker] = useState<{
    mode: "reaction" | "composer";
    messageId?: string;
    anchorRect: {
      top: number;
      left: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    };
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<MessageAttachment | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);

  useEffect(() => {
    setLightboxZoom(1);
  }, [lightboxImage]);

  const setError = useCallback(
    (msg: string | null) => {
      if (msg) {
        notify({
          kind: "error",
          title: "Chat Error",
          message: msg,
          source: `#${channel.name}`,
        });
      }
    },
    [channel.name, notify]
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeChannelIdRef = useRef<string>(channel.id);
  activeChannelIdRef.current = channel.id;

  const onMessagesSeenRef = useRef(onMessagesSeen);
  onMessagesSeenRef.current = onMessagesSeen;

  const reportSeenIfVisible = useCallback((channelId: string, list: MessageItem[]) => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      channelId === activeChannelIdRef.current &&
      list.length > 0
    ) {
      onMessagesSeenRef.current?.(
        channelId,
        list.map((m) => m.id),
        list[list.length - 1].createdAt
      );
    }
  }, []);

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
    setUnseenBelowCount(0);
  }, []);

  // Load & reconcile channel messages when switching channels (race-free with AbortController)
  useEffect(() => {
    const targetChannelId = channel.id;
    const controller = new AbortController();
    let active = true;
    const cached = channelMessageCache.get(targetChannelId);

    setReplyingTo(null);
    setError(null);
    setUnseenBelowCount(0);
    setLoadingOlder(false);

    if (cached?.hydrated) {
      // Instant render from verified memory cache — zero skeleton flash
      setMessages(cached.messages);
      setHasMore(cached.hasMore);
      setLoading(false);
      reportSeenIfVisible(targetChannelId, cached.messages);
      requestAnimationFrame(() => scrollToBottom(false));
    } else {
      setMessages([]);
      setHasMore(false);
      setLoading(true);
    }

    async function syncChannel() {
      try {
        const res = await fetch(getMessagesBaseUrl(targetChannelId), {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json();
        if (!active || targetChannelId !== activeChannelIdRef.current) return;

        if (!res.ok) {
          if (!cached?.hydrated) {
            setError(data.error ?? "Failed to load messages.");
          }
          return;
        }

        const freshTail: MessageItem[] = data.messages ?? [];
        const freshHasMore = Boolean(data.hasMore);
        const currentEntry = channelMessageCache.get(targetChannelId);

        let nextMessages: MessageItem[];
        let nextHasMore: boolean;

        if (currentEntry?.hydrated && currentEntry.messages.length > 0) {
          const reconciled = reconcileWithFreshTail(
            currentEntry.messages,
            freshTail,
            freshHasMore
          );
          nextMessages = reconciled.messages;
          nextHasMore =
            currentEntry.messages.length > freshTail.length
              ? currentEntry.hasMore
              : reconciled.hasMore;
        } else {
          nextMessages = sortMessagesChronologically(freshTail);
          nextHasMore = freshHasMore;
        }

        const hadPreviousTailId =
          currentEntry?.messages[currentEntry.messages.length - 1]?.id ?? null;
        const newTailId = nextMessages[nextMessages.length - 1]?.id ?? null;
        const shouldScroll = !cached?.hydrated || hadPreviousTailId !== newTailId;

        channelMessageCache.set(targetChannelId, {
          messages: nextMessages,
          hasMore: nextHasMore,
          hydrated: true,
        });
        setMessages(nextMessages);
        setHasMore(nextHasMore);
        reportSeenIfVisible(targetChannelId, nextMessages);

        if (shouldScroll) {
          requestAnimationFrame(() => scrollToBottom(false));
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        if (active && !cached?.hydrated) {
          setError("Network error while loading messages.");
        }
      } finally {
        if (active && targetChannelId === activeChannelIdRef.current) {
          setLoading(false);
        }
      }
    }

    void syncChannel();
    return () => {
      active = false;
      controller.abort();
    };
  }, [channel.id, reportSeenIfVisible, scrollToBottom]);

  // Incremental background poll every 2.2s + periodic full-tail reconciliation for reactions/edits/pins
  useEffect(() => {
    const targetChannelId = channel.id;
    let active = true;
    let tickCount = 0;
    let inFlightController: AbortController | null = null;

    const interval = setInterval(async () => {
      if (!active || targetChannelId !== activeChannelIdRef.current) return;
      const entry = channelMessageCache.get(targetChannelId);
      // Never poll incrementally before initial full history has hydrated!
      if (!entry?.hydrated) return;

      tickCount += 1;
      const shouldReconcileTail = tickCount % 4 === 0;
      const lastMsg = entry.messages[entry.messages.length - 1];
      const baseUrl = getMessagesBaseUrl(targetChannelId);
      const url =
        !shouldReconcileTail && lastMsg
          ? `${baseUrl}?after=${encodeURIComponent(lastMsg.createdAt)}`
          : baseUrl;

      inFlightController?.abort();
      const controller = new AbortController();
      inFlightController = controller;

      try {
        const res = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok || !active || targetChannelId !== activeChannelIdRef.current) return;

        const data = await res.json();
        const incoming: MessageItem[] = data.messages ?? [];
        if (!active || targetChannelId !== activeChannelIdRef.current) return;

        // Always merge against the target channel's own cache entry (NEVER React prev state!)
        const latestEntry = channelMessageCache.get(targetChannelId);
        if (!latestEntry?.hydrated) return;

        if (shouldReconcileTail || !lastMsg) {
          const prevLastId = latestEntry.messages[latestEntry.messages.length - 1]?.id ?? null;
          const reconciled = reconcileWithFreshTail(
            latestEntry.messages,
            incoming,
            Boolean(data.hasMore)
          );
          const newLastId = reconciled.messages[reconciled.messages.length - 1]?.id ?? null;
          const hasNewAtBottom = Boolean(newLastId && newLastId !== prevLastId);
          const nearBottom = isNearBottom();

          channelMessageCache.set(targetChannelId, {
            messages: reconciled.messages,
            hasMore:
              latestEntry.messages.length > incoming.length
                ? latestEntry.hasMore
                : reconciled.hasMore,
            hydrated: true,
          });
          setMessages(reconciled.messages);
          reportSeenIfVisible(targetChannelId, reconciled.messages);

          if (hasNewAtBottom) {
            if (nearBottom) {
              requestAnimationFrame(() => scrollToBottom(true));
            } else {
              setUnseenBelowCount((c) => c + 1);
            }
          }
          return;
        }

        if (incoming.length === 0) return;

        const existingIds = new Set(latestEntry.messages.map((m) => m.id));
        const fresh = incoming.filter((m) => !existingIds.has(m.id));
        if (fresh.length === 0) return;

        const merged = sortMessagesChronologically([...latestEntry.messages, ...fresh]);
        channelMessageCache.set(targetChannelId, {
          messages: merged,
          hasMore: latestEntry.hasMore,
          hydrated: true,
        });

        const nearBottom = isNearBottom();
        setMessages(merged);
        reportSeenIfVisible(targetChannelId, merged);

        if (nearBottom) {
          requestAnimationFrame(() => scrollToBottom(true));
        } else {
          setUnseenBelowCount((c) => c + fresh.length);
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
      }
    }, 2200);

    return () => {
      active = false;
      inFlightController?.abort();
      clearInterval(interval);
    };
  }, [channel.id, isNearBottom, reportSeenIfVisible, scrollToBottom]);

  // Smooth jump-to-message from Pinned drawer or In-Channel Search
  useEffect(() => {
    if (!jumpTarget?.messageId) return;
    const el = document.getElementById(`msg-${jumpTarget.messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMessageId(jumpTarget.messageId);
      const t = setTimeout(() => {
        setHighlightedMessageId((curr) =>
          curr === jumpTarget.messageId ? null : curr
        );
      }, 2200);
      return () => clearTimeout(t);
    } else {
      notify({
        kind: "info",
        title: "Older Message",
        message: "Scroll up to load older messages to view that item.",
        source: `#${channel.name}`,
      });
    }
  }, [channel.name, jumpTarget, notify]);

  // Sync unpin events coming from the header Pinned Messages popover
  useEffect(() => {
    if (!unpinnedEvent?.messageId) return;
    const targetId = activeChannelIdRef.current;
    const entry = channelMessageCache.get(targetId);
    if (!entry) return;
    const updated = entry.messages.map((m) =>
      m.id === unpinnedEvent.messageId ? { ...m, pinned: false, pinnedAt: null } : m
    );
    channelMessageCache.set(targetId, { ...entry, messages: updated });
    setMessages(updated);
  }, [unpinnedEvent]);

  // Mark messages as seen when user returns to browser tab while on this channel
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        const entry = channelMessageCache.get(activeChannelIdRef.current);
        if (entry?.messages.length) {
          reportSeenIfVisible(activeChannelIdRef.current, entry.messages);
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [reportSeenIfVisible]);

  // Load older messages pagination (preserves exact scroll position)
  const loadOlderMessages = useCallback(async () => {
    const targetChannelId = activeChannelIdRef.current;
    const entry = channelMessageCache.get(targetChannelId);
    if (!entry?.hydrated || !entry.hasMore || loadingOlder || entry.messages.length === 0) {
      return;
    }

    const oldest = entry.messages[0];
    setLoadingOlder(true);
    const el = scrollContainerRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;

    try {
      const res = await fetch(
        `${getMessagesBaseUrl(targetChannelId)}?before=${encodeURIComponent(oldest.createdAt)}`,
        { cache: "no-store" }
      );
      if (!res.ok || targetChannelId !== activeChannelIdRef.current) return;
      const data = await res.json();
      const older: MessageItem[] = data.messages ?? [];
      const nextHasMore = Boolean(data.hasMore);

      const latestEntry = channelMessageCache.get(targetChannelId);
      if (!latestEntry) return;

      const merged = sortMessagesChronologically([...older, ...latestEntry.messages]);
      channelMessageCache.set(targetChannelId, {
        messages: merged,
        hasMore: nextHasMore,
        hydrated: true,
      });

      setMessages(merged);
      setHasMore(nextHasMore);

      requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        if (container && prevScrollHeight > 0) {
          const delta = container.scrollHeight - prevScrollHeight;
          container.scrollTop += delta;
        }
      });
    } catch {
      // ignore transient pagination failure
    } finally {
      if (targetChannelId === activeChannelIdRef.current) {
        setLoadingOlder(false);
      }
    }
  }, [loadingOlder]);

  // Handle scroll events (auto-load older near top + clear unseen badge at bottom)
  function handleFeedScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollTop < 80 && hasMore && !loadingOlder) {
      void loadOlderMessages();
    }
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80 && unseenBelowCount > 0) {
      setUnseenBelowCount(0);
    }
  }

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxImage) return;
    function onKey(e: KeyboardEvent | globalThis.KeyboardEvent) {
      if (e.key === "Escape") setLightboxImage(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxImage]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setError(null);
    setUploadingCount((c) => c + fileArray.length);

    for (const rawFile of fileArray) {
      try {
        // Automatically compress/convert static images (JPG/PNG) to lightweight WebP before upload
        const file = await convertImageFileToWebP(rawFile);
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? `Failed to upload ${file.name}.`);
        } else if (data.attachment) {
          setPendingAttachments((prev) => [...prev, data.attachment]);
        }
      } catch {
        setError(`Network error uploading ${rawFile.name}.`);
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    }
  }, []);

  async function handleSend(event?: FormEvent) {
    event?.preventDefault();
    const content = composerText.trim();
    if ((!content && pendingAttachments.length === 0) || sending || uploadingCount > 0) {
      return;
    }

    const targetChannelId = channel.id;
    setSending(true);
    setError(null);

    const payload = {
      content,
      replyToId: replyingTo?.id ?? null,
      attachments: pendingAttachments,
    };

    try {
      const res = await fetch(getMessagesBaseUrl(targetChannelId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (targetChannelId === activeChannelIdRef.current) {
          setError(data.error ?? "Failed to send message.");
        }
      } else if (data.message) {
        const sentMsg: MessageItem = data.message;
        const entry = channelMessageCache.get(targetChannelId);
        const existing = entry?.messages ?? [];
        const merged = sortMessagesChronologically([...existing, sentMsg]);
        channelMessageCache.set(targetChannelId, {
          messages: merged,
          hasMore: entry?.hasMore ?? false,
          hydrated: entry?.hydrated ?? false,
        });

        if (targetChannelId === activeChannelIdRef.current) {
          setComposerText("");
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
          }
          setPendingAttachments([]);
          setReplyingTo(null);
          setMessages(merged);
          reportSeenIfVisible(targetChannelId, merged);
          requestAnimationFrame(() => scrollToBottom(true));
        }
      }
    } catch {
      if (targetChannelId === activeChannelIdRef.current) {
        setError("Network error while sending message.");
      }
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    const targetChannelId = channel.id;
    try {
      const res = await fetch(`${getMessagesBaseUrl(targetChannelId)}/${messageId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const entry = channelMessageCache.get(targetChannelId);
        if (entry) {
          const next = entry.messages.filter((m) => m.id !== messageId);
          channelMessageCache.set(targetChannelId, {
            ...entry,
            messages: next,
          });
          if (targetChannelId === activeChannelIdRef.current) {
            setMessages(next);
          }
        } else if (targetChannelId === activeChannelIdRef.current) {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        }
      }
    } catch {
      if (targetChannelId === activeChannelIdRef.current) {
        setError("Could not delete message.");
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const f = items[i].getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void uploadFiles(files);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) {
      void uploadFiles(e.dataTransfer.files);
    }
  }

  async function handleToggleReaction(messageId: string, emoji: string) {
    const targetChannelId = activeChannelIdRef.current;
    const entry = channelMessageCache.get(targetChannelId);
    if (!entry) return;

    const applyLocalReactions = (
      list: MessageItem[],
      updater: (reactions: MessageReactionSummary[]) => MessageReactionSummary[]
    ) =>
      list.map((m) =>
        m.id === messageId ? { ...m, reactions: updater(m.reactions ?? []) } : m
      );

    // Instant optimistic update
    const optimistic = applyLocalReactions(entry.messages, (prev) => {
      const existing = prev.find((r) => r.emoji === emoji);
      if (existing) {
        if (existing.reactedByMe) {
          const nextCount = existing.count - 1;
          if (nextCount <= 0) return prev.filter((r) => r.emoji !== emoji);
          return prev.map((r) =>
            r.emoji === emoji
              ? {
                  ...r,
                  count: nextCount,
                  userIds: r.userIds.filter((id) => id !== currentUser.id),
                  reactedByMe: false,
                }
              : r
          );
        }
        return prev.map((r) =>
          r.emoji === emoji
            ? {
                ...r,
                count: r.count + 1,
                userIds: [...r.userIds, currentUser.id],
                reactedByMe: true,
              }
            : r
        );
      }
      return [
        ...prev,
        { emoji, count: 1, userIds: [currentUser.id], reactedByMe: true },
      ];
    });

    channelMessageCache.set(targetChannelId, { ...entry, messages: optimistic });
    setMessages(optimistic);

    try {
      const res = await fetch(`/api/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update reaction.");
        return;
      }
      const latest = channelMessageCache.get(targetChannelId);
      if (latest && Array.isArray(data.reactions)) {
        const synced = latest.messages.map((m) =>
          m.id === messageId ? { ...m, reactions: data.reactions } : m
        );
        channelMessageCache.set(targetChannelId, { ...latest, messages: synced });
        if (targetChannelId === activeChannelIdRef.current) {
          setMessages(synced);
        }
      }
    } catch {
      setError("Network error while updating reaction.");
    }
  }

  function startEditingMessage(msg: MessageItem) {
    setEditingMessageId(msg.id);
    setEditDraft(msg.content);
  }

  async function handleSaveEdit(messageId: string) {
    const trimmed = editDraft.trim();
    if (!trimmed || savingEdit) return;
    const targetChannelId = activeChannelIdRef.current;
    setSavingEdit(true);

    try {
      const res = await fetch(`${getMessagesBaseUrl(targetChannelId)}/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to edit message.");
        return;
      }

      const entry = channelMessageCache.get(targetChannelId);
      if (entry) {
        const updated = entry.messages.map((m) =>
          m.id === messageId
            ? {
                ...m,
                content: data.message?.content ?? trimmed,
                editedAt: data.message?.editedAt ?? new Date().toISOString(),
              }
            : m
        );
        channelMessageCache.set(targetChannelId, { ...entry, messages: updated });
        if (targetChannelId === activeChannelIdRef.current) {
          setMessages(updated);
        }
      }
      setEditingMessageId(null);
      setEditDraft("");
    } catch {
      setError("Network error while editing message.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleTogglePin(msg: MessageItem) {
    const targetChannelId = activeChannelIdRef.current;
    const nextPinned = !msg.pinned;
    try {
      const res = await fetch(`${getMessagesBaseUrl(targetChannelId)}/${msg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: nextPinned }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not update pin status.");
        return;
      }

      const entry = channelMessageCache.get(targetChannelId);
      if (entry) {
        const updated = entry.messages.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                pinned: Boolean(data.message?.pinned),
                pinnedAt: data.message?.pinnedAt ?? null,
              }
            : m
        );
        channelMessageCache.set(targetChannelId, { ...entry, messages: updated });
        if (targetChannelId === activeChannelIdRef.current) {
          setMessages(updated);
        }
      }
      notify({
        kind: "success",
        title: nextPinned ? "Message Pinned" : "Message Unpinned",
        message: nextPinned
          ? `Pinned to #${channel.name}.`
          : `Removed from #${channel.name} pins.`,
        source: `#${channel.name}`,
      });
    } catch {
      setError("Network error updating pin.");
    }
  }

  function openReactionPicker(e: React.MouseEvent<HTMLElement>, messageId: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    setEmojiPicker({
      mode: "reaction",
      messageId,
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

  function openComposerEmojiPicker(e: React.MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setEmojiPicker({
      mode: "composer",
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

  function handleMessageContextMenu(
    e: React.MouseEvent<HTMLElement>,
    msg: MessageItem,
    canDelete: boolean
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    const isAuthor = msg.author.id === currentUser.id;
    const entries: ContextMenuEntry[] = [
      {
        type: "item",
        id: "react",
        label: "Add Reaction",
        icon: <SmilePlus className="h-3.5 w-3.5 text-emerald-400" />,
        onSelect: () => {
          setEmojiPicker({
            mode: "reaction",
            messageId: msg.id,
            anchorRect: {
              top: e.clientY,
              left: e.clientX,
              right: e.clientX,
              bottom: e.clientY,
              width: rect.width,
              height: 24,
            },
          });
        },
      },
      {
        type: "item",
        id: "reply",
        label: "Reply",
        icon: <Reply className="h-3.5 w-3.5" />,
        onSelect: () => setReplyingTo(msg),
      },
    ];

    if (isAuthor && msg.content) {
      entries.push({
        type: "item",
        id: "edit",
        label: "Edit Message",
        icon: <Pencil className="h-3.5 w-3.5" />,
        onSelect: () => startEditingMessage(msg),
      });
    }

    if (canDelete) {
      entries.push({
        type: "item",
        id: "pin",
        label: msg.pinned ? "Unpin Message" : "Pin Message",
        icon: <Pin className="h-3.5 w-3.5" />,
        onSelect: () => void handleTogglePin(msg),
      });
    }

    if (msg.content) {
      entries.push({
        type: "item",
        id: "copy-text",
        label: "Copy Text",
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => {
          void navigator.clipboard.writeText(msg.content);
          playSound("copy");
        },
      });
    }

    entries.push({
      type: "item",
      id: "share-msg",
      label: "Copy Quote & Author",
      icon: <Share2 className="h-3.5 w-3.5" />,
      onSelect: () => {
        const formatted = `${msg.author.displayName}: ${msg.content || msg.attachments[0]?.url || ""}`;
        void navigator.clipboard.writeText(formatted);
        playSound("copy");
      },
    });

    if (canDelete) {
      entries.push(
        { type: "divider", id: "msg-del-div" },
        {
          type: "item",
          id: "delete",
          label: "Delete Message",
          icon: <Trash2 className="h-3.5 w-3.5" />,
          danger: true,
          onSelect: () => void handleDeleteMessage(msg.id),
        }
      );
    }

    openMenu(e, entries);
  }

  function handleImageContextMenu(
    e: React.MouseEvent<HTMLElement>,
    att: MessageAttachment
  ) {
    openMenu(e, [
      {
        type: "item",
        id: "img-open",
        label: "Open Fullscreen",
        icon: <Maximize2 className="h-3.5 w-3.5" />,
        onSelect: () => setLightboxImage(att),
      },
      {
        type: "item",
        id: "img-download",
        label: "Download Image",
        icon: <Download className="h-3.5 w-3.5" />,
        onSelect: () => triggerDirectDownload(att),
      },
      {
        type: "item",
        id: "img-copy-link",
        label: "Copy Image Link",
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => {
          const fullUrl = att.url.startsWith("/")
            ? `${window.location.origin}${att.url}`
            : att.url;
          void navigator.clipboard.writeText(fullUrl);
          playSound("copy");
        },
      },
    ]);
  }

  function openAuthorProfile(
    e: React.MouseEvent<HTMLElement>,
    author: MessageItem["author"]
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    onOpenUserProfile({
      id: author.id,
      displayName: author.displayName,
      username: author.username,
      avatarColor: author.avatarColor,
      avatarUrl: author.avatarUrl,
      role: author.role,
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

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col bg-[#121316]"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-emerald-500/70 bg-emerald-500/10 backdrop-blur-[2px]"
          >
            <p className="text-sm font-medium text-emerald-300">
              Drop files or screenshots to attach
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Feed */}
      <div
        ref={scrollContainerRef}
        onScroll={handleFeedScroll}
        className="flex-1 space-y-0.5 overflow-y-auto px-4 py-5 md:px-6"
      >
        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-8 w-8 animate-pulse rounded-full bg-white/[0.05]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-28 animate-pulse rounded bg-white/[0.06]" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-white/[0.04]" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex h-full flex-col items-start justify-end pb-6"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-[#18191E] text-emerald-400">
              <Hash className="h-6 w-6" />
            </div>
            <h2 dir="auto" className="mt-4 text-xl font-semibold text-zinc-100">
              {isDm ? channel.name : `Welcome to #${channel.name}`}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {isDm
                ? `This is the beginning of your direct message history with ${channel.name}.`
                : channel.description || "This is the beginning of the conversation."}
            </p>
          </motion.div>
        ) : (
          <>
            {/* Top History Header / Load Older Messages */}
            {hasMore ? (
              <div className="mb-3 flex justify-center">
                <button
                  type="button"
                  disabled={loadingOlder}
                  onClick={() => void loadOlderMessages()}
                  className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#18191E] px-3.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-60"
                >
                  {loadingOlder && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>{loadingOlder ? "Loading older messages..." : "Load older messages"}</span>
                </button>
              </div>
            ) : (
              <div className="mb-4 border-b border-white/[0.06] pb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-[#18191E] text-emerald-400">
                  <Hash className="h-5 w-5" />
                </div>
                <h2 dir="auto" className="mt-2.5 text-base font-semibold text-zinc-100">
                  {isDm ? channel.name : `Welcome to #${channel.name}`}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {isDm
                    ? `Start of your direct messages with ${channel.name}.`
                    : channel.description || "This is the start of the channel history."}
                </p>
              </div>
            )}

            {messages.map((msg, idx) => {
            const prev = messages[idx - 1];
            const currentDayKey = getCalendarDayKey(msg.createdAt);
            const prevDayKey = prev ? getCalendarDayKey(prev.createdAt) : null;
            const showDateDivider = currentDayKey !== prevDayKey;

            const liveMember = members.find((m) => m.id === msg.author.id);
            const author = liveMember
              ? {
                  ...msg.author,
                  displayName: liveMember.displayName,
                  avatarColor: liveMember.avatarColor,
                  avatarUrl: liveMember.avatarUrl,
                  bannerUrl: liveMember.bannerUrl,
                  role: liveMember.role,
                }
              : msg.author;

            const isGrouped =
              Boolean(prev) &&
              !showDateDivider &&
              prev.author.id === msg.author.id &&
              !msg.replyTo &&
              new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() <
                5 * 60 * 1000;

            const canDelete =
              msg.author.id === currentUser.id ||
              (!isDm && (currentUser.role === "admin" || canManageMessages));
            const canPin = isDm || canDelete;

            return (
              <Fragment key={msg.id}>
                {/* Discord-style Day Separator */}
                {showDateDivider && (
                  <div
                    role="separator"
                    className="my-4 flex items-center gap-3 select-none"
                  >
                    <div className="h-px flex-1 bg-white/[0.07]" />
                    <span className="rounded-full border border-white/[0.07] bg-[#16171C] px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-zinc-400">
                      {formatDateDivider(msg.createdAt)}
                    </span>
                    <div className="h-px flex-1 bg-white/[0.07]" />
                  </div>
                )}

                <article
                  id={`msg-${msg.id}`}
                  onContextMenu={(e) => handleMessageContextMenu(e, msg, canDelete)}
                  className={`group relative flex gap-3 rounded-lg px-2 transition-all hover:bg-white/[0.025] ${
                    highlightedMessageId === msg.id
                      ? "bg-emerald-500/10 ring-1 ring-emerald-500/45"
                      : ""
                  } ${
                    density === "compact"
                      ? isGrouped
                        ? "mt-0 py-0.5"
                        : "mt-1.5 py-0.5"
                      : isGrouped
                        ? "mt-0 py-1"
                        : "mt-2.5 py-1 pt-1.5"
                  }`}
                >
                  {/* Hover Action Bar (Quick Reactions + Picker + Reply + Edit + Pin + Copy + Delete) */}
                  <div className="absolute -top-3.5 right-2 z-10 hidden items-center gap-0.5 rounded-lg border border-white/[0.09] bg-[#18191E] p-0.5 shadow-xl shadow-black/60 group-hover:flex">
                    {QUICK_REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => void handleToggleReaction(msg.id, emoji)}
                        title={`React ${emoji}`}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-sm transition-transform hover:scale-110 hover:bg-white/[0.07]"
                      >
                        {emoji}
                      </button>
                    ))}
                    <div className="mx-0.5 h-4 w-px bg-white/[0.08]" />
                    <button
                      type="button"
                      onClick={(e) => openReactionPicker(e, msg.id)}
                      title="Add reaction"
                      className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-emerald-300"
                    >
                      <SmilePlus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplyingTo(msg)}
                      title="Reply"
                      className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                    {msg.author.id === currentUser.id && msg.content && (
                      <button
                        type="button"
                        onClick={() => startEditingMessage(msg)}
                        title="Edit message"
                        className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canPin && (
                      <button
                        type="button"
                        onClick={() => void handleTogglePin(msg)}
                        title={msg.pinned ? "Unpin message" : "Pin message"}
                        className={`rounded-md p-1.5 transition-colors hover:bg-white/[0.06] ${
                          msg.pinned
                            ? "text-emerald-400 hover:text-emerald-300"
                            : "text-zinc-400 hover:text-zinc-100"
                        }`}
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {msg.content && (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(msg.content);
                          playSound("copy");
                        }}
                        title="Copy text"
                        className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteMessage(msg.id)}
                        title="Delete message"
                        className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Left Avatar Column (NO hover timestamp here — prevents height jumps) */}
                  <div className="w-8 shrink-0 pt-0.5">
                    {!isGrouped && (
                      <button
                        type="button"
                        onClick={(e) => openAuthorProfile(e, author)}
                        className="inline-flex rounded-full transition-transform hover:scale-105 focus:outline-none"
                      >
                        <Avatar
                          name={author.displayName}
                          color={author.avatarColor}
                          avatarUrl={author.avatarUrl}
                          size="md"
                        />
                      </button>
                    )}
                  </div>

                  {/* Message Body */}
                  <div className="min-w-0 flex-1">
                    {msg.replyTo && (
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-zinc-400">
                        <Reply className="h-3 w-3 shrink-0 text-emerald-400" />
                        <span dir="auto" className="font-medium text-zinc-300">
                          {msg.replyTo.authorDisplayName}
                        </span>
                        <span dir="auto" className="truncate text-zinc-500">
                          {msg.replyTo.content ||
                            (msg.replyTo.hasAttachments ? "Attachment" : "Message")}
                        </span>
                      </div>
                    )}

                    {!isGrouped && (
                      <div className="flex items-baseline gap-2">
                        <button
                          type="button"
                          onClick={(e) => openAuthorProfile(e, author)}
                          dir="auto"
                          className="text-sm font-semibold text-zinc-100 hover:underline"
                        >
                          {author.displayName}
                        </button>
                        <span className="text-[11px] font-medium tabular-nums text-zinc-500">
                          {formatTime(msg.createdAt)}
                        </span>
                        {msg.pinned && (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                            <Pin className="h-2.5 w-2.5" />
                            Pinned
                          </span>
                        )}
                      </div>
                    )}

                    {editingMessageId === msg.id ? (
                      <div className="mt-1 space-y-1.5">
                        <textarea
                          rows={2}
                          dir="auto"
                          autoFocus
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void handleSaveEdit(msg.id);
                            } else if (e.key === "Escape") {
                              setEditingMessageId(null);
                              setEditDraft("");
                            }
                          }}
                          className="w-full resize-none rounded-lg border border-emerald-500/50 bg-[#18191E] px-3 py-2 text-sm text-zinc-100 focus:outline-none"
                        />
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                          <span>Press Enter to save · Esc to cancel</span>
                          <button
                            type="button"
                            disabled={savingEdit}
                            onClick={() => void handleSaveEdit(msg.id)}
                            className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" />
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditDraft("");
                            }}
                            className="rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      msg.content && (
                        <p
                          dir="auto"
                          className={`whitespace-pre-wrap break-words leading-relaxed text-zinc-200 ${textSizeClass}`}
                        >
                          {renderLinkifiedText(msg.content)}
                          {msg.editedAt && (
                            <span
                              title={`Edited ${formatTime(msg.editedAt)}`}
                              className="ml-1.5 text-[10px] text-zinc-500 select-none"
                            >
                              (edited)
                            </span>
                          )}
                        </p>
                      )
                    )}

                    {msg.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2.5">
                        {msg.attachments.map((att, i) => {
                          const isImage = att.contentType.startsWith("image/");
                          if (isImage) {
                            return (
                              <div
                                key={`${att.url}-${i}`}
                                onContextMenu={(e) => handleImageContextMenu(e, att)}
                                className="group/img relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0E0F12] transition-colors hover:border-emerald-500/40"
                              >
                                <button
                                  type="button"
                                  onClick={() => setLightboxImage(att)}
                                  className="block focus:outline-none"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={att.url}
                                    alt={att.name}
                                    loading="lazy"
                                    className="max-h-72 max-w-xs object-contain transition-transform duration-200 group-hover/img:scale-[1.01] sm:max-w-sm"
                                  />
                                </button>

                                {/* Direct download pill on image hover */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    triggerDirectDownload(att);
                                  }}
                                  title="Download image"
                                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.15] bg-black/70 text-zinc-200 opacity-0 backdrop-blur-sm transition-all hover:bg-black hover:text-emerald-300 group-hover/img:opacity-100"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          }

                          const cat = getFileCategory(att);
                          return (
                            <div
                              key={`${att.url}-${i}`}
                              className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0E0F12] p-2.5 pr-3 transition-colors hover:border-white/[0.16]"
                            >
                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${cat.accent}`}
                              >
                                {cat.icon}
                              </div>
                              <div className="min-w-0 max-w-[200px]">
                                <p className="truncate text-xs font-medium text-zinc-100">
                                  {att.name}
                                </p>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium tabular-nums text-zinc-500">
                                  <span className="rounded bg-white/[0.06] px-1.5 py-0.25 text-zinc-400">
                                    {cat.badge}
                                  </span>
                                  <span>{formatBytes(att.size)}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => triggerDirectDownload(att)}
                                title={`Download ${att.name}`}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-[#18191E] text-zinc-300 transition-all hover:border-emerald-500/40 hover:text-emerald-300 active:scale-95"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Emoji Reactions Bar beneath message (clickable for others' & own messages) */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {msg.reactions.map((reaction) => {
                          const reactorNames = reaction.userIds
                            .map((uid) => {
                              if (uid === currentUser.id) return "You";
                              return (
                                members.find((m) => m.id === uid)?.displayName ?? "Member"
                              );
                            })
                            .join(", ");
                          return (
                            <button
                              key={reaction.emoji}
                              type="button"
                              onClick={() => void handleToggleReaction(msg.id, reaction.emoji)}
                              title={`${reaction.emoji} reacted by ${reactorNames}`}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium tabular-nums transition-all active:scale-95 ${
                                reaction.reactedByMe
                                  ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20"
                                  : "border-white/[0.08] bg-[#18191E] text-zinc-300 hover:border-white/[0.16] hover:text-white"
                              }`}
                            >
                              <span className="text-sm leading-none">{reaction.emoji}</span>
                              <span>{reaction.count}</span>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={(e) => openReactionPicker(e, msg.id)}
                          title="Add reaction"
                          className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-lg border border-white/[0.07] bg-[#18191E] text-zinc-400 transition-colors hover:border-white/[0.16] hover:text-zinc-100"
                        >
                          <SmilePlus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              </Fragment>
            );
          })}
          </>
        )}
      </div>

      {/* Floating Jump-to-Latest Pill when scrolled up and new messages arrive */}
      <AnimatePresence>
        {unseenBelowCount > 0 && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.16 }}
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-[86px] left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-emerald-500/40 bg-[#14151A]/95 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 shadow-xl backdrop-blur-md transition-colors hover:bg-emerald-500 hover:text-zinc-950"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            <span>
              {unseenBelowCount} new {unseenBelowCount === 1 ? "message" : "messages"}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Studio Floating Composer Area */}
      <div className="shrink-0 bg-gradient-to-t from-[#0D0E12] via-[#111216] to-transparent px-4 pb-3.5 pt-2 md:px-6">
        <AnimatePresence>
          {replyingTo && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.14 }}
              className="mb-2 flex items-center justify-between rounded-xl border border-emerald-500/20 bg-[#15171E] px-3 py-1.5 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Reply className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span className="text-zinc-400">Replying to</span>
                <span dir="auto" className="font-semibold text-zinc-100">
                  {replyingTo.author.displayName}
                </span>
                <span dir="auto" className="truncate text-zinc-500">
                  {replyingTo.content || "Attachment"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="rounded-md p-0.5 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {pendingAttachments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-2 flex flex-wrap gap-2"
            >
              {pendingAttachments.map((att, idx) => (
                <div
                  key={`${att.url}-${idx}`}
                  className="siq-bezel-sm flex items-center gap-2 rounded-xl border border-white/[0.09] bg-[#161820] px-2.5 py-1.5 text-xs"
                >
                  {att.contentType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={att.url}
                      alt={att.name}
                      className="h-6 w-6 rounded-md object-cover"
                    />
                  ) : (
                    <File className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  <span className="max-w-[140px] truncate text-zinc-200">{att.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="text-zinc-400 hover:text-rose-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <form
          onSubmit={(e) => void handleSend(e)}
          className="siq-bezel flex items-end gap-2 rounded-2xl border border-white/[0.1] bg-[#16171E] px-3 py-2 transition-all focus-within:border-emerald-500/45 focus-within:ring-2 focus-within:ring-emerald-500/12"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void uploadFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />

          <button
            type="button"
            disabled={uploadingCount > 0}
            onClick={() => {
              if (!blobReady) {
                setError(
                  "Enable Vercel Blob in Vercel Storage (BLOB_READ_WRITE_TOKEN) to upload files."
                );
                return;
              }
              fileInputRef.current?.click();
            }}
            title={blobReady ? "Attach image or file" : "Blob storage not configured"}
            className="mb-0.5 rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-40"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            dir="auto"
            value={composerText}
            onChange={(e) => {
              setComposerText(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              !canSendMessages
                ? `You do not have permission to send messages in ${channelLabel}`
                : uploadingCount > 0
                  ? "Uploading attachment..."
                  : `Message ${channelLabel} (Enter to send, paste screenshot)`
            }
            disabled={!canSendMessages}
            className="max-h-36 flex-1 resize-none bg-transparent py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />

          <button
            type="button"
            onClick={openComposerEmojiPicker}
            title="Insert emoji"
            aria-label="Insert emoji"
            className="mb-0.5 rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-emerald-300"
          >
            <Smile className="h-4 w-4" />
          </button>

          <motion.button
            whileTap={{ scale: 0.92 }}
            type="submit"
            disabled={
              sending ||
              uploadingCount > 0 ||
              (!composerText.trim() && pendingAttachments.length === 0)
            }
            aria-label="Send message"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20 transition-all hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
          >
            <Send className="h-4 w-4" />
          </motion.button>
        </form>
      </div>

      {/* Emoji Picker Popover (Reactions & Composer) */}
      <AnimatePresence>
        {emojiPicker && (
          <EmojiPickerPopover
            anchorRect={emojiPicker.anchorRect}
            onClose={() => setEmojiPicker(null)}
            onSelect={(emoji) => {
              if (emojiPicker.mode === "reaction" && emojiPicker.messageId) {
                void handleToggleReaction(emojiPicker.messageId, emoji);
              } else {
                setComposerText((prev) => `${prev}${emoji}`);
                textareaRef.current?.focus();
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Kibo-style Interactive Image Zoom Lightbox with Direct Download */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-[85] flex items-center justify-center bg-black/88 p-4 backdrop-blur-md"
            onClick={() => setLightboxImage(null)}
            onWheel={(e) => {
              e.preventDefault();
              setLightboxZoom((z) => {
                const next = e.deltaY < 0 ? z + 0.25 : z - 0.25;
                return Math.min(3, Math.max(1, Number(next.toFixed(2))));
              });
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.93 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="relative flex max-h-[92dvh] max-w-[92vw] flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top Action Bar */}
              <div className="mb-3 flex items-center justify-between gap-4 rounded-2xl border border-white/[0.1] bg-[#111218]/90 px-3.5 py-2 backdrop-blur-md">
                <span className="truncate text-xs font-medium text-zinc-200">
                  {lightboxImage.name}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="hidden items-center gap-1 rounded-xl border border-white/[0.08] bg-[#181920] px-1.5 py-1 sm:flex">
                    <button
                      type="button"
                      onClick={() => setLightboxZoom((z) => Math.max(1, Number((z - 0.5).toFixed(2))))}
                      disabled={lightboxZoom <= 1}
                      title="Zoom out"
                      className="rounded-md p-1 text-zinc-300 hover:bg-white/[0.08] hover:text-white disabled:opacity-35"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLightboxZoom(1)}
                      title="Reset zoom"
                      className="inline-flex min-w-[42px] items-center justify-center font-mono text-[11px] font-semibold text-zinc-200"
                    >
                      <SlidingNumber value={Math.round(lightboxZoom * 100)} />%
                    </button>
                    <button
                      type="button"
                      onClick={() => setLightboxZoom((z) => Math.min(3, Number((z + 0.5).toFixed(2))))}
                      disabled={lightboxZoom >= 3}
                      title="Zoom in"
                      className="rounded-md p-1 text-zinc-300 hover:bg-white/[0.08] hover:text-white disabled:opacity-35"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => triggerDirectDownload(lightboxImage)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-95"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download</span>
                  </button>
                  <a
                    href={lightboxImage.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open in new tab"
                    className="rounded-xl border border-white/[0.1] bg-[#181920] p-1.5 text-zinc-300 hover:text-white"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setLightboxImage(null)}
                    aria-label="Close image preview"
                    className="rounded-xl border border-white/[0.1] bg-[#181920] p-1.5 text-zinc-300 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40">
                <motion.img
                  src={lightboxImage.url}
                  alt={lightboxImage.name}
                  animate={{ scale: lightboxZoom }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  onClick={() => setLightboxZoom((z) => (z > 1 ? 1 : 2))}
                  title={lightboxZoom > 1 ? "Click to reset zoom" : "Click to zoom 200%"}
                  className={`max-h-[80dvh] max-w-[90vw] select-none object-contain shadow-2xl ${
                    lightboxZoom > 1 ? "cursor-zoom-out" : "cursor-zoom-in"
                  }`}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
