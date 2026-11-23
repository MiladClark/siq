"use client";

import {
  GearSix,
  Hash,
  Headphones,
  Key,
  List,
  SignOut,
  SpeakerHigh,
  Users,
  X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { InviteModal } from "@/components/workspace/InviteModal";
import { ProfileModal } from "@/components/workspace/ProfileModal";
import type { ChannelItem, PublicUser } from "@/lib/types";

interface WorkspaceShellProps {
  initialUser: PublicUser;
  initialChannels: ChannelItem[];
  initialMembers: PublicUser[];
}

export function WorkspaceShell({
  initialUser,
  initialChannels,
  initialMembers,
}: WorkspaceShellProps) {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser>(initialUser);
  const [members, setMembers] = useState<PublicUser[]>(initialMembers);
  const [selectedChannelId, setSelectedChannelId] = useState<string>(
    initialChannels[0]?.id ?? ""
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const textChannels = initialChannels.filter((c) => c.type === "text");
  const voiceChannels = initialChannels.filter((c) => c.type === "voice");
  const activeChannel =
    initialChannels.find((c) => c.id === selectedChannelId) ?? initialChannels[0] ?? null;

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function handleUserUpdated(updated: PublicUser) {
    setUser(updated);
    setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#09090B] text-zinc-100">
      {/* Mobile sidebar backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Rail: Channels & Profile Dock */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[256px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0E0F12] transition-transform duration-200 md:static md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Workspace Header */}
        <div className="flex h-14 items-center justify-between border-b border-white/[0.07] px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Headphones size={15} weight="bold" />
            </div>
            <div className="leading-none">
              <span className="font-mono text-sm font-semibold tracking-tight text-zinc-100">
                siq
              </span>
              <span className="ml-2 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                v0.1
              </span>
            </div>
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

        {/* Channel Groups */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-2.5 py-4" aria-label="Channels">
          <div>
            <div className="mb-1.5 flex items-center justify-between px-2">
              <span className="text-[11px] font-medium text-zinc-500">Text Channels</span>
            </div>
            <ul className="space-y-0.5">
              {textChannels.map((channel) => {
                const selected = activeChannel?.id === channel.id;
                return (
                  <li key={channel.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChannelId(channel.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
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
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between px-2">
              <span className="text-[11px] font-medium text-zinc-500">Voice Channels</span>
            </div>
            <ul className="space-y-0.5">
              {voiceChannels.map((channel) => {
                const selected = activeChannel?.id === channel.id;
                return (
                  <li key={channel.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChannelId(channel.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                        selected
                          ? "bg-white/[0.08] font-medium text-zinc-100"
                          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      <SpeakerHigh
                        size={15}
                        weight={selected ? "fill" : "regular"}
                        className={selected ? "text-emerald-400" : "text-zinc-500"}
                      />
                      <span dir="auto" className="truncate">
                        {channel.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

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
                onClick={handleSignOut}
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
        {/* Top Channel Bar */}
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
                  <span className="hidden truncate border-l border-white/[0.08] pl-3 text-xs text-zinc-500 sm:inline">
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

        {/* Stage + Members Split */}
        <div className="flex min-h-0 flex-1">
          <main className="flex flex-1 flex-col justify-between overflow-y-auto p-6 md:p-8">
            <div className="max-w-2xl space-y-6">
              <div>
                <p className="font-mono text-xs text-emerald-400">
                  Phase 1 Complete · Authenticated Workspace
                </p>
                <h2 dir="auto" className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">
                  {activeChannel
                    ? activeChannel.type === "voice"
                      ? `${activeChannel.name} voice room`
                      : `#${activeChannel.name}`
                    : "Workspace ready"}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Your private database, invite-only auth, profile settings, and starter
                  channels are live. Next up: channel CRUD in Phase 2, LiveKit voice/video
                  &amp; 60fps screen share in Phase 3, and live text chat with Vercel Blob
                  uploads in Phase 4.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.07] bg-[#0E0F12] p-4">
                  <span className="font-mono text-[11px] text-zinc-500">Signed in as</span>
                  <div className="mt-2 flex items-center gap-2.5">
                    <Avatar name={user.displayName} color={user.avatarColor} size="sm" />
                    <div className="min-w-0">
                      <p dir="auto" className="truncate text-sm font-medium text-zinc-100">
                        {user.displayName}
                      </p>
                      <p className="font-mono text-[11px] text-zinc-500">
                        @{user.username} · {user.role}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/[0.07] bg-[#0E0F12] p-4">
                  <span className="font-mono text-[11px] text-zinc-500">Workspace stats</span>
                  <p className="mt-2 text-sm font-medium text-zinc-100">
                    {initialChannels.length} channels · {members.length}{" "}
                    {members.length === 1 ? "member" : "members"}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Backed by Neon Postgres via Drizzle ORM
                  </p>
                </div>
              </div>
            </div>
          </main>

          {/* Right Members Rail */}
          <aside className="hidden w-56 shrink-0 flex-col border-l border-white/[0.07] bg-[#0E0F12] p-4 lg:flex">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                <Users size={14} />
                <span>Members</span>
              </div>
              <span className="font-mono text-[11px] text-zinc-500">{members.length}</span>
            </div>

            <ul className="space-y-1.5">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs"
                >
                  <Avatar
                    name={member.displayName}
                    color={member.avatarColor}
                    size="sm"
                    online={member.id === user.id}
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
    </div>
  );
}
