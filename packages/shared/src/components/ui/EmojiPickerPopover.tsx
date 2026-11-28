"use client";

import { Search } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface EmojiEntry {
  emoji: string;
  keywords: string;
}

const EMOJI_GROUPS: Array<{ id: string; label: string; items: EmojiEntry[] }> = [
  {
    id: "popular",
    label: "Quick",
    items: [
      { emoji: "👍", keywords: "thumbs up yes ok good like" },
      { emoji: "😂", keywords: "laugh joy funny lol haha" },
      { emoji: "🔥", keywords: "fire lit hot flame" },
      { emoji: "❤️", keywords: "heart love red" },
      { emoji: "✅", keywords: "check done yes ok tick" },
      { emoji: "😭", keywords: "cry sob sad laugh" },
      { emoji: "💀", keywords: "skull dead rip" },
      { emoji: "🫡", keywords: "salute respect sir" },
      { emoji: "👀", keywords: "eyes look watch see" },
      { emoji: "🎉", keywords: "party celebrate tada" },
      { emoji: "💯", keywords: "100 hundred perfect" },
      { emoji: "👏", keywords: "clap bravo applause" },
    ],
  },
  {
    id: "faces",
    label: "Smileys",
    items: [
      { emoji: "😀", keywords: "grin smile happy" },
      { emoji: "😁", keywords: "beam grin happy" },
      { emoji: "😅", keywords: "sweat smile nervous" },
      { emoji: "🤣", keywords: "rofl laugh floor" },
      { emoji: "😊", keywords: "blush warm smile" },
      { emoji: "😎", keywords: "cool sunglasses" },
      { emoji: "🥳", keywords: "party birthday" },
      { emoji: "🤩", keywords: "star eyes amazed" },
      { emoji: "😏", keywords: "smirk" },
      { emoji: "🤔", keywords: "think hmm" },
      { emoji: "🤨", keywords: "eyebrow sus" },
      { emoji: "😐", keywords: "neutral meh" },
      { emoji: "🙄", keywords: "eye roll" },
      { emoji: "😬", keywords: "grimace awkward" },
      { emoji: "😮", keywords: "wow surprised" },
      { emoji: "🤯", keywords: "mind blown explode" },
      { emoji: "😡", keywords: "angry mad" },
      { emoji: "🤬", keywords: "curse rage" },
      { emoji: "🥺", keywords: "pleading puppy eyes" },
      { emoji: "😴", keywords: "sleep tired zzz" },
      { emoji: "🤡", keywords: "clown" },
      { emoji: "😈", keywords: "devil evil" },
      { emoji: "🤝", keywords: "handshake deal agree" },
      { emoji: "🙏", keywords: "pray please thanks" },
    ],
  },
  {
    id: "gaming",
    label: "Gaming & Hype",
    items: [
      { emoji: "🎮", keywords: "game controller gaming" },
      { emoji: "🏆", keywords: "trophy win champion" },
      { emoji: "⚡", keywords: "lightning bolt fast siq" },
      { emoji: "🎯", keywords: "target bullseye aim" },
      { emoji: "🚀", keywords: "rocket launch ship" },
      { emoji: "💎", keywords: "diamond gem" },
      { emoji: "👑", keywords: "crown king" },
      { emoji: "🎧", keywords: "headphones voice audio" },
      { emoji: "🎤", keywords: "mic microphone" },
      { emoji: "💻", keywords: "laptop pc computer" },
      { emoji: "⚔️", keywords: "swords fight battle" },
      { emoji: "🛡️", keywords: "shield defend tank" },
      { emoji: "💣", keywords: "bomb boom" },
      { emoji: "🍿", keywords: "popcorn watch stream" },
      { emoji: "☕", keywords: "coffee tea" },
      { emoji: "🍕", keywords: "pizza food" },
    ],
  },
  {
    id: "symbols",
    label: "Gestures & Symbols",
    items: [
      { emoji: "👎", keywords: "thumbs down no bad" },
      { emoji: "👌", keywords: "ok hand nice" },
      { emoji: "✌️", keywords: "peace victory" },
      { emoji: "🤞", keywords: "crossed fingers luck" },
      { emoji: "💪", keywords: "muscle strong flex" },
      { emoji: "🙌", keywords: "hands up hooray" },
      { emoji: "🫶", keywords: "heart hands" },
      { emoji: "👋", keywords: "wave hi hello bye" },
      { emoji: "❌", keywords: "cross no wrong x" },
      { emoji: "⚠️", keywords: "warning alert" },
      { emoji: "❓", keywords: "question what" },
      { emoji: "❗", keywords: "exclamation important" },
      { emoji: "✨", keywords: "sparkle shine" },
      { emoji: "💚", keywords: "green heart emerald" },
      { emoji: "🖤", keywords: "black heart" },
      { emoji: "📌", keywords: "pin" },
    ],
  },
];

