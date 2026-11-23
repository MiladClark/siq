"use client";

import {
  Check,
  Copy,
  Key,
  LinkSimple,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

interface InviteRow {
  id: string;
  code: string;
  maxUses: number;
  usesCount: number;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
}

export function InviteModal({ open, onClose }: InviteModalProps) {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState(5);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(7);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invites");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load invites.");
      } else {
        setInvites(data.invites ?? []);
      }
    } catch {
      setError("Network error while loading invites.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadInvites();
    }
  }, [open, loadInvites]);

  if (!open) return null;

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxUses, expiresInDays }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create invite.");
      } else if (data.invite) {
        setInvites((prev) => [data.invite, ...prev]);
      }
    } catch {
      setError("Network error while creating invite.");
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
      setError("Could not revoke invite.");
    }
  }

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId((curr) => (curr === key ? null : curr)), 1800);
    } catch {
      setError("Clipboard access denied.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-white/[0.1] bg-[#121316] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Key size={18} weight="bold" className="text-emerald-400" />
            <h2 id="invite-modal-title" className="text-sm font-semibold text-zinc-100">
              Invite friends
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close invite modal"
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Create controls */}
          <div className="rounded-lg border border-white/[0.07] bg-[#0E0F12] p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="invite-max-uses" className="block text-xs font-medium text-zinc-400">
                  Max uses
                </label>
                <select
                  id="invite-max-uses"
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                  className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-2 text-xs text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                >
                  <option value={1}>1 use (single friend)</option>
                  <option value={5}>5 uses</option>
                  <option value={10}>10 uses</option>
                  <option value={25}>25 uses</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="invite-expiry" className="block text-xs font-medium text-zinc-400">
                  Expires after
                </label>
                <select
                  id="invite-expiry"
                  value={expiresInDays === null ? "never" : String(expiresInDays)}
                  onChange={(e) =>
                    setExpiresInDays(e.target.value === "never" ? null : Number(e.target.value))
                  }
                  className="w-full rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-2 text-xs text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
                >
                  <option value="1">24 hours</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="never">Never expires</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
            >
              <Plus size={14} weight="bold" />
              <span>{creating ? "Generating..." : "Generate invite code"}</span>
            </button>
          </div>

          {error && (
            <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          )}

          {/* Existing invites list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Invite codes</span>
              <span className="font-mono text-[11px] text-zinc-500">{invites.length} total</span>
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <div className="space-y-2">
                  <div className="h-14 animate-pulse rounded-lg bg-white/[0.04]" />
                  <div className="h-14 animate-pulse rounded-lg bg-white/[0.04]" />
                </div>
              ) : invites.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/[0.1] py-8 text-center text-xs text-zinc-500">
                  No invite codes yet. Generate one above to share with friends.
                </div>
              ) : (
                invites.map((inv) => {
                  const expired =
                    inv.expiresAt !== null && new Date(inv.expiresAt).getTime() < Date.now();
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
                        <p className="mt-0.5 text-[11px] text-zinc-500">
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
                          onClick={() => copyText(inv.code, `code-${inv.id}`)}
                          title="Copy invite code"
                          className="rounded-md border border-white/[0.08] bg-[#121316] p-1.5 text-zinc-300 transition-colors hover:border-white/[0.16] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
                        >
                          {copiedId === `code-${inv.id}` ? (
                            <Check size={14} className="text-emerald-400" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={inactive}
                          onClick={() => copyText(joinUrl, `link-${inv.id}`)}
                          title="Copy direct invite link"
                          className="rounded-md border border-white/[0.08] bg-[#121316] p-1.5 text-zinc-300 transition-colors hover:border-white/[0.16] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
                        >
                          {copiedId === `link-${inv.id}` ? (
                            <Check size={14} className="text-emerald-400" />
                          ) : (
                            <LinkSimple size={14} />
                          )}
                        </button>
                        {!inv.revoked && (
                          <button
                            type="button"
                            onClick={() => handleRevoke(inv.id)}
                            title="Revoke invite"
                            className="rounded-md border border-white/[0.08] bg-[#121316] p-1.5 text-zinc-400 transition-colors hover:border-rose-500/40 hover:text-rose-400"
                          >
                            <Trash size={14} />
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
      </div>
    </div>
  );
}
