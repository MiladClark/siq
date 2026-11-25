const LAYOUT_STORAGE_KEY = "siq_server_rail_layout_v1";

export function loadServerTabOrder(): string[] {
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return [];
    const nodes: unknown = JSON.parse(raw);
    if (!Array.isArray(nodes)) return [];

    // Older layouts store several servers together in a folder.
    return nodes.flatMap((node) => {
      if (node?.kind === "server" && typeof node.serverId === "string") {
        return [node.serverId];
      }
      if (node?.kind === "folder" && Array.isArray(node.serverIds)) {
        return node.serverIds.filter((id: unknown): id is string => typeof id === "string");
      }
      return [];
    });
  } catch {
    return [];
  }
}

export function saveServerTabOrder(serverIds: string[]): void {
  try {
    const nodes = serverIds.map((serverId) => ({ kind: "server", serverId }));
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(nodes));
  } catch {
    // The order still applies until reload if browser storage is unavailable.
  }
}