export const QUICK_REACTION_EMOJIS = ["👍", "😂", "🔥", "✅"] as const;

interface EmojiPickerPopoverProps {
  anchorRect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPickerPopover({
  anchorRect,
  onSelect,
  onClose,
}: EmojiPickerPopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: anchorRect.top,
    left: anchorRect.left,
  });

  useEffect(() => {
    inputRef.current?.focus();
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const el = ref.current;
    const width = el?.offsetWidth || 292;
    const height = el?.offsetHeight || 320;
    const pad = 12;

    let left = anchorRect.right - width;
    if (left < pad) left = anchorRect.left;
    if (left + width > window.innerWidth - pad) {
      left = window.innerWidth - width - pad;
    }
    if (left < pad) left = pad;

    let top = anchorRect.bottom + 8;
    if (top + height > window.innerHeight - pad) {
      top = anchorRect.top - height - 8;
    }
    if (top < pad) top = pad;

    setCoords({ top, left });
  }, [anchorRect]);

  const normalized = query.trim().toLowerCase();
  const filteredGroups = normalized
    ? EMOJI_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            item.keywords.includes(normalized) || item.emoji.includes(normalized)
        ),
      })).filter((g) => g.items.length > 0)
    : EMOJI_GROUPS;

  // Grow out of the corner nearest the trigger (picker sits below/above, right-aligned)
  const originY = coords.top >= anchorRect.bottom ? "top" : "bottom";
  const originX = coords.left < anchorRect.left ? "right" : "left";

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{
        opacity: 0,
        scale: 0.95,
        transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
      }}
      transition={{ type: "spring", stiffness: 480, damping: 32 }}
      style={{
        top: coords.top,
        left: coords.left,
        transformOrigin: `${originY} ${originX}`,
      }}
      role="dialog"
      aria-label="Emoji picker"
      className="siq-glass fixed z-[95] flex w-[292px] flex-col overflow-hidden rounded-2xl"
    >
      <div className="border-b border-white/[0.06] p-2.5">
        <div className="group relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-emerald-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji..."
            className="w-full rounded-[10px] border border-white/[0.08] bg-black/25 py-2 pl-8 pr-2.5 text-xs text-zinc-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-zinc-500 focus:border-emerald-500/50 focus:bg-black/35 focus:shadow-[0_0_0_3px_rgb(var(--siq-accent-rgb)/0.12)] focus:outline-none"
          />
        </div>
      </div>

      <div className="max-h-[260px] space-y-3 overflow-y-auto p-2.5 [mask-image:linear-gradient(to_bottom,transparent,black_8px,black_calc(100%-14px),transparent)]">
        {filteredGroups.length === 0 ? (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-6 text-center text-xs text-zinc-500"
          >
            No matching emoji
          </motion.p>
        ) : (
          filteredGroups.map((group, groupIndex) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                type: "spring",
                stiffness: 420,
                damping: 32,
                delay: 0.04 + groupIndex * 0.05,
              }}
            >
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.09em] text-zinc-500">
                <span
                  aria-hidden="true"
                  className="h-1 w-1 rounded-full bg-emerald-400/80 shadow-[0_0_6px_rgb(var(--siq-accent-rgb)/0.8)]"
                />
                {group.label}
              </p>
              <div className="grid grid-cols-6 gap-1">
                {group.items.map((item) => (
                  <button
                    key={`${group.id}-${item.emoji}`}
                    type="button"
                    onClick={() => {
                      onSelect(item.emoji);
                      onClose();
                    }}
                    className="group flex h-9 w-full items-center justify-center rounded-[10px] text-lg outline-none transition-[background-color,box-shadow] duration-150 hover:bg-white/[0.07] hover:shadow-[inset_0_0_0_1px_rgb(var(--siq-accent-rgb)/0.22),0_6px_16px_-8px_rgb(var(--siq-accent-rgb)/0.6)] focus-visible:bg-white/[0.07] focus-visible:shadow-[inset_0_0_0_1px_rgb(var(--siq-accent-rgb)/0.45)]"
                  >
                    <span className="inline-block transition-transform duration-200 [transition-timing-function:var(--siq-ease-spring)] motion-safe:group-hover:-rotate-6 motion-safe:group-hover:scale-125 motion-safe:group-active:scale-90">
                      {item.emoji}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
}
