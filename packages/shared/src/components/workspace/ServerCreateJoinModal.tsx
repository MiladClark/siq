"use client";

import { apiFetch } from "@/lib/client-api";
import { Compass, Plus, Server, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { FormEvent, useEffect, useState } from "react";
import { useSystemNotify } from "@siq/shared/components/ui/NotificationCenter";
import { AVATAR_PALETTE, type ServerDetail } from "@siq/shared/lib/types";

const HEADER_TILE =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-emerald-500/[0.04] text-emerald-300 ring-1 ring-inset ring-emerald-400/30 shadow-[0_10px_24px_-10px_rgb(var(--siq-accent-rgb)/0.8),inset_0_1px_0_rgb(255_255_255/0.12)]";

const FIELD =
  "w-full rounded-xl border border-white/[0.09] bg-black/25 px-3.5 text-zinc-100 placeholder:text-zinc-600 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)] transition-[border-color,box-shadow,background-color] duration-200 hover:border-white/[0.14] focus:border-emerald-500/50 focus:bg-black/35 focus:outline-none focus:ring-4 focus:ring-emerald-500/10";

const LABEL = "block text-xs font-semibold text-zinc-300";

const FOOTER =
  "-mx-5 -mb-5 flex justify-end gap-2 border-t border-white/[0.06] bg-black/20 px-5 py-4";

const GHOST_BUTTON =
  "siq-press rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-300 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-zinc-100";

const CTA_BUTTON =
  "siq-cta inline-flex items-center gap-1.5 !rounded-xl px-5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50";

const MODE_PILL =
  "absolute inset-0 -z-10 rounded-xl bg-gradient-to-b from-emerald-500/20 to-emerald-500/[0.08] shadow-[inset_0_0_0_1px_rgb(var(--siq-accent-rgb)/0.4),inset_0_1px_0_rgb(255_255_255/0.08),0_8px_20px_-10px_rgb(var(--siq-accent-rgb)/0.8)]";

interface ServerCreateJoinModalProps {
  open: boolean;
  initialMode?: "create" | "join";
  onClose: () => void;
  onServersUpdated: (servers: ServerDetail[], focusServerId?: string) => void;
}

export function ServerCreateJoinModal({
  open,
  initialMode = "create",
  onClose,
  onServersUpdated,
}: ServerCreateJoinModalProps) {
  const notify = useSystemNotify();
  const [mode, setMode] = useState<"create" | "join">(initialMode);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [accentColor, setAccentColor] = useState<string>(AVATAR_PALETTE[0]);
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setName("");
    setTag("");
    setAccentColor(AVATAR_PALETTE[0]);
    setInviteCode("");
  }, [open, initialMode]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          tag: tag.trim().toUpperCase() || undefined,
          accentColor,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify({
          kind: "error",
          title: "Server Creation",
          message: data.error ?? "Failed to create server.",
          source: "Servers",
        });
        return;
      }

      notify({
        kind: "success",
        title: "Server Created",
        message: `${data.server?.name ?? name.trim()} is ready.`,
        source: "Servers",
      });
      if (data.servers) {
        onServersUpdated(data.servers, data.server?.id);
      }
      onClose();
    } catch {
      notify({
        kind: "error",
        title: "Server Creation",
        message: "Network error while creating server.",
        source: "Servers",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/servers/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify({
          kind: "error",
          title: "Join Server",
          message: data.error ?? "Could not join server with that invite.",
          source: "Servers",
        });
        return;
      }

      notify({
        kind: "success",
        title: data.alreadyMember ? "Already a Member" : "Joined Server",
        message: data.alreadyMember
          ? `Switched to ${data.server?.name ?? "server"}.`
          : `Welcome to ${data.server?.name ?? "the server"}!`,
        source: "Servers",
      });
      if (data.servers) {
        onServersUpdated(data.servers, data.server?.id);
      }
      onClose();
    } catch {
      notify({
        kind: "error",
        title: "Join Server",
        message: "Network error while joining server.",
        source: "Servers",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="siq-backdrop fixed inset-0 z-[85] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Create or join a server"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="siq-glass siq-edge-light relative w-full max-w-md overflow-hidden rounded-3xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 bg-gradient-to-b from-white/[0.035] to-transparent px-5 pb-3 pt-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className={HEADER_TILE}>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={mode}
                      initial={{ opacity: 0, scale: 0.5, rotate: -30 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.5, rotate: 30 }}
                      transition={{ type: "spring", stiffness: 520, damping: 28 }}
                      className="flex"
                    >
                      {mode === "create" ? (
                        <Server className="h-4 w-4" />
                      ) : (
                        <Compass className="h-4 w-4" />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <h2 className="truncate text-[15px] font-bold tracking-tight text-zinc-50">
                  {mode === "create" ? "Create a Server" : "Join a Server"}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="siq-icon-btn shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="border-b border-white/[0.06] px-5 pb-4">
              <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/[0.07] bg-black/30 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]">
                <button
                  type="button"
                  onClick={() => setMode("create")}
                  className={`relative isolate flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors duration-200 ${
                    mode === "create"
                      ? "text-emerald-200"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {mode === "create" && (
                    <motion.span
                      layoutId="siq-server-create-join-mode"
                      className={MODE_PILL}
                      transition={{ type: "spring", stiffness: 520, damping: 40 }}
                    />
                  )}
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create New</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("join")}
                  className={`relative isolate flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors duration-200 ${
                    mode === "join"
                      ? "text-emerald-200"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {mode === "join" && (
                    <motion.span
                      layoutId="siq-server-create-join-mode"
                      className={MODE_PILL}
                      transition={{ type: "spring", stiffness: 520, damping: 40 }}
                    />
                  )}
                  <Compass className="h-3.5 w-3.5" />
                  <span>Join via Invite</span>
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
            {mode === "create" ? (
              <motion.form
                key="create"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                onSubmit={handleCreate}
                className="space-y-4 p-5"
              >
                {/* Preview Badge */}
                <div
                  className="relative flex items-center gap-3.5 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${accentColor}2e 0%, transparent 62%)`,
                  }}
                >
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] text-base font-extrabold tracking-tight text-zinc-950 transition-[background-color,box-shadow] duration-300"
                    style={{
                      backgroundColor: accentColor,
                      boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.35), 0 14px 30px -14px ${accentColor}`,
                    }}
                  >
                    {(name.trim() || "SQ")
                      .split(/\s+/)
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p dir="auto" className="truncate text-sm font-bold tracking-tight text-zinc-50">
                        {name.trim() || "My Squad Server"}
                      </p>
                      {tag.trim() && (
                        <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
                          {tag.trim().slice(0, 6)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      Includes #general, Lounge, Gaming &amp; role permissions
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="srv-name" className={LABEL}>
                    Server name
                  </label>
                  <input
                    id="srv-name"
                    type="text"
                    dir="auto"
                    required
                    minLength={2}
                    maxLength={48}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Squad HQ or گیمینگ"
                    className={`${FIELD} py-2.5 text-sm`}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="srv-tag" className={LABEL}>
                    Server tag (optional, up to 6 chars)
                  </label>
                  <input
                    id="srv-tag"
                    type="text"
                    maxLength={6}
                    value={tag}
                    onChange={(e) => setTag(e.target.value.toUpperCase())}
                    placeholder="SIQ"
                    className={`${FIELD} py-2 text-xs font-semibold uppercase tracking-wider placeholder:font-normal placeholder:normal-case placeholder:tracking-normal`}
                  />
                </div>

                <div className="space-y-2">
                  <span className={LABEL}>Accent color</span>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {AVATAR_PALETTE.map((hex, index) => (
                      <motion.button
                        key={hex}
                        type="button"
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          delay: 0.04 + index * 0.025,
                          type: "spring",
                          stiffness: 520,
                          damping: 26,
                        }}
                        onClick={() => setAccentColor(hex)}
                        aria-label={`Select color ${hex}`}
                        style={{ backgroundColor: hex }}
                        className={`h-7 w-7 rounded-full shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] outline-offset-2 transition-[scale,opacity,outline-color] duration-200 ${
                          accentColor === hex
                            ? "scale-115 outline-2 outline-white"
                            : "opacity-70 outline-2 outline-transparent hover:scale-110 hover:opacity-100"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className={FOOTER}>
                  <button
                    type="button"
                    onClick={onClose}
                    className={GHOST_BUTTON}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || name.trim().length < 2}
                    className={CTA_BUTTON}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{submitting ? "Creating..." : "Create Server"}</span>
                  </button>
                </div>
              </motion.form>
            ) : (
              <motion.form
                key="join"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                onSubmit={handleJoin}
                className="space-y-4 p-5"
              >
                <p className="text-xs leading-relaxed text-zinc-400">
                  Paste an invite code (e.g.{" "}
                  <code className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-200 ring-1 ring-inset ring-emerald-500/20">
                    SIQ-ABCD-1234
                  </code>
                  ) or a full invite link shared by a friend.
                </p>

                <div className="space-y-2">
                  <label htmlFor="join-code" className={LABEL}>
                    Invite code or link
                  </label>
                  <input
                    id="join-code"
                    type="text"
                    required
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="SIQ-XXXX-XXXX or https://siq.devtune.app/join/..."
                    className={`${FIELD} py-2.5 font-mono text-sm placeholder:font-sans`}
                  />
                </div>

                <div className={FOOTER}>
                  <button
                    type="button"
                    onClick={onClose}
                    className={GHOST_BUTTON}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !inviteCode.trim()}
                    className={CTA_BUTTON}
                  >
                    <Compass className="h-3.5 w-3.5" />
                    <span>{submitting ? "Joining..." : "Join Server"}</span>
                  </button>
                </div>
              </motion.form>
            )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
