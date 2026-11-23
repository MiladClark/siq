import type {
  ChannelItem,
  RoleItem,
  RolePermissions,
  ServerDetail,
} from "@/lib/types";

export interface EffectivePermissions {
  administrator: boolean;
  manageServer: boolean;
  manageChannels: boolean;
  manageRoles: boolean;
  createInvites: boolean;
  kickMembers: boolean;
  muteMembers: boolean;
  manageMessages: boolean;
  sendMessages: boolean;
  connectVoice: boolean;
  streamScreen: boolean;
}

export const ALL_PERMISSIONS_TRUE: EffectivePermissions = {
  administrator: true,
  manageServer: true,
  manageChannels: true,
  manageRoles: true,
  createInvites: true,
  kickMembers: true,
  muteMembers: true,
  manageMessages: true,
  sendMessages: true,
  connectVoice: true,
  streamScreen: true,
};

export const EMPTY_PERMISSIONS: EffectivePermissions = {
  administrator: false,
  manageServer: false,
  manageChannels: false,
  manageRoles: false,
  createInvites: false,
  kickMembers: false,
  muteMembers: false,
  manageMessages: false,
  sendMessages: true,
  connectVoice: true,
  streamScreen: true,
};

export function computeEffectivePermissions(params: {
  userId: string;
  ownerId: string | null;
  serverRoles: Array<{ id: string; isDefault: boolean; permissions: RolePermissions }>;
  assignedRoleIds: string[];
}): EffectivePermissions {
  if (params.ownerId && params.ownerId === params.userId) {
    return ALL_PERMISSIONS_TRUE;
  }

  const assignedSet = new Set(params.assignedRoleIds);
  const matchingRoles = params.serverRoles.filter(
    (r) => r.isDefault || assignedSet.has(r.id)
  );

  if (matchingRoles.some((r) => r.permissions?.administrator)) {
    return ALL_PERMISSIONS_TRUE;
  }

  const merged: EffectivePermissions = {
    administrator: false,
    manageServer: false,
    manageChannels: false,
    manageRoles: false,
    createInvites: false,
    kickMembers: false,
    muteMembers: false,
    manageMessages: false,
    sendMessages: false,
    connectVoice: false,
    streamScreen: false,
  };

  for (const r of matchingRoles) {
    const p = r.permissions ?? {};
    if (p.manageServer) merged.manageServer = true;
    if (p.manageChannels) merged.manageChannels = true;
    if (p.manageRoles) merged.manageRoles = true;
    if (p.createInvites) merged.createInvites = true;
    if (p.kickMembers) merged.kickMembers = true;
    if (p.muteMembers) merged.muteMembers = true;
    if (p.manageMessages) merged.manageMessages = true;
    if (p.sendMessages) merged.sendMessages = true;
    if (p.connectVoice) merged.connectVoice = true;
    if (p.streamScreen) merged.streamScreen = true;
  }

  // Fallback if server has no @everyone role configured yet
  if (matchingRoles.length === 0) {
    return EMPTY_PERMISSIONS;
  }

  return merged;
}

export function canUserAccessChannel(params: {
  channel: Pick<ChannelItem, "isPrivate" | "allowedRoleIds">;
  permissions: EffectivePermissions;
  assignedRoleIds: string[];
}): boolean {
  if (!params.channel.isPrivate) return true;
  if (params.permissions.administrator || params.permissions.manageChannels) {
    return true;
  }
  const allowed = params.channel.allowedRoleIds ?? [];
  if (allowed.length === 0) return false;
  return params.assignedRoleIds.some((rid) => allowed.includes(rid));
}

export function getMemberRolesInServer(
  server: ServerDetail,
  userId: string
): RoleItem[] {
  const ids = new Set(server.memberRoleIds[userId] ?? []);
  return server.roles
    .filter((r) => !r.isDefault && ids.has(r.id))
    .sort((a, b) => b.position - a.position);
}

export const PERMISSION_DEFINITIONS: Array<{
  key: keyof RolePermissions;
  label: string;
  description: string;
}> = [
  {
    key: "administrator",
    label: "Administrator",
    description: "Grants every permission and bypasses private channel locks.",
  },
  {
    key: "manageServer",
    label: "Manage Server",
    description: "Edit server name, icon, banner, tag, and accent color.",
  },
  {
    key: "manageChannels",
    label: "Manage Channels",
    description: "Create, edit, lock, and delete text/voice channels and categories.",
  },
  {
    key: "manageRoles",
    label: "Manage Roles",
    description: "Create, edit, delete roles and assign them to members.",
  },
  {
    key: "createInvites",
    label: "Create Invites",
    description: "Generate invite codes and links for friends to join this server.",
  },
  {
    key: "kickMembers",
    label: "Kick Members",
    description: "Kick users from voice channels or remove them from the server.",
  },
  {
    key: "muteMembers",
    label: "Server Mute Voice",
    description: "Server-mute members inside voice channels.",
  },
  {
    key: "manageMessages",
    label: "Manage Messages",
    description: "Pin, unpin, or delete messages sent by other members.",
  },
  {
    key: "sendMessages",
    label: "Send Messages",
    description: "Post messages and upload attachments in text channels.",
  },
  {
    key: "connectVoice",
    label: "Connect to Voice",
    description: "Join and speak in voice channels.",
  },
  {
    key: "streamScreen",
    label: "Share Screen & Video",
    description: "Broadcast screen share or webcam inside voice channels.",
  },
];
