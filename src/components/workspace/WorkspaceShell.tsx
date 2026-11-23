"use client";

import {
  GearSix,
  Hash,
  Headphones,
  Key,
  List,
  Microphone,
  MicrophoneSlash,
  MonitorPlay,
  PencilSimple,
  PhoneDisconnect,
  Plus,
  SignOut,
  SpeakerHigh,
  SpeakerSlash,
  Trash,
  Users,
  X,
} from "@phosphor-icons/react";
import { ConnectionState } from "livekit-client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TextChannelView } from "@/components/chat/TextChannelView";
import { Avatar } from "@/components/ui/Avatar";
import { useVoice, VoiceProvider } from "@/components/voice/VoiceProvider";
import { VoiceStage } from "@/components/voice/VoiceStage";
import { ChannelModal } from "@/components/workspace/ChannelModal";
import { InviteModal } from "@/components/workspace/InviteModal";
import { ProfileModal } from "@/components/workspace/ProfileModal";
import type {
  ChannelItem,
  PublicUser,
  VoiceOccupancyMap,
} from "@/lib/types";

interface WorkspaceShellProps {
  initialUser: PublicUser;
  initialChannels: ChannelItem[];
  initialMembers: PublicUser[];
  initialVoiceOccupancy: VoiceOccupancyMap;
  initialCapabilities: {
    livekitReady: boolean;
    blobReady: boolean;
  };
}

const ONLINE_WINDOW_MS = 60 * 1000;

