"use client";

import { Phone, PhoneOff, Video } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Avatar } from "@siq/shared/components/ui/Avatar";
import type { IncomingCallItem } from "@siq/shared/lib/types";

// Three sonar rings ripple out of the caller avatar while the call is ringing
const RING_WAVES = [0, 1, 2] as const;

interface IncomingCallPopupProps {
  call: IncomingCallItem | null;
  busy?: boolean;
  onAccept: (call: IncomingCallItem, withVideo: boolean) => void;
  onReject: (call: IncomingCallItem) => void;
}

export function IncomingCallPopup({
  call,
  busy = false,
  onAccept,
  onReject,
}: IncomingCallPopupProps) {
  const reducedMotion = useReducedMotion();
  const ringing = !reducedMotion;

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed left-4 right-4 top-[68px] z-[105] mx-auto flex max-w-[336px] justify-end sm:left-auto sm:right-4 sm:mx-0"
    >
      <AnimatePresence mode="wait">
        {call && (
          <motion.div
            key={`${call.dmConversationId}-${call.startedAtMs}`}
            initial={{ opacity: 0, y: -18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: -12,
              scale: 0.95,
              transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
            }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            role="alertdialog"
            aria-label={`Incoming ${call.withVideo ? "video" : "voice"} call from ${call.caller.displayName}`}
            className="siq-glass pointer-events-auto relative w-full origin-top-right rounded-[22px]"
          >
            {/* Ambient accent light + scanning top hairline, clipped to the card */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
            >
              <div className="absolute inset-0 bg-[radial-gradient(85%_75%_at_10%_0%,rgb(var(--siq-accent-rgb)/0.16),transparent_65%)]" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
              {ringing && (
                <motion.div
                  className="absolute left-0 top-0 h-[2px] w-1/2 bg-gradient-to-r from-transparent via-emerald-300 to-transparent"
                  initial={{ x: "-100%" }}
                  animate={{ x: "200%" }}
                  transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 0.5, ease: "easeInOut" }}
                />
              )}
            </div>

            <div className="relative p-4">
              {/* Caller Identity Row */}
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  {ringing ? (
                    RING_WAVES.map((wave) => (
                      <motion.span
                        key={wave}
                        aria-hidden="true"
                        initial={{ scale: 1, opacity: 0 }}
                        animate={{ scale: [1, 1.45, 1.7], opacity: [0.65, 0.22, 0] }}
                        transition={{
                          duration: 2.4,
                          repeat: Infinity,
                          ease: "easeOut",
                          delay: wave * 0.8,
                        }}
                        className="pointer-events-none absolute -inset-0.5 rounded-full border border-emerald-400/70 shadow-[0_0_14px_rgb(var(--siq-accent-rgb)/0.35)]"
                      />
                    ))
                  ) : (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-1 rounded-full border border-emerald-400/50"
                    />
                  )}
                  <span className="siq-speaking-ring relative inline-flex rounded-full">
                    <Avatar
                      name={call.caller.displayName}
                      color={call.caller.avatarColor}
                      avatarUrl={call.caller.avatarUrl}
                      size="lg"
                      ringClassName="ring-[#121319]"
                    />
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                    <motion.span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/30"
                      animate={ringing ? { rotate: [0, -16, 14, -10, 8, 0] } : undefined}
                      transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 1.1, ease: "easeInOut" }}
                    >
                      {call.withVideo ? (
                        <Video className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                      )}
                    </motion.span>
                    <span className="truncate">
                      {call.withVideo ? "Incoming Video Call" : "Incoming Voice Call"}
                    </span>
                  </div>

                  <p
                    dir="auto"
                    className="mt-1 truncate text-[15px] font-bold tracking-tight text-zinc-50"
                  >
                    {call.caller.displayName}
                  </p>
                  <p className="truncate text-xs text-zinc-400">@{call.caller.username}</p>
                </div>
              </div>

              {/* Action Row */}
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onReject(call)}
                  className="siq-press inline-flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-rose-500/35 bg-rose-500/[0.12] px-3 text-xs font-semibold text-rose-300 shadow-[0_0_20px_-8px_rgba(244,63,94,0.55)] hover:border-rose-400/70 hover:bg-rose-500 hover:text-white hover:shadow-[0_10px_28px_-8px_rgba(244,63,94,0.85)] disabled:opacity-50"
                >
                  <PhoneOff className="h-3.5 w-3.5 shrink-0" />
                  <span>Reject</span>
                </button>

                {call.withVideo && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAccept(call, false)}
                    title="Accept voice only"
                    aria-label="Accept voice only"
                    className="siq-press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/35 bg-emerald-500/[0.12] text-emerald-300 hover:border-emerald-400/60 hover:bg-emerald-500/25 hover:shadow-[0_0_22px_-4px_rgb(var(--siq-accent-rgb)/0.7)] disabled:opacity-50"
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </button>
                )}

                <span className="relative flex flex-1">
                  {/* Breathing halo behind the primary action */}
                  <motion.span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-0.5 rounded-[14px] shadow-[0_0_20px_0_rgb(var(--siq-accent-rgb)/0.5)]"
                    initial={{ opacity: 0.45 }}
                    animate={
                      ringing && !busy ? { opacity: [0.35, 1, 0.35] } : { opacity: busy ? 0 : 0.6 }
                    }
                    transition={
                      ringing && !busy
                        ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                        : { duration: 0.2 }
                    }
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAccept(call, call.withVideo)}
                    className="siq-cta inline-flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap !rounded-xl px-3 text-xs disabled:opacity-50"
                  >
                    {call.withVideo ? (
                      <Video className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>{call.withVideo ? "Accept Video" : "Accept"}</span>
                  </button>
                </span>
              </div>
            </div>

            <span
              aria-hidden="true"
              className="siq-edge-light pointer-events-none !absolute -inset-px rounded-[inherit]"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
