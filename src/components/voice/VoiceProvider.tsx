"use client";

import {
  ConnectionState,
  LocalParticipant,
  Participant,
  RemoteAudioTrack,
  RemoteParticipant,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
} from "livekit-client";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RemoteAudioPlayer } from "@/components/voice/AudioRenderer";
import { pickAvatarColor, type ChannelItem } from "@/lib/types";

export type ScreenSharePreset = "1080p60" | "1080p30" | "720p30";

export interface VoiceParticipantView {
  identity: string;
  name: string;
  username?: string;
  avatarColor: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  cameraTrack: Track | null;
  screenTrack: Track | null;
  screenAudioTrack: RemoteAudioTrack | null;
  micAudioTrack: RemoteAudioTrack | null;
}

interface MediaDevicesList {
  audioInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
}

interface VoiceContextValue {
  activeChannel: ChannelItem | null;
  connectionState: ConnectionState;
  error: string | null;
  participants: VoiceParticipantView[];
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  screenPreset: ScreenSharePreset;
  setScreenPreset: (preset: ScreenSharePreset) => void;
  noiseSuppression: boolean;
  toggleNoiseSuppression: () => Promise<void>;
  devices: MediaDevicesList;
  selectedAudioInput: string;
  selectedAudioOutput: string;
  selectedVideoInput: string;
  setAudioInput: (deviceId: string) => Promise<void>;
  setAudioOutput: (deviceId: string) => void;
  setVideoInput: (deviceId: string) => Promise<void>;
  refreshDevices: () => Promise<void>;
  userVolumes: Record<string, number>;
  setUserVolume: (identity: string, volume: number) => void;
  joinVoiceChannel: (channel: ChannelItem) => Promise<void>;
  leaveVoiceChannel: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  clearError: () => void;
}

const VOLUME_STORAGE_KEY = "siq_user_volumes_v1";

const VoiceContext = createContext<VoiceContextValue | null>(null);

function parseParticipantMeta(p: Participant): {
  username?: string;
  avatarColor: string;
} {
  if (p.metadata) {
    try {
      const parsed = JSON.parse(p.metadata) as {
        username?: string;
        avatarColor?: string;
      };
      return {
        username: parsed.username,
        avatarColor: parsed.avatarColor || pickAvatarColor(p.identity),
      };
    } catch {
      // ignore
    }
  }
  return { avatarColor: pickAvatarColor(p.identity) };
}

function buildParticipantView(
  p: Participant,
  isLocal: boolean,
  activeSpeakerIds: Set<string>
): VoiceParticipantView {
  const meta = parseParticipantMeta(p);
  const micPub = p.getTrackPublication(Track.Source.Microphone);
  const camPub = p.getTrackPublication(Track.Source.Camera);
  const screenPub = p.getTrackPublication(Track.Source.ScreenShare);
  const screenAudioPub = p.getTrackPublication(Track.Source.ScreenShareAudio);

  const isMuted = !micPub || micPub.isMuted || !micPub.track;
  const isCameraOn = Boolean(camPub && !camPub.isMuted && camPub.track);
  const isScreenSharing = Boolean(screenPub && !screenPub.isMuted && screenPub.track);

  return {
    identity: p.identity,
    name: p.name || meta.username || "Member",
    username: meta.username,
    avatarColor: meta.avatarColor,
    isLocal,
    isSpeaking: activeSpeakerIds.has(p.identity) && !isMuted,
    isMuted,
    isCameraOn,
    isScreenSharing,
    cameraTrack: isCameraOn ? (camPub?.track ?? null) : null,
    screenTrack: isScreenSharing ? (screenPub?.track ?? null) : null,
    micAudioTrack:
      !isLocal && micPub?.track?.kind === Track.Kind.Audio
        ? (micPub.track as RemoteAudioTrack)
        : null,
    screenAudioTrack:
      !isLocal && screenAudioPub?.track?.kind === Track.Kind.Audio
        ? (screenAudioPub.track as RemoteAudioTrack)
        : null,
  };
}

