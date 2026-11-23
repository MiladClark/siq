"use client";

interface AvatarProps {
  name: string;
  color: string;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  online?: boolean;
  speaking?: boolean;
  speakingOffsetClassName?: string;
  ringClassName?: string;
}

const SIZE_CLASSES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-8 w-8 text-xs",
  lg: "h-14 w-14 text-lg",
  xl: "h-16 w-16 text-xl",
} as const;

const DOT_CLASSES = {
  xs: "h-2 w-2",
  sm: "h-2.5 w-2.5",
  md: "h-2.5 w-2.5",
  lg: "h-3.5 w-3.5",
  xl: "h-4 w-4",
} as const;

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function Avatar({
  name,
  color,
  avatarUrl,
  size = "md",
  online,
  speaking = false,
  speakingOffsetClassName = "ring-offset-[#0E0F12]",
  ringClassName = "ring-[#0E0F12]",
}: AvatarProps) {
  return (
    <span
      className={`relative inline-flex aspect-square shrink-0 items-center justify-center rounded-full leading-none transition-shadow duration-100 ${
        SIZE_CLASSES[size]
      } ${
        speaking
          ? `ring-2 ring-emerald-400 ring-offset-2 ${speakingOffsetClassName}`
          : ""
      }`}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          className="block h-full w-full rounded-full object-cover select-none"
          style={{ backgroundColor: color }}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full font-semibold tracking-tight text-zinc-950 select-none"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        >
          {getInitials(name)}
        </span>
      )}
      {online !== undefined && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${DOT_CLASSES[size]} rounded-full ring-2 ${ringClassName} ${
            online ? "bg-emerald-400" : "bg-zinc-600"
          }`}
          title={online ? "Online" : "Offline"}
        />
      )}
    </span>
  );
}
