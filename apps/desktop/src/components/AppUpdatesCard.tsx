"use client";

import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatBytes, type UpdateCheckResult } from "@siq/shared/lib/update-types";
import { desktopServerOrigin } from "../lib/client-api";
import {
  checkDesktopUpdates,
  fetchDesktopUpdate,
  startDesktopUpdate,
} from "../lib/desktop-updater";

export function AppUpdatesCard() {
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const check = useCallback(async (forceRefresh = false) => {
    setChecking(true);
    setActionError(null);
    try {
      const res = await checkDesktopUpdates(forceRefresh);
      setResult(res);
    } catch (err) {
      setResult({
        ok: false,
        currentVersion: "0.2.0",
        error: err instanceof Error ? err.message : "Could not check for updates.",
      });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check(false);
  }, [check]);

  async function updateNow() {
    if (!result?.latest?.version) return;
    setUpdating(true);
    setActionError(null);
    try {
      await fetchDesktopUpdate(true);
      const res = await startDesktopUpdate(result.latest.version, Boolean(result.required));
      if (!res.ok && res.error && res.error !== "paused" && res.error !== "Update cancelled") {
        setActionError(res.error);
      }
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-[#0d0e12] p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-zinc-100">App Updates</h4>
          <p className="text-[11px] text-zinc-500">
            In-place verified updates via {desktopServerOrigin || "SIQ"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void check(true)}
          disabled={checking}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#16171D] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-400/50 hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={13} className={checking ? "animate-spin" : ""} />
          Check now
        </button>
      </div>

      {!result ? (
        <p className="text-xs text-zinc-400">Checking for updates…</p>
      ) : !result.ok ? (
        <p className="flex items-center gap-2 text-xs text-amber-300">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{result.error}</span>
        </p>
      ) : result.updateAvailable && result.latest ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-100">
            <Download size={14} className="text-emerald-400" />
            <span>
              Version <b className="font-mono">v{result.latest.version}</b> is available (you have{" "}
              <span className="font-mono text-zinc-400">v{result.currentVersion}</span>)
            </span>
            {result.required && (
              <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                Required
              </span>
            )}
          </div>
          {result.latest.releaseNotes && (
            <pre className="max-h-28 overflow-y-auto rounded-lg border border-white/[0.07] bg-[#090A0D] p-2.5 font-sans text-[11px] whitespace-pre-wrap text-zinc-400">
              {result.latest.releaseNotes}
            </pre>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void updateNow()}
              disabled={updating || !result.latest.downloadUrl}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:opacity-40"
            >
              {updating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Update now
            </button>
            {result.latest.sizeBytes != null && (
              <span className="text-[11px] tabular-nums text-zinc-500">
                {formatBytes(result.latest.sizeBytes)}
              </span>
            )}
          </div>
          {actionError && <p className="text-xs text-rose-300">{actionError}</p>}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle2 size={14} />
          <span>
            You are up to date (<span className="font-mono">v{result.currentVersion}</span>).
          </span>
        </p>
      )}
    </div>
  );
}
