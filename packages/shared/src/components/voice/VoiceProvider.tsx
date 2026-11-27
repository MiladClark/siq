"use client";

import { apiFetch } from "@/lib/client-api";
import {
  ConnectionState,
  LocalAudioTrack,
  LocalParticipant,
  LocalVideoTrack,
  Participant,
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  VideoQuality,
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
import { preconnect } from "react-dom";
import { useSystemNotify } from "@siq/shared/components/ui/NotificationCenter";
import { RemoteAudioPlayer } from "@siq/shared/components/voice/AudioRenderer";
import { voiceControls } from "@/lib/voice-controls";
import {
  createNoiseProcessor,
  type LiveConfigurableAudioProcessor,
  type NoiseCancellationMode,
} from "@siq/shared/lib/noise-processor";
import {
  DEFAULT_SCREEN_SHARE_CONFIG,
  DEFAULT_VOICE_AUDIO_SETTINGS,
  loadAppPreferences,
  saveAppPreferences,
  type ScreenShareConfig,
  type VoiceAudioSettings,
} from "@siq/shared/lib/preferences";
import {
  DEFAULT_SIQ_DSP_CONFIG,
  SIQ_DSP_PRESETS,
  type SiqAiEngine,
  type SiqDspConfig,
  type SiqPresetId,
} from "@siq/shared/lib/siq-audio-worklet";
import { playCallDeclinedSound, playSound } from "@siq/shared/lib/sounds";
import {
  pickAvatarColor,
  type ChannelItem,
  type PublicUser,
  type VoiceNetworkStats,
  type VoiceParticipantSummary,
} from "@siq/shared/lib/types";
import { summarizeVoiceNetwork } from "@siq/shared/lib/voice-network";

export interface JoinVoiceOptions {
  watchIdentity?: string | null;
  seedOccupants?: VoiceParticipantSummary[];
  currentUser?: PublicUser;
  dmConversationId?: string;
  startWithVideo?: boolean;
}

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

export type CameraFacingMode = "user" | "environment";

interface MediaDevicesList {
  audioInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
}

interface VoiceContextValue {
  activeChannel: ChannelItem | null;
  connectionState: ConnectionState;
  error: string | null;
  notice: string | null;
  participants: VoiceParticipantView[];
  networkStats: VoiceNetworkStats;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  cameraFacingMode: CameraFacingMode;
  isSwitchingCamera: boolean;
  canSwitchCamera: boolean;
  supportsScreenShare: boolean;
  isScreenSharing: boolean;
  screenShareConfig: ScreenShareConfig;
  updateScreenShareConfig: (patch: Partial<ScreenShareConfig>) => void;
  startScreenShare: (override?: Partial<ScreenShareConfig>) => Promise<boolean>;
  stopScreenShare: () => Promise<void>;
  noiseMode: NoiseCancellationMode;
  activeNoiseEngine: NoiseCancellationMode;
  activeSiqEngine: SiqAiEngine;
  setNoiseMode: (mode: NoiseCancellationMode) => Promise<void>;
  echoCancellation: boolean;
  setEchoCancellation: (enabled: boolean) => Promise<void>;
  autoGainControl: boolean;
  setAutoGainControl: (enabled: boolean) => Promise<void>;
  voiceAudio: VoiceAudioSettings;
  updateVoiceAudio: (patch: Partial<VoiceAudioSettings>) => Promise<void>;
  updateSiqDsp: (patch: Partial<SiqDspConfig>) => void;
  applySiqPreset: (presetId: SiqPresetId) => void;
  isPttActive: boolean;
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
  watchTargetIdentity: string | null;
  setWatchTargetIdentity: (identity: string | null) => void;
  previewTargetIdentity: string | null;
  setPreviewTargetIdentity: (identity: string | null) => void;
  joinVoiceChannel: (channel: ChannelItem, options?: JoinVoiceOptions) => Promise<void>;
  leaveVoiceChannel: (options?: { silent?: boolean }) => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  switchCameraFacingMode: (target?: CameraFacingMode) => Promise<void>;
  enableCameraWithFacing: (facing: CameraFacingMode) => Promise<boolean>;
  clearError: () => void;
  clearNotice: () => void;
}

const VOLUME_STORAGE_KEY = "siq_user_volumes_v1";

const EMPTY_NETWORK_STATS: VoiceNetworkStats = {
  lastPingMs: null,
  avgPingMs: null,
  packetLossPct: null,
  history: [],
  serverHost: "",
  transport: null,
  joinTiming: null,
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
  // For remote participants, screenPub exists as soon as they publish (even before on-demand subscribe)
  const isScreenSharing = Boolean(screenPub && !screenPub.isMuted && (isLocal ? screenPub.track : true));

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

async function readLiveKitStats(room: Room) {
  const transports = room.engine?.pcManager;
  const reports = await Promise.allSettled([
    transports?.publisher?.getStats(),
    transports?.subscriber?.getStats(),
  ]);
  return summarizeVoiceNetwork(
    reports.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : []
    )
  );
}

function getResolutionDimensions(res: ScreenShareConfig["resolution"]): {
  width: number;
  height: number;
} | undefined {
  switch (res) {
    case "720p":
      return { width: 1280, height: 720 };
    case "1080p":
      return { width: 1920, height: 1080 };
    case "1440p":
      return { width: 2560, height: 1440 };
    case "source":
      return undefined; // Native screen resolution
  }
}

function getAudioPublishOptions(voiceAudio: VoiceAudioSettings) {
  const maxBitrate =
    voiceAudio.voiceQuality === "low-bandwidth"
      ? 32_000
      : voiceAudio.voiceQuality === "studio"
        ? 96_000
        : 64_000;
  return {
    audioPreset: { maxBitrate },
    dtx: voiceAudio.voiceQuality === "studio" ? false : voiceAudio.dtxEnabled,
    red: voiceAudio.packetLossRecovery,
  };
}

export function VoiceProvider({
  children,
  onOccupancyChanged,
}: {
  children: ReactNode;
  onOccupancyChanged?: () => void;
}) {
  const notify = useSystemNotify();
  const roomRef = useRef<Room | null>(null);
  const switchingRef = useRef<boolean>(false);
  const joinAttemptIdRef = useRef<number>(0);
  const joinRequestRef = useRef<{ channelId: string; controller: AbortController } | null>(null);
  const roomDisconnectRef = useRef<Promise<void> | null>(null);
  const preDeafenMutedRef = useRef<boolean>(false);
  const preLocalMuteVolumeRef = useRef<Record<string, number>>({});
  const serverHostRef = useRef<string>("");
  const isLiveKitCloudRef = useRef<boolean>(false);

  const [activeChannel, setActiveChannel] = useState<ChannelItem | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );
  const [error, setErrorState] = useState<string | null>(null);
  const [notice, setNoticeState] = useState<string | null>(null);

  const setError = useCallback(
    (msg: string | null) => {
      setErrorState(msg);
      if (msg) {
        notify({ kind: "error", title: "Voice Error", message: msg, source: "Voice" });
      }
    },
    [notify]
  );

  const setNotice = useCallback(
    (msg: string | null) => {
      setNoticeState(msg);
      if (msg) {
        notify({ kind: "warning", title: "Voice Notice", message: msg, source: "Voice" });
      }
    },
    [notify]
  );
  const [participants, setParticipants] = useState<VoiceParticipantView[]>([]);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<Set<string>>(new Set());
  const [networkStats, setNetworkStats] = useState<VoiceNetworkStats>(EMPTY_NETWORK_STATS);
  const [watchTargetIdentity, setWatchTargetIdentity] = useState<string | null>(null);
  const watchTargetIdentityRef = useRef<string | null>(null);
  watchTargetIdentityRef.current = watchTargetIdentity;
  const [previewTargetIdentity, setPreviewTargetIdentity] = useState<string | null>(null);
  const previewTargetIdentityRef = useRef<string | null>(null);
  previewTargetIdentityRef.current = previewTargetIdentity;
  const leaveVoiceChannelRef = useRef<(options?: { silent?: boolean }) => Promise<void>>(
    async () => {}
  );

  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<CameraFacingMode>("user");
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const switchingCameraRef = useRef(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [supportsScreenShare, setSupportsScreenShare] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  useEffect(() => {
    setIsTouchDevice(
      typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
    );
    setSupportsScreenShare(
      typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia)
    );
  }, []);

  const [noiseMode, setNoiseModeState] = useState<NoiseCancellationMode>("siq");
  const [activeNoiseEngine, setActiveNoiseEngine] =
    useState<NoiseCancellationMode>("siq");
  const [activeSiqEngine, setActiveSiqEngine] = useState<SiqAiEngine>(
    DEFAULT_SIQ_DSP_CONFIG.aiEngine
  );
  const [echoCancellation, setEchoCancellationState] = useState(true);
  const [autoGainControl, setAutoGainControlState] = useState(true);
  const [voiceAudio, setVoiceAudioState] = useState<VoiceAudioSettings>(
    DEFAULT_VOICE_AUDIO_SETTINGS
  );
  const [isPttActive, setIsPttActive] = useState(false);
  const [screenShareConfig, setScreenShareConfig] = useState<ScreenShareConfig>(
    DEFAULT_SCREEN_SHARE_CONFIG
  );

  const activeProcessorRef = useRef<LiveConfigurableAudioProcessor | null>(null);
  const voiceAudioRef = useRef<VoiceAudioSettings>(voiceAudio);
  voiceAudioRef.current = voiceAudio;
  const noiseModeRef = useRef<NoiseCancellationMode>(noiseMode);
  noiseModeRef.current = noiseMode;
  const pttReleaseTimerRef = useRef<number | null>(null);
  const pttHeldRef = useRef<boolean>(false);

  // Hydrate persisted audio/screen preferences on mount
  useEffect(() => {
    const prefs = loadAppPreferences();
    setNoiseModeState(prefs.noiseMode);
    setActiveNoiseEngine(prefs.noiseMode);
    setActiveSiqEngine(prefs.voiceAudio.siqDsp.aiEngine);
    setEchoCancellationState(prefs.echoCancellation);
    setAutoGainControlState(prefs.autoGainControl);
    setVoiceAudioState(prefs.voiceAudio);
    setScreenShareConfig(prefs.screenShareConfig);
  }, []);

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

  /** On-demand screen share subscription: always subscribe to Mic & Camera,
   *  and only subscribe to remote ScreenShare video/audio in server voice channels
   *  when the user explicitly watches (or hovers to preview) that stream. */
  const syncTrackSubscriptions = useCallback(
    (room: Room | null, watchIdentity: string | null, previewIdentity: string | null = null) => {
      if (!room || room.state !== ConnectionState.Connected) return;
      const isDmRoom = Boolean(room.name?.startsWith("dm-"));

      room.remoteParticipants.forEach((rp: RemoteParticipant) => {
        rp.trackPublications.forEach((pub) => {
          const remotePub = pub as RemoteTrackPublication;
          const isScreenVideo = remotePub.source === Track.Source.ScreenShare;
          const isScreenAudio = remotePub.source === Track.Source.ScreenShareAudio;
          const isScreen = isScreenVideo || isScreenAudio;

          if (isScreen && !isDmRoom) {
            const isWatching = watchIdentity === rp.identity;
            const isPreviewing = !isWatching && isScreenVideo && previewIdentity === rp.identity;
            const shouldSubscribe = isWatching || isPreviewing;

            if (remotePub.isSubscribed !== shouldSubscribe) {
              remotePub.setSubscribed(shouldSubscribe);
            }
            if (shouldSubscribe && remotePub.isSubscribed && isScreenVideo) {
              try {
                remotePub.setVideoQuality(isWatching ? VideoQuality.HIGH : VideoQuality.LOW);
              } catch {
                // ignore if track isn't simulcast
              }
            }
          } else {
            if (!remotePub.isSubscribed) {
              remotePub.setSubscribed(true);
            }
            if (isScreenVideo && remotePub.isSubscribed) {
              try {
                remotePub.setVideoQuality(VideoQuality.HIGH);
              } catch {
                // ignore if track isn't simulcast
              }
            }
          }
        });
      });
    },
    []
  );

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      syncTrackSubscriptions(roomRef.current, watchTargetIdentity, previewTargetIdentity);
    }
  }, [connectionState, previewTargetIdentity, syncTrackSubscriptions, watchTargetIdentity]);

  const syncParticipants = useCallback(() => {
    const room = roomRef.current;
    // Never wipe optimistic/seeded participants while a new room is still connecting.
    if (!room) {
      if (!switchingRef.current) {
        setParticipants([]);
      }
      return;
    }
    if (room.state === ConnectionState.Disconnected) {
      if (!switchingRef.current) {
        setParticipants([]);
      }
      return;
    }
    if (room.state !== ConnectionState.Connected) {
      return;
    }

    const speakers = activeSpeakerIdsRef.current;
    const liveMap = new Map<string, VoiceParticipantView>();

    liveMap.set(
      room.localParticipant.identity,
      buildParticipantView(room.localParticipant, true, speakers)
    );

    room.remoteParticipants.forEach((rp: RemoteParticipant) => {
      liveMap.set(rp.identity, buildParticipantView(rp, false, speakers));
    });

    // Preserve existing visual order so participant cards and sidebar rows never jump
    setParticipants((prev) => {
      const ordered: VoiceParticipantView[] = [];
      const added = new Set<string>();

      for (const item of prev) {
        const fresh = liveMap.get(item.identity);
        if (fresh) {
          ordered.push(fresh);
          added.add(item.identity);
        }
      }

      liveMap.forEach((view, identity) => {
        if (!added.has(identity)) {
          ordered.push(view);
        }
      });

      return ordered;
    });

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

  /** Attach or remove the active Noise / Gain Processor on the live microphone track */
  const applyNoiseProcessorToCurrentMic = useCallback(
    async (
      targetMode: NoiseCancellationMode,
      aec: boolean,
      agc: boolean,
      forceRepublishMic = false,
      audioOverride?: VoiceAudioSettings
    ) => {
      const currentAudio = audioOverride ?? voiceAudioRef.current;
      const room = roomRef.current;
      if (!room || room.state !== ConnectionState.Connected) {
        activeProcessorRef.current = null;
        setActiveNoiseEngine(targetMode);
        setActiveSiqEngine(currentAudio.siqDsp.aiEngine);
        return;
      }

      const browserNoiseSuppression = targetMode === "standard";
      const pubOpts = getAudioPublishOptions(currentAudio);

      if (forceRepublishMic && room.localParticipant.isMicrophoneEnabled) {
        await room.localParticipant.setMicrophoneEnabled(false);
        await room.localParticipant.setMicrophoneEnabled(
          true,
          {
            autoGainControl: agc,
            echoCancellation: aec,
            noiseSuppression: browserNoiseSuppression,
            deviceId: selectedAudioInput || undefined,
          },
          pubOpts
        );
      }

      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const localTrack = micPub?.track as LocalAudioTrack | undefined;
      if (!localTrack) {
        activeProcessorRef.current = null;
        setActiveNoiseEngine(targetMode);
        return;
      }

      try {
        await localTrack.stopProcessor();
      } catch {
        // ignore if no previous processor was running
      }
      activeProcessorRef.current = null;

      const siqConfig: SiqDspConfig = {
        ...currentAudio.siqDsp,
        inputGainPct: currentAudio.inputGainPct,
      };

      const attach = async (modeToAttach: NoiseCancellationMode) => {
        const result = await createNoiseProcessor(modeToAttach, {
          isLiveKitCloud: isLiveKitCloudRef.current,
          siqConfig,
          inputGainPct: currentAudio.inputGainPct,
        });
        if (result.processor) {
          await localTrack.setProcessor(result.processor);
          activeProcessorRef.current = result.processor;
          if (result.processor.activeSiqEngine) {
            setActiveSiqEngine(result.processor.activeSiqEngine);
          }
        } else {
          activeProcessorRef.current = null;
        }
        setActiveNoiseEngine(result.effectiveMode);
        const noticeMsg = result.processor?.fallbackNotice || result.notice;
        if (noticeMsg) {
          setNotice(noticeMsg);
        }
      };

      try {
        await attach(targetMode);
      } catch (err) {
        console.warn(`[noise-processor] ${targetMode} failed:`, err);
        const detail = err instanceof Error ? err.message : "runtime error";
        // If Krisp / GTCRN / RNNoise failed (e.g. CDN unreachable or runtime block),
        // fall back cleanly to our 100% local zero-latency SIQ Cancellation engine first!
        if (targetMode !== "siq" && targetMode !== "standard" && targetMode !== "off") {
          try {
            await attach("siq");
            setNotice(
              `${targetMode.toUpperCase()} unavailable (${detail}); switched to SIQ Cancellation.`
            );
            return;
          } catch (siqErr) {
            console.warn("[noise-processor] SIQ fallback failed:", siqErr);
          }
        }
        activeProcessorRef.current = null;
        setActiveNoiseEngine("standard");
        setNotice(`Audio filter fallback to standard (${detail}).`);
      }
    },
    [selectedAudioInput, setNotice]
  );

  const setNoiseMode = useCallback(
    async (mode: NoiseCancellationMode) => {
      setNoiseModeState(mode);
      const prefs = loadAppPreferences();
      saveAppPreferences({ ...prefs, noiseMode: mode });
      setNotice(null);
      await applyNoiseProcessorToCurrentMic(
        mode,
        echoCancellation,
        autoGainControl,
        mode === "standard" || mode === "off"
      );
    },
    [applyNoiseProcessorToCurrentMic, autoGainControl, echoCancellation, setNotice]
  );

  const setEchoCancellation = useCallback(
    async (enabled: boolean) => {
      setEchoCancellationState(enabled);
      const prefs = loadAppPreferences();
      saveAppPreferences({ ...prefs, echoCancellation: enabled });
      await applyNoiseProcessorToCurrentMic(noiseMode, enabled, autoGainControl, true);
    },
    [applyNoiseProcessorToCurrentMic, autoGainControl, noiseMode]
  );

  const setAutoGainControl = useCallback(
    async (enabled: boolean) => {
      setAutoGainControlState(enabled);
      const prefs = loadAppPreferences();
      saveAppPreferences({ ...prefs, autoGainControl: enabled });
      await applyNoiseProcessorToCurrentMic(noiseMode, echoCancellation, enabled, true);
    },
    [applyNoiseProcessorToCurrentMic, echoCancellation, noiseMode]
  );

  const updateVoiceAudio = useCallback(
    async (patch: Partial<VoiceAudioSettings>) => {
      const prev = voiceAudioRef.current;
      const next: VoiceAudioSettings = {
        ...prev,
        ...patch,
        siqDsp: {
          ...prev.siqDsp,
          ...(patch.siqDsp ?? {}),
          inputGainPct: patch.inputGainPct ?? patch.siqDsp?.inputGainPct ?? prev.inputGainPct,
        },
      };
      voiceAudioRef.current = next;
      setVoiceAudioState(next);

      const prefs = loadAppPreferences();
      saveAppPreferences({ ...prefs, voiceAudio: next });

      // Live hot-update input gain with zero interruption if a processor is already running
      if (patch.inputGainPct !== undefined && patch.inputGainPct !== prev.inputGainPct) {
        const proc = activeProcessorRef.current;
        if (proc?.updateSiqConfig) {
          proc.updateSiqConfig(next.siqDsp);
        } else if (proc?.setInputGainPct) {
          proc.setInputGainPct(next.inputGainPct);
        } else if (
          roomRef.current?.state === ConnectionState.Connected &&
          next.inputGainPct !== 100
        ) {
          void applyNoiseProcessorToCurrentMic(
            noiseModeRef.current,
            echoCancellation,
            autoGainControl,
            false,
            next
          );
        }
      }

      // Live hot-update SIQ DSP parameters
      if (patch.siqDsp && activeProcessorRef.current?.updateSiqConfig) {
        activeProcessorRef.current.updateSiqConfig(next.siqDsp);
      }

      // Handle Push-to-Talk mode switches immediately on active room
      if (patch.inputMode && patch.inputMode !== prev.inputMode) {
        const room = roomRef.current;
        const micPub = room?.localParticipant.getTrackPublication(Track.Source.Microphone);
        const localTrack = micPub?.track as LocalAudioTrack | undefined;
        if (room && room.state === ConnectionState.Connected && localTrack) {
          if (patch.inputMode === "push-to-talk") {
            setIsPttActive(false);
            pttHeldRef.current = false;
            await localTrack.mute().catch(() => {});
            syncParticipants();
          } else {
            setIsPttActive(false);
            pttHeldRef.current = false;
            if (!isDeafened) {
              await localTrack.unmute().catch(() => {});
            }
            syncParticipants();
          }
        }
      }

      // Republish mic only when Opus codec / bitrate / RED / DTX settings change
      const networkChanged =
        (patch.voiceQuality !== undefined && patch.voiceQuality !== prev.voiceQuality) ||
        (patch.packetLossRecovery !== undefined &&
          patch.packetLossRecovery !== prev.packetLossRecovery) ||
        (patch.dtxEnabled !== undefined && patch.dtxEnabled !== prev.dtxEnabled);

      if (networkChanged && roomRef.current?.state === ConnectionState.Connected) {
        await applyNoiseProcessorToCurrentMic(
          noiseModeRef.current,
          echoCancellation,
          autoGainControl,
          true,
          next
        );
      }
    },
    [applyNoiseProcessorToCurrentMic, autoGainControl, echoCancellation, isDeafened, syncParticipants]
  );

  const updateSiqDsp = useCallback(
    (patch: Partial<SiqDspConfig>) => {
      const prev = voiceAudioRef.current;
      const nextSiq: SiqDspConfig = {
        ...prev.siqDsp,
        ...patch,
        inputGainPct: patch.inputGainPct ?? prev.inputGainPct,
      };
      const next: VoiceAudioSettings = {
        ...prev,
        inputGainPct: nextSiq.inputGainPct,
        siqDsp: nextSiq,
      };
      voiceAudioRef.current = next;
      setVoiceAudioState(next);

      const prefs = loadAppPreferences();
      saveAppPreferences({ ...prefs, voiceAudio: next });

      const engineChanged =
        patch.aiEngine !== undefined && patch.aiEngine !== prev.siqDsp.aiEngine;
      if (engineChanged) {
        setActiveSiqEngine(nextSiq.aiEngine);
        if (
          roomRef.current?.state === ConnectionState.Connected &&
          noiseModeRef.current === "siq"
        ) {
          void applyNoiseProcessorToCurrentMic(
            "siq",
            echoCancellation,
            autoGainControl,
            false,
            next
          );
          return;
        }
      }

      if (activeProcessorRef.current?.updateSiqConfig) {
        activeProcessorRef.current.updateSiqConfig(nextSiq);
      }
    },
    [applyNoiseProcessorToCurrentMic, autoGainControl, echoCancellation]
  );

  const applySiqPreset = useCallback(
    (presetId: SiqPresetId) => {
      const preset = SIQ_DSP_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      updateSiqDsp(preset.patch);
    },
    [updateSiqDsp]
  );

  // Zero-latency Push-to-Talk keyboard listener (uses LocalAudioTrack.mute/unmute — 0ms SDP lag)
  useEffect(() => {
    if (
      voiceAudio.inputMode !== "push-to-talk" ||
      connectionState !== ConnectionState.Connected
    ) {
      setIsPttActive(false);
      pttHeldRef.current = false;
      if (pttReleaseTimerRef.current !== null) {
        window.clearTimeout(pttReleaseTimerRef.current);
        pttReleaseTimerRef.current = null;
      }
      return;
    }

    const NON_TYPING_KEYS = new Set([
      "AltLeft",
      "AltRight",
      "ControlLeft",
      "ControlRight",
      "CapsLock",
      "ScrollLock",
      "Pause",
      "Backquote",
      "F1",
      "F2",
      "F3",
      "F4",
      "F5",
      "F6",
      "F7",
      "F8",
      "F9",
      "F10",
      "F11",
      "F12",
    ]);

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      );
    };

    const getLocalMicTrack = (): LocalAudioTrack | undefined => {
      const room = roomRef.current;
      if (!room || room.state !== ConnectionState.Connected) return undefined;
      return room.localParticipant.getTrackPublication(Track.Source.Microphone)
        ?.track as LocalAudioTrack | undefined;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (document.body.dataset.siqRecordingPtt === "true") return;
      const boundCode = voiceAudioRef.current.pttKey;
      if (!boundCode || e.code !== boundCode) return;
      if (!NON_TYPING_KEYS.has(boundCode) && isEditableTarget(e.target)) return;
      if (isDeafened) return;

      if (pttReleaseTimerRef.current !== null) {
        window.clearTimeout(pttReleaseTimerRef.current);
        pttReleaseTimerRef.current = null;
      }

      if (!pttHeldRef.current) {
        pttHeldRef.current = true;
        setIsPttActive(true);
        const track = getLocalMicTrack();
        if (track) {
          void track.unmute().then(() => syncParticipants()).catch(() => {});
        }
      }
    };

    const releasePtt = () => {
      if (!pttHeldRef.current) return;
      const delay = Math.max(0, Math.min(600, voiceAudioRef.current.pttReleaseDelayMs));
      if (pttReleaseTimerRef.current !== null) {
        window.clearTimeout(pttReleaseTimerRef.current);
      }
      pttReleaseTimerRef.current = window.setTimeout(() => {
        pttReleaseTimerRef.current = null;
        pttHeldRef.current = false;
        setIsPttActive(false);
        const track = getLocalMicTrack();
        if (track) {
          void track.mute().then(() => syncParticipants()).catch(() => {});
        }
      }, delay);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === voiceAudioRef.current.pttKey) {
        releasePtt();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", releasePtt);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", releasePtt);
      if (pttReleaseTimerRef.current !== null) {
        window.clearTimeout(pttReleaseTimerRef.current);
        pttReleaseTimerRef.current = null;
      }
    };
  }, [connectionState, isDeafened, syncParticipants, voiceAudio.inputMode]);

  const updateScreenShareConfig = useCallback((patch: Partial<ScreenShareConfig>) => {
    setScreenShareConfig((prev) => {
      const next = { ...prev, ...patch };
      const prefs = loadAppPreferences();
      saveAppPreferences({ ...prefs, screenShareConfig: next });
      return next;
    });
  }, []);

  const setUserVolume = useCallback((identity: string, volume: number) => {
    const clamped = Math.max(0, Math.min(2, Number(volume.toFixed(2))));
    setUserVolumes((prev) => {
      const next = { ...prev, [identity]: clamped };
      try {
        window.localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
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
        const res = await apiFetch("/api/livekit/moderate", {
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
        const res = await apiFetch("/api/livekit/moderate", {
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

  // Instant low-latency Web Audio RMS Voice Activity Detection (~45ms attack, ~140ms release)
  // Eliminates LiveKit's ~500-800ms server-side ActiveSpeakersChanged delay.
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) {
      activeSpeakerIdsRef.current = new Set();
      setActiveSpeakerIds(new Set());
      return;
    }

    let audioCtx: AudioContext | null = null;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioCtx();
    } catch {
      return;
    }

    interface MeterEntry {
      trackId: string;
      source: MediaStreamAudioSourceNode;
      analyser: AnalyserNode;
      data: Uint8Array<ArrayBuffer>;
      lastLoudAt: number;
    }

    const meters = new Map<string, MeterEntry>();
    const SPEAK_THRESHOLD = 0.015;
    const HOLD_MS = 140;

    const tick = () => {
      const room = roomRef.current;
      if (!room || !audioCtx || room.state !== ConnectionState.Connected) return;

      if (audioCtx.state === "suspended") {
        void audioCtx.resume().catch(() => {});
      }

      const activeParticipants: Participant[] = [
        room.localParticipant,
        ...Array.from(room.remoteParticipants.values()),
      ];
      const presentIds = new Set<string>();

      for (const p of activeParticipants) {
        presentIds.add(p.identity);
        const micPub = p.getTrackPublication(Track.Source.Microphone);
        const mediaTrack =
          micPub && !micPub.isMuted ? micPub.track?.mediaStreamTrack : undefined;

        const existing = meters.get(p.identity);
        if (!mediaTrack || mediaTrack.readyState !== "live") {
          if (existing) {
            try {
              existing.source.disconnect();
              existing.analyser.disconnect();
            } catch {
              // ignore
            }
            meters.delete(p.identity);
          }
          continue;
        }

        if (!existing || existing.trackId !== mediaTrack.id) {
          if (existing) {
            try {
              existing.source.disconnect();
              existing.analyser.disconnect();
            } catch {
              // ignore
            }
          }
          try {
            const source = audioCtx.createMediaStreamSource(new MediaStream([mediaTrack]));
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.15;
            source.connect(analyser);
            meters.set(p.identity, {
              trackId: mediaTrack.id,
              source,
              analyser,
              data: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
              lastLoudAt: 0,
            });
          } catch {
            // ignore track attach error
          }
        }
      }

      // Clean up disconnected participant meters
      meters.forEach((entry, id) => {
        if (!presentIds.has(id)) {
          try {
            entry.source.disconnect();
            entry.analyser.disconnect();
          } catch {
            // ignore
          }
          meters.delete(id);
        }
      });

      const now = performance.now();
      const nextSpeakers = new Set<string>();

      meters.forEach((entry, identity) => {
        entry.analyser.getByteTimeDomainData(entry.data);
        let sumSq = 0;
        for (let i = 0; i < entry.data.length; i++) {
          const norm = (entry.data[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / entry.data.length);
        if (rms >= SPEAK_THRESHOLD) {
          entry.lastLoudAt = now;
        }
        if (now - entry.lastLoudAt <= HOLD_MS) {
          nextSpeakers.add(identity);
        }
      });

      const prev = activeSpeakerIdsRef.current;
      let changed = prev.size !== nextSpeakers.size;
      if (!changed) {
        nextSpeakers.forEach((id) => {
          if (!prev.has(id)) changed = true;
        });
      }

      if (changed) {
        activeSpeakerIdsRef.current = nextSpeakers;
        setActiveSpeakerIds(nextSpeakers);
        syncParticipants();
      }
    };

    const timer = setInterval(tick, 45);

    return () => {
      clearInterval(timer);
      meters.forEach((entry) => {
        try {
          entry.source.disconnect();
          entry.analyser.disconnect();
        } catch {
          // ignore
        }
      });
      meters.clear();
      if (audioCtx && audioCtx.state !== "closed") {
        void audioCtx.close().catch(() => {});
      }
    };
  }, [connectionState, syncParticipants]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || connectionState !== ConnectionState.Connected) return;

    let cancelled = false;
    let seenIcePing = false;
    let timer: ReturnType<typeof setTimeout>;
    const sample = async () => {
      const { pingMs, hasIcePing, packetLossPct, transport } = await readLiveKitStats(room).catch(
        () => summarizeVoiceNetwork([])
      );
      if (cancelled || roomRef.current !== room || room.state !== ConnectionState.Connected) {
        return;
      }

      if (hasIcePing) seenIcePing = true;
      // Once ICE STUN RTT is established, don't let a transient fallback to noisy RTCP RTT spike the chart
      const effectivePing = !seenIcePing || hasIcePing ? pingMs : null;

      const timestamp = Date.now();
      const serverHost = serverHostRef.current;
      setNetworkStats((prev) => {
        const history =
          effectivePing === null
            ? prev.history
            : [...prev.history.slice(-39), { timestamp, pingMs: effectivePing }];
        const sum = history.reduce((total, entry) => total + entry.pingMs, 0);
        return {
          ...prev,
          lastPingMs: effectivePing ?? prev.lastPingMs,
          avgPingMs: history.length ? Math.round(sum / history.length) : null,
          packetLossPct,
          history,
          serverHost,
          transport: transport ?? prev.transport,
        };
      });
      timer = setTimeout(() => void sample(), 2000);
    };

    void sample();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeChannel?.id, connectionState]);

  const disconnectCurrentRoom = useCallback(() => {
    const room = roomRef.current;
    if (!room) return roomDisconnectRef.current;
    roomRef.current = null;

    const closing = room.disconnect().finally(() => {
      if (roomDisconnectRef.current === closing) roomDisconnectRef.current = null;
    });
    roomDisconnectRef.current = closing;
    return closing;
  }, []);

  const leaveVoiceChannel = useCallback(
    async (options?: { silent?: boolean }) => {
      joinAttemptIdRef.current += 1;
      joinRequestRef.current?.controller.abort();
      joinRequestRef.current = null;
      switchingRef.current = false;
      const hadRoom = Boolean(roomRef.current);
      const disconnect = disconnectCurrentRoom();
      setActiveChannel(null);
      setConnectionState(ConnectionState.Disconnected);
      setParticipants([]);
      setActiveSpeakerIds(new Set());
      setNetworkStats(EMPTY_NETWORK_STATS);
      setWatchTargetIdentity(null);
      setIsMuted(false);
      setIsDeafened(false);
      setIsCameraOn(false);
      setIsScreenSharing(false);
      await disconnect?.catch(() => {});
      if (hadRoom && !options?.silent) playSound("leave");
      onOccupancyChanged?.();
      setTimeout(() => onOccupancyChanged?.(), 500);
    },
    [disconnectCurrentRoom, onOccupancyChanged]
  );

  leaveVoiceChannelRef.current = leaveVoiceChannel;

  const joinVoiceChannel = useCallback(
    async (channel: ChannelItem, options?: JoinVoiceOptions) => {
      if (options?.watchIdentity !== undefined) {
        setWatchTargetIdentity(options.watchIdentity);
      }

      if (joinRequestRef.current?.channelId === channel.id) return;
      if (
        activeChannel?.id === channel.id &&
        roomRef.current &&
        (roomRef.current.state === ConnectionState.Connected ||
          roomRef.current.state === ConnectionState.Connecting)
      ) {
        return;
      }

      const attemptId = ++joinAttemptIdRef.current;
      joinRequestRef.current?.controller.abort();
      const request = { channelId: channel.id, controller: new AbortController() };
      joinRequestRef.current = request;
      setError(null);
      setNotice(null);

      // Build optimistic participants list keeping EXISTING people in their exact order first,
      // then appending you cleanly so nobody vanishes or shifts while connecting.
      const optimisticList: VoiceParticipantView[] = [];
      if (options?.seedOccupants) {
        for (const occ of options.seedOccupants) {
          if (options.currentUser && occ.identity === options.currentUser.id) continue;
          if (optimisticList.some((p) => p.identity === occ.identity)) continue;
          optimisticList.push({
            identity: occ.identity,
            name: occ.name,
            username: occ.username,
            avatarColor: occ.avatarColor,
            avatarUrl: occ.avatarUrl ?? null,
            isLocal: false,
            isSpeaking: false,
            isMuted: false,
            isCameraOn: false,
            isScreenSharing: Boolean(occ.isScreenSharing),
            cameraTrack: null,
            screenTrack: null,
            screenAudioTrack: null,
            micAudioTrack: null,
          });
        }
      }
      if (options?.currentUser) {
        optimisticList.push({
          identity: options.currentUser.id,
          name: options.currentUser.displayName,
          username: options.currentUser.username,
          avatarColor: options.currentUser.avatarColor,
          avatarUrl: options.currentUser.avatarUrl,
          role: options.currentUser.role,
          isLocal: true,
          isSpeaking: false,
          isMuted: false,
          isCameraOn: false,
          isScreenSharing: false,
          cameraTrack: null,
          screenTrack: null,
          screenAudioTrack: null,
          micAudioTrack: null,
        });
      }

      switchingRef.current = true;
      setActiveChannel(channel);
      setConnectionState(ConnectionState.Connecting);
      setParticipants(optimisticList);
      setNetworkStats(EMPTY_NETWORK_STATS);

      try {
        const url = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();
        if (url?.startsWith("wss://")) preconnect(url.replace(/^wss:/, "https:"));

        const tokenStartedAt = performance.now();
        const tokenRequest = apiFetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: request.controller.signal,
          body: JSON.stringify(
            options?.dmConversationId
              ? { dmConversationId: options.dmConversationId }
              : { channelId: channel.id }
          ),
        }).then(async (response) => ({
          response,
          data: await response.json(),
          tokenMs: Math.round(performance.now() - tokenStartedAt),
        }));
        const [{ response, data, tokenMs }] = await Promise.all([
          tokenRequest,
          disconnectCurrentRoom(),
        ]);
        if (attemptId !== joinAttemptIdRef.current) return;
        if (!response.ok) throw new Error(data.error ?? "Could not connect to voice server.");

        try {
          const parsedUrl = new URL(data.url);
          serverHostRef.current = parsedUrl.host;
          isLiveKitCloudRef.current = parsedUrl.host.endsWith(".livekit.cloud");
        } catch {
          serverHostRef.current = "livekit-edge";
          isLiveKitCloudRef.current = false;
        }

        const pubAudioDefaults = getAudioPublishOptions(voiceAudioRef.current);
        const room = new Room({
          adaptiveStream: false,
          dynacast: true,
          audioCaptureDefaults: {
            autoGainControl,
            echoCancellation,
            noiseSuppression: noiseMode === "standard",
            deviceId: selectedAudioInput || undefined,
          },
          videoCaptureDefaults: {
            resolution: VideoPresets.h720.resolution,
            deviceId: selectedVideoInput || undefined,
          },
          publishDefaults: {
            simulcast: false,
            videoCodec: "vp9",
            screenShareSimulcastLayers: [],
            ...pubAudioDefaults,
          },
        });

        roomRef.current = room;

        const handleRoomUpdate = () => {
          if (roomRef.current !== room) return;
          syncParticipants();
        };

        room
          .on(RoomEvent.ConnectionStateChanged, (state) => {
            if (roomRef.current !== room) return;
            setConnectionState(state);
            if (state === ConnectionState.Connected) {
              switchingRef.current = false;
              syncTrackSubscriptions(
                room,
                watchTargetIdentityRef.current,
                previewTargetIdentityRef.current
              );
              syncParticipants();
            }
          })
          .on(RoomEvent.ParticipantConnected, () => {
            if (roomRef.current !== room) return;
            playSound("peer-join");
            syncTrackSubscriptions(
              room,
              watchTargetIdentityRef.current,
              previewTargetIdentityRef.current
            );
            syncParticipants();
            onOccupancyChanged?.();
          })
          .on(RoomEvent.ParticipantDisconnected, () => {
            if (roomRef.current !== room) return;
            playSound("peer-leave");
            syncParticipants();
            onOccupancyChanged?.();
          })
          .on(RoomEvent.TrackPublished, () => {
            if (roomRef.current !== room) return;
            syncTrackSubscriptions(
              room,
              watchTargetIdentityRef.current,
              previewTargetIdentityRef.current
            );
            syncParticipants();
            onOccupancyChanged?.();
          })
          .on(RoomEvent.TrackUnpublished, () => {
            if (roomRef.current !== room) return;
            syncParticipants();
            onOccupancyChanged?.();
          })
          .on(RoomEvent.TrackSubscribed, handleRoomUpdate)
          .on(RoomEvent.TrackUnsubscribed, handleRoomUpdate)
          .on(RoomEvent.TrackMuted, handleRoomUpdate)
          .on(RoomEvent.TrackUnmuted, handleRoomUpdate)
          .on(RoomEvent.LocalTrackPublished, () => {
            if (roomRef.current !== room) return;
            syncParticipants();
            onOccupancyChanged?.();
          })
          .on(RoomEvent.LocalTrackUnpublished, (pub) => {
            if (roomRef.current !== room) return;
            if (pub.source === Track.Source.ScreenShare) {
              playSound("stream-stop");
            }
            syncParticipants();
            onOccupancyChanged?.();
          })
          .on(RoomEvent.DataReceived, (payload: Uint8Array) => {
            if (roomRef.current !== room) return;
            try {
              const decoded = new TextDecoder().decode(payload);
              const msg = JSON.parse(decoded) as {
                type?: string;
                byDisplayName?: string;
              };
              if (msg.type === "dm-call-declined") {
                playCallDeclinedSound();
                notify({
                  kind: "warning",
                  title: "Call Declined",
                  message: msg.byDisplayName
                    ? `${msg.byDisplayName} declined your call.`
                    : "The call was declined.",
                  source: "Direct Call",
                });
                void leaveVoiceChannelRef.current({ silent: true });
              }
            } catch {
              // ignore non-JSON data packets
            }
          })
          .on(RoomEvent.Disconnected, () => {
            if (roomRef.current === room && !switchingRef.current) {
              roomRef.current = null;
              playSound("leave");
              setActiveChannel(null);
              setConnectionState(ConnectionState.Disconnected);
              setParticipants([]);
              setNetworkStats(EMPTY_NETWORK_STATS);
              setWatchTargetIdentity(null);
              setIsCameraOn(false);
              setIsScreenSharing(false);
              onOccupancyChanged?.();
            }
          });

        const connectStartedAt = performance.now();
        await room.connect(data.url, data.token, { autoSubscribe: false });
        if (attemptId !== joinAttemptIdRef.current) return;
        syncTrackSubscriptions(room, watchTargetIdentityRef.current);
        const connectMs = Math.round(performance.now() - connectStartedAt);
        const serverHost = serverHostRef.current;
        setNetworkStats((prev) => ({
          ...prev,
          serverHost,
          joinTiming: { tokenMs, connectMs },
        }));
        switchingRef.current = false;
        playSound("join");
        syncParticipants();

        try {
          await room.localParticipant.setMicrophoneEnabled(
            true,
            {
              autoGainControl,
              echoCancellation,
              noiseSuppression: noiseMode === "standard",
              deviceId: selectedAudioInput || undefined,
            },
            getAudioPublishOptions(voiceAudioRef.current)
          );
          if (attemptId !== joinAttemptIdRef.current) return;
          await applyNoiseProcessorToCurrentMic(
            noiseMode,
            echoCancellation,
            autoGainControl,
            false
          );
          if (attemptId !== joinAttemptIdRef.current) return;
          if (voiceAudioRef.current.inputMode === "push-to-talk") {
            const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
            const localTrack = micPub?.track as LocalAudioTrack | undefined;
            if (localTrack) {
              await localTrack.mute().catch(() => {});
            }
          }
          if (options?.startWithVideo) {
            await room.localParticipant
              .setCameraEnabled(true, {
                resolution: VideoPresets.h720.resolution,
                deviceId: selectedVideoInput || undefined,
              })
              .catch(() => {});
          }
        } catch {
          if (attemptId === joinAttemptIdRef.current) {
            setError("Microphone permission denied. Connected in listen-only mode.");
          }
        }

        if (attemptId !== joinAttemptIdRef.current) return;
        await refreshDevices();
        if (attemptId !== joinAttemptIdRef.current) return;
        syncParticipants();
        onOccupancyChanged?.();
        setTimeout(() => onOccupancyChanged?.(), 600);
      } catch (err) {
        if (attemptId !== joinAttemptIdRef.current) return;
        request.controller.abort();
        switchingRef.current = false;
        const msg = err instanceof Error ? err.message : "Failed to join voice channel.";
        setError(msg);
        const disconnect = disconnectCurrentRoom();
        setActiveChannel(null);
        setParticipants([]);
        setConnectionState(ConnectionState.Disconnected);
        setNetworkStats(EMPTY_NETWORK_STATS);
        await disconnect?.catch(() => {});
      } finally {
        if (joinRequestRef.current === request) joinRequestRef.current = null;
      }
    },
    [
      activeChannel?.id,
      applyNoiseProcessorToCurrentMic,
      autoGainControl,
      disconnectCurrentRoom,
      echoCancellation,
      noiseMode,
      notify,
      onOccupancyChanged,
      refreshDevices,
      selectedAudioInput,
      selectedVideoInput,
      syncParticipants,
      syncTrackSubscriptions,
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
      await room.localParticipant.setMicrophoneEnabled(
        nextEnabled,
        {
          autoGainControl,
          echoCancellation,
          noiseSuppression: noiseMode === "standard",
          deviceId: selectedAudioInput || undefined,
        },
        getAudioPublishOptions(voiceAudioRef.current)
      );
      if (nextEnabled) {
        await applyNoiseProcessorToCurrentMic(
          noiseMode,
          echoCancellation,
          autoGainControl,
          false
        );
      }
      playSound(nextEnabled ? "unmute" : "mute");
      syncParticipants();
    } catch {
      setError("Could not access microphone.");
    }
  }, [
    applyNoiseProcessorToCurrentMic,
    autoGainControl,
    echoCancellation,
    isDeafened,
    noiseMode,
    selectedAudioInput,
    syncParticipants,
  ]);

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
        ...(selectedVideoInput
          ? { deviceId: selectedVideoInput }
          : { facingMode: cameraFacingMode }),
      });
      if (nextEnabled) {
        const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        const settings = track?.mediaStreamTrack?.getSettings?.();
        if (settings?.facingMode === "environment" || settings?.facingMode === "user") {
          setCameraFacingMode(settings.facingMode);
        }
        void refreshDevices();
      }
      playSound(nextEnabled ? "unmute" : "mute");
      syncParticipants();
    } catch {
      setError("Could not access webcam.");
    }
  }, [cameraFacingMode, refreshDevices, selectedVideoInput, setError, syncParticipants]);

  const switchCameraFacingMode = useCallback(
    async (target?: CameraFacingMode) => {
      const nextFacing: CameraFacingMode =
        target ?? (cameraFacingMode === "user" ? "environment" : "user");
      const room = roomRef.current;
      if (!room || !room.localParticipant.isCameraEnabled) {
        setCameraFacingMode(nextFacing);
        return;
      }
      if (switchingCameraRef.current) return;
      switchingCameraRef.current = true;
      setIsSwitchingCamera(true);

      try {
        const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        const videoTrack = camPub?.track as LocalVideoTrack | undefined;
        if (!videoTrack) {
          setCameraFacingMode(nextFacing);
          return;
        }

        const currentDeviceId =
          videoTrack.mediaStreamTrack?.getSettings?.().deviceId ?? selectedVideoInput;
        let switched = false;

        try {
          await videoTrack.restartTrack({
            facingMode: nextFacing,
            resolution: VideoPresets.h720.resolution,
          });
          const afterSettings = videoTrack.mediaStreamTrack?.getSettings?.();
          const sameDevice =
            Boolean(currentDeviceId) && afterSettings?.deviceId === currentDeviceId;

          if (!sameDevice) {
            switched = true;
          }
        } catch {
          // Fall through to explicit deviceId switching
        }

        if (!switched) {
          const allCameras = devices.videoInputs;
          const labelRegex =
            nextFacing === "environment" ? /back|rear|environment/i : /front|user|facetime/i;
          const matchedCamera =
            allCameras.find((d) => labelRegex.test(d.label) && d.deviceId !== currentDeviceId) ??
            allCameras.find((d) => d.deviceId !== currentDeviceId);

          if (matchedCamera) {
            await videoTrack.restartTrack({
              deviceId: { exact: matchedCamera.deviceId },
              resolution: VideoPresets.h720.resolution,
            });
            switched = true;
          }
        }

        if (switched) {
          const settings = videoTrack.mediaStreamTrack?.getSettings?.();
          if (settings?.facingMode === "environment" || settings?.facingMode === "user") {
            setCameraFacingMode(settings.facingMode);
          } else {
            setCameraFacingMode(nextFacing);
          }
          if (settings?.deviceId) {
            setSelectedVideoInput(settings.deviceId);
          }
          syncParticipants();
          void refreshDevices();
        }
      } catch {
        setError("Could not switch camera.");
      } finally {
        switchingCameraRef.current = false;
        setIsSwitchingCamera(false);
      }
    },
    [cameraFacingMode, devices.videoInputs, refreshDevices, selectedVideoInput, setError, syncParticipants]
  );

  const enableCameraWithFacing = useCallback(
    async (facing: CameraFacingMode): Promise<boolean> => {
      const room = roomRef.current;
      if (!room) return false;
      if (room.localParticipant.isCameraEnabled) {
        await switchCameraFacingMode(facing);
        return true;
      }
      try {
        await room.localParticipant.setCameraEnabled(true, {
          facingMode: facing,
          resolution: VideoPresets.h720.resolution,
        });
        const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        const settings = track?.mediaStreamTrack?.getSettings?.();
        setCameraFacingMode(
          settings?.facingMode === "environment" || settings?.facingMode === "user"
            ? settings.facingMode
            : facing
        );
        if (settings?.deviceId) {
          setSelectedVideoInput(settings.deviceId);
        }
        playSound("unmute");
        syncParticipants();
        void refreshDevices();
        return true;
      } catch {
        setError("Could not start camera.");
        return false;
      }
    },
    [refreshDevices, setError, switchCameraFacingMode, syncParticipants]
  );

  /** Start or seamlessly restart (change source / quality) screen share without dropping voice */
  const startScreenShare = useCallback(
    async (override?: Partial<ScreenShareConfig>): Promise<boolean> => {
      const room = roomRef.current;
      if (!room) return false;

      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
        setError("Screen sharing is not supported in this mobile browser.");
        return false;
      }

      const cfg: ScreenShareConfig = { ...screenShareConfig, ...(override ?? {}) };
      updateScreenShareConfig(cfg);

      try {
        // If already sharing, disable previous track cleanly first so browser re-prompts for source/settings
        if (room.localParticipant.isScreenShareEnabled) {
          await room.localParticipant.setScreenShareEnabled(false);
        }

        const dims = getResolutionDimensions(cfg.resolution);
        const resolution = dims
          ? { width: dims.width, height: dims.height, frameRate: cfg.fps }
          : undefined;

        const publishOpts = {
          simulcast: false,
          videoCodec: cfg.codec,
          degradationPreference:
            cfg.mode === "detail"
              ? ("maintain-resolution" as const)
              : ("maintain-framerate" as const),
          screenShareEncoding: {
            maxBitrate: cfg.bitrateMbps * 1_000_000,
            maxFramerate: cfg.fps,
          },
        };

        try {
          await room.localParticipant.setScreenShareEnabled(
            true,
            {
              audio: cfg.shareAudio,
              resolution,
              contentHint: cfg.mode,
              selfBrowserSurface: "exclude",
              systemAudio: cfg.shareAudio ? "include" : "exclude",
              suppressLocalAudioPlayback: true,
            },
            publishOpts
          );
        } catch (innerErr) {
          if (innerErr instanceof Error && innerErr.name === "NotAllowedError") {
            throw innerErr;
          }
          // Mobile browsers sometimes reject desktop-only displaySurface/audio hints — retry with safe constraints
          await room.localParticipant.setScreenShareEnabled(
            true,
            {
              audio: cfg.shareAudio,
              resolution,
            },
            publishOpts
          );
        }

        playSound("stream-start");
        syncParticipants();
        onOccupancyChanged?.();
        return true;
      } catch (err) {
        if (err instanceof Error && err.name === "NotAllowedError") {
          return false;
        }
        setError("Could not start screen sharing.");
        return false;
      }
    },
    [onOccupancyChanged, screenShareConfig, setError, syncParticipants, updateScreenShareConfig]
  );

  const stopScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    if (room.localParticipant.isScreenShareEnabled) {
      await room.localParticipant.setScreenShareEnabled(false);
      playSound("stream-stop");
      syncParticipants();
      onOccupancyChanged?.();
    }
  }, [onOccupancyChanged, syncParticipants]);

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
    const inVoice =
      Boolean(activeChannel) && connectionState !== ConnectionState.Disconnected;
    void voiceControls?.syncState({
      inVoice,
      muted: isMuted,
      deafened: isDeafened,
      channelName: activeChannel?.name ?? null,
    });
  }, [activeChannel, connectionState, isDeafened, isMuted]);

  const toggleMuteRef = useRef(toggleMute);
  toggleMuteRef.current = toggleMute;
  const toggleDeafenRef = useRef(toggleDeafen);
  toggleDeafenRef.current = toggleDeafen;

  useEffect(() => {
    if (!voiceControls) return;
    let cleanup: (() => void) | null = null;
    let active = true;
    void voiceControls.subscribe({
      onToggleMute: () => void toggleMuteRef.current(),
      onToggleDeafen: () => void toggleDeafenRef.current(),
    }).then((unlisten) => {
      if (active) {
        cleanup = unlisten;
      } else {
        unlisten();
      }
    });
    return () => {
      active = false;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    return () => {
      joinAttemptIdRef.current += 1;
      joinRequestRef.current?.controller.abort();
      joinRequestRef.current = null;
      void disconnectCurrentRoom()?.catch(() => {});
    };
  }, [disconnectCurrentRoom]);

  const canSwitchCamera = devices.videoInputs.length > 1 || isTouchDevice;

  const value = useMemo<VoiceContextValue>(
    () => ({
      activeChannel,
      connectionState,
      error,
      notice,
      participants,
      networkStats,
      isMuted,
      isDeafened,
      isCameraOn,
      cameraFacingMode,
      isSwitchingCamera,
      canSwitchCamera,
      supportsScreenShare,
      isScreenSharing,
      screenShareConfig,
      updateScreenShareConfig,
      startScreenShare,
      stopScreenShare,
      noiseMode,
      activeNoiseEngine,
      activeSiqEngine,
      setNoiseMode,
      echoCancellation,
      setEchoCancellation,
      autoGainControl,
      setAutoGainControl,
      voiceAudio,
      updateVoiceAudio,
      updateSiqDsp,
      applySiqPreset,
      isPttActive,
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
      watchTargetIdentity,
      setWatchTargetIdentity,
      previewTargetIdentity,
      setPreviewTargetIdentity,
      joinVoiceChannel,
      leaveVoiceChannel,
      toggleMute,
      toggleDeafen,
      toggleCamera,
      switchCameraFacingMode,
      enableCameraWithFacing,
      clearError: () => setError(null),
      clearNotice: () => setNotice(null),
    }),
    [
      activeChannel,
      connectionState,
      error,
      notice,
      participants,
      networkStats,
      isMuted,
      isDeafened,
      isCameraOn,
      cameraFacingMode,
      isSwitchingCamera,
      canSwitchCamera,
      supportsScreenShare,
      isScreenSharing,
      screenShareConfig,
      updateScreenShareConfig,
      startScreenShare,
      stopScreenShare,
      noiseMode,
      activeNoiseEngine,
      activeSiqEngine,
      setNoiseMode,
      echoCancellation,
      setEchoCancellation,
      autoGainControl,
      setAutoGainControl,
      voiceAudio,
      updateVoiceAudio,
      updateSiqDsp,
      applySiqPreset,
      isPttActive,
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
      watchTargetIdentity,
      previewTargetIdentity,
      joinVoiceChannel,
      leaveVoiceChannel,
      toggleMute,
      toggleDeafen,
      toggleCamera,
      switchCameraFacingMode,
      enableCameraWithFacing,
      setError,
      setNotice,
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
                volume={(userVolumes[p.identity] ?? 1) * (voiceAudio.outputVolumePct / 100)}
                deafened={isDeafened}
                outputDeviceId={selectedAudioOutput || undefined}
              />
            )}
            {p.screenAudioTrack && (
              <RemoteAudioPlayer
                track={p.screenAudioTrack}
                volume={
                  (userVolumes[`${p.identity}:screen`] ?? 1) * (voiceAudio.outputVolumePct / 100)
                }
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
