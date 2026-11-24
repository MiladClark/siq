"use client";

import { motion, useReducedMotion } from "motion/react";
import { Avatar } from "@/components/ui/Avatar";
import type { PublicUser } from "@/lib/types";

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
      initial={{ opacity: 0, y: reducedMotion ? 0 : 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
      transition={{ duration: 0.14 }}
      className="siq-bezel absolute bottom-full left-0 z-20 mb-1.5 w-[min(320px,100%)] overflow-hidden rounded-xl border border-white/[0.1] bg-[#14151A] p-1.5"
    >
      <div className="px-2 pb-1 pt-0.5 text-[11px] font-medium text-zinc-400">
        Mention a member
      </div>
      <div id={id} role="listbox" aria-label="Members to mention" className="max-h-56 overflow-y-auto">
        {members.map((member, index) => (
          <button
            key={member.id}
            id={`${id}-${member.id}`}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            tabIndex={-1}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onSelect(member)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-white/[0.07] ${
              index === activeIndex ? "bg-white/[0.06]" : ""
            }`}
          >
            <Avatar name={member.displayName} color={member.avatarColor} avatarUrl={member.avatarUrl} size="sm" />
            <span dir="auto" className="truncate text-xs font-medium text-zinc-100">{member.displayName}</span>
            <span className="ml-auto shrink-0 text-[11px] text-zinc-400">@{member.username}</span>
          </button>
        ))}
      </div>
      {members.length === 0 && (
        <p className="px-2 py-1.5 text-xs text-zinc-500">No matching members</p>
      )}
    </motion.div>
  );
}
