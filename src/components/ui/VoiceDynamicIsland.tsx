"use client";

import { ConnectionState } from "livekit-client";
import {
  ArrowUpRight,
  Mic,
  MicOff,
  Monitor,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { BarVisualizer } from "@/components/ui/BarVisualizer";
import { SlidingNumber } from "@/components/ui/MotionPrimitives";
import { useVoice } from "@/components/voice/VoiceProvider";

interface VoiceDynamicIslandProps {
  /** Only render when connected to voice and NOT currently viewing that voice stage */
  visible: boolean;
  onReturnToStage: () => void;
  onOpenScreenShareModal: () => void;
  onLeaveVoice: () => void;
}

/**
 * Cult UI Dynamic Island-inspired floating live audio capsule.
 * Keeps active speakers, ping telemetry, and instant voice controls
 * reachable while browsing text channels, DMs, or Friends.
 */
export function VoiceDynamicIsland({
  visible,
  onReturnToStage,
  onOpenScreenShareModal,
  onLeaveVoice,
}: VoiceDynamicIslandProps) {
  const voice = useVoice();
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!expanded) return;
    function handleOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [expanded]);

  useEffect(() => {
    if (!visible) setExpanded(false);
  }, [visible]);

  const activeChannel = voice.activeChannel;
  const speakingParticipants = voice.participants.filter((p) => p.isSpeaking);
  const primarySpeaker = speakingParticipants[0] ?? null;
  const isConnecting = voice.connectionState === ConnectionState.Connecting;
  const ping = voice.networkStats.lastPingMs;

  const visualizerState = isConnecting
    ? "connecting"
    : voice.isMuted && !primarySpeaker
      ? "muted"
      : primarySpeaker
        ? "speaking"
        : "listening";

  return (
    <AnimatePresence>
      {visible && activeChannel && (
        <div
          ref={rootRef}
          className="pointer-events-none fixed left-1/2 top-3 z-50 flex -translate-x-1/2 justify-center"
        >
          <motion.div
            layout
            initial={{ opacity: 0, y: -18, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="siq-bezel pointer-events-auto overflow-hidden border border-white/[0.12] bg-[#0D0E12]/95 backdrop-blur-xl"
            style={{ borderRadius: expanded ? 22 : 9999 }}
          >
            {!expanded ? (
              <motion.div
                layout="position"
                className="flex items-center gap-2.5 py-1.5 pl-3 pr-1.5"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="flex items-center gap-2.5 text-left focus:outline-none"
                  title="Expand voice controls"
                >
                  <BarVisualizer
                    state={visualizerState}
                    barCount={5}
                    size="xs"
                    mediaStreamTrack={primarySpeaker?.micAudioTrack?.mediaStreamTrack ?? null}
                  />

                  <div className="flex max-w-[175px] items-center gap-1.5">
                    {primarySpeaker ? (
                      <>
                        <Avatar
                          name={primarySpeaker.name}
                          color={primarySpeaker.avatarColor}
                          avatarUrl={primarySpeaker.avatarUrl}
                          size="xs"
                        />
                        <span
                          dir="auto"
                          className="truncate text-xs font-semibold text-emerald-300"
                        >
                          {primarySpeaker.name}
                        </span>
                      </>
                    ) : (
                      <span
                        dir="auto"
                        className="truncate text-xs font-semibold text-zinc-100"
                      >
                        {activeChannel.name}
                      </span>
                    )}
                  </div>

                  {ping !== null && (
                    <span className="hidden items-center gap-0.5 rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-300 sm:inline-flex">
                      <SlidingNumber value={ping} />
                      <span>ms</span>
                    </span>
                  )}
                </button>

                <div className="h-4 w-px bg-white/[0.09]" />

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void voice.toggleMute()}
                    title={voice.isMuted ? "Unmute" : "Mute"}
                    className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                      voice.isMuted
                        ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                        : "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.12]"
                    }`}
                  >
                    {voice.isMuted ? (
                      <MicOff className="h-3.5 w-3.5" />
                    ) : (
                      <Mic className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={onReturnToStage}
                    title="Open Voice Stage"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-zinc-200 transition-colors hover:bg-emerald-500/20 hover:text-emerald-300"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={onLeaveVoice}
                    title="Disconnect"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-500/15 text-rose-400 transition-colors hover:bg-rose-500 hover:text-white"
                  >
                    <PhoneOff className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                className="w-[330px] max-w-[92vw] p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                      <BarVisualizer state={visualizerState} barCount={5} size="xs" />
                    </div>
                    <div className="min-w-0">
                      <p dir="auto" className="truncate text-xs font-semibold text-zinc-100">
                        {activeChannel.name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] font-medium text-zinc-400">
                        <span className="text-emerald-400">
                          {isConnecting ? "Connecting" : "Live"}
                        </span>
                        {ping !== null && (
                          <span className="inline-flex items-center gap-0.5 font-mono text-zinc-300">
                            <SlidingNumber value={ping} />
                            <span>ms</span>
                          </span>
                        )}
                        <span>· {voice.participants.length} in room</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setExpanded(false);
                      onReturnToStage();
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500 hover:text-zinc-950"
                  >
                    <span>Stage</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>

                {/* Mini participant pills */}
                {voice.participants.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-2.5">
                    {voice.participants.slice(0, 6).map((p) => (
                      <span
                        key={p.identity}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                          p.isSpeaking
                            ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-200"
                            : "border-white/[0.07] bg-white/[0.03] text-zinc-300"
                        }`}
                      >
                        <Avatar
                          name={p.name}
                          color={p.avatarColor}
                          avatarUrl={p.avatarUrl}
                          size="xs"
                        />
                        <span dir="auto" className="max-w-[80px] truncate">
                          {p.name}
                        </span>
                        {p.isMuted && <MicOff className="h-2.5 w-2.5 text-rose-400" />}
                      </span>
                    ))}
                  </div>
                )}

                {/* Quick Controls */}
                <div className="mt-3 grid grid-cols-5 gap-1.5">
                  <button
                    type="button"
                    onClick={() => void voice.toggleMute()}
                    title={voice.isMuted ? "Unmute" : "Mute"}
                    className={`flex h-9 items-center justify-center rounded-xl border transition-colors ${
                      voice.isMuted
                        ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                        : "border-white/[0.08] bg-[#181920] text-zinc-200 hover:bg-white/[0.09]"
                    }`}
                  >
                    {voice.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => void voice.toggleDeafen()}
                    title={voice.isDeafened ? "Undeafen" : "Deafen"}
                    className={`flex h-9 items-center justify-center rounded-xl border transition-colors ${
                      voice.isDeafened
                        ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                        : "border-white/[0.08] bg-[#181920] text-zinc-200 hover:bg-white/[0.09]"
                    }`}
                  >
                    {voice.isDeafened ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => void voice.toggleCamera()}
                    title="Toggle camera"
                    className={`flex h-9 items-center justify-center rounded-xl border transition-colors ${
                      voice.isCameraOn
                        ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-300"
                        : "border-white/[0.08] bg-[#181920] text-zinc-200 hover:bg-white/[0.09]"
                    }`}
                  >
                    {voice.isCameraOn ? (
                      <Video className="h-4 w-4" />
                    ) : (
                      <VideoOff className="h-4 w-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setExpanded(false);
                      onOpenScreenShareModal();
                    }}
                    title="Share screen"
                    className={`flex h-9 items-center justify-center rounded-xl border transition-colors ${
                      voice.isScreenSharing
                        ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-300"
                        : "border-white/[0.08] bg-[#181920] text-zinc-200 hover:bg-white/[0.09]"
                    }`}
                  >
                    <Monitor className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={onLeaveVoice}
                    title="Disconnect"
                    className="flex h-9 items-center justify-center rounded-xl bg-rose-500 text-white transition-colors hover:bg-rose-400"
                  >
                    <PhoneOff className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
