"use client";

export interface ServerFolderNode {
  kind: "folder";
  id: string;
  name: string;
  color: string;
  serverIds: string[];
  expanded: boolean;
}

export interface ServerSingleNode {
  kind: "server";
  serverId: string;
}

export type ServerRailNode = ServerSingleNode | ServerFolderNode;

export const FOLDER_COLOR_PALETTE = [
  "#10B981",
  "#06B6D4",
  "#4C9AFF",
  "#7C83FF",
  "#9D7BFA",
  "#F97316",
  "#F59E0B",
  "#F43F5E",
] as const;

const LAYOUT_STORAGE_KEY = "siq_server_rail_layout_v1";

export function loadServerRailLayout(): ServerRailNode[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ServerRailNode[];
  } catch {
    return [];
  }
}

export function saveServerRailLayout(nodes: ServerRailNode[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(nodes));
  } catch {
    // ignore quota errors
  }
}

/**
 * Reconciles saved folder/order layout with the live server list:
 * - Drops deleted/left server IDs
 * - Unwraps folders that end up with < 2 servers (unless user explicitly kept 1) -> unwraps empty folders
 * - Appends any newly joined/created servers at the bottom
 */
export function reconcileServerRailLayout(
  saved: ServerRailNode[],
  liveServerIds: string[]
): ServerRailNode[] {
  const liveSet = new Set(liveServerIds);
  const placed = new Set<string>();
  const cleaned: ServerRailNode[] = [];

  for (const node of saved) {
    if (node.kind === "server") {
      if (liveSet.has(node.serverId) && !placed.has(node.serverId)) {
        placed.add(node.serverId);
        cleaned.push({ kind: "server", serverId: node.serverId });
      }
    } else if (node.kind === "folder") {
      const validIds = node.serverIds.filter((id) => liveSet.has(id) && !placed.has(id));
      for (const id of validIds) placed.add(id);
      if (validIds.length >= 2) {
        cleaned.push({
          ...node,
          serverIds: validIds,
        });
      } else if (validIds.length === 1) {
        // Auto-unwrap single leftover server just like Discord
        cleaned.push({ kind: "server", serverId: validIds[0] });
      }
    }
  }

  for (const id of liveServerIds) {
    if (!placed.has(id)) {
      cleaned.push({ kind: "server", serverId: id });
    }
  }

  return cleaned;
}

/** Remove a serverId from wherever it currently lives (top-level or inside a folder) */
function extractServer(
  nodes: ServerRailNode[],
  serverId: string
): ServerRailNode[] {
  const result: ServerRailNode[] = [];
  for (const node of nodes) {
    if (node.kind === "server") {
      if (node.serverId !== serverId) result.push(node);
    } else {
      const remaining = node.serverIds.filter((id) => id !== serverId);
      if (remaining.length >= 2) {
        result.push({ ...node, serverIds: remaining });
      } else if (remaining.length === 1) {
        result.push({ kind: "server", serverId: remaining[0] });
      }
    }
  }
  return result;
}

