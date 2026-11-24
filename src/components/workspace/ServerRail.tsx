"use client";

import { Headphones, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import type { ServerDetail } from "@/lib/types";

interface ServerRailProps {
  servers: ServerDetail[];
  viewMode: "home" | "server";
  activeServerId: string | null;
  homeBadgeCount: number;
  unreadServerIds: Set<string>;
  onSelectHome: () => void;
  onSelectServer: (serverId: string) => void;
  onOpenCreateJoin: () => void;
  onServerContextMenu?: (e: React.MouseEvent<HTMLElement>, server: ServerDetail) => void;
}

export function ServerRail({
  servers,
  viewMode,
  activeServerId,
  homeBadgeCount,
  unreadServerIds,
  onSelectHome,
  onSelectServer,
  onOpenCreateJoin,
  onServerContextMenu,
}: ServerRailProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <nav
      aria-label="Servers"
      className="flex h-full w-[68px] shrink-0 flex-col items-center border-r border-white/[0.06] bg-[#08080A] py-3 select-none"
    >
      {/* Home / Direct Messages */}
      <div className="relative flex w-full items-center justify-center">
        <span
          className={`absolute left-0 w-1 rounded-r-full bg-emerald-400 transition-all duration-200 ${
            viewMode === "home"
              ? "h-9 opacity-100"
              : hoveredId === "home"
                ? "h-5 opacity-90"
                : "h-0 opacity-0"
          }`}
        />

        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={onSelectHome}
          onMouseEnter={() => setHoveredId("home")}
          onMouseLeave={() => setHoveredId((curr) => (curr === "home" ? null : curr))}
          aria-label="Direct Messages & Friends"
          className={`relative flex h-11 w-11 items-center justify-center border transition-all duration-200 ${
            viewMode === "home"
              ? "rounded-[14px] border-emerald-500/50 bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20"
              : "rounded-[22px] border-white/[0.08] bg-[#14151A] text-zinc-300 hover:rounded-[14px] hover:border-emerald-500/40 hover:bg-emerald-500/15 hover:text-emerald-300"
          }`}
        >
          <Headphones className="h-5 w-5" />
          {homeBadgeCount > 0 && (
            <span className="absolute -bottom-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-[#08080A]">
              {homeBadgeCount > 9 ? "9+" : homeBadgeCount}
            </span>
          )}
        </motion.button>

        {hoveredId === "home" && (
          <div className="pointer-events-none absolute left-[64px] z-[75] whitespace-nowrap rounded-lg border border-white/[0.1] bg-[#14151A] px-2.5 py-1.5 text-xs font-semibold text-zinc-100 shadow-2xl shadow-black/80">
            Direct Messages
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="my-2.5 h-px w-8 rounded-full bg-white/[0.09]" />

      {/* Server Icons */}
      <div className="flex w-full flex-1 flex-col items-center gap-2 overflow-y-auto overflow-x-visible py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {servers.map((server) => {
          const isActive = viewMode === "server" && activeServerId === server.id;
          const isHovered = hoveredId === server.id;
          const hasUnread = unreadServerIds.has(server.id);
          const initials = server.name
            .trim()
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          return (
            <div
              key={server.id}
              className="relative flex w-full items-center justify-center"
            >
              <span
                className={`absolute left-0 w-1 rounded-r-full transition-all duration-200 ${
                  isActive
                    ? "h-9 bg-emerald-400 opacity-100"
                    : isHovered
                      ? "h-5 bg-zinc-200 opacity-90"
                      : hasUnread
                        ? "h-2 bg-zinc-200 opacity-90"
                        : "h-0 opacity-0"
                }`}
              />

              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => onSelectServer(server.id)}
                onContextMenu={(e) => onServerContextMenu?.(e, server)}
                onMouseEnter={() => setHoveredId(server.id)}
                onMouseLeave={() =>
                  setHoveredId((curr) => (curr === server.id ? null : curr))
                }
                aria-label={server.name}
                style={
                  !server.iconUrl
                    ? {
                        backgroundColor: isActive
                          ? server.accentColor
                          : `${server.accentColor}20`,
                        color: isActive ? "#09090B" : server.accentColor,
                        borderColor: isActive
                          ? server.accentColor
                          : `${server.accentColor}40`,
                      }
                    : undefined
                }
                className={`relative flex h-11 w-11 items-center justify-center overflow-hidden border text-xs font-bold tracking-tight transition-all duration-200 ${
                  isActive
                    ? "rounded-[14px] ring-2 ring-emerald-400/25"
                    : "rounded-[22px] hover:rounded-[14px]"
                } ${
                  server.iconUrl
                    ? isActive
                      ? "border-emerald-400/60 bg-[#14151A]"
                      : "border-white/[0.1] bg-[#14151A] hover:border-white/[0.22]"
                    : ""
                }`}
              >
                {server.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={server.iconUrl}
                    alt={server.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>{initials || "SQ"}</span>
                )}
              </motion.button>

              {isHovered && (
                <div className="pointer-events-none fixed left-[74px] z-[80] flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/[0.1] bg-[#14151A] px-2.5 py-1.5 text-xs font-semibold text-zinc-100 shadow-2xl shadow-black/80">
                  <span dir="auto">{server.name}</span>
                  {server.tag && (
                    <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-emerald-300">
                      {server.tag}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add / Join Server Button */}
        <div className="relative mt-0.5 flex w-full items-center justify-center">
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={onOpenCreateJoin}
            onMouseEnter={() => setHoveredId("add-server")}
            onMouseLeave={() =>
              setHoveredId((curr) => (curr === "add-server" ? null : curr))
            }
            aria-label="Create or join a server"
            className="flex h-11 w-11 items-center justify-center rounded-[22px] border border-dashed border-white/[0.14] bg-[#121316] text-emerald-400 transition-all duration-200 hover:rounded-[14px] hover:border-emerald-500/60 hover:bg-emerald-500 hover:text-zinc-950"
          >
            <Plus className="h-5 w-5" />
          </motion.button>

          {hoveredId === "add-server" && (
            <div className="pointer-events-none fixed left-[74px] z-[80] whitespace-nowrap rounded-lg border border-white/[0.1] bg-[#14151A] px-2.5 py-1.5 text-xs font-semibold text-zinc-100 shadow-2xl shadow-black/80">
              Create or Join Server
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
