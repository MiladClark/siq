import { DESKTOP_CLIENT, DESKTOP_CLIENT_HEADER } from "@siq/shared/lib/desktop-origin";
import { saveDownload } from "@siq/shared/lib/save-download";

export const desktopServerOrigin = process.env.NEXT_PUBLIC_SIQ_API_ORIGIN;
export const DESKTOP_SESSION_RECHECK = "siq:desktop-session-recheck";

let desktopToken: string | null = null;

export function setDesktopToken(token: string | null) {
  desktopToken = token;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!desktopServerOrigin) return fetch(path, init);
  if (!path.startsWith("/api/")) throw new Error("Expected a relative siq API path.");

  const headers = new Headers(init?.headers);
  headers.set(DESKTOP_CLIENT_HEADER, DESKTOP_CLIENT);
  const token = desktopToken;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${desktopServerOrigin}${path}`, {
    ...init,
    headers,
    credentials: "omit",
    redirect: "error",
  }).then((response) => {
    if (response.status === 401 && token && token === desktopToken && path.startsWith("/api/presence?")) {
      window.dispatchEvent(new Event(DESKTOP_SESSION_RECHECK));
    }
    return response;
  });
}

export function mediaUrl<T extends string | null | undefined>(url: T): T | string {
  return desktopServerOrigin && url?.startsWith("/api/uploads/")
    ? `${desktopServerOrigin}${url}`
    : url;
}

export function siteUrl(path: string): string {
  return `${desktopServerOrigin ?? window.location.origin}${path}`;
}

export function markPresenceOffline() {
  if (desktopServerOrigin) {
    void apiFetch("/api/presence/offline", { method: "POST", keepalive: true }).catch(() => {});
  } else {
    navigator.sendBeacon("/api/presence/offline");
  }
}

export async function downloadFile(url: string, name: string) {
  const response = await apiFetch(url);
  if (!response.ok) throw new Error("Could not download the attachment.");

  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    saveDownload(objectUrl, name);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