export function VoiceProvider({
  children,
  onOccupancyChanged,
}: {
  children: ReactNode;
  onOccupancyChanged?: () => void;
}) {
  const roomRef = useRef<Room | null>(null);
  const preDeafenMutedRef = useRef<boolean>(false);

  const [activeChannel, setActiveChannel] = useState<ChannelItem | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipantView[]>([]);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<Set<string>>(new Set());
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenPreset, setScreenPreset] = useState<ScreenSharePreset>("1080p60");
  const [noiseSuppression, setNoiseSuppression] = useState(true);

  const [devices, setDevices] = useState<MediaDevicesList>({
    audioInputs: [],
    audioOutputs: [],
    videoInputs: [],
  });
  const [selectedAudioInput, setSelectedAudioInput] = useState("");
  const [selectedAudioOutput, setSelectedAudioOutput] = useState("");
  const [selectedVideoInput, setSelectedVideoInput] = useState("");

  const [userVolumes, setUserVolumes] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = window.localStorage.getItem(VOLUME_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });

  const activeSpeakerIdsRef = useRef<Set<string>>(activeSpeakerIds);
  activeSpeakerIdsRef.current = activeSpeakerIds;

  const syncParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room || room.state === ConnectionState.Disconnected) {
      setParticipants([]);
      return;
    }

    const speakers = activeSpeakerIdsRef.current;
    const list: VoiceParticipantView[] = [
      buildParticipantView(room.localParticipant, true, speakers),
    ];

    room.remoteParticipants.forEach((rp: RemoteParticipant) => {
      list.push(buildParticipantView(rp, false, speakers));
    });

    setParticipants(list);

    const local: LocalParticipant = room.localParticipant;
    setIsMuted(!local.isMicrophoneEnabled);
    setIsCameraOn(local.isCameraEnabled);
    setIsScreenSharing(local.isScreenShareEnabled);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        audioInputs: all.filter((d) => d.kind === "audioinput"),
        audioOutputs: all.filter((d) => d.kind === "audiooutput"),
        videoInputs: all.filter((d) => d.kind === "videoinput"),
      });
    } catch {
      // ignore
    }
  }, []);

  const setUserVolume = useCallback((identity: string, volume: number) => {
    const clamped = Math.max(0, Math.min(2, Number(volume.toFixed(2))));
    setUserVolumes((prev) => {
      const next = { ...prev, [identity]: clamped };
      try {
        window.localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  }, []);

  const leaveVoiceChannel = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      await room.disconnect();
    }
    setActiveChannel(null);
    setConnectionState(ConnectionState.Disconnected);
    setParticipants([]);
    setActiveSpeakerIds(new Set());
    setIsMuted(false);
    setIsDeafened(false);
    setIsCameraOn(false);
    setIsScreenSharing(false);
    onOccupancyChanged?.();
  }, [onOccupancyChanged]);

  const joinVoiceChannel = useCallback(
    async (channel: ChannelItem) => {
      if (activeChannel?.id === channel.id && roomRef.current?.state === ConnectionState.Connected) {
        return;
      }

      setError(null);
      if (roomRef.current) {
        await roomRef.current.disconnect();
        roomRef.current = null;
      }

      setActiveChannel(channel);
      setConnectionState(ConnectionState.Connecting);

      try {
        const res = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId: channel.id }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Could not connect to voice server.");
          setActiveChannel(null);
          setConnectionState(ConnectionState.Disconnected);
          return;
        }

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression,
            deviceId: selectedAudioInput || undefined,
          },
          videoCaptureDefaults: {
            resolution: VideoPresets.h720.resolution,
            deviceId: selectedVideoInput || undefined,
          },
        });

        roomRef.current = room;

        const handleRoomUpdate = () => syncParticipants();

        room
          .on(RoomEvent.ConnectionStateChanged, (state) => {
            setConnectionState(state);
            syncParticipants();
          })
          .on(RoomEvent.ParticipantConnected, () => {
            syncParticipants();
            onOccupancyChanged?.();
          })
          .on(RoomEvent.ParticipantDisconnected, () => {
            syncParticipants();
            onOccupancyChanged?.();
          })
          .on(RoomEvent.TrackSubscribed, handleRoomUpdate)
          .on(RoomEvent.TrackUnsubscribed, handleRoomUpdate)
          .on(RoomEvent.TrackMuted, handleRoomUpdate)
          .on(RoomEvent.TrackUnmuted, handleRoomUpdate)
          .on(RoomEvent.LocalTrackPublished, handleRoomUpdate)
          .on(RoomEvent.LocalTrackUnpublished, handleRoomUpdate)
          .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            const ids = new Set(speakers.map((s) => s.identity));
            activeSpeakerIdsRef.current = ids;
            setActiveSpeakerIds(ids);
            syncParticipants();
          })
          .on(RoomEvent.Disconnected, () => {
            if (roomRef.current === room) {
              roomRef.current = null;
              setActiveChannel(null);
              setConnectionState(ConnectionState.Disconnected);
              setParticipants([]);
              setIsCameraOn(false);
              setIsScreenSharing(false);
              onOccupancyChanged?.();
            }
          });

        await room.connect(data.url, data.token);

        try {
          await room.localParticipant.setMicrophoneEnabled(true, {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression,
            deviceId: selectedAudioInput || undefined,
          });
        } catch {
          // User may have denied mic permission — stay connected in listen-only mode
          setError("Microphone permission denied. Connected in listen-only mode.");
        }

        await refreshDevices();
        syncParticipants();
        onOccupancyChanged?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to join voice channel.";
        setError(msg);
        if (roomRef.current) {
          await roomRef.current.disconnect();
          roomRef.current = null;
        }
        setActiveChannel(null);
        setConnectionState(ConnectionState.Disconnected);
      }
    },
    [
      activeChannel?.id,
      noiseSuppression,
      onOccupancyChanged,
      refreshDevices,
      selectedAudioInput,
      selectedVideoInput,
      syncParticipants,
    ]
  );

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const nextEnabled = !room.localParticipant.isMicrophoneEnabled;
    if (nextEnabled && isDeafened) {
      setIsDeafened(false);
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(nextEnabled, {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression,
        deviceId: selectedAudioInput || undefined,
      });
      syncParticipants();
    } catch {
      setError("Could not access microphone.");
    }
  }, [isDeafened, noiseSuppression, selectedAudioInput, syncParticipants]);

  const toggleDeafen = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    if (!isDeafened) {
      preDeafenMutedRef.current = !room.localParticipant.isMicrophoneEnabled;
      setIsDeafened(true);
      if (room.localParticipant.isMicrophoneEnabled) {
        await room.localParticipant.setMicrophoneEnabled(false);
      }
    } else {
      setIsDeafened(false);
      if (!preDeafenMutedRef.current) {
        await room.localParticipant.setMicrophoneEnabled(true).catch(() => {});
      }
    }
    syncParticipants();
  }, [isDeafened, syncParticipants]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const nextEnabled = !room.localParticipant.isCameraEnabled;
    try {
      await room.localParticipant.setCameraEnabled(nextEnabled, {
        resolution: VideoPresets.h720.resolution,
        deviceId: selectedVideoInput || undefined,
      });
      syncParticipants();
    } catch {
      setError("Could not access webcam.");
    }
  }, [selectedVideoInput, syncParticipants]);

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const nextEnabled = !room.localParticipant.isScreenShareEnabled;
    try {
      if (nextEnabled) {
        const presetConfig =
          screenPreset === "1080p60"
            ? { width: 1920, height: 1080, frameRate: 60 }
            : screenPreset === "1080p30"
              ? { width: 1920, height: 1080, frameRate: 30 }
              : { width: 1280, height: 720, frameRate: 30 };

        await room.localParticipant.setScreenShareEnabled(
          true,
          {
            audio: true,
            resolution: presetConfig,
            contentHint: screenPreset === "1080p60" ? "motion" : "detail",
          },
          {
            screenShareEncoding: {
              maxBitrate: screenPreset === "1080p60" ? 5_000_000 : 3_000_000,
              maxFramerate: presetConfig.frameRate,
            },
          }
        );
      } else {
        await room.localParticipant.setScreenShareEnabled(false);
      }
      syncParticipants();
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        // User canceled the browser screen picker — not an error
        return;
      }
      setError("Could not start screen sharing.");
    }
  }, [screenPreset, syncParticipants]);

  const toggleNoiseSuppression = useCallback(async () => {
    const next = !noiseSuppression;
    setNoiseSuppression(next);
    const room = roomRef.current;
    if (room && room.localParticipant.isMicrophoneEnabled) {
      await room.localParticipant.setMicrophoneEnabled(false);
      await room.localParticipant.setMicrophoneEnabled(true, {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: next,
        deviceId: selectedAudioInput || undefined,
      });
      syncParticipants();
    }
  }, [noiseSuppression, selectedAudioInput, syncParticipants]);

  const setAudioInput = useCallback(async (deviceId: string) => {
    setSelectedAudioInput(deviceId);
    const room = roomRef.current;
    if (room) {
      await room.switchActiveDevice("audioinput", deviceId).catch(() => {});
    }
  }, []);

  const setAudioOutput = useCallback((deviceId: string) => {
    setSelectedAudioOutput(deviceId);
  }, []);

  const setVideoInput = useCallback(async (deviceId: string) => {
    setSelectedVideoInput(deviceId);
    const room = roomRef.current;
    if (room) {
      await room.switchActiveDevice("videoinput", deviceId).catch(() => {});
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        void roomRef.current.disconnect();
      }
    };
  }, []);

  const value = useMemo<VoiceContextValue>(
    () => ({
      activeChannel,
      connectionState,
      error,
      participants,
      isMuted,
      isDeafened,
      isCameraOn,
      isScreenSharing,
      screenPreset,
      setScreenPreset,
      noiseSuppression,
      toggleNoiseSuppression,
      devices,
      selectedAudioInput,
      selectedAudioOutput,
      selectedVideoInput,
      setAudioInput,
      setAudioOutput,
      setVideoInput,
      refreshDevices,
      userVolumes,
      setUserVolume,
      joinVoiceChannel,
      leaveVoiceChannel,
      toggleMute,
      toggleDeafen,
      toggleCamera,
      toggleScreenShare,
      clearError: () => setError(null),
    }),
    [
      activeChannel,
      connectionState,
      error,
      participants,
      isMuted,
      isDeafened,
      isCameraOn,
      isScreenSharing,
      screenPreset,
      noiseSuppression,
      toggleNoiseSuppression,
      devices,
      selectedAudioInput,
      selectedAudioOutput,
      selectedVideoInput,
      setAudioInput,
      setAudioOutput,
      setVideoInput,
      refreshDevices,
      userVolumes,
      setUserVolume,
      joinVoiceChannel,
      leaveVoiceChannel,
      toggleMute,
      toggleDeafen,
      toggleCamera,
      toggleScreenShare,
    ]
  );

  return (
    <VoiceContext.Provider value={value}>
      {children}
      {/* Persistent audio engine: keeps playing voice even while browsing text channels */}
      <div className="hidden" aria-hidden="true">
        {participants.map((p) => (
          <div key={p.identity}>
            {p.micAudioTrack && (
              <RemoteAudioPlayer
                track={p.micAudioTrack}
                volume={userVolumes[p.identity] ?? 1}
                deafened={isDeafened}
                outputDeviceId={selectedAudioOutput || undefined}
              />
            )}
            {p.screenAudioTrack && (
              <RemoteAudioPlayer
                track={p.screenAudioTrack}
                volume={userVolumes[`${p.identity}:screen`] ?? 1}
                deafened={isDeafened}
                outputDeviceId={selectedAudioOutput || undefined}
              />
            )}
          </div>
        ))}
      </div>
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error("useVoice must be used inside VoiceProvider.");
  }
  return ctx;
}
