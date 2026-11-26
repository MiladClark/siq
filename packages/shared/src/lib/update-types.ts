export type UpdatePhase =
  | "idle"
  | "downloading"
  | "paused"
  | "verifying"
  | "ready"
  | "applying"
  | "restarting"
  | "error"
  | "cancelled";

export interface UpdateProgress {
  phase: UpdatePhase;
  percent: number;
  message: string;
  version?: string;
  error?: string;
  bytesReceived?: number;
  bytesTotal?: number;
  bytesPerSec?: number;
}

export interface UpdateAvailablePayload {
  version: string;
  required: boolean;
  releaseNotes?: string | null;
  sizeBytes?: number | null;
}

export interface UpdateLatestRelease {
  version: string;
  downloadUrl: string;
  fallbackUrl?: string | null;
  checksum: string;
  sizeBytes?: number | null;
  releaseNotes?: string | null;
  releasedAt?: string | null;
}

export interface UpdateCheckResult {
  ok: boolean;
  error?: string;
  currentVersion: string;
  updateAvailable?: boolean;
  required?: boolean;
  latest?: UpdateLatestRelease;
}

export interface UpdateActionResult {
  ok: boolean;
  error?: string;
}

export interface UpdateFetchResult {
  ok: boolean;
  error?: string;
  pending?: UpdateAvailablePayload | null;
  result?: UpdateCheckResult | null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return unit === 0 ? `${Math.round(value)} ${units[unit]}` : `${value.toFixed(1)} ${units[unit]}`;
}
