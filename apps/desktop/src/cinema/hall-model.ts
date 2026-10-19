import type {
  ActivityCommand,
  QueueItem,
  RoomSnapshot,
  SharedMedia,
} from '../../../../packages/activity-protocol/src';
import type { CinemaItem, CinemaProgramme } from '../../../../packages/community-cinema/src/types';
import { clock } from '../cinema-youtube';

export type HallMedia = Extract<SharedMedia, { kind: 'community-media' }>;
export type HallItem = QueueItem & { media: HallMedia };
export type HallTab = 'live' | 'movies' | 'series' | 'youtube' | 'rmdb';

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
  // Without a running hall there is nothing on screen, whatever the last timeline says.
  if (room?.primary?.activity !== 'hall') return { current: null, upcoming: [] as QueueItem[] };
  const queue = room.queue;
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
/** The activities service refuses `queue.add` past this many items. */
const QUEUE_LIMIT = 100;

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
  } else {
    // A full queue (the service keeps 100) drops its oldest watched items first.
    const queue = room?.primary ? room.queue : [];
    const watched = queue.slice(
      0,
      Math.max(
        0,
        queue.findIndex((item) => item.id === current?.id),
      ),
    );
    for (const item of watched.slice(0, Math.max(0, queue.length - (QUEUE_LIMIT - 1))))
      commands.push({ type: 'queue.remove', itemId: item.id });
    commands.push({ type: 'queue.add', itemId, media, start: true });
  }
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

/** A film or episode the hall can pick up again (RMDB's `resume`). */
export type HallResume = { ref: string; title: string; positionSec: number; art: string | null };

/** The queue entry for a resume target; never live, art only when the protocol accepts it. */
export function resumeMedia(target: HallResume): HallMedia {
  return {
    kind: 'community-media',
    ref: target.ref,
    title: (target.title.trim() || 'Adsız').slice(0, 240),
    live: false,
    art: target.art && /^[a-f0-9]{16,64}$/.test(target.art) ? target.art : null,
  };
}

/** The protocol's `playback` position limit. */
const MAX_POSITION_SEC = 86_400;

/**
 * How the hall picks a title up again. The protocol cannot start an item at a position, so with
 * the remote it is opened now (`open`) and then moved there by a separate `playback` command
 * (`seek`); the caller sends the seek only while the hall still shows that title. Without the
 * remote the title is only suggested to the queue, and it will start from the beginning.
 */
export function resumeCommands(
  room: RoomSnapshot | null,
  target: HallResume,
  itemId: string,
  canDirect: boolean,
): { open: ActivityCommand[]; seek: ActivityCommand | null; suggested: boolean } {
  const media = resumeMedia(target);
  // Nobody runs the hall yet: whoever opens it starts it and holds the remote.
  if (!canDirect && room?.primary)
    return { open: suggestCommands(room, media, itemId), seek: null, suggested: true };
  const positionSec = Math.min(MAX_POSITION_SEC, Math.max(0, Math.floor(target.positionSec)));
  return {
    open: openNowCommands(room, media, itemId),
    seek: positionSec > 0 ? { type: 'playback', playing: true, positionSec, rate: 1 } : null,
    suggested: false,
  };
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
  return !!element?.closest?.(
    'input,textarea,select,[contenteditable="true"],[role="dialog"] *,.hall-panel',
  );
}

/** Space and digits belong to a focused control (button, tab, link, list option). */
export function controlTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return !!element?.closest?.(
    'button,a[href],[role="tab"],[role="option"],[role="menuitem"],[role="slider"],summary',
  );
}

/**
 * Arrows belong only to widgets that move with them: sliders, lists, menus, radio groups.
 * A focused button or tab does not use them, so right after clicking play, the volume or the
 * Salon tab, ←/→ still seek and ↑/↓ still zap.
 */
export function arrowTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return !!element?.closest?.(
    '[role="slider"],[role="listbox"],[role="option"],[role="menu"],[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"],[role="radiogroup"],[role="radio"],[role="grid"],[role="tree"]',
  );
}

/** ←/→ move a film or episode by this many seconds. */
export const SEEK_STEP_SEC = 10;
/** Repeated ←/→ presses add up before the hall seeks once for everyone. */
export const SEEK_SETTLE_MS = 400;

/** Where a keyboard seek lands: not before the start, not past the last second. */
export function seekTarget(positionSec: number, durationSec: number | null) {
  const end = durationSec && durationSec > 1 ? durationSec - 1 : Infinity;
  return Math.max(0, Math.min(end, positionSec));
}

/** The OSD of a pending ←/→ seek, e.g. `20 sn ileri · 21:10`. */
export function seekNote(offsetSec: number, targetSec: number) {
  return `${Math.abs(offsetSec)} sn ${offsetSec < 0 ? 'geri' : 'ileri'} · ${clock(targetSec)}`;
}

/** The palette shortcut as this platform writes it. */
export const paletteShortcut =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

/** `Ece açtı`, but `Sen açtın` (Turkish verbs agree with the person). */
export const didThis = (name: string, verb: 'açtı' | 'ekledi') =>
  name === 'Sen' ? `Sen ${verb}n` : `${name} ${verb}`;

export const viewerLabel = (count: number) =>
  count === 1 ? '1 kişi izliyor' : `${count} kişi izliyor`;
