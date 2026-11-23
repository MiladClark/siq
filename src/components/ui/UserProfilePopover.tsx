"use client";

import { Shield, Volume2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";

export interface ProfilePopoverTarget {
  id: string;
  displayName: string;
  username?: string;
  avatarColor: string;
  avatarUrl?: string | null;
  role?: "admin" | "member";
  online?: boolean;
  inVoiceChannelName?: string | null;
  anchorRect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
}

interface UserProfilePopoverProps {
  target: ProfilePopoverTarget | null;
  onClose: () => void;
}

export function UserProfilePopover({ target, onClose }: UserProfilePopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  useEffect(() => {
    if (!target) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleOutside);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleOutside);
    };
  }, [target, onClose]);

  useLayoutEffect(() => {
    if (!target || !ref.current) return;
    const cardW = ref.current.offsetWidth || 272;
    const cardH = ref.current.offsetHeight || 200;
    const pad = 12;

    // Prefer opening to the right of the clicked element; flip left if near right edge
    let left = target.anchorRect.right + 10;
    if (left + cardW > window.innerWidth - pad) {
      left = target.anchorRect.left - cardW - 10;
    }
    if (left < pad) {
      left = Math.max(pad, Math.min(target.anchorRect.left, window.innerWidth - cardW - pad));
    }

    let top = target.anchorRect.top - 8;
    if (top + cardH > window.innerHeight - pad) {
      top = window.innerHeight - cardH - pad;
    }
    if (top < pad) top = pad;

    setCoords({ top, left });
  }, [target]);

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          ref={ref}
          key={target.id}
          initial={{ opacity: 0, scale: 0.94, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 2 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          style={{ top: coords.top, left: coords.left }}
          role="dialog"
          aria-label={`${target.displayName} profile`}
          className="fixed z-[75] w-[272px] overflow-hidden rounded-xl border border-white/[0.11] bg-[#14151A] shadow-2xl shadow-black/70"
        >
          {/* Accent header strip */}
          <div
            className="relative h-16 w-full"
            style={{
              background: `linear-gradient(135deg, ${target.avatarColor}38 0%, #14151A 100%)`,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile popover"
              className="absolute right-2.5 top-2.5 rounded-lg bg-black/35 p-1 text-zinc-300 transition-colors hover:bg-black/60 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Avatar + Identity */}
          <div className="px-4 pb-4">
            <div className="-mt-8 mb-3 flex items-end justify-between">
              <div className="rounded-full ring-4 ring-[#14151A]">
                <Avatar
                  name={target.displayName}
                  color={target.avatarColor}
                  avatarUrl={target.avatarUrl}
                  size="xl"
                  online={target.online}
                  ringClassName="ring-[#14151A]"
                />
              </div>

              {target.role === "admin" && (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-300">
                  <Shield className="h-3 w-3" />
                  Admin
                </span>
              )}
            </div>

            <div className="space-y-0.5">
              <h3 dir="auto" className="truncate text-base font-semibold text-zinc-100">
                {target.displayName}
              </h3>
              {target.username && (
                <p className="font-mono text-xs text-zinc-400">@{target.username}</p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3 text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-zinc-400">
                <span
                  className={`h-2 w-2 rounded-full ${
                    target.online ? "bg-emerald-400" : "bg-zinc-600"
                  }`}
                />
                {target.online ? "Online" : "Offline"}
              </span>

              {target.inVoiceChannelName && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                  <Volume2 className="h-3 w-3" />
                  <span dir="auto" className="max-w-[130px] truncate">
                    {target.inVoiceChannelName}
                  </span>
                </span>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
