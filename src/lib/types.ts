export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
  role: "admin" | "member";
  lastSeenAt: string;
  createdAt: string;
}

export interface ChannelItem {
  id: string;
  name: string;
  slug: string;
  type: "text" | "voice";
  description: string | null;
  position: number;
  createdById?: string | null;
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

export interface MessageItem {
  id: string;
  channelId: string;
  content: string;
  replyToId: string | null;
  replyTo: MessageReplyPreview | null;
  attachments: MessageAttachment[];
  editedAt: string | null;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarColor: string;
    role: "admin" | "member";
  };
}

export interface VoiceParticipantSummary {
  identity: string;
  name: string;
  username?: string;
  avatarColor: string;
}

export type VoiceOccupancyMap = Record<string, VoiceParticipantSummary[]>;

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
