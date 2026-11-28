"use client";

import { mediaUrl } from "@/lib/client-api";
import { MessageCircle, X } from "lucide-react";
import { AnimatePresence, motion, Reorder } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatedIconButton } from "@siq/shared/components/ui/AnimatedIcon";
import { SiqMark } from "@siq/shared/components/ui/SiqMark";
import { PlusIcon } from "@siq/shared/components/ui/animated-icons/plus";
import { loadServerTabOrder, saveServerTabOrder } from "@siq/shared/lib/server-folders";
import type { ServerDetail } from "@siq/shared/lib/types";

interface ServerRailProps {
  servers: ServerDetail[];
  activeTab: "home" | "server";
  activeServerId: string | null;
  homeBadgeCount: number;
  unreadServerIds: Set<string>;
  onSelectHome: () => void;
  onSelectServer: (serverId: string) => void;
  onOpenCreateJoin: () => void;
  onCloseNavigation: () => void;
  windowDrag?: boolean;
  onServerContextMenu?: (e: React.MouseEvent<HTMLElement>, server: ServerDetail) => void;
}

interface ActiveEdge {
  top: number;
  height: number;
  clipTop: number;
  clipBottom: number;
  instant: boolean;
}

interface RailTip {
  label: string;
  sub?: string;
  top: number;
  left: number;
}

/** Server tiles are painted with a lit gradient of their accent colour */
function tileStyle(accent: string): React.CSSProperties {
  return {
    background: `linear-gradient(150deg, color-mix(in srgb, ${accent} 88%, white 12%), color-mix(in srgb, ${accent} 58%, #050507 42%))`,
    color: "#fff",
    textShadow: "0 1px 2px rgb(0 0 0 / 0.45)",
  };
}

function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "SQ";
}

