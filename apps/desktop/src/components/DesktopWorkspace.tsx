"use client";

import { Headphones, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AuthView } from "@siq/shared/components/auth/AuthView";
import { WorkspaceShell } from "@siq/shared/components/workspace/WorkspaceShell";
import type { PrivateUser } from "@siq/shared/lib/types";
import type { AuthBootstrapState, WorkspaceInitialData } from "@siq/shared/lib/workspace-types";
import { apiFetch, DESKTOP_SESSION_RECHECK, desktopServerOrigin } from "../lib/client-api";
import { restoreDesktopSession, saveDesktopSession } from "../lib/desktop-session";
import { DesktopWindowChrome, type DesktopChrome } from "./DesktopWindowChrome";

type SignedIn = { user: PrivateUser } & WorkspaceInitialData;
type SignedOut = { user: null } & AuthBootstrapState;
type State = { view: "loading" } | { view: "unavailable" } | { view: "ready"; data: SignedIn | SignedOut };

export function DesktopWorkspace() {
  return (
    <DesktopWindowChrome>
      {(chrome) => <DesktopWorkspaceContent chrome={chrome} />}
    </DesktopWindowChrome>
  );
}

function DesktopWorkspaceContent({ chrome }: { chrome?: DesktopChrome }) {
  const [state, setState] = useState<State>({ view: "loading" });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => {
    setState({ view: "loading" });
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    window.addEventListener(DESKTOP_SESSION_RECHECK, reload);
    return () => window.removeEventListener(DESKTOP_SESSION_RECHECK, reload);
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const token = await restoreDesktopSession();
        if (controller.signal.aborted) return;
        const response = await apiFetch("/api/workspace", {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        });
        if (!response.ok) throw new Error("Workspace unavailable");
        const data = await response.json() as SignedIn | SignedOut;
        if (controller.signal.aborted) return;
        if (!data.user && token) await saveDesktopSession(null);
        if (!controller.signal.aborted) setState({ view: "ready", data });
      } catch {
        if (!controller.signal.aborted) setState({ view: "unavailable" });
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  const data = state.view === "ready" ? state.data : null;
  if (data?.user) {
    return (
      <WorkspaceShell
        key={data.user.id}
        initialUser={data.user}
        initialServers={data.servers}
        initialFriends={data.friends}
        initialDmConversations={data.dmConversations}
        initialMembers={data.members}
        initialVoiceOccupancy={data.voiceOccupancy}
        initialVoiceRoomCreatedAt={data.voiceRoomCreatedAt}
        initialCapabilities={data.capabilities}
        desktopChrome={chrome}
        onSignedOut={async () => {
          await saveDesktopSession(null);
          reload();
        }}
      />
    );
  }

  return (
    <div className="siq-desktop-entry">
      {chrome && (
        <div className="siq-desktop-entry-rail">
          <div aria-hidden="true" className="min-h-0 flex-1" data-tauri-drag-region="deep" />
          {chrome.controls}
        </div>
      )}
      <div className="siq-desktop-entry-body">
        {data ? (
          <AuthView
            windowDrag={Boolean(chrome)}
            dbConfigured={data.dbConfigured}
            schemaReady={data.schemaReady}
            hasUsers={data.hasUsers}
            onAuthenticated={async (token, rememberMe) => {
              await saveDesktopSession(token, rememberMe);
              reload();
            }}
          />
        ) : (
          <main className="grid h-full place-items-center px-6 text-center">
            <section className="max-w-sm space-y-4" role="status">
              {state.view === "loading" ? (
                <>
                  <Headphones className="mx-auto size-8 text-emerald-400" aria-hidden />
                  <h1 className="text-xl font-semibold">Connecting to SIQ…</h1>
                </>
              ) : (
                <>
                  <WifiOff className="mx-auto size-8 text-zinc-400" aria-hidden />
                  <h1 className="text-xl font-semibold">Can&apos;t connect to SIQ</h1>
                  <p className="text-sm text-zinc-400">The workspace is unavailable at {desktopServerOrigin}.</p>
                  <button type="button" onClick={reload} className="min-h-11 rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-zinc-950">
                    Retry connection
                  </button>
                </>
              )}
            </section>
          </main>
        )}
      </div>
    </div>
  );
}
