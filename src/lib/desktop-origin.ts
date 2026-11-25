export const DESKTOP_ORIGIN = "https://tauri.localhost";
export const DESKTOP_CLIENT_HEADER = "X-Siq-Client";
export const DESKTOP_CLIENT = "desktop";

export function isDesktopRequest(headers: Pick<Headers, "get">): boolean {
  return headers.get("origin") === DESKTOP_ORIGIN &&
    headers.get(DESKTOP_CLIENT_HEADER) === DESKTOP_CLIENT;
}
