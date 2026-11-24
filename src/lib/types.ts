export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";

/** Public profile visible to all workspace members — NEVER includes email. */
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  presenceStatus: PresenceStatus;
  customActivity: string | null;
  role: "admin" | "member";
  lastSeenAt: string;
  createdAt: string;
}

/** Private profile visible ONLY to the authenticated user themselves. */
export interface PrivateUser extends PublicUser {
  email: string | null;
}

export interface RolePermissions {
  administrator?: boolean;
  manageServer?: boolean;
  manageChannels?: boolean;
  manageRoles?: boolean;
  createInvites?: boolean;
  kickMembers?: boolean;
  muteMembers?: boolean;
  manageMessages?: boolean;
  sendMessages?: boolean;
  connectVoice?: boolean;
  streamScreen?: boolean;
}

export interface RoleItem {
  id: string;
  serverId: string;
  name: string;
  color: string;
  position: number;
  permissions: RolePermissions;
  isDefault: boolean;
}

export interface CategoryItem {
  id: string;
  serverId: string;
  name: string;
  position: number;
}

export interface ChannelItem {
  id: string;
  serverId?: string | null;
  categoryId?: string | null;
  name: string;
  slug: string;
  type: "text" | "voice";
  description: string | null;
  isPrivate?: boolean;
  allowedRoleIds?: string[];
  position: number;
  createdById?: string | null;
}

export interface ServerDetail {
  id: string;
  name: string;
  tag: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
  accentColor: string;
  ownerId: string | null;
  isDefault: boolean;
  createdAt: string;
  categories: CategoryItem[];
  channels: ChannelItem[];
  roles: RoleItem[];
  memberIds: string[];
  /** userId -> assigned non-default role IDs */
  memberRoleIds: Record<string, string[]>;
}

export type FriendshipStatus = "pending" | "accepted" | "blocked";

export interface FriendItem {
  friendshipId: string;
  status: FriendshipStatus;
  direction: "friend" | "incoming" | "outgoing" | "blocked";
  user: PublicUser;
  createdAt: string;
}

export interface DmConversationItem {
  id: string;
  peer: PublicUser;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastMessageAuthorId: string | null;
  createdAt: string;
}

export interface MessageAttachment {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

export interface MessageReplyPreview {
  id: string;
  content: string;
  authorDisplayName: string;
  hasAttachments: boolean;
}

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
  reactedByMe: boolean;
}

export interface MessageItem {
  id: string;
  channelId: string | null;
  dmConversationId?: string | null;
  content: string;
  replyToId: string | null;
  replyTo: MessageReplyPreview | null;
  attachments: MessageAttachment[];
  pinned: boolean;
  pinnedAt: string | null;
  reactions: MessageReactionSummary[];
  editedAt: string | null;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarColor: string;
    avatarUrl: string | null;
    bannerUrl?: string | null;
    role: "admin" | "member";
  };
}

export interface VoiceParticipantSummary {
  identity: string;
  name: string;
  username?: string;
  avatarColor: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  isScreenSharing?: boolean;
  isCameraOn?: boolean;
  joinedAt?: number | null;
}

export interface IncomingCallItem {
  dmConversationId: string;
  roomName: string;
  caller: PublicUser;
  withVideo: boolean;
  startedAtMs: number;
}

export type VoiceOccupancyMap = Record<string, VoiceParticipantSummary[]>;
export type VoiceRoomCreatedAtMap = Record<string, number>;

export type NotificationKind = "message" | "error" | "warning" | "info" | "success";

export interface NotificationItem {
  id: string;
  kind?: NotificationKind;
  mentioned?: boolean;
  channelId: string;
  dmConversationId?: string | null;
  serverId?: string | null;
  channelName: string;
  authorId: string;
  authorDisplayName: string;
  authorAvatarColor: string;
  authorAvatarUrl: string | null;
  content: string;
  hasAttachments: boolean;
  createdAt: string;
  read: boolean;
}

export interface VoiceNetworkSample {
  timestamp: number;
  pingMs: number;
}

export interface VoiceNetworkStats {
  lastPingMs: number | null;
  avgPingMs: number | null;
  packetLossPct: number | null;
  history: VoiceNetworkSample[];
  serverHost: string;
  transport: string | null;
  joinTiming: { tokenMs: number; connectMs: number } | null;
}

export const AVATAR_PALETTE = [
  "#10B981", // Emerald
  "#0EA5E9", // Sky
  "#F59E0B", // Amber
  "#F43F5E", // Rose
  "#14B8A6", // Teal
  "#EAB308", // Yellow
  "#EC4899", // Pink
  "#84CC16", // Lime
] as const;

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
