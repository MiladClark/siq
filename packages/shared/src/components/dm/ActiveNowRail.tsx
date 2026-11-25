"use client";

import { mediaUrl } from "@/lib/client-api";
import { Gamepad2, Headphones, Monitor, Play, Volume2 } from "lucide-react";
import { Avatar, resolveDisplayStatus } from "@siq/shared/components/ui/Avatar";
import type {
  ChannelItem,
  FriendItem,
  PublicUser,
  ServerDetail,
  VoiceOccupancyMap,
} from "@siq/shared/lib/types";

interface ActiveNowRailProps {
  friends: FriendItem[];
  servers: ServerDetail[];
  members: PublicUser[];
  onlineMemberIds: Set<string>;
  voiceOccupancy: VoiceOccupancyMap;
  onJoinVoice: (serverId: string, channel: ChannelItem) => void;
  onWatchStream: (serverId: string, channel: ChannelItem, userId: string) => void;
  onStartDm: (userId: string) => void;
}

export function ActiveNowRail({
  friends,
  servers,
  members,
  onlineMemberIds,
  voiceOccupancy,
  onJoinVoice,
  onWatchStream,
  onStartDm,
}: ActiveNowRailProps) {
  const acceptedFriendIds = new Set(
    friends.filter((f) => f.direction === "friend").map((f) => f.user.id)
  );

  // Build active voice room cards where at least one friend (or server peer) is connected
  const activeVoiceCards: Array<{
    server: ServerDetail;
    channel: ChannelItem;
    occupants: Array<{
      identity: string;
      name: string;
      avatarColor: string;
      avatarUrl: string | null;
      isScreenSharing: boolean;
    }>;
  }> = [];

  for (const srv of servers) {
    for (const ch of srv.channels) {
      if (ch.type !== "voice") continue;
      const raw = voiceOccupancy[ch.slug] ?? [];
      if (raw.length === 0) continue;

      const enriched = raw.map((o) => {
        const m = members.find((item) => item.id === o.identity);
        return {
          identity: o.identity,
          name: m?.displayName ?? o.name,
          avatarColor: m?.avatarColor ?? o.avatarColor,
          avatarUrl: m ? m.avatarUrl : (o.avatarUrl ?? null),
          isScreenSharing: Boolean(o.isScreenSharing),
        };
      });

      activeVoiceCards.push({
        server: srv,
        channel: ch,
        occupants: enriched,
      });
    }
  }

  // Friends with a custom activity who aren't already highlighted
  const customActivityFriends = friends
    .filter(
      (f) =>
        f.direction === "friend" &&
        onlineMemberIds.has(f.user.id) &&
        Boolean(f.user.customActivity)
    )
    .map((f) => f.user);

  const hasContent =
    activeVoiceCards.length > 0 || customActivityFriends.length > 0;

  return (
    <aside className="hidden w-[312px] shrink-0 flex-col border-l border-white/[0.07] bg-[#0E0F12] p-4 select-none xl:flex">
      <h2 className="mb-4 text-sm font-bold tracking-tight text-zinc-100">Active Now</h2>

      <div className="flex-1 space-y-3 overflow-y-auto pr-0.5">
        {!hasContent ? (
          <div className="rounded-xl border border-white/[0.07] bg-[#121316] p-5 text-center">
            <p className="text-xs font-semibold text-zinc-200">
              It&apos;s quiet for now...
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
              When friends join a voice room, go live, or set an activity, you&apos;ll see
              them here in real time.
            </p>
          </div>
        ) : (
          <>
            {activeVoiceCards.map(({ server, channel, occupants }) => {
              const streamer = occupants.find((o) => o.isScreenSharing);
              const lead = streamer ?? occupants[0];
              const isFriendLead = acceptedFriendIds.has(lead.identity);
              const headerNames =
                occupants.length === 1
                  ? lead.name
                  : occupants.length === 2
                    ? `${occupants[0].name}, ${occupants[1].name}`
                    : `${occupants[0].name}, ${occupants[1].name}, and ${occupants.length - 2} other`;

              return (
                <div
                  key={`${server.id}-${channel.id}`}
                  className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#14151A] p-3.5 transition-colors hover:border-white/[0.14]"
                >
                  <div className="flex items-start gap-2.5">
                    <Avatar
                      name={lead.name}
                      color={lead.avatarColor}
                      avatarUrl={lead.avatarUrl}
                      size="md"
                      status="online"
                      ringClassName="ring-[#14151A]"
                    />
                    <div className="min-w-0 flex-1">
                      <p dir="auto" className="truncate text-xs font-semibold text-zinc-100">
                        {headerNames}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        {streamer
                          ? "Sharing their screen"
                          : isFriendLead
                            ? "In a Voice Channel"
                            : `Active in ${server.name}`}
                      </p>
                    </div>
                    {streamer && (
                      <span className="shrink-0 rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
                        LIVE
                      </span>
                    )}
                  </div>

                  {/* Server + Voice Channel Row */}
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-[#0E0F12] px-2.5 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-zinc-950"
                        style={{ backgroundColor: server.accentColor }}
                      >
                        {server.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={mediaUrl(server.iconUrl)}
                            alt={server.name}
                            className="h-full w-full rounded-md object-cover"
                          />
                        ) : (
                          server.name.slice(0, 2).toUpperCase()
                        )}
                      </span>
                      <div className="min-w-0">
                        <p dir="auto" className="truncate text-[11px] font-semibold text-zinc-200">
                          {server.name}
                        </p>
                        <p className="flex items-center gap-1 truncate text-[10px] text-zinc-500">
                          <Volume2 className="h-3 w-3 shrink-0 text-emerald-400" />
                          <span dir="auto" className="truncate">
                            {channel.name}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 -space-x-1.5">
                      {occupants.slice(0, 3).map((occ) => (
                        <span
                          key={occ.identity}
                          className="inline-flex rounded-full ring-2 ring-[#0E0F12]"
                        >
                          <Avatar
                            name={occ.name}
                            color={occ.avatarColor}
                            avatarUrl={occ.avatarUrl}
                            size="xs"
                          />
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Live Stream Card / Join Action */}
                  {streamer ? (
                    <button
                      type="button"
                      onClick={() => onWatchStream(server.id, channel, streamer.identity)}
                      className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98]"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Watch {streamer.name}&apos;s Stream</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onJoinVoice(server.id, channel)}
                      className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#18191E] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
                    >
                      <Headphones className="h-3.5 w-3.5" />
                      <span>Join Voice</span>
                    </button>
                  )}
                </div>
              );
            })}

            {customActivityFriends.map((friend) => (
              <button
                key={friend.id}
                type="button"
                onClick={() => onStartDm(friend.id)}
                className="flex w-full flex-col gap-2 rounded-xl border border-white/[0.08] bg-[#14151A] p-3.5 text-left transition-colors hover:border-white/[0.14]"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar
                    name={friend.displayName}
                    color={friend.avatarColor}
                    avatarUrl={friend.avatarUrl}
                    size="md"
                    status={resolveDisplayStatus(true, friend.presenceStatus)}
                    ringClassName="ring-[#14151A]"
                  />
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="truncate text-xs font-semibold text-zinc-100">
                      {friend.displayName}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-zinc-400">
                      <Gamepad2 className="h-3 w-3 shrink-0 text-emerald-400" />
                      <span dir="auto" className="truncate">
                        {friend.customActivity}
                      </span>
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Subtle footer hint */}
      <div className="mt-3 flex items-center gap-1.5 border-t border-white/[0.06] pt-3 text-[10px] text-zinc-500">
        <Monitor className="h-3 w-3 shrink-0 text-emerald-400/70" />
        <span>Live voice &amp; streams sync automatically</span>
      </div>
    </aside>
  );
}
