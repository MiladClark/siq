"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UpdateAvailablePayload, UpdateProgress } from "@siq/shared/lib/update-types";
import {
  cancelDesktopUpdate,
  fetchDesktopUpdate,
  getDesktopUpdateState,
  installDesktopUpdate,
  pauseDesktopUpdate,
  resumeDesktopUpdate,
  startDesktopUpdate,
  subscribeDesktopUpdates,
} from "../lib/desktop-updater";
import { UpdateWidget } from "./UpdateWidget";

const IDLE: UpdateProgress = { phase: "idle", percent: 0, message: "" };
const ACTIVE_PHASES: UpdateProgress["phase"][] = [
  "downloading",
  "paused",
  "verifying",
  "ready",
  "applying",
  "restarting",
  "error",
];

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function UpdateRoot() {
  const [available, setAvailable] = useState<UpdateAvailablePayload | null>(null);
  const [progress, setProgress] = useState<UpdateProgress>(IDLE);
  const requiredRef = useRef(false);

  const startDownload = useCallback(async (version?: string, required?: boolean) => {
    setProgress({ phase: "downloading", percent: 0, message: "Starting download…", version });
    const res = await startDesktopUpdate(version, required);
    if (!res.ok && res.error && res.error !== "Update cancelled" && res.error !== "paused") {
      setProgress((prev) => ({
        phase: "error",
        percent: 0,
        message: "Update failed",
        error: res.error ?? "Update failed",
        version: prev.version ?? version,
      }));
    }
  }, []);

  const hide = useCallback(() => {
    requiredRef.current = false;
    setAvailable(null);
    setProgress(IDLE);
  }, []);

  const cancel = useCallback(async () => {
    await cancelDesktopUpdate();
    hide();
  }, [hide]);

  useEffect(() => {
    let active = true;
    let cleanupEvents: (() => void) | null = null;

    void subscribeDesktopUpdates({
      onAvailable: (payload) => {
        if (!active) return;
        requiredRef.current = Boolean(payload.required);
        setAvailable(payload);
        setProgress((prev) =>
          ACTIVE_PHASES.includes(prev.phase) ? prev : { ...IDLE, version: payload.version }
        );
        if (payload.required) {
          void startDownload(payload.version, true);
        }
      },
      onProgress: (prog) => {
        if (!active) return;
        if (prog.phase === "cancelled") {
          hide();
          return;
        }
        setProgress(prog);
        if (prog.phase === "ready" && requiredRef.current) {
          void installDesktopUpdate();
        }
      },
    }).then((unlisten) => {
      if (active) {
        cleanupEvents = unlisten;
      } else {
        unlisten();
      }
    });

    // Hydrate any in-progress state first, then perform a quiet startup check
    void getDesktopUpdateState().then((snapshot) => {
      if (!active || !snapshot) return;
      const [pending, prog] = snapshot;
      if (pending) {
        requiredRef.current = Boolean(pending.required);
        setAvailable(pending);
      }
      if (prog && ACTIVE_PHASES.includes(prog.phase)) {
        setProgress(prog);
      }
    });

    const initialTimer = window.setTimeout(() => {
      if (active) void fetchDesktopUpdate(false);
    }, 2500);

    const periodicTimer = window.setInterval(() => {
      if (active) void fetchDesktopUpdate(false);
    }, CHECK_INTERVAL_MS);

    return () => {
      active = false;
      window.clearTimeout(initialTimer);
      window.clearInterval(periodicTimer);
      cleanupEvents?.();
    };
  }, [hide, startDownload]);

  const visible = Boolean(available) || ACTIVE_PHASES.includes(progress.phase);
  if (!visible) return null;

  const version = progress.version ?? available?.version;
  const required = requiredRef.current;

  return (
    <UpdateWidget
      progress={progress}
      available={available}
      onDownload={() => void startDownload(version, required)}
      onPause={() => void pauseDesktopUpdate()}
      onResume={() => void resumeDesktopUpdate()}
      onInstall={() => void installDesktopUpdate()}
      onCancel={() => void cancel()}
      onRetry={() => void startDownload(version, required)}
    />
  );
}
