"use client";

import { Check, Clock, Copy, KeyRound, Link2, Plus, Trash2, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { useSystemNotify } from "@/components/ui/NotificationCenter";
import { SelectDropdown } from "@/components/ui/SelectDropdown";
import { playSound } from "@/lib/sounds";

interface InviteRow {
  id: string;
  code: string;
  maxUses: number;
  usesCount: number;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

interface ServerInvitesProps {
  open: boolean;
  serverId?: string | null;
  serverName?: string | null;
  onClose: () => void;
  presentation?: "modal" | "panel";
}

export function ServerInvites({
  open,
  serverId = null,
  serverName = null,
  onClose,
  presentation = "modal",
}: ServerInvitesProps) {
  const compact = presentation === "panel";
  const title = serverName ? `Invite friends to ${serverName}` : "Invite friends";
  const notify = useSystemNotify();
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState(10);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(7);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadInvites = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    try {
      const url = serverId
        ? `/api/invites?serverId=${encodeURIComponent(serverId)}`
        : "/api/invites";
      const res = await fetch(url, { cache: "no-store", signal });
      const data = await res.json();
      if (signal.aborted) return;
      if (!res.ok) {
        notify({
          kind: "error",
          title: "Invites Error",
          message: data.error ?? "Failed to load invites.",
          source: serverName ?? "Invites",
        });
      } else {
        setInvites(data.invites ?? []);
      }
    } catch {
      if (signal.aborted) return;
      notify({
        kind: "error",
        title: "Invites Error",
        message: "Network error while loading invites.",
        source: serverName ?? "Invites",
      });
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [notify, serverId, serverName]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void loadInvites(controller.signal);
    return () => controller.abort();
  }, [open, loadInvites]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: serverId ?? undefined,
          maxUses,
          expiresInDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify({
          kind: "error",
          title: "Invites Error",
          message: data.error ?? "Failed to create invite.",
          source: serverName ?? "Invites",
        });
      } else if (data.invite) {
        setInvites((prev) => [data.invite, ...prev]);
      }
    } catch {
      notify({
        kind: "error",
        title: "Invites Error",
        message: "Network error while creating invite.",
        source: serverName ?? "Invites",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      const res = await fetch(`/api/invites/${id}`, { method: "DELETE" });
      if (res.ok) {
        setInvites((prev) =>
          prev.map((inv) => (inv.id === id ? { ...inv, revoked: true } : inv))
        );
      }
    } catch {
      notify({
        kind: "error",
        title: "Invites Error",
        message: "Could not revoke invite.",
        source: serverName ?? "Invites",
      });
    }
  }

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      playSound("copy");
      setCopiedId(key);
      setTimeout(() => setCopiedId((curr) => (curr === key ? null : curr)), 1800);
    } catch {
      notify({
        kind: "warning",
        title: "Clipboard Blocked",
        message: "Clipboard access denied.",
        source: serverName ?? "Invites",
      });
    }
  }

  const content = (
    <>
      <div className={`flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] ${compact ? "px-3.5 py-2" : "px-5 py-4"}`}>
        <div className="flex items-center gap-2.5">
          <KeyRound className="h-4 w-4 shrink-0 text-emerald-400" />
          <h2 className="text-sm font-semibold text-zinc-100">
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close invites"
          className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className={compact ? "min-h-0 space-y-3 overflow-y-auto p-3.5" : "space-y-5 p-5"}>
        <div className={compact ? "" : "rounded-xl border border-white/[0.07] bg-[#0E0F12] p-4"}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor={compact ? "invite-panel-max-uses" : "invite-max-uses"}
                className="block text-xs font-medium text-zinc-400"
              >
                Max uses
              </label>
              <SelectDropdown
                id={compact ? "invite-panel-max-uses" : "invite-max-uses"}
                ariaLabel="Max uses"
                value={String(maxUses)}
                onChange={(v) => setMaxUses(Number(v))}
                icon={<Users className="h-3.5 w-3.5" />}
                options={[
                  { value: "1", label: "1 use", badge: compact ? undefined : "Single" },
                  { value: "5", label: "5 uses" },
                  { value: "10", label: "10 uses" },
                  { value: "25", label: "25 uses" },
                  { value: "100", label: "100 uses" },
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={compact ? "invite-panel-expiry" : "invite-expiry"}
                className="block text-xs font-medium text-zinc-400"
              >
                Expires after
              </label>
              <SelectDropdown
                id={compact ? "invite-panel-expiry" : "invite-expiry"}
                ariaLabel="Expires after"
                value={expiresInDays === null ? "never" : String(expiresInDays)}
                onChange={(v) => setExpiresInDays(v === "never" ? null : Number(v))}
                icon={<Clock className="h-3.5 w-3.5" />}
                options={[
                  { value: "1", label: "24 hours" },
                  { value: "7", label: "7 days", badge: compact ? undefined : "Default" },
                  { value: "30", label: "30 days" },
                  { value: "never", label: "Never expires" },
                ]}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{creating ? "Generating..." : "Generate invite link"}</span>
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Invite codes</span>
            <span className="text-[11px] font-medium tabular-nums text-zinc-500">
              {invites.length} total
            </span>
          </div>

          <div className={compact ? "max-h-56 space-y-1.5 overflow-y-auto" : "max-h-64 space-y-2 overflow-y-auto pr-1"}>
            {loading ? (
              <div className="space-y-2">
                <div className="h-14 animate-pulse rounded-lg bg-white/[0.04]" />
                <div className="h-14 animate-pulse rounded-lg bg-white/[0.04]" />
              </div>
            ) : invites.length === 0 ? (
              <div className={`rounded-lg border border-white/[0.07] bg-black/15 text-center text-xs text-zinc-500 ${compact ? "py-4" : "py-8"}`}>
                No invite codes yet.
              </div>
            ) : (
              invites.map((inv) => {
                const expired =
                  inv.expiresAt !== null &&
                  new Date(inv.expiresAt).getTime() < Date.now();
                const exhausted = inv.usesCount >= inv.maxUses;
                const inactive = inv.revoked || expired || exhausted;
                const joinUrl =
                  typeof window !== "undefined"
                    ? `${window.location.origin}/join/${inv.code}`
                    : `/join/${inv.code}`;

                return (
                  <div
                    key={inv.id}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 ${
                      inactive
                        ? "border-white/[0.05] bg-[#0E0F12]/50 opacity-55"
                        : "border-white/[0.08] bg-[#18191E]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-xs font-semibold tracking-wider text-zinc-100">
                          {inv.code}
                        </code>
                        {inv.revoked && (
                          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
                            Revoked
                          </span>
                        )}
                        {!inv.revoked && expired && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                            Expired
                          </span>
                        )}
                        {!inv.revoked && !expired && exhausted && (
                          <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                            Used up
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] tabular-nums text-zinc-500">
                        {inv.usesCount}/{inv.maxUses} used
                        {inv.expiresAt
                          ? ` · expires ${new Date(inv.expiresAt).toLocaleDateString()}`
                          : " · never expires"}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={inactive}
                        onClick={() => void copyText(inv.code, `code-${inv.id}`)}
                        title="Copy invite code"
                        className="rounded-md border border-white/[0.08] bg-[#121316] p-1.5 text-zinc-300 transition-colors hover:border-white/[0.16] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
                      >
                        {copiedId === `code-${inv.id}` ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={inactive}
                        onClick={() => void copyText(joinUrl, `link-${inv.id}`)}
                        title="Copy direct invite link"
                        className="rounded-md border border-white/[0.08] bg-[#121316] p-1.5 text-zinc-300 transition-colors hover:border-white/[0.16] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
                      >
                        {copiedId === `link-${inv.id}` ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {!inv.revoked && (
                        <button
                          type="button"
                          onClick={() => void handleRevoke(inv.id)}
                          title="Revoke invite"
                          className="rounded-md border border-white/[0.08] bg-[#121316] p-1.5 text-zinc-400 transition-colors hover:border-rose-500/40 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <AnimatePresence>
      {open && (compact ? (
        <HeaderPanel kind="invite" label={title}>{content}</HeaderPanel>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#121316] shadow-2xl shadow-black/70"
          >
            {content}
          </motion.div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
