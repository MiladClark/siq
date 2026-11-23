"use client";

import {
  ArrowBendUpLeft,
  DownloadSimple,
  File,
  Hash,
  Paperclip,
  PaperPlaneTilt,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  ClipboardEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Avatar } from "@/components/ui/Avatar";
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
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
}: TextChannelViewProps) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
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
  const lastTimestampRef = useRef<string | null>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // Load initial messages for the channel
  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessages([]);
    setReplyingTo(null);
    setError(null);
    lastTimestampRef.current = null;

    async function loadInitial() {
      try {
        const res = await fetch(`/api/channels/${channel.id}/messages`);
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setError(data.error ?? "Failed to load messages.");
        } else {
          const loaded: MessageItem[] = data.messages ?? [];
          setMessages(loaded);
          if (loaded.length > 0) {
            lastTimestampRef.current = loaded[loaded.length - 1].createdAt;
          }
          requestAnimationFrame(() => scrollToBottom(false));
        }
      } catch {
        if (active) setError("Network error while loading messages.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInitial();
    return () => {
      active = false;
    };
  }, [channel.id, scrollToBottom]);

  // Smart incremental sync (polls every 2s only while tab is visible)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.visibilityState !== "visible") return;

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
          lastTimestampRef.current = merged[merged.length - 1].createdAt;
          return merged;
        });

        if (nearBottom) {
          requestAnimationFrame(() => scrollToBottom(true));
        }
      } catch {
        // silent retry on next tick
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [channel.id, scrollToBottom]);

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
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
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
      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-emerald-500/70 bg-emerald-500/10 backdrop-blur-[1px]">
          <p className="font-mono text-sm font-medium text-emerald-300">
            Drop files or screenshots to attach
          </p>
        </div>
      )}

      {/* Messages Feed */}
      <div
        ref={scrollContainerRef}
        className="flex-1 space-y-1 overflow-y-auto px-4 py-5 md:px-6"
      >
        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-8 w-8 animate-pulse rounded-full bg-white/[0.05]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-28 animate-pulse rounded bg-white/[0.06]" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-white/[0.04]" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-start justify-end pb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-[#18191E] text-emerald-400">
              <Hash size={22} weight="bold" />
            </div>
            <h2 dir="auto" className="mt-4 text-xl font-semibold text-zinc-100">
              Welcome to #{channel.name}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {channel.description || "This is the beginning of the conversation."}
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const prev = messages[idx - 1];
            const isGrouped =
              Boolean(prev) &&
              prev.author.id === msg.author.id &&
              !msg.replyTo &&
              new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() <
                5 * 60 * 1000;

            const canDelete =
              msg.author.id === currentUser.id || currentUser.role === "admin";

            return (
              <article
                key={msg.id}
                className={`group relative flex gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-white/[0.025] ${
                  isGrouped ? "mt-0" : "mt-3 pt-1.5"
                }`}
              >
                {/* Hover Actions */}
                <div className="absolute -top-2.5 right-2 hidden items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#18191E] p-0.5 shadow-lg group-hover:flex">
                  <button
                    type="button"
                    onClick={() => setReplyingTo(msg)}
                    title="Reply"
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                  >
                    <ArrowBendUpLeft size={13} />
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteMessage(msg.id)}
                      title="Delete message"
                      className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
                    >
                      <Trash size={13} />
                    </button>
                  )}
                </div>

                {/* Left Avatar Column */}
                <div className="w-8 shrink-0 pt-0.5">
                  {!isGrouped ? (
                    <Avatar
                      name={msg.author.displayName}
                      color={msg.author.avatarColor}
                      size="md"
                    />
                  ) : (
                    <span className="hidden pt-1 font-mono text-[10px] text-zinc-600 group-hover:block">
                      {formatTime(msg.createdAt)}
                    </span>
                  )}
                </div>

                {/* Message Body */}
                <div className="min-w-0 flex-1">
                  {msg.replyTo && (
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] text-zinc-400">
                      <ArrowBendUpLeft size={12} className="shrink-0 text-emerald-400" />
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
                      <span dir="auto" className="text-sm font-semibold text-zinc-100">
                        {msg.author.displayName}
                      </span>
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
                    <div className="mt-2 flex flex-wrap gap-2">
                      {msg.attachments.map((att, i) => {
                        const isImage = att.contentType.startsWith("image/");
                        if (isImage) {
                          return (
                            <button
                              key={`${att.url}-${i}`}
                              type="button"
                              onClick={() => setLightboxImage(att)}
                              className="group/img overflow-hidden rounded-lg border border-white/[0.08] bg-[#0E0F12] transition-colors hover:border-emerald-500/40"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={att.url}
                                alt={att.name}
                                loading="lazy"
                                className="max-h-72 max-w-xs object-contain transition-transform group-hover/img:scale-[1.01] sm:max-w-sm"
                              />
                            </button>
                          );
                        }

                        return (
                          <a
                            key={`${att.url}-${i}`}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#0E0F12] px-3 py-2 text-xs transition-colors hover:border-white/[0.18]"
                          >
                            <File size={18} className="shrink-0 text-emerald-400" />
                            <div className="min-w-0">
                              <p className="max-w-[200px] truncate font-medium text-zinc-200">
                                {att.name}
                              </p>
                              <p className="font-mono text-[10px] text-zinc-500">
                                {formatBytes(att.size)}
                              </p>
                            </div>
                            <DownloadSimple size={15} className="shrink-0 text-zinc-400" />
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Composer Area */}
      <div className="shrink-0 border-t border-white/[0.07] bg-[#121316] px-4 py-3 md:px-6">
        {error && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <WarningCircle size={14} weight="bold" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError(null)}>
              <X size={13} />
            </button>
          </div>
        )}

        {replyingTo && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-white/[0.07] bg-[#18191E] px-3 py-1.5 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <ArrowBendUpLeft size={13} className="shrink-0 text-emerald-400" />
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
              <X size={13} />
            </button>
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
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
                  <File size={14} className="text-emerald-400" />
                )}
                <span className="max-w-[140px] truncate text-zinc-200">{att.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="text-zinc-400 hover:text-rose-400"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => void handleSend(e)}
          className="flex items-end gap-2 rounded-xl border border-white/[0.1] bg-[#18191E] px-3 py-2 focus-within:border-emerald-500/50"
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
            <Paperclip size={18} />
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
            <PaperPlaneTilt size={15} weight="fill" />
          </button>
        </form>
      </div>

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-h-[90dvh] max-w-[92vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              aria-label="Close image preview"
              className="absolute -top-10 right-0 rounded-lg bg-white/10 p-1.5 text-zinc-200 hover:bg-white/20"
            >
              <X size={18} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxImage.url}
              alt={lightboxImage.name}
              className="max-h-[85dvh] max-w-[90vw] rounded-lg object-contain"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
              <span className="truncate">{lightboxImage.name}</span>
              <a
                href={lightboxImage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:underline"
              >
                Open original
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