export function ServerRail({
  servers,
  activeTab,
  activeServerId,
  homeBadgeCount,
  unreadServerIds,
  onSelectHome,
  onSelectServer,
  onOpenCreateJoin,
  onCloseNavigation,
  windowDrag,
  onServerContextMenu,
}: ServerRailProps) {
  const [savedOrder, setSavedOrder] = useState<string[]>([]);
  const [canDrag, setCanDrag] = useState(false);
  const [activeEdge, setActiveEdge] = useState<ActiveEdge | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const serverListRef = useRef<HTMLDivElement | null>(null);
  const reorderAreaRef = useRef<HTMLUListElement | null>(null);
  const draggedByPointer = useRef(false);
  const orderToSave = useRef<string[] | null>(null);
  const [tip, setTip] = useState<RailTip | null>(null);

  const showTip = (event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>, label: string, sub?: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({ label, sub, top: rect.top + rect.height / 2, left: rect.right + 10 });
  };
  const hideTip = () => setTip(null);

  useEffect(() => {
    setSavedOrder(loadServerTabOrder());
    const desktop = window.matchMedia("(min-width: 48rem)");
    const syncDrag = () => setCanDrag(desktop.matches);
    syncDrag();
    desktop.addEventListener("change", syncDrag);
    return () => desktop.removeEventListener("change", syncDrag);
  }, []);

  const orderedServers = useMemo(() => {
    const serverById = new Map(servers.map((server) => [server.id, server]));
    const ids = new Set([...savedOrder, ...serverById.keys()]);
    return Array.from(ids, (id) => serverById.get(id)).filter(
      (server): server is ServerDetail => server !== undefined
    );
  }, [savedOrder, servers]);

  useLayoutEffect(() => {
    const rail = railRef.current;
    const list = serverListRef.current;
    const active = rail?.querySelector<HTMLButtonElement>('button[aria-current="page"]');
    if (!rail || !list || !active) {
      setActiveEdge(null);
      return;
    }
    const inServerList = list.contains(active);

    const measure = (instant: boolean) => {
      // Layout offsets stay stable while the server rows animate a drag reorder.
      let top = 0;
      for (
        let node: HTMLElement | null = active;
        node && node !== rail;
        node = node.offsetParent as HTMLElement | null
      ) {
        top += node.offsetTop;
      }
      const height = active.offsetHeight;
      const listTop = list.offsetTop;
      if (inServerList) top -= list.scrollTop;
      const clipTop = inServerList ? Math.min(height, Math.max(0, listTop - top)) : 0;
      const clipBottom = inServerList
        ? Math.min(height, Math.max(0, top + height - listTop - list.clientHeight))
        : 0;

      setActiveEdge((previous) =>
        previous?.top === top && previous.height === height &&
        previous.clipTop === clipTop && previous.clipBottom === clipBottom
          ? previous
          : { top, height, clipTop, clipBottom, instant }
      );
    };

    measure(false);
    const syncPosition = () => measure(true);
    const observer = new ResizeObserver(syncPosition);
    observer.observe(rail);
    observer.observe(list);
    observer.observe(active);
    list.addEventListener("scroll", syncPosition, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", syncPosition);
    };
  }, [activeTab, activeServerId, orderedServers]);

  function reorderServers(next: string[]) {
    orderToSave.current = next;
    setSavedOrder(next);
  }

  function finishReorder() {
    if (orderToSave.current) saveServerTabOrder(orderToSave.current);
    orderToSave.current = null;
  }

  return (
    <nav ref={railRef} aria-label="Workspace tabs" className="siq-workspace-tabs"
      data-tauri-drag-region={windowDrag ? "deep" : undefined}
    >
      {activeEdge && (
        <span
          aria-hidden="true"
          className="siq-workspace-active-edge"
          data-instant={activeEdge.instant}
          style={{
            height: activeEdge.height,
            transform: `translateY(${activeEdge.top}px)`,
            clipPath: `inset(${activeEdge.clipTop}px 0 ${activeEdge.clipBottom}px 0)`,
          }}
        />
      )}
      <div className="grid h-9 w-full shrink-0 place-items-center pr-px md:h-12">
        <SiqMark className="text-[19px]" />
      </div>
      <button type="button" aria-label="Close navigation" onClick={onCloseNavigation} className="siq-workspace-tab siq-close-navigation">
        <X aria-hidden="true" className="size-5" />
      </button>

      <button
        type="button"
        aria-label="Direct Messages & Friends"
        aria-current={activeTab === "home" ? "page" : undefined}
        onClick={onSelectHome}
        onMouseEnter={(e) => showTip(e, "Direct Messages", homeBadgeCount > 0 ? `${homeBadgeCount} unread` : "Friends & DMs")}
        onMouseLeave={hideTip}
        onFocus={(e) => showTip(e, "Direct Messages")}
        onBlur={hideTip}
        className="siq-workspace-tab"
      >
        <span aria-hidden="true" className="siq-rail-icon siq-rail-home">
          <MessageCircle className="h-[19px] w-[19px]" strokeWidth={2.2} />
        </span>
        {homeBadgeCount > 0 && (
          <span key={homeBadgeCount} className="siq-rail-badge tabular-nums">
            {homeBadgeCount > 9 ? "9+" : homeBadgeCount}
          </span>
        )}
      </button>
      <span aria-hidden="true" className="siq-rail-divider" />

      <motion.div
        ref={serverListRef}
        layoutScroll
        className="flex min-h-0 w-full flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {orderedServers.length > 0 && (
          <Reorder.Group
            ref={reorderAreaRef}
            axis="y"
            values={orderedServers.map((server) => server.id)}
            onReorder={reorderServers}
            onPointerDownCapture={() => { draggedByPointer.current = false; }}
            onClickCapture={(event) => {
              if (draggedByPointer.current && event.detail > 0) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            className="relative flex shrink-0 flex-col gap-1.5"
          >
            {orderedServers.map((server) => (
              <Reorder.Item
                key={server.id}
                value={server.id}
                tabIndex={-1}
                data-tauri-drag-region={windowDrag ? "false" : undefined}
                layout="position"
                drag={canDrag ? "y" : false}
                dragConstraints={reorderAreaRef}
                dragElastic={0}
                dragMomentum={false}
                onDragStart={() => { draggedByPointer.current = true; }}
                onDragEnd={finishReorder}
                transition={{ type: "spring", stiffness: 460, damping: 34 }}
                className="relative"
              >
                <button
                  type="button"
                  draggable={false}
                  onClick={() => onSelectServer(server.id)}
                  onContextMenu={(event) => onServerContextMenu?.(event, server)}
                  aria-label={server.name}
                  aria-current={activeTab === "server" && activeServerId === server.id ? "page" : undefined}
                  onMouseEnter={(e) =>
                    showTip(e, server.name, unreadServerIds.has(server.id) ? "New messages" : server.tag ?? undefined)
                  }
                  onMouseLeave={hideTip}
                  onFocus={(e) => showTip(e, server.name)}
                  onBlur={hideTip}
                  onPointerDown={hideTip}
                  className="siq-workspace-tab"
                >
                  <span
                    aria-hidden="true"
                    className="siq-rail-icon"
                    style={server.iconUrl ? undefined : tileStyle(server.accentColor)}
                  >
                    {server.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(server.iconUrl)} alt="" draggable={false} className="size-full object-cover" />
                    ) : (
                      getInitials(server.name)
                    )}
                  </span>
                  {unreadServerIds.has(server.id) && (
                    <span className="siq-workspace-tab-dot" aria-label="Unread" />
                  )}
                </button>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}

        <AnimatedIconButton
          type="button"
          icon={PlusIcon}
          iconSize={19}
          iconClassName="siq-rail-icon siq-rail-add"
          onClick={onOpenCreateJoin}
          onMouseEnter={(e) => showTip(e, "Create or join a server")}
          onMouseLeave={hideTip}
          aria-label="Create or join a server"
          className="siq-workspace-tab"
        />
      </motion.div>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {tip && (
              <motion.div
                key={tip.label}
                role="tooltip"
                initial={{ opacity: 0, x: -8, scale: 0.92 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -6, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 520, damping: 32 }}
                className="siq-rail-tooltip siq-glass"
                style={{ top: tip.top, left: tip.left, translateY: "-50%" }}
              >
                <span>{tip.label}</span>
                {tip.sub && <span className="text-[11px] font-medium text-zinc-400">{tip.sub}</span>}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </nav>
  );
}
