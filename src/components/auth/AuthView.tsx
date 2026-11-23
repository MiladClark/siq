"use client";

import {
  AlertCircle,
  ArrowRight,
  Database,
  Headphones,
  KeyRound,
  Lock,
  Mail,
  MessageSquare,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ContextMenuProvider } from "@/components/ui/ContextMenu";

interface AuthViewProps {
  initialMode?: "login" | "register";
  initialInviteCode?: string;
  dbConfigured: boolean;
  schemaReady: boolean;
  hasUsers: boolean;
  dbError?: string;
}

export function AuthView({
  initialMode = "login",
  initialInviteCode = "",
  dbConfigured,
  schemaReady,
  hasUsers,
  dbError,
}: AuthViewProps) {
  const router = useRouter();
  const isBootstrap = dbConfigured && schemaReady && !hasUsers;

  const [mode, setMode] = useState<"login" | "register">(
    isBootstrap || initialInviteCode ? "register" : initialMode
  );
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(initialInviteCode.toUpperCase());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isBootstrap) {
      setMode("register");
    }
  }, [isBootstrap]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login"
          ? { identifier, password }
          : {
              username,
              email,
              displayName: displayName || username,
              password,
              inviteCode,
            };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Authentication failed.");
        setSubmitting(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <ContextMenuProvider>
        <main className="grid min-h-[100dvh] grid-cols-1 bg-[#09090B] lg:grid-cols-12">
      {/* Left architectural column */}
      <section className="siq-grid-bg relative flex flex-col justify-between border-b border-white/[0.07] px-8 py-10 lg:col-span-7 lg:border-b-0 lg:border-r lg:px-14 lg:py-14">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Headphones className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-zinc-100">
              siq
            </span>
          </div>

          <span className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#121316] px-3 py-1 text-xs font-medium text-zinc-400">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                dbConfigured && schemaReady ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            {dbConfigured && schemaReady ? "Private Instance" : "Setup Pending"}
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="my-12 max-w-xl lg:my-0"
        >
          <h1 className="text-4xl font-semibold tracking-tighter text-zinc-50 sm:text-5xl">
            Low-latency voice and screen share, without the bloat.
          </h1>
          <p className="mt-5 max-w-[54ch] text-base leading-relaxed text-zinc-400">
            Built for a close circle of friends. Instant voice rooms, crisp 60fps screen
            sharing with system audio, and clean text channels in a fast web workspace.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 border-t border-white/[0.07] pt-8 sm:grid-cols-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-zinc-200">
                <Headphones className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium">Voice Channels</span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-500">
                Opus audio with per-user volume boost and live ping metrics.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-zinc-200">
                <Monitor className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium">Screen &amp; Cam</span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-500">
                1080p stream sharing with system audio and theater view.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-zinc-200">
                <MessageSquare className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium">Invite-Only</span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-500">
                Locked to friends with revocable invite codes and clean chat.
              </p>
            </div>
          </div>
        </motion.div>

        <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
          <span>Private Voice · Screen Share · Chat</span>
          <span>LTR + فارسی</span>
        </div>
      </section>

      {/* Right form column */}
      <section className="flex flex-col justify-center bg-[#0E0F12] px-6 py-12 sm:px-12 lg:col-span-5 lg:px-14">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-full max-w-sm"
        >
          {(!dbConfigured || !schemaReady) && (
            <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-xs leading-relaxed text-amber-200">
              <div className="flex items-center gap-2 font-medium text-amber-300">
                <Database className="h-4 w-4" />
                <span>
                  {!dbConfigured ? "Connect Postgres to begin" : "Push database schema"}
                </span>
              </div>
              <p className="mt-1.5 text-amber-200/80">
                {!dbConfigured
                  ? "Add DATABASE_URL and AUTH_SECRET to .env.local (or link Neon in Vercel Storage), then run pnpm db:push."
                  : "DATABASE_URL is set, but tables are missing. Run pnpm db:push in your terminal."}
              </p>
              {dbError && (
                <p className="mt-2 truncate font-mono text-[11px] text-amber-300/70">
                  {dbError}
                </p>
              )}
            </div>
          )}

          {isBootstrap && (
            <div className="mb-6 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 text-xs leading-relaxed text-emerald-200">
              <div className="flex items-center gap-2 font-medium text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
                <span>First-run workspace setup</span>
              </div>
              <p className="mt-1 text-emerald-200/80">
                No accounts exist yet. Your first account will be created as workspace admin
                and starter channels will be seeded automatically.
              </p>
            </div>
          )}

          {/* Mode switcher */}
          {!isBootstrap && (
            <div className="mb-7 grid grid-cols-2 rounded-lg border border-white/[0.08] bg-[#121316] p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className={`rounded-md py-2 text-xs font-medium transition-colors ${
                  mode === "login"
                    ? "bg-[#1C1D22] text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                className={`rounded-md py-2 text-xs font-medium transition-colors ${
                  mode === "register"
                    ? "bg-[#1C1D22] text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Create account
              </button>
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-100">
              {isBootstrap
                ? "Create admin account"
                : mode === "login"
                  ? "Welcome back"
                  : "Create your account"}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {isBootstrap
                ? "Set up your credentials to claim this server."
                : mode === "login"
                  ? "Sign in with your username or email address."
                  : "Sign up with your email and username to get started."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && !isBootstrap && initialInviteCode && (
              <div className="space-y-1.5">
                <label
                  htmlFor="inviteCode"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Invite code (optional)
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    id="inviteCode"
                    name="inviteCode"
                    type="text"
                    autoComplete="off"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="SIQ-XXXX-XXXX"
                    className="w-full rounded-lg border border-white/[0.1] bg-[#121316] py-2.5 pl-9 pr-3 text-sm font-medium uppercase tracking-wider tabular-nums text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                  />
                </div>
              </div>
            )}

            {mode === "login" ? (
              <div className="space-y-1.5">
                <label htmlFor="identifier" className="block text-xs font-medium text-zinc-300">
                  Username or email
                </label>
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value.toLowerCase())}
                  placeholder="reza or reza@example.com"
                  className="w-full rounded-lg border border-white/[0.1] bg-[#121316] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-xs font-medium text-zinc-300">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value.toLowerCase())}
                      placeholder="you@example.com"
                      className="w-full rounded-lg border border-white/[0.1] bg-[#121316] py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                    />
                  </div>
                  <p className="flex items-center gap-1 text-[11px] text-zinc-500">
                    <Lock className="h-3 w-3 shrink-0 text-zinc-500" />
                    <span>Kept private — never displayed to other members.</span>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="username" className="block text-xs font-medium text-zinc-300">
                    Username
                  </label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="reza"
                    className="w-full rounded-lg border border-white/[0.1] bg-[#121316] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                  />
                  <p className="text-[11px] text-zinc-500">
                    3–24 lowercase letters, numbers, underscores, or hyphens.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="displayName"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Display name
                  </label>
                  <input
                    id="displayName"
                    name="displayName"
                    type="text"
                    required
                    dir="auto"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Reza or رضا"
                    className="w-full rounded-lg border border-white/[0.1] bg-[#121316] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-medium text-zinc-300">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-white/[0.1] bg-[#121316] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
              />
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-300"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={submitting || !dbConfigured || !schemaReady}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span>
                {submitting
                  ? "Working..."
                  : isBootstrap
                    ? "Create Workspace"
                    : mode === "login"
                      ? "Sign in"
                      : "Join Workspace"}
              </span>
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        </motion.div>
      </section>
    </main>
      </ContextMenuProvider>
    </MotionConfig>
  );
}
