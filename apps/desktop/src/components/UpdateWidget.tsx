"use client";

import {
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  X,
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import {
  formatBytes,
  type UpdateAvailablePayload,
  type UpdateProgress,
} from "@siq/shared/lib/update-types";

interface UpdateWidgetProps {
  progress: UpdateProgress;
  available: UpdateAvailablePayload | null;
  onDownload: () => void;
  onPause: () => void;
  onResume: () => void;
  onInstall: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

const TITLE: Record<UpdateProgress["phase"], string> = {
  idle: "New update available",
  downloading: "Downloading update…",
  paused: "Update paused",
  verifying: "Verifying update…",
  ready: "Ready to install",
  applying: "Installing update…",
  restarting: "Restarting SIQ…",
  error: "Update failed",
  cancelled: "Update cancelled",
};

/**
 * Compact floating card in the bottom-right corner that drives the entire SIQ
 * update flow (download → pause/resume → verify → install & restart) without
 * interrupting voice or chat. Collapses neatly into a pill the user can reopen.
 */
export function UpdateWidget({
  progress,
  available,
  onDownload,
  onPause,
  onResume,
  onInstall,
  onCancel,
  onRetry,
}: UpdateWidgetProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (typeof document === "undefined") return null;

  const phase = progress.phase;
  const version = progress.version ?? available?.version;
  const required = Boolean(available?.required);

  const indeterminate =
    phase === "verifying" || phase === "applying" || phase === "restarting";
  const showBar = phase === "downloading" || phase === "paused" || indeterminate;
  const percent = Math.max(2, Math.min(100, progress.percent || 0));

  if (collapsed) {
    return createPortal(
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-[200] flex items-center gap-2 rounded-full border border-white/[0.12] bg-[#0D0E12] px-3.5 py-2 text-xs font-medium text-zinc-200 shadow-lg shadow-black/50 transition-colors hover:border-emerald-400/50 hover:text-white"
      >
        {phase === "downloading" && (
          <Loader2 size={13} className="animate-spin text-emerald-400" />
        )}
        <span className="tabular-nums">
          {phase === "downloading"
            ? `Updating… ${progress.percent || 0}%`
            : phase === "ready"
              ? "Update ready"
              : phase === "paused"
                ? "Update paused"
                : "Update available"}
        </span>
        <ChevronUp size={14} className="text-zinc-400" />
      </button>,
      document.body
    );
  }

  const card = (
    <div className="siq-bezel fixed bottom-4 right-4 z-[200] w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/[0.11] bg-[#0D0E12] shadow-2xl shadow-black/60">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">
            {TITLE[phase]}
            {version && phase === "idle" && (
              <span className="ml-2 font-mono text-xs font-normal text-emerald-300">
                v{version}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="shrink-0 rounded-lg p-1 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
          aria-label="Collapse update panel"
        >
          <ChevronDown size={18} />
        </button>
      </div>

      <div className="px-4 pb-4 pt-2">
        {/* Available — waiting for user approval */}
        {phase === "idle" && (
          <>
            <p className="text-xs leading-relaxed text-zinc-400">
              A newer SIQ desktop build is ready. With your approval, it downloads in the
              background without dropping voice.
            </p>
            {available?.releaseNotes && (
              <pre className="mt-2 max-h-24 overflow-y-auto rounded-lg border border-white/[0.06] bg-[#090A0D] p-2.5 font-sans text-[11px] whitespace-pre-wrap text-zinc-300">
                {available.releaseNotes}
              </pre>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              {available?.sizeBytes ? (
                <span className="text-[11px] tabular-nums text-zinc-500">
                  {formatBytes(available.sizeBytes)}
                </span>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                {!required && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                  >
                    Later
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDownload}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-300"
                >
                  <Download size={14} /> Download
                </button>
              </div>
            </div>
          </>
        )}

        {/* Downloading / Paused / Verifying / Applying / Restarting */}
        {showBar && (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
              {indeterminate ? (
                <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-400" />
              ) : (
                <div
                  className="h-full rounded-full bg-emerald-400 transition-[width] duration-150"
                  style={{ width: `${percent}%` }}
                />
              )}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs tabular-nums text-zinc-400">
                {phase === "downloading" && Boolean(progress.bytesTotal) ? (
                  <>
                    <span>
                      {formatBytes(progress.bytesReceived ?? 0)} /{" "}
                      {formatBytes(progress.bytesTotal ?? 0)}
                    </span>
                    {Boolean(progress.bytesPerSec) && (
                      <>
                        <span className="text-zinc-600">•</span>
                        <span>{formatBytes(progress.bytesPerSec ?? 0)}/s</span>
                      </>
                    )}
                  </>
                ) : (
                  <span>{progress.message || TITLE[phase]}</span>
                )}
              </p>

              {(phase === "downloading" || phase === "paused") && (
                <div className="flex shrink-0 items-center gap-1">
                  {phase === "downloading" ? (
                    <button
                      type="button"
                      onClick={onPause}
                      className="rounded-lg p-1.5 text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                      aria-label="Pause download"
                      title="Pause"
                    >
                      <Pause size={15} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onResume}
                      className="rounded-lg p-1.5 text-emerald-400 transition-colors hover:bg-white/[0.06]"
                      aria-label="Resume download"
                      title="Resume"
                    >
                      <Play size={15} />
                    </button>
                  )}
                  {!required && (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-rose-300"
                      aria-label="Cancel update"
                      title="Cancel"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Verified and ready to install */}
        {phase === "ready" && (
          <>
            <p className="text-xs leading-relaxed text-zinc-400">
              SIQ{version ? ` v${version}` : ""} is verified and ready. SIQ will close briefly to
              replace itself and reopen automatically.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              {!required && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={onInstall}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-300"
              >
                <Rocket size={14} /> Install &amp; restart
              </button>
            </div>
          </>
        )}

        {/* Error */}
        {phase === "error" && (
          <>
            <p className="text-xs leading-relaxed text-rose-300">
              {progress.error || "Something went wrong while updating SIQ."}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              {!required && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.06]"
                >
                  Dismiss
                </button>
              )}
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-300"
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          </>
        )}

        {required && phase !== "idle" && phase !== "error" && (
          <p className="mt-2 text-[11px] text-rose-300/80">This update is required.</p>
        )}
      </div>
    </div>
  );

  return createPortal(card, document.body);
}
