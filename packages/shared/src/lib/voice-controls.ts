export interface VoiceControls {
  syncState(state: {
    inVoice: boolean;
    muted: boolean;
    deafened: boolean;
    channelName: string | null;
  }): Promise<void>;
  subscribe(handlers: {
    onToggleMute: () => void;
    onToggleDeafen: () => void;
  }): Promise<() => void>;
}
