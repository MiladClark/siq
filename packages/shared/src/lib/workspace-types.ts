import type {
  DmConversationItem,
  FriendItem,
  PublicUser,
  ServerDetail,
  VoiceOccupancyMap,
  VoiceRoomCreatedAtMap,
} from "./types";

export interface AuthBootstrapState {
  dbConfigured: boolean;
  schemaReady: boolean;
  hasUsers: boolean;
  dbError?: string;
}

export interface WorkspaceInitialData {
  servers: ServerDetail[];
  friends: FriendItem[];
  dmConversations: DmConversationItem[];
  members: PublicUser[];
  voiceOccupancy: VoiceOccupancyMap;
  voiceRoomCreatedAt: VoiceRoomCreatedAtMap;
  capabilities: {
    livekitReady: boolean;
    blobReady: boolean;
  };
}
