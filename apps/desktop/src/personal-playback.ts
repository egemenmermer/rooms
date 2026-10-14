import { create } from 'zustand';

export interface PersonalPlaybackSource {
  url: string;
  name: string;
  live: boolean;
  startAt?: number;
  channelId?: string;
}
export interface PersonalPlaybackSession {
  media: PersonalPlaybackSource;
  connectionId: string;
  ownerId: string | null;
  ownerServerUrl?: string | null;
}

/** In-memory capability only. Never persist this store or copy it into Activity state. */
export const usePersonalPlayback = create<{
  session: PersonalPlaybackSession | null;
  historyRevision: number;
}>(() => ({ session: null, historyRevision: 0 }));
export function startPersonalPlayback(
  media: PersonalPlaybackSource,
  connectionId: string,
  ownerId: string | null,
  ownerServerUrl?: string | null,
) {
  const parsed = new URL(media.url);
  if (
    parsed.protocol !== 'rooms-provider:' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.hostname) ||
    parsed.pathname !== '/stream' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  )
    throw new Error('Geçersiz kişisel oynatma kaynağı.');
  usePersonalPlayback.setState({ session: { media, connectionId, ownerId, ownerServerUrl } });
}
export function stopPersonalPlayback(connectionId?: string) {
  const session = usePersonalPlayback.getState().session;
  if (!connectionId || session?.connectionId === connectionId)
    usePersonalPlayback.setState({ session: null });
}

export function liveWindow(ranges: Pick<TimeRanges, 'length' | 'start' | 'end'>, position: number) {
  if (!ranges.length) return null;
  const last = ranges.length - 1,
    start = ranges.start(last),
    end = ranges.end(last);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return {
    start,
    end,
    canSeek: end - start > 5,
    position: Math.max(start, Math.min(end, position)),
    lag: Math.max(0, end - position),
  };
}
