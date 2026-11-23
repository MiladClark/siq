"use client";

import {
  ArrowDown,
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
  Reply,
  Send,
  Share2,
  Trash2,
  X,
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
import { useSystemNotify } from "@/components/ui/NotificationCenter";
import type { ProfilePopoverTarget } from "@/components/ui/UserProfilePopover";
import { convertImageFileToWebP } from "@/lib/image-webp";
import type { MessageDensity, TextScale } from "@/lib/preferences";
import { playSound } from "@/lib/sounds";
import type {
  ChannelItem,
  MessageAttachment,
  MessageItem,
  PublicUser,
} from "@/lib/types";

interface TextChannelViewProps {
  channel: ChannelItem;
  currentUser: PublicUser;
  members: PublicUser[];
  blobReady: boolean;
  density?: MessageDensity;
  textScale?: TextScale;
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
  density = "comfortable",
  textScale = "md",
  onOpenUserProfile,
  onMessagesSeen,
}: TextChannelViewProps) {
  const { openMenu } = useContextMenu();
  const notify = useSystemNotify();
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
  const [dragging, setDragging] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<MessageAttachment | null>(null);

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
        const res = await fetch(`/api/channels/${targetChannelId}/messages`, {
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

  // Incremental background poll every 2.2s (strictly channel-scoped + AbortController — NEVER corrupts cache)
  useEffect(() => {
    const targetChannelId = channel.id;
    let active = true;
    let inFlightController: AbortController | null = null;

    const interval = setInterval(async () => {
      if (!active || targetChannelId !== activeChannelIdRef.current) return;
      const entry = channelMessageCache.get(targetChannelId);
      // Never poll incrementally before initial full history has hydrated!
      if (!entry?.hydrated) return;

      const lastMsg = entry.messages[entry.messages.length - 1];
      const url = lastMsg
        ? `/api/channels/${targetChannelId}/messages?after=${encodeURIComponent(lastMsg.createdAt)}`
        : `/api/channels/${targetChannelId}/messages`;

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
        if (incoming.length === 0) return;
        if (!active || targetChannelId !== activeChannelIdRef.current) return;

        // Always merge against the target channel's own cache entry (NEVER React prev state!)
        const latestEntry = channelMessageCache.get(targetChannelId);
        if (!latestEntry?.hydrated) return;

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
        `/api/channels/${targetChannelId}/messages?before=${encodeURIComponent(oldest.createdAt)}`,
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
      const res = await fetch(`/api/channels/${targetChannelId}/messages`, {
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
      const res = await fetch(`/api/channels/${targetChannelId}/messages/${messageId}`, {
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

  function handleMessageContextMenu(
    e: React.MouseEvent<HTMLElement>,
    msg: MessageItem,
    canDelete: boolean
  ) {
    const entries: ContextMenuEntry[] = [
      {
        type: "item",
        id: "reply",
        label: "Reply",
        icon: <Reply className="h-3.5 w-3.5" />,
        onSelect: () => setReplyingTo(msg),
      },
    ];

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
              Welcome to #{channel.name}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {channel.description || "This is the beginning of the conversation."}
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
                  Welcome to #{channel.name}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {channel.description || "This is the start of the channel history."}
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
              msg.author.id === currentUser.id || currentUser.role === "admin";

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
                  onContextMenu={(e) => handleMessageContextMenu(e, msg, canDelete)}
                  className={`group relative flex gap-3 rounded-lg px-2 transition-colors hover:bg-white/[0.025] ${
                    density === "compact"
                      ? isGrouped
                        ? "mt-0 py-0.5"
                        : "mt-1.5 py-0.5"
                      : isGrouped
                        ? "mt-0 py-1"
                        : "mt-2.5 py-1 pt-1.5"
                  }`}
                >
                  {/* Hover Actions */}
                  <div className="absolute -top-3 right-2 hidden items-center gap-0.5 rounded-lg border border-white/[0.09] bg-[#18191E] p-0.5 shadow-lg group-hover:flex">
                    <button
                      type="button"
                      onClick={() => setReplyingTo(msg)}
                      title="Reply"
                      className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </button>
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
                      </div>
                    )}

                    {msg.content && (
                      <p
                        dir="auto"
                        className={`whitespace-pre-wrap break-words leading-relaxed text-zinc-200 ${textSizeClass}`}
                      >
                        {renderLinkifiedText(msg.content)}
                      </p>
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

      {/* Composer Area */}
      <div className="shrink-0 border-t border-white/[0.07] bg-[#121316] px-4 py-3 md:px-6">
        <AnimatePresence>
          {replyingTo && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.14 }}
              className="mb-2 flex items-center justify-between rounded-lg border border-white/[0.07] bg-[#18191E] px-3 py-1.5 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Reply className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span className="text-zinc-400">Replying to</span>
                <span dir="auto" className="font-medium text-zinc-200">
                  {replyingTo.author.displayName}
                </span>
                <span dir="auto" className="truncate text-zinc-500">
                  {replyingTo.content || "Attachment"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="rounded p-0.5 text-zinc-400 hover:text-zinc-100"
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
                  className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#18191E] px-2.5 py-1.5 text-xs"
                >
                  {att.contentType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={att.url}
                      alt={att.name}
                      className="h-6 w-6 rounded object-cover"
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
          className="flex items-end gap-2 rounded-xl border border-white/[0.1] bg-[#18191E] px-3 py-2 transition-colors focus-within:border-emerald-500/50"
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
            className="mb-0.5 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-40"
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
              uploadingCount > 0
                ? "Uploading attachment..."
                : `Message #${channel.name} (Enter to send, paste screenshot)`
            }
            className="max-h-36 flex-1 resize-none bg-transparent py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />

          <button
            type="submit"
            disabled={
              sending ||
              uploadingCount > 0 ||
              (!composerText.trim() && pendingAttachments.length === 0)
            }
            aria-label="Send message"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950 transition-all hover:bg-emerald-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* Animated Image Lightbox with Direct Download */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-[85] flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs"
            onClick={() => setLightboxImage(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.93 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex max-h-[92dvh] max-w-[92vw] flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top Action Bar */}
              <div className="mb-2.5 flex items-center justify-between gap-4">
                <span className="truncate text-xs font-medium text-zinc-300">
                  {lightboxImage.name}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => triggerDirectDownload(lightboxImage)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-95"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download</span>
                  </button>
                  <a
                    href={lightboxImage.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open in new tab"
                    className="rounded-lg border border-white/[0.12] bg-[#18191E] p-1.5 text-zinc-300 hover:text-white"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setLightboxImage(null)}
                    aria-label="Close image preview"
                    className="rounded-lg border border-white/[0.12] bg-[#18191E] p-1.5 text-zinc-300 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxImage.url}
                alt={lightboxImage.name}
                className="max-h-[82dvh] max-w-[90vw] rounded-xl border border-white/[0.08] object-contain shadow-2xl"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