/** Dragging server A onto standalone server B creates a new folder grouping [B, A] */
export function mergeServersIntoNewFolder(
  nodes: ServerRailNode[],
  draggedServerId: string,
  targetServerId: string,
  defaultColor = "#10B981"
): ServerRailNode[] {
  if (draggedServerId === targetServerId) return nodes;
  const withoutDragged = extractServer(nodes, draggedServerId);
  const newFolderId = `fld-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  return withoutDragged.map((node) => {
    if (node.kind === "server" && node.serverId === targetServerId) {
      return {
        kind: "folder",
        id: newFolderId,
        name: "Server Folder",
        color: defaultColor,
        serverIds: [targetServerId, draggedServerId],
        expanded: true,
      } satisfies ServerFolderNode;
    }
    return node;
  });
}

/** Dragging a server onto an existing folder adds it inside that folder */
export function dropServerIntoFolder(
  nodes: ServerRailNode[],
  draggedServerId: string,
  targetFolderId: string
): ServerRailNode[] {
  // Check if already in target folder
  const existingFolder = nodes.find(
    (n) => n.kind === "folder" && n.id === targetFolderId
  ) as ServerFolderNode | undefined;
  if (!existingFolder || existingFolder.serverIds.includes(draggedServerId)) {
    return nodes;
  }

  const withoutDragged = extractServer(nodes, draggedServerId);
  return withoutDragged.map((node) => {
    if (node.kind === "folder" && node.id === targetFolderId) {
      return {
        ...node,
        serverIds: [...node.serverIds, draggedServerId],
      };
    }
    return node;
  });
}

/** Reorder a dragged server or folder before/after a target top-level node key */
export function moveRailNodeRelative(
  nodes: ServerRailNode[],
  dragPayload: { kind: "server"; serverId: string } | { kind: "folder"; folderId: string },
  targetKey: string,
  position: "before" | "after"
): ServerRailNode[] {
  let movingNode: ServerRailNode | null = null;
  let remaining: ServerRailNode[];
  let effectiveTargetKey = targetKey;

  if (dragPayload.kind === "server") {
    if (targetKey === `server:${dragPayload.serverId}`) return nodes;
    // If dragging out of a 2-server folder onto that same folder's edge, keep placement adjacent to the remaining sibling
    if (targetKey.startsWith("folder:")) {
      const targetFolderId = targetKey.slice("folder:".length);
      const sourceFolder = nodes.find(
        (n) =>
          n.kind === "folder" &&
          n.id === targetFolderId &&
          n.serverIds.includes(dragPayload.serverId)
      ) as ServerFolderNode | undefined;
      if (sourceFolder && sourceFolder.serverIds.length === 2) {
        const siblingId = sourceFolder.serverIds.find(
          (id) => id !== dragPayload.serverId
        );
        if (siblingId) {
          effectiveTargetKey = `server:${siblingId}`;
        }
      }
    }
    movingNode = { kind: "server", serverId: dragPayload.serverId };
    remaining = extractServer(nodes, dragPayload.serverId);
  } else {
    if (targetKey === `folder:${dragPayload.folderId}`) return nodes;
    const found = nodes.find(
      (n) => n.kind === "folder" && n.id === dragPayload.folderId
    );
    if (!found) return nodes;
    movingNode = found;
    remaining = nodes.filter(
      (n) => !(n.kind === "folder" && n.id === dragPayload.folderId)
    );
  }

  const targetIndex = remaining.findIndex((n) =>
    n.kind === "server"
      ? `server:${n.serverId}` === effectiveTargetKey
      : `folder:${n.id}` === effectiveTargetKey
  );

  if (targetIndex === -1) {
    return [...remaining, movingNode];
  }

  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  const next = [...remaining];
  next.splice(insertIndex, 0, movingNode);
  return next;
}

/** Reorder a server within an expanded folder (or drop an external server at a specific slot inside it) */
export function reorderServerInsideFolder(
  nodes: ServerRailNode[],
  draggedServerId: string,
  folderId: string,
  targetServerId: string,
  position: "before" | "after"
): ServerRailNode[] {
  if (draggedServerId === targetServerId) return nodes;

  const targetFolder = nodes.find(
    (n) => n.kind === "folder" && n.id === folderId
  ) as ServerFolderNode | undefined;
  if (!targetFolder) return nodes;

  // Same-folder reorder: mutate serverIds directly so 2-server folders are never prematurely unwrapped
  if (targetFolder.serverIds.includes(draggedServerId)) {
    return nodes.map((node) => {
      if (node.kind !== "folder" || node.id !== folderId) return node;
      const without = node.serverIds.filter((id) => id !== draggedServerId);
      const idx = without.indexOf(targetServerId);
      if (idx === -1) {
        return { ...node, serverIds: [...without, draggedServerId] };
      }
      const insertIdx = position === "before" ? idx : idx + 1;
      without.splice(insertIdx, 0, draggedServerId);
      return { ...node, serverIds: without };
    });
  }

  const withoutDragged = extractServer(nodes, draggedServerId);
  return withoutDragged.map((node) => {
    if (node.kind !== "folder" || node.id !== folderId) return node;
    const idx = node.serverIds.indexOf(targetServerId);
    if (idx === -1) {
      return { ...node, serverIds: [...node.serverIds, draggedServerId] };
    }
    const insertIdx = position === "before" ? idx : idx + 1;
    const nextIds = [...node.serverIds];
    nextIds.splice(insertIdx, 0, draggedServerId);
    return { ...node, serverIds: nextIds };
  });
}

export function toggleFolderExpandedState(
  nodes: ServerRailNode[],
  folderId: string
): ServerRailNode[] {
  return nodes.map((n) =>
    n.kind === "folder" && n.id === folderId ? { ...n, expanded: !n.expanded } : n
  );
}

export function updateFolderSettings(
  nodes: ServerRailNode[],
  folderId: string,
  patch: { name?: string; color?: string }
): ServerRailNode[] {
  return nodes.map((n) =>
    n.kind === "folder" && n.id === folderId
      ? {
          ...n,
          name: patch.name !== undefined ? patch.name.trim() || "Server Folder" : n.name,
          color: patch.color ?? n.color,
        }
      : n
  );
}

export function ungroupFolderNode(
  nodes: ServerRailNode[],
  folderId: string
): ServerRailNode[] {
  const result: ServerRailNode[] = [];
  for (const n of nodes) {
    if (n.kind === "folder" && n.id === folderId) {
      for (const sid of n.serverIds) {
        result.push({ kind: "server", serverId: sid });
      }
    } else {
      result.push(n);
    }
  }
  return result;
}
