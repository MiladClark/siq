import { saveDownload } from "@siq/shared/lib/save-download";

export const apiFetch = fetch;

export function mediaUrl<T extends string | null | undefined>(url: T): T {
  return url;
}

export function siteUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

export function markPresenceOffline() {
  navigator.sendBeacon("/api/presence/offline");
}

export async function downloadFile(url: string, name: string) {
  saveDownload(url, name);
}
