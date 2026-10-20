import type { CinemaContinueItem } from '../../../../packages/community-cinema/src/types';
import { minutesLabel } from './hall-model';

const HIDDEN_KEY = 'rooms.cinema.continue-hidden';
/** Under this many days an announced episode also shows a countdown badge (`49g`). */
export const COUNTDOWN_DAYS = 60;
const DAY_MS = 86_400_000;

/** `S1 B2 · Bölüm adı` for an episode; how long is left of a film. */
export function continueLine(item: CinemaContinueItem) {
  if (item.episode)
    return [`S${item.episode.season} B${item.episode.episode}`, item.episode.title]
      .filter(Boolean)
      .join(' · ');
  return item.remainingSec ? `${minutesLabel(item.remainingSec * 1000)} kaldı` : 'Kaldığın yerden';
}

const dateFormat = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `20.10.2026` (air dates are kept at noon UTC, so the day never shifts). */
export const airDateLabel = (ms: number) => dateFormat.format(ms);

/** Whole days until the air date, counted by calendar day; null when it is 60 days or more away. */
export function daysUntil(airDate: number, now: number) {
  const today = Date.UTC(
    new Date(now).getFullYear(),
    new Date(now).getMonth(),
    new Date(now).getDate(),
    12,
  );
  const days = Math.round((airDate - today) / DAY_MS);
  return days >= 0 && days < COUNTDOWN_DAYS ? days : null;
}

type Hidden = Record<string, number>;

function readHidden(): Hidden {
  try {
    const value = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '{}');
    return value && typeof value === 'object' ? (value as Hidden) : {};
  } catch {
    return {};
  }
}

/**
 * "Listeden kaldır" is this viewer's own: the card stays away until the hall watches the work
 * again (its `updatedAt` passes the moment it was hidden).
 */
export function visibleContinue(
  hallId: string,
  items: readonly CinemaContinueItem[],
  hidden: Hidden = readHidden(),
) {
  return items.filter((item) => {
    const at = hidden[`${hallId}:${item.workId}`];
    return at === undefined || item.updatedAt > at;
  });
}

export function hideContinue(hallId: string, workId: string, now = Date.now()) {
  const hidden = readHidden();
  hidden[`${hallId}:${workId}`] = now;
  // Keep the newest few hundred; older entries no longer matter.
  const entries = Object.entries(hidden)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 300);
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Private storage: the card is hidden for this session only.
  }
}