function isMemberOnline(member: PublicUser, currentUserId: string, nowMs: number): boolean {
  if (member.id === currentUserId) return true;
  return nowMs - new Date(member.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

function WorkspaceInner({
  initialUser,
  initialChannels,
  initialMembers,
  initialVoiceOccupancy,
  initialCapabilities,
  onPresenceRef,
}: WorkspaceShellProps & {
  onPresenceRef: React.MutableRefObject<() => void>;
}) {
  const router = useRouter();
  const voice = useVoice();

  const [user, setUser] = useState<PublicUser>(initialUser);
  const [channels, setChannels] = useState<ChannelItem[]>(initialChannels);
  const [members, setMembers] = useState<PublicUser[]>(initialMembers);
  const [voiceOccupancy, setVoiceOccupancy] =
    useState<VoiceOccupancyMap>(initialVoiceOccupancy);
  const [capabilities, setCapabilities] = useState(initialCapabilities);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [selectedChannelId, setSelectedChannelId] = useState<string>(
    initialChannels.find((c) => c.type === "text")?.id ?? initialChannels[0]?.id ?? ""
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [channelModalType, setChannelModalType] = useState<"text" | "voice">("text");
  const [editingChannel, setEditingChannel] = useState<ChannelItem | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const syncPresence = useCallback(async () => {
    try {
      const res = await fetch("/api/presence");
      if (!res.ok) return;
      const data = await res.json();
      if (data.members) setMembers(data.members);
      if (data.channels) setChannels(data.channels);
      if (data.voiceOccupancy) setVoiceOccupancy(data.voiceOccupancy);
      if (data.capabilities) setCapabilities(data.capabilities);
      setNowMs(Date.now());
    } catch {
      // ignore transient heartbeat failure
    }
  }, []);

  onPresenceRef.current = () => {
    void syncPresence();
  };

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncPresence();
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [syncPresence]);

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");
  const activeChannel =
    channels.find((c) => c.id === selectedChannelId) ?? channels[0] ?? null;

  const onlineMembers = members.filter((m) => isMemberOnline(m, user.id, nowMs));
  const offlineMembers = members.filter((m) => !isMemberOnline(m, user.id, nowMs));

  const isVoiceConnected =
    voice.activeChannel !== null &&
    voice.connectionState !== ConnectionState.Disconnected;

  async function handleSignOut() {
    if (isVoiceConnected) {
      await voice.leaveVoiceChannel();
    }
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function handleUserUpdated(updated: PublicUser) {
    setUser(updated);
    setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }

  function openCreateChannel(type: "text" | "voice") {
    setEditingChannel(null);
    setChannelModalType(type);
    setChannelModalOpen(true);
  }

  function openEditChannel(ch: ChannelItem) {
    setEditingChannel(ch);
    setChannelModalType(ch.type);
    setChannelModalOpen(true);
  }

  function handleChannelSaved(saved: ChannelItem, isEdit: boolean) {
    if (isEdit) {
      setChannels((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    } else {
      setChannels((prev) => [...prev, saved]);
      setSelectedChannelId(saved.id);
    }
  }

  async function handleDeleteChannel(ch: ChannelItem) {
    const confirmed = window.confirm(`Delete "${ch.name}"?`);
    if (!confirmed) return;

    const res = await fetch(`/api/channels/${ch.id}`, { method: "DELETE" });
    if (res.ok) {
      if (voice.activeChannel?.id === ch.id) {
        await voice.leaveVoiceChannel();
      }
      setChannels((prev) => {
        const remaining = prev.filter((c) => c.id !== ch.id);
        if (selectedChannelId === ch.id) {
          setSelectedChannelId(remaining[0]?.id ?? "");
        }
        return remaining;
      });
    }
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#09090B] text-zinc-100">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Rail: Channels, Persistent Voice Dock & Profile Dock */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0E0F12] transition-transform duration-200 md:static md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Workspace Header */}
        <div className="flex h-14 items-center justify-between border-b border-white/[0.07] px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Headphones size={15} weight="bold" />
            </div>
            <span className="font-mono text-sm font-semibold tracking-tight text-zinc-100">
              siq
            </span>
          </div>

          <div className="flex items-center gap-1">
            {user.role === "admin" && (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                title="Invite friends"
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-emerald-400"
              >
                <Key size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close sidebar"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] md:hidden"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Channel Lists */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-2.5 py-4" aria-label="Channels">
          {/* Text Channels */}
          <div>
            <div className="mb-1.5 flex items-center justify-between px-2">
              <span className="text-[11px] font-medium text-zinc-500">Text Channels</span>
              <button
                type="button"
                onClick={() => openCreateChannel("text")}
                title="New text channel"
                className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
              >
                <Plus size={13} weight="bold" />
              </button>
            </div>

            <ul className="space-y-0.5">
              {textChannels.map((channel) => {
                const selected = activeChannel?.id === channel.id;
                const canManage =
                  user.role === "admin" || channel.createdById === user.id;

                return (
                  <li key={channel.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChannelId(channel.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                        selected
                          ? "bg-white/[0.08] font-medium text-zinc-100"
                          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      <Hash
                        size={15}
                        weight={selected ? "bold" : "regular"}
                        className={selected ? "text-emerald-400" : "text-zinc-500"}
                      />
                      <span dir="auto" className="truncate">
                        {channel.name}
                      </span>
                    </button>

                    {canManage && (
                      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                        <button
                          type="button"
                          onClick={() => openEditChannel(channel)}
                          title="Edit channel"
                          className="rounded p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                        >
                          <PencilSimple size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteChannel(channel)}
                          title="Delete channel"
                          className="rounded p-1 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400"
                        >
                          <Trash size={12} />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Voice Channels */}
          <div>
            <div className="mb-1.5 flex items-center justify-between px-2">
              <span className="text-[11px] font-medium text-zinc-500">Voice Channels</span>
              <button
                type="button"
                onClick={() => openCreateChannel("voice")}
                title="New voice channel"
                className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
              >
                <Plus size={13} weight="bold" />
              </button>
            </div>

            <ul className="space-y-1">
              {voiceChannels.map((channel) => {
                const selected = activeChannel?.id === channel.id;
                const isLiveHere =
                  voice.activeChannel?.id === channel.id && isVoiceConnected;
                const canManage =
                  user.role === "admin" || channel.createdById === user.id;

                // Show live LiveKit participants when connected to this room, else server occupancy
                const occupants = isLiveHere
                  ? voice.participants.map((p) => ({
                      identity: p.identity,
                      name: p.name,
                      avatarColor: p.avatarColor,
                      isSpeaking: p.isSpeaking,
                      isMuted: p.isMuted,
                      isScreenSharing: p.isScreenSharing,
                    }))
                  : (voiceOccupancy[channel.slug] ?? []).map((o) => ({
                      identity: o.identity,
                      name: o.name,
                      avatarColor: o.avatarColor,
                      isSpeaking: false,
                      isMuted: false,
                      isScreenSharing: false,
                    }));

                return (
                  <li key={channel.id} className="space-y-0.5">
                    <div className="group flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedChannelId(channel.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                          selected
                            ? "bg-white/[0.08] font-medium text-zinc-100"
                            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                        }`}
                      >
                        <SpeakerHigh
                          size={15}
                          weight={isLiveHere || selected ? "fill" : "regular"}
                          className={
                            isLiveHere
                              ? "text-emerald-400"
                              : selected
                                ? "text-zinc-200"
                                : "text-zinc-500"
                          }
                        />
                        <span dir="auto" className="truncate">
                          {channel.name}
                        </span>
                        {occupants.length > 0 && (
                          <span className="ml-auto font-mono text-[10px] text-zinc-500">
                            {occupants.length}
                          </span>
                        )}
                      </button>

                      {canManage && (
                        <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                          <button
                            type="button"
                            onClick={() => openEditChannel(channel)}
                            title="Edit channel"
                            className="rounded p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                          >
                            <PencilSimple size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteChannel(channel)}
                            title="Delete channel"
                            className="rounded p-1 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400"
                          >
                            <Trash size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    {occupants.length > 0 && (
                      <ul className="space-y-0.5 pl-6 pr-2 pt-0.5">
                        {occupants.map((occ) => (
                          <li
                            key={occ.identity}
                            className="flex items-center gap-2 rounded-md py-1 text-xs text-zinc-300"
                          >
                            <div
                              className={`rounded-full ${
                                occ.isSpeaking ? "ring-2 ring-emerald-400" : ""
                              }`}
                            >
                              <Avatar
                                name={occ.name}
                                color={occ.avatarColor}
                                size="sm"
                              />
                            </div>
                            <span dir="auto" className="min-w-0 flex-1 truncate text-xs">
                              {occ.name}
                            </span>
                            {occ.isScreenSharing && (
                              <span className="rounded bg-emerald-500/15 px-1 py-0.5 font-mono text-[9px] font-semibold text-emerald-300">
                                LIVE
                              </span>
                            )}
                            {occ.isMuted && (
                              <MicrophoneSlash size={12} className="shrink-0 text-rose-400" />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        {/* Active Voice Connection Dock (visible even while browsing text channels) */}
        {isVoiceConnected && voice.activeChannel && (
          <div className="border-t border-white/[0.07] bg-[#111317] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSelectedChannelId(voice.activeChannel!.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="font-mono text-[11px] font-medium text-emerald-400">
                    {voice.connectionState === ConnectionState.Connecting
                      ? "Connecting..."
                      : "Voice Connected"}
                  </span>
                </div>
                <p dir="auto" className="mt-0.5 truncate text-xs font-medium text-zinc-200">
                  {voice.activeChannel.name}
                </p>
              </button>

              <button
                type="button"
                onClick={() => void voice.leaveVoiceChannel()}
                title="Disconnect"
                className="rounded-lg p-1.5 text-rose-400 transition-colors hover:bg-rose-500/15"
              >
                <PhoneDisconnect size={16} weight="bold" />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => void voice.toggleMute()}
                title={voice.isMuted ? "Unmute" : "Mute"}
                className={`flex items-center justify-center rounded-md py-1.5 text-xs transition-colors ${
                  voice.isMuted
                    ? "bg-rose-500/15 text-rose-300"
                    : "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09]"
                }`}
              >
                {voice.isMuted ? <MicrophoneSlash size={14} /> : <Microphone size={14} />}
              </button>
              <button
                type="button"
                onClick={() => void voice.toggleDeafen()}
                title={voice.isDeafened ? "Undeafen" : "Deafen"}
                className={`flex items-center justify-center rounded-md py-1.5 text-xs transition-colors ${
                  voice.isDeafened
                    ? "bg-rose-500/15 text-rose-300"
                    : "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09]"
                }`}
              >
                {voice.isDeafened ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />}
              </button>
              <button
                type="button"
                onClick={() => void voice.toggleScreenShare()}
                title={voice.isScreenSharing ? "Stop share" : "Share screen"}
                className={`flex items-center justify-center rounded-md py-1.5 text-xs transition-colors ${
                  voice.isScreenSharing
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09]"
                }`}
              >
                <MonitorPlay size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Bottom Profile Dock */}
        <div className="border-t border-white/[0.07] bg-[#0B0C0E] p-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-white/[0.05]"
            >
              <Avatar name={user.displayName} color={user.avatarColor} size="md" online />
              <div className="min-w-0">
                <p dir="auto" className="truncate text-xs font-medium text-zinc-100">
                  {user.displayName}
                </p>
                <p className="truncate font-mono text-[11px] text-zinc-500">
                  @{user.username}
                </p>
              </div>
            </button>

            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                title="Profile settings"
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
              >
                <GearSix size={16} />
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                title="Sign out"
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
              >
                <SignOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#121316]">
        {/* Top Channel Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open channels menu"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] md:hidden"
            >
              <List size={18} />
            </button>

            {activeChannel && (
              <>
                {activeChannel.type === "text" ? (
                  <Hash size={17} weight="bold" className="shrink-0 text-zinc-500" />
                ) : (
                  <SpeakerHigh size={17} weight="fill" className="shrink-0 text-emerald-400" />
                )}
                <h1 dir="auto" className="truncate text-sm font-semibold text-zinc-100">
                  {activeChannel.name}
                </h1>
                {activeChannel.description && (
                  <span
                    dir="auto"
                    className="hidden truncate border-l border-white/[0.08] pl-3 text-xs text-zinc-500 sm:inline"
                  >
                    {activeChannel.description}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {user.role === "admin" && (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
              >
                <Key size={14} />
                <span>Invites</span>
              </button>
            )}
          </div>
        </header>

        {/* Active Channel View + Right Members Rail */}
        <div className="flex min-h-0 flex-1">
          {activeChannel ? (
            activeChannel.type === "text" ? (
              <TextChannelView
                channel={activeChannel}
                currentUser={user}
                blobReady={capabilities.blobReady}
              />
            ) : (
              <VoiceStage
                channel={activeChannel}
                livekitReady={capabilities.livekitReady}
                previewOccupants={voiceOccupancy[activeChannel.slug] ?? []}
              />
            )
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
              <p className="text-sm text-zinc-400">No channels yet.</p>
              <button
                type="button"
                onClick={() => openCreateChannel("text")}
                className="mt-3 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950"
              >
                Create your first channel
              </button>
            </div>
          )}

          {/* Right Members Rail */}
          <aside className="hidden w-56 shrink-0 flex-col border-l border-white/[0.07] bg-[#0E0F12] p-4 lg:flex">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                <Users size={14} />
                <span>Members</span>
              </div>
              <span className="font-mono text-[11px] text-zinc-500">
                {onlineMembers.length}/{members.length}
              </span>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto">
              <div>
                <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Online · {onlineMembers.length}
                </p>
                <ul className="space-y-1">
                  {onlineMembers.map((member) => (
                    <li
                      key={member.id}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs"
                    >
                      <Avatar
                        name={member.displayName}
                        color={member.avatarColor}
                        size="sm"
                        online
                      />
                      <div className="min-w-0 flex-1">
                        <p dir="auto" className="truncate font-medium text-zinc-200">
                          {member.displayName}
                        </p>
                        <p className="truncate font-mono text-[10px] text-zinc-500">
                          {member.role === "admin" ? "admin" : `@${member.username}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {offlineMembers.length > 0 && (
                <div>
                  <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Offline · {offlineMembers.length}
                  </p>
                  <ul className="space-y-1">
                    {offlineMembers.map((member) => (
                      <li
                        key={member.id}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs opacity-55"
                      >
                        <Avatar
                          name={member.displayName}
                          color={member.avatarColor}
                          size="sm"
                          online={false}
                        />
                        <div className="min-w-0 flex-1">
                          <p dir="auto" className="truncate font-medium text-zinc-300">
                            {member.displayName}
                          </p>
                          <p className="truncate font-mono text-[10px] text-zinc-500">
                            @{member.username}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <ProfileModal
        open={profileOpen}
        user={user}
        onClose={() => setProfileOpen(false)}
        onUpdated={handleUserUpdated}
      />
      <ChannelModal
        open={channelModalOpen}
        defaultType={channelModalType}
        editingChannel={editingChannel}
        onClose={() => setChannelModalOpen(false)}
        onSaved={handleChannelSaved}
      />
    </div>
  );
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  const [presenceRef] = useState<{ current: () => void }>(() => ({
    current: () => {},
  }));

  return (
    <VoiceProvider onOccupancyChanged={() => presenceRef.current()}>
      <WorkspaceInner {...props} onPresenceRef={presenceRef} />
    </VoiceProvider>
  );
}
