import { desktopServerOrigin, setDesktopToken } from "./client-api";

let currentSession: Promise<string | null> | undefined;

export function restoreDesktopSession(): Promise<string | null> {
  currentSession ??= import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke<string | null>("desktop_load_session", { origin: desktopServerOrigin }))
    .catch(() => null)
    .then((token) => {
      setDesktopToken(token);
      return token;
    });
  return currentSession;
}

export async function saveDesktopSession(token: string | null, rememberMe = false) {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    await invoke("desktop_save_session", { origin: desktopServerOrigin, token: rememberMe ? token : null });
  } catch {
    throw new Error("Windows Credential Manager could not update the siq session.");
  }
  setDesktopToken(token);
  currentSession = Promise.resolve(token);
}
