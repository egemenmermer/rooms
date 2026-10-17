import type {
  ActivityCommand,
  QueueItem,
  RoomSnapshot,
  SharedMedia,
} from '../../../../packages/activity-protocol/src';
import type { CinemaItem, CinemaProgramme } from '../../../../packages/community-cinema/src/types';

export type HallMedia = Extract<SharedMedia, { kind: 'community-media' }>;
export type HallItem = QueueItem & { media: HallMedia };
export type HallTab = 'live' | 'guide' | 'movies' | 'series' | 'youtube';

export const HALL_TITLE = 'Sinema salonu';

/** The queue entry for a catalog item. Titles are trimmed to the protocol's 240 characters. */
export function hallMedia(item: CinemaItem): HallMedia {
  return {
    kind: 'community-media',
    ref: item.ref,
    title: (item.title.trim() || 'Adsız').slice(0, 240),
    live: item.kind === 'live',
    art: item.art && /^[a-f0-9]{16,64}$/.test(item.art) ? item.art : null,
  };
}

export const isHallItem = (item: QueueItem | null | undefined): item is HallItem =>
  item?.media.kind === 'community-media';

/** The playing queue item and what follows it. */
export function hallProgress(room: RoomSnapshot | null) {
  const queue = room?.queue ?? [];
  const index = queue.findIndex((item) => item.id === room?.timeline.itemId);
  return {
    current: index >= 0 ? queue[index]! : null,
    upcoming: index >= 0 ? queue.slice(index + 1) : queue,
  };
}

/**
 * Commands that open `media` for everyone now. A live channel replaces the previous live
 * channel instead of piling up in the queue, so zapping never fills it.
 */
export function openNowCommands(
  room: RoomSnapshot | null,
  media: SharedMedia,
  itemId: string,
): ActivityCommand[] {
  const commands: ActivityCommand[] = [];
  if (!room?.primary) commands.push({ type: 'start', activity: 'hall', title: HALL_TITLE });
  const existing = room?.primary
    ? room.queue.find(
        (item) =>
          item.media.kind === media.kind &&
          (media.kind === 'community-media'
            ? (item.media as HallMedia).ref === media.ref
            : media.kind === 'youtube' && 'videoId' in item.media
              ? item.media.videoId === media.videoId
              : false),
      )
    : undefined;
  const { current } = hallProgress(room);
  if (existing) {
    if (existing.id !== current?.id)
      commands.push({ type: 'queue.select', itemId: existing.id, play: true });
  } else commands.push({ type: 'queue.add', itemId, media, start: true });
  if (room?.primary && isHallItem(current) && current.media.live && current.id !== existing?.id)
    commands.push({ type: 'queue.remove', itemId: current.id });
  return commands;
}

export function suggestCommands(room: RoomSnapshot | null, media: SharedMedia, itemId: string) {
  const commands: ActivityCommand[] = [];
  if (!room?.primary) commands.push({ type: 'start', activity: 'hall', title: HALL_TITLE });
  commands.push({ type: 'queue.add', itemId, media });
  return commands;
}

const timeFormat = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('tr-TR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export const hhmm = (ms: number) => timeFormat.format(ms);
export const dayLabel = (ms: number) => dayFormat.format(ms);
export const timeRange = (p: { start: number; stop: number }) => `${hhmm(p.start)}–${hhmm(p.stop)}`;

/** `45 dk`, `1 sa 50 dk`. */
export function minutesLabel(ms: number) {
  const total = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(total / 60),
    minutes = total % 60;
  if (!hours) return `${minutes} dk`;
  return minutes ? `${hours} sa ${minutes} dk` : `${hours} sa`;
}

export function programmeAt(list: CinemaProgramme[] | undefined, now: number) {
  return list?.find((p) => p.start <= now && p.stop > now) ?? null;
}

export function programmeAfter(list: CinemaProgramme[] | undefined, now: number) {
  return list?.find((p) => p.start > now) ?? null;
}

export function programmeProgress(p: CinemaProgramme | null, now: number) {
  if (!p || p.stop <= p.start) return 0;
  return Math.min(1, Math.max(0, (now - p.start) / (p.stop - p.start)));
}

/** Keys a typed number zap buffers before it commits. */
export const NUMBER_ZAP_MS = 1200;
/** Repeated ↑/↓ presses settle before the hall actually switches. */
export const ARROW_ZAP_MS = 550;

/** The neighbour of `ref` in `list`, wrapping around. */
export function neighbour<T extends { ref: string }>(list: T[], ref: string | null, step: 1 | -1) {
  if (!list.length) return null;
  const index = ref ? list.findIndex((item) => item.ref === ref) : -1;
  if (index < 0) return list[step === 1 ? 0 : list.length - 1]!;
  return list[(index + step + list.length) % list.length]!;
}

/** Typing in a field must never zap, seek or pause. */
export function editingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return !!element?.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"] *');
}

export const viewerLabel = (count: number) =>
  count === 1 ? '1 kişi izliyor' : `${count} kişi izliyor`;
