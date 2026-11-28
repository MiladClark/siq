"use client";

import { apiFetch, siteUrl } from "@/lib/client-api";
import { Check, Clock, Copy, KeyRound, Link2, Plus, Trash2, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { HeaderPanel } from "@siq/shared/components/ui/HeaderPanel";
import { useSystemNotify } from "@siq/shared/components/ui/NotificationCenter";
import { SelectDropdown } from "@siq/shared/components/ui/SelectDropdown";
import { playSound } from "@siq/shared/lib/sounds";

interface InviteRow {
  id: string;
  code: string;
  maxUses: number;
  usesCount: number;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

const HEADER_TILE =
  "flex shrink-0 items-center justify-center bg-gradient-to-br from-emerald-400/25 to-emerald-500/[0.04] text-emerald-300 ring-1 ring-inset ring-emerald-400/30 shadow-[0_10px_24px_-10px_rgb(var(--siq-accent-rgb)/0.8),inset_0_1px_0_rgb(255_255_255/0.12)]";

const ROW_ACTION =
  "siq-icon-btn !h-7 !w-7 !rounded-lg disabled:pointer-events-none disabled:opacity-40";

function SwapIcon({ swapKey, children }: { swapKey: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={swapKey}
        initial={{ opacity: 0, scale: 0.4, rotate: -20 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        exit={{ opacity: 0, scale: 0.4, rotate: 20 }}
        transition={{ type: "spring", stiffness: 600, damping: 30 }}
        className="flex"
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
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
      const res = await apiFetch(url, { cache: "no-store", signal });
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
      const res = await apiFetch("/api/invites", {
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
      const res = await apiFetch(`/api/invites/${id}`, { method: "DELETE" });
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
      <div className={`flex shrink-0 items-center justify-between gap-2 rounded-t-[inherit] border-b border-white/[0.06] bg-gradient-to-b from-white/[0.035] to-transparent ${compact ? "px-3.5 py-2.5" : "px-5 py-4"}`}>
        <div className={`flex min-w-0 items-center ${compact ? "gap-2.5" : "gap-3"}`}>
          <span className={`${HEADER_TILE} ${compact ? "h-7 w-7 rounded-lg" : "h-9 w-9 rounded-xl"}`}>
            <KeyRound className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </span>
          <h2 className={`truncate font-bold tracking-tight text-zinc-50 ${compact ? "text-sm" : "text-[15px]"}`}>
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close invites"
          className={`siq-icon-btn shrink-0 ${compact ? "!h-7 !w-7 !rounded-lg" : ""}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className={compact ? "min-h-0 space-y-3.5 overflow-y-auto overscroll-contain p-3.5" : "space-y-5 p-5"}>
        <div className={compact ? "" : "rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]"}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor={compact ? "invite-panel-max-uses" : "invite-max-uses"}
                className="block text-xs font-semibold text-zinc-400"
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
                className="block text-xs font-semibold text-zinc-400"
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
            className="siq-cta mt-3.5 flex w-full items-center justify-center gap-2 !rounded-xl px-3.5 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{creating ? "Generating..." : "Generate invite link"}</span>
          </button>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="siq-section-label !px-0">Invite codes</span>
            <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-zinc-400">
              {invites.length} total
            </span>
          </div>

          <div className={compact ? "max-h-56 space-y-1.5 overflow-y-auto" : "max-h-64 space-y-2 overflow-y-auto pr-1"}>
            {loading ? (
              <div className="space-y-2">
                <div className="siq-skeleton h-14 rounded-xl" />
                <div className="siq-skeleton h-14 rounded-xl opacity-60" />
              </div>
            ) : invites.length === 0 ? (
              <div className={`flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] text-center text-xs text-zinc-500 ${compact ? "py-4" : "py-8"}`}>
                {!compact && (
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.04] text-zinc-500 ring-1 ring-inset ring-white/[0.06]">
                    <Link2 className="h-4 w-4" />
                  </span>
                )}
                No invite codes yet.
              </div>
            ) : (
              invites.map((inv, index) => {
                const expired =
                  inv.expiresAt !== null &&
                  new Date(inv.expiresAt).getTime() < Date.now();
                const exhausted = inv.usesCount >= inv.maxUses;
                const inactive = inv.revoked || expired || exhausted;
                const joinUrl =
                  typeof window !== "undefined"
                    ? siteUrl(`/join/${inv.code}`)
                    : `/join/${inv.code}`;

                return (
                  <motion.div
                    key={inv.id}
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      delay: Math.min(index, 8) * 0.035,
                      type: "spring",
                      stiffness: 420,
                      damping: 32,
                    }}
                  >
                  <div
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-[border-color,background-color,opacity] duration-200 ${
                      inactive
                        ? "border-white/[0.05] bg-black/20 opacity-55"
                        : "border-white/[0.08] bg-white/[0.035] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] hover:border-white/[0.14] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-xs font-bold tracking-wider text-zinc-50">
                          {inv.code}
                        </code>
                        {inv.revoked && (
                          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300 ring-1 ring-inset ring-rose-500/25">
                            Revoked
                          </span>
                        )}
                        {!inv.revoked && expired && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-inset ring-amber-500/25">
                            Expired
                          </span>
                        )}
                        {!inv.revoked && !expired && exhausted && (
                          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-zinc-300 ring-1 ring-inset ring-white/[0.08]">
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
                        className={ROW_ACTION}
                      >
                        <SwapIcon swapKey={copiedId === `code-${inv.id}` ? "done" : "idle"}>
                          {copiedId === `code-${inv.id}` ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </SwapIcon>
                      </button>
                      <button
                        type="button"
                        disabled={inactive}
                        onClick={() => void copyText(joinUrl, `link-${inv.id}`)}
                        title="Copy direct invite link"
                        className={ROW_ACTION}
                      >
                        <SwapIcon swapKey={copiedId === `link-${inv.id}` ? "done" : "idle"}>
                          {copiedId === `link-${inv.id}` ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Link2 className="h-3.5 w-3.5" />
                          )}
                        </SwapIcon>
                      </button>
                      {!inv.revoked && (
                        <button
                          type="button"
                          onClick={() => void handleRevoke(inv.id)}
                          title="Revoke invite"
                          className={`${ROW_ACTION} hover:!border-rose-500/40 hover:!bg-rose-500/10 hover:!text-rose-300`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  </motion.div>
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
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="siq-backdrop fixed inset-0 z-[85] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="siq-glass siq-edge-light relative w-full max-w-lg rounded-3xl"
          >
            {content}
          </motion.div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
