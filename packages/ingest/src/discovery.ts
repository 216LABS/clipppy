export type LiveChannel = {
  platform: "twitch" | "kick";
  platformChannelId: string;
  login: string;
  gameId: string;
  viewerCount: number;
  language: string;
};

export type DiscoveryFilters = {
  gameId: string;
  languages?: string[];
  minViewers?: number;
  topN?: number;
  allowlist?: string[];
  denylist?: string[];
};

export type DiscoveredChannel = LiveChannel & { authorized: false };

/** Discovery never grants capture rights. The authorized flag is a literal false. */
export function filterLiveChannels(channels: LiveChannel[], filters: DiscoveryFilters): DiscoveredChannel[] {
  return channels
    .filter((channel) => channel.gameId === filters.gameId)
    .filter((channel) => !filters.languages?.length || filters.languages.includes(channel.language))
    .filter((channel) => channel.viewerCount >= (filters.minViewers ?? 0))
    .filter((channel) => !filters.denylist?.includes(channel.platformChannelId))
    .filter((channel) => !filters.allowlist?.length || filters.allowlist.includes(channel.platformChannelId))
    .sort((a, b) => b.viewerCount - a.viewerCount)
    .slice(0, filters.topN ?? 20)
    .map((channel) => ({ ...channel, authorized: false as const }));
}
