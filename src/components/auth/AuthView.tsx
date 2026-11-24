"use client";

import {
  AlertCircle,
  ArrowRight,
  Database,
  Headphones,
  KeyRound,
  Lock,
  Mail,
  Monitor,
  Radio,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { BarVisualizer } from "@/components/ui/BarVisualizer";
import { ContextMenuProvider } from "@/components/ui/ContextMenu";
import {
  SlidingNumber,
  SpotlightCard,
  StatusPill,
} from "@/components/ui/MotionPrimitives";

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
  const [previewPing, setPreviewPing] = useState(14);

  useEffect(() => {
    if (isBootstrap) {
      setMode("register");
    }
  }, [isBootstrap]);

  // Subtle organic ping telemetry in the acoustic studio card
  useEffect(() => {
    const samples = [13, 14, 16, 12, 15, 14, 17, 13];
    let i = 0;
    const timer = setInterval(() => {
      i = (i + 1) % samples.length;
      setPreviewPing(samples[i]);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

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
        <main className="siq-grain grid min-h-[100dvh] grid-cols-1 bg-[#070709] lg:grid-cols-12">
          {/* Left acoustic studio showcase */}
          <section className="siq-grid-bg relative flex flex-col justify-between overflow-hidden border-b border-white/[0.07] px-8 py-10 lg:col-span-7 lg:border-b-0 lg:border-r lg:px-14 lg:py-14">
            {/* Subtle top-left architectural spotlight */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgb(var(--siq-accent-rgb)/0.1)_0%,transparent_70%)]"
            />

            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="siq-bezel-sm flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/35 bg-emerald-500/[0.12] text-emerald-400">
                  <Headphones className="h-4 w-4" />
                </div>
                <div>
                  <span className="block text-sm font-bold leading-none tracking-tight text-zinc-50">
                    siq
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] tracking-wider text-zinc-500">
                    ACOUSTIC WORKSPACE
                  </span>
                </div>
              </div>

              <StatusPill
                label={dbConfigured && schemaReady ? "Private Instance" : "Setup Pending"}
                tone={dbConfigured && schemaReady ? "emerald" : "amber"}
                pulse={dbConfigured && schemaReady}
              />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 my-12 max-w-xl lg:my-0"
            >
              <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tighter text-zinc-50 sm:text-[3.25rem]">
                Studio-grade voice &amp; screen share, built for your circle.
              </h1>
              <p className="mt-5 max-w-[50ch] text-[15px] leading-relaxed text-zinc-400">
                Drop into instant WebRTC voice rooms with WASM noise suppression, 60fps
                system-audio streams, and distraction-free channels — zero bloat.
              </p>

              {/* Bespoke Asymmetric Acoustic Telemetry Showcase (replaces generic 3-col cards) */}
              <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-12">
                <SpotlightCard
                  active
                  className="siq-bezel rounded-2xl border border-white/[0.09] bg-[#0D0E12]/90 p-4 sm:col-span-7"
                >
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-xs font-semibold text-zinc-100">Lounge · Voice</span>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-300">
                      <SlidingNumber value={previewPing} />
                      <span>ms</span>
                    </span>
                  </div>

                  <div className="relative z-10 mt-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#08090C] px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-zinc-950">
                        AR
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-zinc-100">Aria</p>
                        <p className="text-[10px] text-emerald-400">Speaking · Krisp AI</p>
                      </div>
                    </div>
                    <BarVisualizer state="speaking" barCount={9} size="sm" />
                  </div>
                </SpotlightCard>

                <div className="grid grid-rows-2 gap-3 sm:col-span-5">
                  <SpotlightCard className="siq-bezel-sm rounded-2xl border border-white/[0.08] bg-[#0D0E12]/80 p-3.5">
                    <div className="relative z-10 flex items-center gap-2 text-zinc-200">
                      <Monitor className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-xs font-semibold">1440p · 60fps Stream</span>
                    </div>
                    <p className="relative z-10 mt-1 text-[11px] leading-relaxed text-zinc-500">
                      VP9 &amp; AV1 screen capture with native system audio.
                    </p>
                  </SpotlightCard>

                  <SpotlightCard className="siq-bezel-sm rounded-2xl border border-white/[0.08] bg-[#0D0E12]/80 p-3.5">
                    <div className="relative z-10 flex items-center gap-2 text-zinc-200">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-xs font-semibold">WASM Noise Filter</span>
                    </div>
                    <p className="relative z-10 mt-1 text-[11px] leading-relaxed text-zinc-500">
                      Krisp, GTCRN &amp; RNNoise running locally in browser.
                    </p>
                  </SpotlightCard>
                </div>
              </div>
            </motion.div>

            <div className="relative z-10 flex items-center justify-between text-xs font-medium text-zinc-500">
              <span className="font-mono text-[11px] tracking-wide">
                WebRTC · Opus · End-to-End Private
              </span>
              <span className="rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-0.5 text-[11px] text-zinc-400">
                EN + فارسی
              </span>
            </div>
          </section>

          {/* Right form column */}
          <section className="flex flex-col justify-center bg-[#0B0C0F] px-6 py-12 sm:px-12 lg:col-span-5 lg:px-14">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
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

              {/* Spring-animated mode switcher */}
              {!isBootstrap && (
                <div className="mb-7 grid grid-cols-2 rounded-xl border border-white/[0.08] bg-[#111216] p-1">
                  {(
                    [
                      { id: "login", label: "Sign in" },
                      { id: "register", label: "Create account" },
                    ] as const
                  ).map((item) => {
                    const active = mode === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setMode(item.id);
                          setError(null);
                        }}
                        className={`relative rounded-lg py-2 text-xs font-medium transition-colors ${
                          active ? "text-zinc-50" : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="auth-mode-pill"
                            transition={{ type: "spring", stiffness: 420, damping: 32 }}
                            className="siq-bezel-sm absolute inset-0 rounded-lg border border-white/[0.08] bg-[#1C1D24]"
                          />
                        )}
                        <span className="relative z-10">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mb-6">
                <h2 className="text-xl font-semibold tracking-tight text-zinc-50">
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
                        className="w-full rounded-xl border border-white/[0.09] bg-[#111216] py-2.5 pl-9 pr-3 font-mono text-sm font-medium uppercase tracking-wider text-zinc-100 placeholder:text-zinc-600 transition-all focus:border-emerald-500/60 focus:bg-[#14161C] focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                      />
                    </div>
                  </div>
                )}

                {mode === "login" ? (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="identifier"
                      className="block text-xs font-medium text-zinc-300"
                    >
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
                      className="w-full rounded-xl border border-white/[0.09] bg-[#111216] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-all focus:border-emerald-500/60 focus:bg-[#14161C] focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
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
                          className="w-full rounded-xl border border-white/[0.09] bg-[#111216] py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 transition-all focus:border-emerald-500/60 focus:bg-[#14161C] focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                        />
                      </div>
                      <p className="flex items-center gap-1 text-[11px] text-zinc-500">
                        <Lock className="h-3 w-3 shrink-0 text-zinc-500" />
                        <span>Kept private — never displayed to other members.</span>
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="username"
                        className="block text-xs font-medium text-zinc-300"
                      >
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
                        className="w-full rounded-xl border border-white/[0.09] bg-[#111216] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-all focus:border-emerald-500/60 focus:bg-[#14161C] focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
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
                        className="w-full rounded-xl border border-white/[0.09] bg-[#111216] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-all focus:border-emerald-500/60 focus:bg-[#14161C] focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
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
                    className="w-full rounded-xl border border-white/[0.09] bg-[#111216] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-all focus:border-emerald-500/60 focus:bg-[#14161C] focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                  />
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      role="alert"
                      className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-300"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  whileTap={{ scale: 0.985 }}
                  type="submit"
                  disabled={submitting || !dbConfigured || !schemaReady}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-500/15 transition-all hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
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
                </motion.button>
              </form>
            </motion.div>
          </section>
        </main>
      </ContextMenuProvider>
    </MotionConfig>
  );
}
