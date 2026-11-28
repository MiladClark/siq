"use client";

import { AtSign } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Avatar } from "@siq/shared/components/ui/Avatar";
import type { PublicUser } from "@siq/shared/lib/types";

export function MentionSuggestions({
  id,
  members,
  activeIndex,
  onSelect,
}: {
  id: string;
  members: PublicUser[];
  activeIndex: number;
  onSelect: (member: PublicUser) => void;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reducedMotion ? 0 : 8, scale: reducedMotion ? 1 : 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        y: reducedMotion ? 0 : 4,
        scale: reducedMotion ? 1 : 0.98,
        transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
      }}
      transition={{ type: "spring", stiffness: 480, damping: 32 }}
      className="siq-glass absolute bottom-full left-0 z-20 mb-2 w-[min(320px,100%)] origin-bottom-left overflow-hidden rounded-2xl p-1.5"
    >
      <div className="flex items-center gap-2 px-2 pb-1.5 pt-1 text-[11px] font-semibold text-zinc-400">
        <span
          aria-hidden="true"
          className="grid h-5 w-5 place-items-center rounded-md bg-emerald-500/[0.12] text-emerald-300 ring-1 ring-inset ring-emerald-500/25"
        >
          <AtSign className="h-3 w-3" strokeWidth={2.4} />
        </span>
        Mention a member
      </div>
      <motion.div
        id={id}
        role="listbox"
        aria-label="Members to mention"
        layoutScroll
        className="max-h-56 overflow-y-auto"
      >
        {members.map((member, index) => {
          const active = index === activeIndex;
          return (
            <motion.button
              key={member.id}
              id={`${id}-${member.id}`}
              type="button"
              role="option"
              aria-selected={active}
              tabIndex={-1}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onSelect(member)}
              initial={{ opacity: 0, x: reducedMotion ? 0 : -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                type: "spring",
                stiffness: 560,
                damping: 36,
                delay: 0.03 + Math.min(index, 8) * 0.022,
              }}
              className={`relative isolate flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-start transition-colors duration-150 ${
                active ? "" : "hover:bg-white/[0.04]"
              }`}
            >
              {active && (
                <motion.span
                  layoutId={`${id}-active`}
                  aria-hidden="true"
                  transition={{ type: "spring", stiffness: 620, damping: 44, mass: 0.6 }}
                  className="absolute inset-0 -z-10 rounded-[inherit] bg-gradient-to-r from-emerald-500/[0.16] via-emerald-500/[0.06] to-white/[0.02] ring-1 ring-inset ring-emerald-500/25"
                />
              )}
              <Avatar name={member.displayName} color={member.avatarColor} avatarUrl={member.avatarUrl} size="sm" />
              <span dir="auto" className={`truncate text-xs font-medium ${active ? "text-white" : "text-zinc-100"}`}>{member.displayName}</span>
              <span className={`ml-auto shrink-0 text-[11px] transition-colors ${active ? "text-emerald-300" : "text-zinc-400"}`}>@{member.username}</span>
            </motion.button>
          );
        })}
      </motion.div>
      {members.length === 0 && (
        <p className="px-2 py-1.5 text-xs text-zinc-500">No matching members</p>
      )}
    </motion.div>
  );
}
