"use client";

import {
  Check,
  Folder,
  FolderOpen,
  Headphones,
  Palette,
  Plus,
  Ungroup,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useContextMenu } from "@/components/ui/ContextMenu";
import {
  dropServerIntoFolder,
  FOLDER_COLOR_PALETTE,
  loadServerRailLayout,
  mergeServersIntoNewFolder,
  moveRailNodeRelative,
  reconcileServerRailLayout,
  reorderServerInsideFolder,
  saveServerRailLayout,
  type ServerFolderNode,
  type ServerRailNode,
  toggleFolderExpandedState,
  ungroupFolderNode,
  updateFolderSettings,
} from "@/lib/server-folders";
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

type DragPayload =
  | { kind: "server"; serverId: string }
  | { kind: "folder"; folderId: string };

type DropHint =
  | { kind: "merge-server"; serverId: string }
  | { kind: "merge-folder"; folderId: string }
  | { kind: "line"; targetKey: string; position: "before" | "after" }
  | {
      kind: "folder-line";
      folderId: string;
      serverId: string;
      position: "before" | "after";
    };

function getInitials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return letters || "SQ";
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
  const { openMenu } = useContextMenu();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [savedLayout, setSavedLayout] = useState<ServerRailNode[]>([]);
  const [layoutHydrated, setLayoutHydrated] = useState(false);

  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);

  // Inline Folder Settings Modal state
  const [editingFolder, setEditingFolder] = useState<ServerFolderNode | null>(null);
  const [folderNameDraft, setFolderNameDraft] = useState("");
  const [folderColorDraft, setFolderColorDraft] = useState<string>(FOLDER_COLOR_PALETTE[0]);

  useEffect(() => {
    setSavedLayout(loadServerRailLayout());
    setLayoutHydrated(true);
  }, []);

  const serverMap = useMemo(() => {
    const map = new Map<string, ServerDetail>();
    for (const s of servers) map.set(s.id, s);
    return map;
  }, [servers]);

  const liveServerIds = useMemo(() => servers.map((s) => s.id), [servers]);

  const railNodes = useMemo(
    () => reconcileServerRailLayout(savedLayout, liveServerIds),
    [savedLayout, liveServerIds]
  );

  function commitLayout(next: ServerRailNode[]) {
    const reconciled = reconcileServerRailLayout(next, liveServerIds);
    setSavedLayout(reconciled);
    if (layoutHydrated) {
      saveServerRailLayout(reconciled);
    }
  }

  function openFolderSettingsModal(folder: ServerFolderNode) {
    setEditingFolder(folder);
    setFolderNameDraft(folder.name);
    setFolderColorDraft(folder.color);
  }

  function handleFolderContextMenu(
    e: React.MouseEvent<HTMLElement>,
    folder: ServerFolderNode
  ) {
    e.preventDefault();
    e.stopPropagation();
    openMenu(e, [
      {
        type: "item",
        id: "folder-toggle",
        label: folder.expanded ? "Collapse Folder" : "Expand Folder",
        icon: folder.expanded ? (
          <Folder className="h-3.5 w-3.5" />
        ) : (
          <FolderOpen className="h-3.5 w-3.5" />
        ),
        onSelect: () => commitLayout(toggleFolderExpandedState(railNodes, folder.id)),
      },
      {
        type: "item",
        id: "folder-settings",
        label: "Folder Settings",
        icon: <Palette className="h-3.5 w-3.5" />,
        onSelect: () => openFolderSettingsModal(folder),
      },
      { type: "divider", id: "folder-div" },
      {
        type: "item",
        id: "folder-ungroup",
        label: "Ungroup Folder",
        icon: <Ungroup className="h-3.5 w-3.5" />,
        danger: true,
        onSelect: () => commitLayout(ungroupFolderNode(railNodes, folder.id)),
      },
    ]);
  }

  function clearDragState() {
    setDragging(null);
    setDropHint(null);
  }

  function renderServerButton(
    server: ServerDetail,
    opts?: { insideFolderId?: string }
  ) {
    const isActive = viewMode === "server" && activeServerId === server.id;
    const isHovered = hoveredId === server.id;
    const hasUnread = unreadServerIds.has(server.id);
    const isBeingDragged =
      dragging?.kind === "server" && dragging.serverId === server.id;
    const isMergeTarget =
      dropHint?.kind === "merge-server" && dropHint.serverId === server.id;
    const targetKey = `server:${server.id}`;

    const showTopLine = opts?.insideFolderId
      ? dropHint?.kind === "folder-line" &&
        dropHint.folderId === opts.insideFolderId &&
        dropHint.serverId === server.id &&
        dropHint.position === "before"
      : dropHint?.kind === "line" &&
        dropHint.targetKey === targetKey &&
        dropHint.position === "before";

    const showBottomLine = opts?.insideFolderId
      ? dropHint?.kind === "folder-line" &&
        dropHint.folderId === opts.insideFolderId &&
        dropHint.serverId === server.id &&
        dropHint.position === "after"
      : dropHint?.kind === "line" &&
        dropHint.targetKey === targetKey &&
        dropHint.position === "after";

    return (
      <motion.div
        key={server.id}
        layout
        transition={{ type: "spring", stiffness: 460, damping: 34 }}
        onDragOver={(e) => {
          if (!dragging) return;
          e.preventDefault();
          e.stopPropagation();

          const rect = e.currentTarget.getBoundingClientRect();
          const relY = (e.clientY - rect.top) / Math.max(1, rect.height);

          if (opts?.insideFolderId) {
            if (dragging.kind !== "server") return;
            setDropHint({
              kind: "folder-line",
              folderId: opts.insideFolderId,
              serverId: server.id,
              position: relY < 0.5 ? "before" : "after",
            });
            return;
          }

          // Top-level server: middle 50% merges into folder (if dragging another server), top/bottom reorders
          if (
            dragging.kind === "server" &&
            dragging.serverId !== server.id &&
            relY >= 0.25 &&
            relY <= 0.75
          ) {
            setDropHint({ kind: "merge-server", serverId: server.id });
          } else {
            setDropHint({
              kind: "line",
              targetKey,
              position: relY < 0.5 ? "before" : "after",
            });
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!dragging || !dropHint) {
            clearDragState();
            return;
          }

          if (dropHint.kind === "merge-server" && dragging.kind === "server") {
            commitLayout(
              mergeServersIntoNewFolder(
                railNodes,
                dragging.serverId,
                dropHint.serverId,
                server.accentColor || "#10B981"
              )
            );
          } else if (dropHint.kind === "folder-line" && dragging.kind === "server") {
            commitLayout(
              reorderServerInsideFolder(
                railNodes,
                dragging.serverId,
                dropHint.folderId,
                dropHint.serverId,
                dropHint.position
              )
            );
          } else if (dropHint.kind === "line") {
            commitLayout(
              moveRailNodeRelative(railNodes, dragging, dropHint.targetKey, dropHint.position)
            );
          }
          clearDragState();
        }}
        className="relative flex w-full items-center justify-center"
      >
        {showTopLine && (
          <span className="pointer-events-none absolute -top-1.5 left-3 right-3 z-20 h-0.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(var(--siq-accent-rgb)/0.85)]" />
        )}

        {isActive ? (
          <motion.span
            layoutId="server-rail-active-pill"
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="absolute left-0 h-9 w-1 rounded-r-full bg-emerald-400 shadow-[0_0_12px_rgb(var(--siq-accent-rgb)/0.65)]"
          />
        ) : (
          <span
            className={`absolute left-0 w-1 rounded-r-full bg-zinc-200 transition-all duration-200 ${
              isHovered
                ? "h-5 opacity-90"
                : hasUnread
                  ? "h-2 opacity-90"
                  : "h-0 opacity-0"
            }`}
          />
        )}

        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", `server:${server.id}`);
            setDragging({ kind: "server", serverId: server.id });
            setHoveredId(null);
          }}
          onDragEnd={clearDragState}
          className={`relative ${isBeingDragged ? "opacity-40" : ""}`}
        >
          <motion.button
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.93 }}
            onClick={() => onSelectServer(server.id)}
            onContextMenu={(e) => onServerContextMenu?.(e, server)}
            onMouseEnter={() => {
              if (!dragging) setHoveredId(server.id);
            }}
            onMouseLeave={() =>
              setHoveredId((curr) => (curr === server.id ? null : curr))
            }
            aria-label={server.name}
            style={
              !server.iconUrl
                ? {
                    backgroundColor: isActive
                      ? server.accentColor
                      : `${server.accentColor}1f`,
                    color: isActive ? "#070709" : server.accentColor,
                    borderColor: isActive
                      ? server.accentColor
                      : `${server.accentColor}42`,
                  }
                : undefined
            }
            className={`siq-bezel-sm relative flex h-11 w-11 items-center justify-center overflow-hidden border text-xs font-bold tracking-tight transition-all duration-200 ${
              isMergeTarget
                ? "scale-105 rounded-[14px] ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#070709]"
                : isActive
                  ? "rounded-[15px] ring-2 ring-emerald-400/25"
                  : "rounded-[22px] hover:rounded-[15px]"
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
                draggable={false}
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{getInitials(server.name)}</span>
            )}
          </motion.button>

          {isMergeTarget && (
            <span className="pointer-events-none absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 shadow-md">
              <Folder className="h-2.5 w-2.5" />
            </span>
          )}
        </div>

        <AnimatePresence>
          {isHovered && !dragging && (
            <motion.div
              initial={{ opacity: 0, x: -4, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -3, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className="siq-bezel pointer-events-none fixed left-[74px] z-[80] flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/[0.11] bg-[#121319]/95 px-2.5 py-1.5 text-xs font-semibold text-zinc-100 backdrop-blur-md"
            >
              <span dir="auto">{server.name}</span>
              {server.tag && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-emerald-300">
                  {server.tag}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {showBottomLine && (
          <span className="pointer-events-none absolute -bottom-1.5 left-3 right-3 z-20 h-0.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(var(--siq-accent-rgb)/0.85)]" />
        )}
      </motion.div>
    );
  }

  return (
    <>
      <nav
        aria-label="Servers"
        className="flex h-full w-[68px] shrink-0 flex-col items-center border-r border-white/[0.06] bg-[#070709] py-3 select-none"
      >
        {/* Home / Direct Messages */}
        <div className="relative flex w-full items-center justify-center">
          {viewMode === "home" ? (
            <motion.span
              layoutId="server-rail-active-pill"
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="absolute left-0 h-9 w-1 rounded-r-full bg-emerald-400 shadow-[0_0_12px_rgb(var(--siq-accent-rgb)/0.65)]"
            />
          ) : (
            <span
              className={`absolute left-0 w-1 rounded-r-full bg-zinc-200 transition-all duration-200 ${
                hoveredId === "home" ? "h-5 opacity-90" : "h-0 opacity-0"
              }`}
            />
          )}

          <motion.button
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.93 }}
            onClick={onSelectHome}
            onMouseEnter={() => setHoveredId("home")}
            onMouseLeave={() => setHoveredId((curr) => (curr === "home" ? null : curr))}
            aria-label="Direct Messages & Friends"
            className={`siq-bezel-sm relative flex h-11 w-11 items-center justify-center border transition-all duration-200 ${
              viewMode === "home"
                ? "rounded-[15px] border-emerald-400/55 bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/25"
                : "rounded-[22px] border-white/[0.08] bg-[#13141A] text-zinc-300 hover:rounded-[15px] hover:border-emerald-500/40 hover:bg-emerald-500/15 hover:text-emerald-300"
            }`}
          >
            <Headphones className="h-5 w-5" />
            {homeBadgeCount > 0 && (
              <span className="absolute -bottom-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-[#070709]">
                {homeBadgeCount > 9 ? "9+" : homeBadgeCount}
              </span>
            )}
          </motion.button>

          <AnimatePresence>
            {hoveredId === "home" && !dragging && (
              <motion.div
                initial={{ opacity: 0, x: -4, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -3, scale: 0.96 }}
                transition={{ duration: 0.12 }}
                className="siq-bezel pointer-events-none absolute left-[64px] z-[75] whitespace-nowrap rounded-lg border border-white/[0.11] bg-[#121319]/95 px-2.5 py-1.5 text-xs font-semibold text-zinc-100 backdrop-blur-md"
              >
                Direct Messages
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div className="my-2.5 h-px w-8 rounded-full bg-white/[0.08]" />

        {/* Server Icons & Discord-style Expandable Folders */}
        <div
          onDragOver={(e) => {
            if (dragging) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging?.kind === "server" && railNodes.length > 0) {
              const last = railNodes[railNodes.length - 1];
              const lastKey =
                last.kind === "server" ? `server:${last.serverId}` : `folder:${last.id}`;
              commitLayout(moveRailNodeRelative(railNodes, dragging, lastKey, "after"));
            }
            clearDragState();
          }}
          className="flex w-full flex-1 flex-col items-center gap-2 overflow-y-auto overflow-x-visible py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {railNodes.map((node) => {
            if (node.kind === "server") {
              const srv = serverMap.get(node.serverId);
              if (!srv) return null;
              return renderServerButton(srv);
            }

            const folderServers = node.serverIds
              .map((id) => serverMap.get(id))
              .filter((s): s is ServerDetail => Boolean(s));
            if (folderServers.length === 0) return null;

            const folderKey = `folder:${node.id}`;
            const containsActive =
              viewMode === "server" &&
              Boolean(activeServerId && node.serverIds.includes(activeServerId));
            const containsUnread = node.serverIds.some((id) => unreadServerIds.has(id));
            const isFolderHovered = hoveredId === folderKey;
            const isFolderMergeTarget =
              dropHint?.kind === "merge-folder" && dropHint.folderId === node.id;
            const showTopLine =
              dropHint?.kind === "line" &&
              dropHint.targetKey === folderKey &&
              dropHint.position === "before";
            const showBottomLine =
              dropHint?.kind === "line" &&
              dropHint.targetKey === folderKey &&
              dropHint.position === "after";
            const isDraggingThisFolder =
              dragging?.kind === "folder" && dragging.folderId === node.id;

            const folderTooltip =
              node.name && node.name !== "Server Folder"
                ? node.name
                : folderServers.map((s) => s.name).join(", ");

            return (
              <motion.div
                key={node.id}
                layout
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const relY = (e.clientY - rect.top) / Math.max(1, rect.height);

                  if (dragging.kind === "server" && !node.expanded) {
                    if (relY >= 0.22 && relY <= 0.78) {
                      setDropHint({ kind: "merge-folder", folderId: node.id });
                    } else {
                      setDropHint({
                        kind: "line",
                        targetKey: folderKey,
                        position: relY < 0.5 ? "before" : "after",
                      });
                    }
                  } else if (dragging.kind === "folder") {
                    setDropHint({
                      kind: "line",
                      targetKey: folderKey,
                      position: relY < 0.5 ? "before" : "after",
                    });
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!dragging || !dropHint) {
                    clearDragState();
                    return;
                  }
                  if (dropHint.kind === "merge-folder" && dragging.kind === "server") {
                    commitLayout(
                      dropServerIntoFolder(railNodes, dragging.serverId, dropHint.folderId)
                    );
                  } else if (dropHint.kind === "line") {
                    commitLayout(
                      moveRailNodeRelative(
                        railNodes,
                        dragging,
                        dropHint.targetKey,
                        dropHint.position
                      )
                    );
                  }
                  clearDragState();
                }}
                className={`relative flex w-full flex-col items-center ${
                  isDraggingThisFolder ? "opacity-40" : ""
                }`}
              >
                {showTopLine && (
                  <span className="pointer-events-none absolute -top-1.5 left-3 right-3 z-20 h-0.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(var(--siq-accent-rgb)/0.85)]" />
                )}

                {!node.expanded ? (
                  <div className="relative flex w-full items-center justify-center">
                    {containsActive ? (
                      <motion.span
                        layoutId="server-rail-active-pill"
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        className="absolute left-0 h-9 w-1 rounded-r-full bg-emerald-400 shadow-[0_0_12px_rgb(var(--siq-accent-rgb)/0.65)]"
                      />
                    ) : (
                      <span
                        className={`absolute left-0 w-1 rounded-r-full bg-zinc-200 transition-all duration-200 ${
                          isFolderHovered
                            ? "h-5 opacity-90"
                            : containsUnread
                              ? "h-2 opacity-90"
                              : "h-0 opacity-0"
                        }`}
                      />
                    )}

                    <div
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", folderKey);
                        setDragging({ kind: "folder", folderId: node.id });
                        setHoveredId(null);
                      }}
                      onDragEnd={clearDragState}
                    >
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() =>
                          commitLayout(toggleFolderExpandedState(railNodes, node.id))
                        }
                        onContextMenu={(e) => handleFolderContextMenu(e, node)}
                        onMouseEnter={() => {
                          if (!dragging) setHoveredId(folderKey);
                        }}
                        onMouseLeave={() =>
                          setHoveredId((curr) => (curr === folderKey ? null : curr))
                        }
                        aria-label={`Open folder ${folderTooltip}`}
                        style={{
                          backgroundColor: `${node.color}22`,
                          borderColor: isFolderMergeTarget
                            ? node.color
                            : containsActive
                              ? `${node.color}70`
                              : `${node.color}36`,
                        }}
                        className={`siq-bezel-sm grid h-11 w-11 grid-cols-2 grid-rows-2 place-items-center gap-[3px] rounded-[16px] border p-[5px] transition-all duration-200 ${
                          isFolderMergeTarget
                            ? "scale-105 ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#070709]"
                            : ""
                        }`}
                      >
                        {folderServers.slice(0, 4).map((srv) => (
                          <span
                            key={srv.id}
                            style={
                              !srv.iconUrl
                                ? {
                                    backgroundColor: srv.accentColor,
                                    color: "#070709",
                                  }
                                : undefined
                            }
                            className="flex h-[15px] w-[15px] items-center justify-center overflow-hidden rounded-[5px] text-[7px] font-extrabold leading-none"
                          >
                            {srv.iconUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={srv.iconUrl}
                                alt={srv.name}
                                draggable={false}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              getInitials(srv.name).slice(0, 1)
                            )}
                          </span>
                        ))}
                      </motion.button>
                    </div>

                    <AnimatePresence>
                      {isFolderHovered && !dragging && (
                        <motion.div
                          initial={{ opacity: 0, x: -4, scale: 0.96 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: -3, scale: 0.96 }}
                          transition={{ duration: 0.12 }}
                          className="siq-bezel pointer-events-none fixed left-[74px] z-[80] flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/[0.11] bg-[#121319]/95 px-2.5 py-1.5 text-xs font-semibold text-zinc-100 backdrop-blur-md"
                        >
                          <Folder className="h-3.5 w-3.5" style={{ color: node.color }} />
                          <span dir="auto" className="max-w-[180px] truncate">
                            {folderTooltip}
                          </span>
                          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                            {folderServers.length}
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="relative flex w-full flex-col items-center">
                    <motion.div
                      layout
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      style={{
                        backgroundColor: `${node.color}14`,
                        borderColor: isFolderMergeTarget
                          ? node.color
                          : "rgba(255, 255, 255, 0.06)",
                      }}
                      className={`pointer-events-none absolute inset-y-0 left-1/2 w-[52px] -translate-x-1/2 rounded-[20px] border transition-colors ${
                        isFolderMergeTarget ? "ring-2 ring-emerald-400" : ""
                      }`}
                    />

                    <div className="relative z-10 flex w-full flex-col items-center gap-2 py-1">
                      <div
                        className="relative flex w-full items-center justify-center"
                        onDragOver={(e) => {
                          if (dragging?.kind === "server") {
                            e.preventDefault();
                            e.stopPropagation();
                            setDropHint({ kind: "merge-folder", folderId: node.id });
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (dragging?.kind === "server") {
                            commitLayout(
                              dropServerIntoFolder(railNodes, dragging.serverId, node.id)
                            );
                          }
                          clearDragState();
                        }}
                      >
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", folderKey);
                            setDragging({ kind: "folder", folderId: node.id });
                            setHoveredId(null);
                          }}
                          onDragEnd={clearDragState}
                        >
                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.92 }}
                            onClick={() =>
                              commitLayout(toggleFolderExpandedState(railNodes, node.id))
                            }
                            onContextMenu={(e) => handleFolderContextMenu(e, node)}
                            onMouseEnter={() => {
                              if (!dragging) setHoveredId(folderKey);
                            }}
                            onMouseLeave={() =>
                              setHoveredId((curr) => (curr === folderKey ? null : curr))
                            }
                            aria-label={`Collapse folder ${folderTooltip}`}
                            className="flex h-10 w-10 items-center justify-center rounded-[14px] transition-colors hover:bg-white/[0.06]"
                          >
                            <Folder
                              className="h-5 w-5 fill-current"
                              style={{ color: node.color }}
                            />
                          </motion.button>
                        </div>

                        <AnimatePresence>
                          {isFolderHovered && !dragging && (
                            <motion.div
                              initial={{ opacity: 0, x: -4, scale: 0.96 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              exit={{ opacity: 0, x: -3, scale: 0.96 }}
                              transition={{ duration: 0.12 }}
                              className="siq-bezel pointer-events-none fixed left-[74px] z-[80] flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/[0.11] bg-[#121319]/95 px-2.5 py-1.5 text-xs font-semibold text-zinc-100 backdrop-blur-md"
                            >
                              <FolderOpen
                                className="h-3.5 w-3.5"
                                style={{ color: node.color }}
                              />
                              <span dir="auto" className="max-w-[180px] truncate">
                                {folderTooltip}
                              </span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <AnimatePresence initial={false}>
                        {folderServers.map((srv) =>
                          renderServerButton(srv, { insideFolderId: node.id })
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {showBottomLine && (
                  <span className="pointer-events-none absolute -bottom-1.5 left-3 right-3 z-20 h-0.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(var(--siq-accent-rgb)/0.85)]" />
                )}
              </motion.div>
            );
          })}

          {/* Add / Join Server Button */}
          <div className="relative mt-0.5 flex w-full items-center justify-center">
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.93 }}
              onClick={onOpenCreateJoin}
              onMouseEnter={() => setHoveredId("add-server")}
              onMouseLeave={() =>
                setHoveredId((curr) => (curr === "add-server" ? null : curr))
              }
              aria-label="Create or join a server"
              className="flex h-11 w-11 items-center justify-center rounded-[22px] border border-dashed border-white/[0.15] bg-[#111216] text-emerald-400 transition-all duration-200 hover:rounded-[15px] hover:border-emerald-500/60 hover:bg-emerald-500 hover:text-zinc-950"
            >
              <Plus className="h-5 w-5" />
            </motion.button>

            <AnimatePresence>
              {hoveredId === "add-server" && !dragging && (
                <motion.div
                  initial={{ opacity: 0, x: -4, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -3, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="siq-bezel pointer-events-none fixed left-[74px] z-[80] whitespace-nowrap rounded-lg border border-white/[0.11] bg-[#121319]/95 px-2.5 py-1.5 text-xs font-semibold text-zinc-100 backdrop-blur-md"
                >
                  Create or Join Server
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>

      {/* Folder Customization Modal (Rename + Color) */}
      <AnimatePresence>
        {editingFolder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEditingFolder(null)}
            className="fixed inset-0 z-[105] flex items-center justify-center bg-black/75 p-4 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-label="Folder settings"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 6 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="siq-bezel w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.11] bg-[#121319] p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Folder
                    className="h-4 w-4 fill-current"
                    style={{ color: folderColorDraft }}
                  />
                  <h3 className="text-sm font-semibold text-zinc-100">Folder Settings</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingFolder(null)}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-300">
                    Folder Name
                  </label>
                  <input
                    type="text"
                    dir="auto"
                    value={folderNameDraft}
                    maxLength={32}
                    onChange={(e) => setFolderNameDraft(e.target.value)}
                    placeholder="Gaming, Work, Friends..."
                    className="w-full rounded-xl border border-white/[0.1] bg-[#181920] px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/60 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-300">
                    Folder Color
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {FOLDER_COLOR_PALETTE.map((c) => {
                      const active = folderColorDraft === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setFolderColorDraft(c)}
                          style={{ backgroundColor: c }}
                          className={`flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110 ${
                            active ? "ring-2 ring-white ring-offset-2 ring-offset-[#121319]" : ""
                          }`}
                        >
                          {active && <Check className="h-3.5 w-3.5 stroke-[3] text-zinc-950" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/[0.07] pt-3.5">
                <button
                  type="button"
                  onClick={() => {
                    commitLayout(ungroupFolderNode(railNodes, editingFolder.id));
                    setEditingFolder(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
                >
                  <Ungroup className="h-3.5 w-3.5" />
                  <span>Ungroup</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    commitLayout(
                      updateFolderSettings(railNodes, editingFolder.id, {
                        name: folderNameDraft,
                        color: folderColorDraft,
                      })
                    );
                    setEditingFolder(null);
                  }}
                  className="rounded-xl bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
                >
                  Save Folder
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
