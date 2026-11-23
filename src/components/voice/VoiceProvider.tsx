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
import { playSound } from "@/lib/sounds";
import {
  pickAvatarColor,
  type ChannelItem,
  type VoiceNetworkSample,
  type VoiceNetworkStats,
} from "@/lib/types";

export type ScreenSharePreset = "1080p60" | "1080p30" | "720p30";

export interface VoiceParticipantView {
  identity: string;
  name: string;
  username?: string;
  avatarColor: string;
  avatarUrl: string | null;
  role?: "admin" | "member";
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
  networkStats: VoiceNetworkStats;
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
  toggleLocalMuteUser: (identity: string) => void;
  kickParticipant: (targetIdentity: string, roomName?: string) => Promise<void>;
  serverMuteParticipant: (targetIdentity: string, roomName?: string) => Promise<void>;
  joinVoiceChannel: (channel: ChannelItem) => Promise<void>;
  leaveVoiceChannel: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  clearError: () => void;
}

const VOLUME_STORAGE_KEY = "siq_user_volumes_v1";

const EMPTY_NETWORK_STATS: VoiceNetworkStats = {
  lastPingMs: null,
  avgPingMs: null,
  packetLossPct: 0,
  history: [],
  serverHost: "",
  encrypted: true,
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

function parseParticipantMeta(p: Participant): {
  username?: string;
  avatarColor: string;
  avatarUrl: string | null;
  role?: "admin" | "member";
} {
  if (p.metadata) {
    try {
      const parsed = JSON.parse(p.metadata) as {
        username?: string;
        avatarColor?: string;
        avatarUrl?: string | null;
        role?: "admin" | "member";
      };
      return {
        username: parsed.username,
        avatarColor: parsed.avatarColor || pickAvatarColor(p.identity),
        avatarUrl: parsed.avatarUrl ?? null,
        role: parsed.role,
      };
    } catch {
      // ignore
    }
  }
  return { avatarColor: pickAvatarColor(p.identity), avatarUrl: null };
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
    avatarUrl: meta.avatarUrl,
    role: meta.role,
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

/** Extract real WebRTC RTT (ms) and outbound packet loss (%) from LiveKit's internal engine */
async function readLiveKitStats(
  room: Room
): Promise<{ pingMs: number | null; packetLossPct: number } | null> {
  try {
    // Access LiveKit's internal pcManager (publisher & subscriber RTCPeerConnections)
    const engine = (
      room as unknown as {
        engine?: {
          pcManager?: {
            publisher?: { getStats?: () => Promise<RTCStatsReport> };
            subscriber?: { getStats?: () => Promise<RTCStatsReport> };
          };
        };
      }
    ).engine;

    const pubPc = engine?.pcManager?.publisher;
    const subPc = engine?.pcManager?.subscriber;

    let rttSeconds: number | null = null;
    let packetsSent = 0;
    let packetsLost = 0;

    const reports: RTCStatsReport[] = [];
    if (pubPc?.getStats) reports.push(await pubPc.getStats());
    if (subPc?.getStats) reports.push(await subPc.getStats());

    for (const report of reports) {
      report.forEach((stat) => {
        if (
          stat.type === "candidate-pair" &&
          (stat.state === "succeeded" || stat.nominated) &&
          typeof stat.currentRoundTripTime === "number" &&
          stat.currentRoundTripTime > 0
        ) {
          rttSeconds = stat.currentRoundTripTime;
        }
        if (stat.type === "remote-inbound-rtp" && stat.kind === "audio") {
          if (typeof stat.roundTripTime === "number" && stat.roundTripTime > 0 && rttSeconds === null) {
            rttSeconds = stat.roundTripTime;
          }
          if (typeof stat.packetsLost === "number") {
            packetsLost += Math.max(0, stat.packetsLost);
          }
        }
        if (stat.type === "outbound-rtp" && stat.kind === "audio") {
          if (typeof stat.packetsSent === "number") {
            packetsSent += Math.max(0, stat.packetsSent);
          }
        }
      });
    }

    const total = packetsSent + packetsLost;
    const packetLossPct = total > 0 ? Math.min(100, (packetsLost / total) * 100) : 0;
    return {
      pingMs: rttSeconds !== null ? Math.round(rttSeconds * 1000) : null,
      packetLossPct,
    };
  } catch {
    return null;
  }
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
  const preLocalMuteVolumeRef = useRef<Record<string, number>>({});
  const serverHostRef = useRef<string>("");

  const [activeChannel, setActiveChannel] = useState<ChannelItem | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipantView[]>([]);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<Set<string>>(new Set());
  const [networkStats, setNetworkStats] = useState<VoiceNetworkStats>(EMPTY_NETWORK_STATS);

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

  const toggleLocalMuteUser = useCallback(
    (identity: string) => {
      const current = userVolumes[identity] ?? 1;
      if (current > 0) {
        preLocalMuteVolumeRef.current[identity] = current;
        setUserVolume(identity, 0);
        playSound("mute");
      } else {
        const restored = preLocalMuteVolumeRef.current[identity] ?? 1;
        setUserVolume(identity, restored > 0 ? restored : 1);
        playSound("unmute");
      }
    },
    [setUserVolume, userVolumes]
  );

  const kickParticipant = useCallback(
    async (targetIdentity: string, roomName?: string) => {
      const targetRoom = roomName || activeChannel?.slug;
      if (!targetRoom) return;
      try {
        const res = await fetch("/api/livekit/moderate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "kick",
            roomName: targetRoom,
            targetIdentity,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Failed to kick user.");
        } else {
          playSound("peer-leave");
          onOccupancyChanged?.();
        }
      } catch {
        setError("Network error while kicking user.");
      }
    },
    [activeChannel?.slug, onOccupancyChanged]
  );

  const serverMuteParticipant = useCallback(
    async (targetIdentity: string, roomName?: string) => {
      const targetRoom = roomName || activeChannel?.slug;
      if (!targetRoom) return;
      try {
        const res = await fetch("/api/livekit/moderate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "mute",
            roomName: targetRoom,
            targetIdentity,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Failed to mute user.");
        } else {
          playSound("mute");
        }
      } catch {
        setError("Network error while muting user.");
      }
    },
    [activeChannel?.slug]
  );

  // Sample live WebRTC ping & packet loss every 2 seconds while connected
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) {
      setNetworkStats(EMPTY_NETWORK_STATS);
      return;
    }

    let cancelled = false;
    const sample = async () => {
      const room = roomRef.current;
      if (!room || cancelled) return;

      const measured = await readLiveKitStats(room);
      if (cancelled) return;

      let pingMs = measured?.pingMs ?? null;
      const packetLossPct = measured?.packetLossPct ?? 0;

      // Fallback lightweight HTTP ping measurement if WebRTC stats haven't warmed up yet
      if (pingMs === null) {
        try {
          const t0 = performance.now();
          await fetch("/api/auth/status", { method: "HEAD", cache: "no-store" });
          pingMs = Math.max(1, Math.round(performance.now() - t0));
        } catch {
          // ignore
        }
      }

      if (pingMs === null || cancelled) return;

      setNetworkStats((prev) => {
        const nextHistory: VoiceNetworkSample[] = [
          ...prev.history.slice(-39),
          { timestamp: Date.now(), pingMs: pingMs! },
        ];
        const sum = nextHistory.reduce((acc, s) => acc + s.pingMs, 0);
        const avgPingMs = Math.round(sum / nextHistory.length);
        return {
          lastPingMs: pingMs,
          avgPingMs,
          packetLossPct,
          history: nextHistory,
          serverHost: serverHostRef.current,
          encrypted: true,
        };
      });
    };

    void sample();
    const timer = setInterval(() => void sample(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connectionState]);

  const leaveVoiceChannel = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      await room.disconnect();
      playSound("leave");
    }
    setActiveChannel(null);
    setConnectionState(ConnectionState.Disconnected);
    setParticipants([]);
    setActiveSpeakerIds(new Set());
    setNetworkStats(EMPTY_NETWORK_STATS);
    setIsMuted(false);
    setIsDeafened(false);
    setIsCameraOn(false);
    setIsScreenSharing(false);
    onOccupancyChanged?.();
  }, [onOccupancyChanged]);

  const joinVoiceChannel = useCallback(
    async (channel: ChannelItem) => {
      if (
        activeChannel?.id === channel.id &&
        roomRef.current?.state === ConnectionState.Connected
      ) {
        return;
      }

      setError(null);
      if (roomRef.current) {
        await roomRef.current.disconnect();
        roomRef.current = null;
      }

      setActiveChannel(channel);
      setConnectionState(ConnectionState.Connecting);
      setNetworkStats(EMPTY_NETWORK_STATS);

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

        try {
          serverHostRef.current = new URL(data.url).host;
        } catch {
          serverHostRef.current = "livekit-edge";
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
            playSound("peer-join");
            syncParticipants();
            onOccupancyChanged?.();
          })
          .on(RoomEvent.ParticipantDisconnected, () => {
            playSound("peer-leave");
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
              playSound("leave");
              setActiveChannel(null);
              setConnectionState(ConnectionState.Disconnected);
              setParticipants([]);
              setNetworkStats(EMPTY_NETWORK_STATS);
              setIsCameraOn(false);
              setIsScreenSharing(false);
              onOccupancyChanged?.();
            }
          });

        await room.connect(data.url, data.token);
        playSound("join");

        try {
          await room.localParticipant.setMicrophoneEnabled(true, {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression,
            deviceId: selectedAudioInput || undefined,
          });
        } catch {
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
      playSound(nextEnabled ? "unmute" : "mute");
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
      playSound("deafen");
      if (room.localParticipant.isMicrophoneEnabled) {
        await room.localParticipant.setMicrophoneEnabled(false);
      }
    } else {
      setIsDeafened(false);
      playSound("undeafen");
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
      playSound(nextEnabled ? "unmute" : "mute");
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
        playSound("stream-start");
      } else {
        await room.localParticipant.setScreenShareEnabled(false);
        playSound("stream-stop");
      }
      syncParticipants();
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
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
      networkStats,
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
      toggleLocalMuteUser,
      kickParticipant,
      serverMuteParticipant,
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
      networkStats,
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
      toggleLocalMuteUser,
      kickParticipant,
      serverMuteParticipant,
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
