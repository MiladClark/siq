"use client";

interface AvatarProps {
  name: string;
  color: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
}

const SIZE_CLASSES = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-8 w-8 text-xs",
  lg: "h-12 w-12 text-base",
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

export function Avatar({ name, color, size = "md", online }: AvatarProps) {
  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={`${SIZE_CLASSES[size]} flex items-center justify-center rounded-full font-semibold tracking-tight text-zinc-950 select-none`}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        {getInitials(name)}
      </div>
      {online !== undefined && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#0E0F12] ${
            online ? "bg-emerald-400" : "bg-zinc-600"
          }`}
          title={online ? "Online" : "Offline"}
        />
      )}
    </div>
  );
}
