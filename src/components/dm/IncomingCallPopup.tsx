"use client";

import { Phone, PhoneOff, Video } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Avatar } from "@/components/ui/Avatar";
import type { IncomingCallItem } from "@/lib/types";

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
  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed left-4 right-4 top-[68px] z-[105] mx-auto flex max-w-[336px] justify-end sm:left-auto sm:right-4 sm:mx-0"
    >
      <AnimatePresence mode="wait">
        {call && (
          <motion.div
            key={`${call.dmConversationId}-${call.startedAtMs}`}
            initial={{ opacity: 0, y: -14, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            role="alertdialog"
            aria-label={`Incoming ${call.withVideo ? "video" : "voice"} call from ${call.caller.displayName}`}
            className="siq-bezel pointer-events-auto relative w-full overflow-hidden rounded-2xl border border-white/[0.12] bg-[#121319]/96 shadow-2xl shadow-black/75 backdrop-blur-xl"
          >
            {/* Subtle top hairline accent */}
            <div
              aria-hidden="true"
              className="h-[2px] w-full bg-gradient-to-r from-transparent via-emerald-400/75 to-transparent"
            />

            <div className="p-4">
              {/* Caller Identity Row */}
              <div className="flex items-center gap-3.5">
                <div className="relative shrink-0">
                  <motion.span
                    aria-hidden="true"
                    animate={{ scale: [1, 1.32, 1.38], opacity: [0.55, 0.18, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                    className="pointer-events-none absolute -inset-1 rounded-full border border-emerald-400/70"
                  />
                  <Avatar
                    name={call.caller.displayName}
                    color={call.caller.avatarColor}
                    avatarUrl={call.caller.avatarUrl}
                    size="lg"
                    ringClassName="ring-[#121319]"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-300">
                    {call.withVideo ? (
                      <Video className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">
                      {call.withVideo ? "Incoming Video Call" : "Incoming Voice Call"}
                    </span>
                  </div>

                  <p
                    dir="auto"
                    className="mt-0.5 truncate text-sm font-bold tracking-tight text-zinc-50"
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
                  className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-rose-500/35 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-300 transition-all hover:border-rose-500/60 hover:bg-rose-500 hover:text-white active:scale-[0.97] disabled:opacity-50"
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
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/35 bg-emerald-500/15 text-emerald-300 transition-all hover:bg-emerald-500/25 active:scale-[0.97] disabled:opacity-50"
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAccept(call, call.withVideo)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400 active:scale-[0.97] disabled:opacity-50"
                >
                  {call.withVideo ? (
                    <Video className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{call.withVideo ? "Accept Video" : "Accept"}</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
