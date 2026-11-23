"use client";

import {
  AlertCircle,
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
import type { ProfilePopoverTarget } from "@/components/ui/UserProfilePopover";
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
  blobReady: boolean;
  onOpenUserProfile: (target: ProfilePopoverTarget) => void;
}

/** Persistent in-memory cache across channel switches — zero skeleton flash when switching back */
const channelMessageCache = new Map<string, MessageItem[]>();

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
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
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
  blobReady,
  onOpenUserProfile,
}: TextChannelViewProps) {
  const { openMenu } = useContextMenu();

  const cachedInitial = channelMessageCache.get(channel.id);
  const [messages, setMessages] = useState<MessageItem[]>(cachedInitial ?? []);
  const [loading, setLoading] = useState<boolean>(cachedInitial === undefined);
  const [composerText, setComposerText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<MessageAttachment | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lastTimestampRef = useRef<string | null>(
    cachedInitial && cachedInitial.length > 0
      ? cachedInitial[cachedInitial.length - 1].createdAt
      : null
  );

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // Load or silently refresh channel messages when switching channels
  useEffect(() => {
    let active = true;
    const cached = channelMessageCache.get(channel.id);

    setReplyingTo(null);
    setError(null);

    if (cached !== undefined) {
      // Instant render from memory cache — zero skeleton flicker!
      setMessages(cached);
      setLoading(false);
      lastTimestampRef.current =
        cached.length > 0 ? cached[cached.length - 1].createdAt : null;
      requestAnimationFrame(() => scrollToBottom(false));
    } else {
      setMessages([]);
      setLoading(true);
      lastTimestampRef.current = null;
    }

    async function syncChannel() {
      try {
        const after = cached && cached.length > 0 ? cached[cached.length - 1].createdAt : null;
        const url = after
          ? `/api/channels/${channel.id}/messages?after=${encodeURIComponent(after)}`
          : `/api/channels/${channel.id}/messages`;

        const res = await fetch(url);
        const data = await res.json();
        if (!active) return;

        if (!res.ok) {
          if (cached === undefined) {
            setError(data.error ?? "Failed to load messages.");
          }
          return;
        }

        const incoming: MessageItem[] = data.messages ?? [];
        if (after) {
          if (incoming.length > 0) {
            setMessages((prev) => {
              const ids = new Set(prev.map((m) => m.id));
              const fresh = incoming.filter((m) => !ids.has(m.id));
              const merged = fresh.length > 0 ? [...prev, ...fresh] : prev;
              channelMessageCache.set(channel.id, merged);
              if (merged.length > 0) {
                lastTimestampRef.current = merged[merged.length - 1].createdAt;
              }
              return merged;
            });
            requestAnimationFrame(() => scrollToBottom(true));
          }
        } else {
          channelMessageCache.set(channel.id, incoming);
          setMessages(incoming);
          lastTimestampRef.current =
            incoming.length > 0 ? incoming[incoming.length - 1].createdAt : null;
          requestAnimationFrame(() => scrollToBottom(false));
        }
      } catch {
        if (active && cached === undefined) {
          setError("Network error while loading messages.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void syncChannel();
    return () => {
      active = false;
    };
  }, [channel.id, scrollToBottom]);

  // Incremental background sync every 2.2s
  useEffect(() => {
    const interval = setInterval(async () => {
      const after = lastTimestampRef.current;
      const url = after
        ? `/api/channels/${channel.id}/messages?after=${encodeURIComponent(after)}`
        : `/api/channels/${channel.id}/messages`;

      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const incoming: MessageItem[] = data.messages ?? [];
        if (incoming.length === 0) return;

        const el = scrollContainerRef.current;
        const nearBottom = el
          ? el.scrollHeight - el.scrollTop - el.clientHeight < 140
          : true;

        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = incoming.filter((m) => !existingIds.has(m.id));
          if (fresh.length === 0) return prev;
          const merged = [...prev, ...fresh];
          channelMessageCache.set(channel.id, merged);
          lastTimestampRef.current = merged[merged.length - 1].createdAt;
          return merged;
        });

        if (nearBottom) {
          requestAnimationFrame(() => scrollToBottom(true));
        }
      } catch {
        // silent retry
      }
    }, 2200);

    return () => clearInterval(interval);
  }, [channel.id, scrollToBottom]);

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

    for (const file of fileArray) {
      try {
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
        setError(`Network error uploading ${file.name}.`);
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

    setSending(true);
    setError(null);

    const payload = {
      content,
      replyToId: replyingTo?.id ?? null,
      attachments: pendingAttachments,
    };

    try {
      const res = await fetch(`/api/channels/${channel.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to send message.");
      } else if (data.message) {
        setComposerText("");
        setPendingAttachments([]);
        setReplyingTo(null);
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          const next = [...prev, data.message];
          channelMessageCache.set(channel.id, next);
          lastTimestampRef.current = data.message.createdAt;
          return next;
        });
        requestAnimationFrame(() => scrollToBottom(true));
      }
    } catch {
      setError("Network error while sending message.");
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    try {
      const res = await fetch(`/api/channels/${channel.id}/messages/${messageId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMessages((prev) => {
          const next = prev.filter((m) => m.id !== messageId);
          channelMessageCache.set(channel.id, next);
          return next;
        });
      }
    } catch {
      setError("Could not delete message.");
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
            <p className="font-mono text-sm font-medium text-emerald-300">
              Drop files or screenshots to attach
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Feed */}
      <div
        ref={scrollContainerRef}
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
          messages.map((msg, idx) => {
            const prev = messages[idx - 1];
            const currentDayKey = getCalendarDayKey(msg.createdAt);
            const prevDayKey = prev ? getCalendarDayKey(prev.createdAt) : null;
            const showDateDivider = currentDayKey !== prevDayKey;

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
                    <span className="rounded-full border border-white/[0.07] bg-[#16171C] px-2.5 py-0.5 font-mono text-[11px] font-medium text-zinc-400">
                      {formatDateDivider(msg.createdAt)}
                    </span>
                    <div className="h-px flex-1 bg-white/[0.07]" />
                  </div>
                )}

                <article
                  onContextMenu={(e) => handleMessageContextMenu(e, msg, canDelete)}
                  className={`group relative flex gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-white/[0.025] ${
                    isGrouped ? "mt-0" : "mt-2.5 pt-1.5"
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
                        onClick={(e) => openAuthorProfile(e, msg.author)}
                        className="rounded-full transition-transform hover:scale-105 focus:outline-none"
                      >
                        <Avatar
                          name={msg.author.displayName}
                          color={msg.author.avatarColor}
                          avatarUrl={msg.author.avatarUrl}
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
                          onClick={(e) => openAuthorProfile(e, msg.author)}
                          dir="auto"
                          className="text-sm font-semibold text-zinc-100 hover:underline"
                        >
                          {msg.author.displayName}
                        </button>
                        <span className="font-mono text-[11px] text-zinc-500">
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>
                    )}

                    {msg.content && (
                      <p
                        dir="auto"
                        className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200"
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
                                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
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
          })
        )}
      </div>

      {/* Composer Area */}
      <div className="shrink-0 border-t border-white/[0.07] bg-[#121316] px-4 py-3 md:px-6">
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button type="button" onClick={() => setError(null)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

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
            rows={1}
            dir="auto"
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
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
