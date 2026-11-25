"use client";

import { apiFetch } from "@/lib/client-api";
import { Compass, Plus, Server, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { FormEvent, useEffect, useState } from "react";
import { useSystemNotify } from "@/components/ui/NotificationCenter";
import { AVATAR_PALETTE, type ServerDetail } from "@/lib/types";

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
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/75 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Create or join a server"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.1] bg-[#121316] shadow-2xl shadow-black/80"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Server className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-zinc-100">
                  {mode === "create" ? "Create a Server" : "Join a Server"}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-1.5 border-b border-white/[0.06] bg-[#0E0F12] p-2.5">
              <button
                type="button"
                onClick={() => setMode("create")}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  mode === "create"
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                    : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create New</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("join")}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  mode === "join"
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                    : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                }`}
              >
                <Compass className="h-3.5 w-3.5" />
                <span>Join via Invite</span>
              </button>
            </div>

            {mode === "create" ? (
              <form onSubmit={handleCreate} className="space-y-4 p-5">
                {/* Preview Badge */}
                <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#0E0F12] p-3">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-zinc-950"
                    style={{ backgroundColor: accentColor }}
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
                      <p dir="auto" className="truncate text-sm font-semibold text-zinc-100">
                        {name.trim() || "My Squad Server"}
                      </p>
                      {tag.trim() && (
                        <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                          {tag.trim().slice(0, 6)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      Includes #general, Lounge, Gaming &amp; role permissions
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="srv-name" className="block text-xs font-medium text-zinc-300">
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
                    className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="srv-tag" className="block text-xs font-medium text-zinc-300">
                    Server tag (optional, up to 6 chars)
                  </label>
                  <input
                    id="srv-tag"
                    type="text"
                    maxLength={6}
                    value={tag}
                    onChange={(e) => setTag(e.target.value.toUpperCase())}
                    placeholder="SIQ"
                    className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-100 placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-zinc-300">Accent color</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {AVATAR_PALETTE.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setAccentColor(hex)}
                        aria-label={`Select color ${hex}`}
                        style={{ backgroundColor: hex }}
                        className={`h-7 w-7 rounded-full transition-transform ${
                          accentColor === hex
                            ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#121316]"
                            : "opacity-75 hover:opacity-100"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-white/[0.1] px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.05]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || name.trim().length < 2}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{submitting ? "Creating..." : "Create Server"}</span>
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleJoin} className="space-y-4 p-5">
                <p className="text-xs leading-relaxed text-zinc-400">
                  Paste an invite code (e.g.{" "}
                  <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">
                    SIQ-ABCD-1234
                  </code>
                  ) or a full invite link shared by a friend.
                </p>

                <div className="space-y-1.5">
                  <label htmlFor="join-code" className="block text-xs font-medium text-zinc-300">
                    Invite code or link
                  </label>
                  <input
                    id="join-code"
                    type="text"
                    required
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="SIQ-XXXX-XXXX or https://siq.devtune.app/join/..."
                    className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-white/[0.1] px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.05]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !inviteCode.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
                  >
                    <Compass className="h-3.5 w-3.5" />
                    <span>{submitting ? "Joining..." : "Join Server"}</span>
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
