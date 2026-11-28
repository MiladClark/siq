"use client";

import { AlertCircle, ArrowRight, AudioLines, Database, Eye, EyeOff, MonitorUp, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { ContextMenuProvider } from "@siq/shared/components/ui/ContextMenu";
import { SiqMark } from "@siq/shared/components/ui/SiqMark";
import { apiFetch } from "@/lib/client-api";

interface AuthViewProps {
  initialMode?: "login" | "register";
  initialInviteCode?: string;
  dbConfigured: boolean;
  schemaReady: boolean;
  hasUsers: boolean;
  dbError?: string;
  windowDrag?: boolean;
  onAuthenticated?: (token: string, rememberMe: boolean) => Promise<void>;
}

const labelClass = "block text-sm font-medium text-zinc-200";
const fieldClass =
  "min-h-12 w-full rounded-xl border border-white/10 bg-black/25 px-3.5 text-base text-zinc-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] transition-all placeholder:text-zinc-500 focus:border-emerald-400/70 focus:outline-none focus:ring-4 focus:ring-emerald-400/15";

const BRAND_FEATURES = [
  { icon: AudioLines, label: "AI noise-free voice" },
  { icon: MonitorUp, label: "1440p screen share" },
  { icon: ShieldCheck, label: "Private by design" },
] as const;

const rise = {
  hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { delay: 0.08 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function AuthView({
  initialMode = "login",
  initialInviteCode = "",
  dbConfigured,
  schemaReady,
  hasUsers,
  dbError,
  windowDrag,
  onAuthenticated,
}: AuthViewProps) {
  const router = useRouter();
  const isBootstrap = dbConfigured && schemaReady && !hasUsers;
  const [mode, setMode] = useState<"login" | "register">(
    isBootstrap || initialInviteCode ? "register" : initialMode,
  );
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [inviteCode, setInviteCode] = useState(initialInviteCode.toUpperCase());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLogin = mode === "login";

  useEffect(() => {
    if (isBootstrap) {
      setMode("register");
      setShowPassword(false);
    }
  }, [isBootstrap]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await apiFetch(isLogin ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isLogin
          ? { identifier, password, rememberMe }
          : { username, email, displayName: displayName || username, password, inviteCode }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Authentication failed.");
        return;
      }

      if (onAuthenticated) {
        if (typeof data.token !== "string") {
          setError("The server does not support desktop sign-in yet.");
          return;
        }
        await onAuthenticated(data.token, !isLogin || rememberMe);
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (error) {
      setError(error instanceof Error && error.message.startsWith("Windows Credential Manager")
        ? error.message
        : "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode() {
    setMode(isLogin ? "register" : "login");
    setShowPassword(false);
    setError(null);
  }

  const action = isBootstrap ? "Create workspace" : isLogin ? "Sign in" : "Create account";

  return (
    <ContextMenuProvider>
      <main className="siq-auth siq-ambient">
        <section className="siq-auth-brand" aria-label="About SIQ" data-tauri-drag-region={windowDrag ? "deep" : undefined}>
          <motion.div initial="hidden" animate="show" custom={0} variants={rise}>
            <SiqMark className="siq-auth-wordmark" />
          </motion.div>
          <motion.p initial="hidden" animate="show" custom={1} variants={rise}
            className="siq-gradient-text mt-2 text-3xl font-extrabold tracking-tight sm:mt-4 sm:text-6xl">
            Squad up.
          </motion.p>
          <motion.p initial="hidden" animate="show" custom={2} variants={rise} className="mt-2 text-base text-zinc-300">
            Voice, chat, and screen share.
          </motion.p>
          <motion.ul initial="hidden" animate="show" custom={3} variants={rise} className="mt-6 hidden flex-wrap gap-2 sm:flex">
            {BRAND_FEATURES.map(({ icon: Icon, label }) => (
              <li key={label}
                className="inline-flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
                <Icon aria-hidden="true" className="size-3.5 text-emerald-300" />
                {label}
              </li>
            ))}
          </motion.ul>
          <motion.p initial="hidden" animate="show" custom={4} variants={rise} className="mt-3 text-xs text-zinc-400 sm:mt-9">
            Designed by Clark <span aria-hidden="true">·</span> 2026
          </motion.p>
        </section>

        <section className="siq-auth-form" aria-labelledby="siq-auth-title">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 28, delay: 0.12 }}
            className="siq-glass siq-edge-light relative mx-auto w-full max-w-sm rounded-[28px] p-6 sm:p-8"
          >
            <motion.h1 key={action} id="siq-auth-title"
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="mb-6 text-3xl font-extrabold tracking-tight text-zinc-50">
              {isBootstrap ? "Create the admin account" : action}
            </motion.h1>

            {(!dbConfigured || !schemaReady) && (
              <div role="status" className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-sm text-amber-200">
                <p className="flex items-center gap-2 font-medium">
                  <Database aria-hidden="true" className="size-4" />
                  {dbConfigured ? "Database setup required" : "Connect Postgres to begin"}
                </p>
                <p className="mt-1">
                  {dbConfigured
                    ? "Run pnpm db:push to initialize the workspace."
                    : "Set DATABASE_URL and AUTH_SECRET, then run pnpm db:push."}
                </p>
                {dbError && <p className="mt-2 break-words text-xs">{dbError}</p>}
              </div>
            )}
            {isBootstrap && <p className="mb-5 text-sm text-zinc-400">The first account manages this workspace.</p>}

            <form onSubmit={handleSubmit} className="space-y-4" aria-busy={submitting}>
              {!isLogin && !isBootstrap && initialInviteCode && (
                <div className="space-y-1.5">
                  <label htmlFor="inviteCode" className={labelClass}>Invite code (optional)</label>
                  <input id="inviteCode" name="inviteCode" autoComplete="off"
                    value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} className={fieldClass} />
                </div>
              )}
              {isLogin ? (
                <div className="space-y-1.5">
                  <label htmlFor="identifier" className={labelClass}>Username or email</label>
                  <input id="identifier" name="identifier" required autoComplete="username"
                    autoCapitalize="none" spellCheck={false}
                    value={identifier} onChange={(event) => setIdentifier(event.target.value.toLowerCase())} className={fieldClass} />
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="email" className={labelClass}>Email address</label>
                    <input id="email" name="email" type="email" required autoComplete="email"
                      value={email} onChange={(event) => setEmail(event.target.value.toLowerCase())} className={fieldClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="username" className={labelClass}>Username</label>
                    <input id="username" name="username" required autoComplete="username"
                      autoCapitalize="none" spellCheck={false} aria-describedby="username-hint"
                      value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} className={fieldClass} />
                    <p id="username-hint" className="text-xs text-zinc-400">3–24 lowercase letters, numbers, underscores, or hyphens.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="displayName" className={labelClass}>Display name</label>
                    <input id="displayName" name="displayName" required dir="auto" autoComplete="name"
                      value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={fieldClass} />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <label htmlFor="password" className={labelClass}>Password</label>
                <div className="relative">
                  <input id="password" name="password" type={showPassword ? "text" : "password"}
                    required minLength={6} autoComplete={isLogin ? "current-password" : "new-password"}
                    autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    value={password} onChange={(event) => setPassword(event.target.value)}
                    className={`${fieldClass} pr-12 [&::-ms-reveal]:hidden`} />
                  <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-controls="password"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-zinc-400 hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-emerald-400">
                    {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                  </button>
                </div>
              </div>
              {isLogin && (
                <button type="button" role="switch" aria-checked={rememberMe} onClick={() => setRememberMe(!rememberMe)}
                  className="siq-switch flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-1 text-left text-sm text-zinc-300 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400">
                  Remember me
                  <span aria-hidden="true" className="siq-switch-track" />
                </button>
              )}

              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2.5 text-sm text-rose-200">
                  <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              )}
              <button type="submit" disabled={submitting || !dbConfigured || !schemaReady}
                className="siq-cta group relative flex min-h-12 w-full items-center justify-center !rounded-xl px-11 text-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 disabled:opacity-50">
                {submitting ? isLogin ? "Signing in…" : "Creating account…" : action}
                <ArrowRight aria-hidden="true" className="absolute right-4 size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </button>
            </form>
            {!isBootstrap && (
              <p className="mt-5 flex flex-wrap items-center justify-center gap-x-1.5 text-sm text-zinc-400">
                {isLogin ? "New to SIQ?" : "Already have an account?"}
                <button type="button" onClick={switchMode} disabled={submitting}
                  className="min-h-11 rounded-md px-1 font-medium text-emerald-300 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-400">
                  {isLogin ? "Create account" : "Sign in"}
                </button>
              </p>
            )}
          </motion.div>
        </section>
      </main>
    </ContextMenuProvider>
  );
}
