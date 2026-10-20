import { useSyncExternalStore } from 'react';

/** "Başlayınca haber ver" for a programme in the guide; kept on this device. */
export type Reminder = {
  hallId: string;
  ref: string;
  channel: string;
  title: string;
  /** Programme start, epoch ms. */
  start: number;
};

const KEY = 'rooms.cinema.reminders';
/** A reminder whose programme started longer ago than this is dropped unannounced. */
export const LATE_MS = 10 * 60_000;
const listeners = new Set<() => void>();
let cached: Reminder[] | null = null;

const same = (a: Reminder, b: Pick<Reminder, 'hallId' | 'ref' | 'start'>) =>
  a.hallId === b.hallId && a.ref === b.ref && a.start === b.start;

export function reminders(): Reminder[] {
  if (cached) return cached;
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cached = Array.isArray(value)
      ? value.filter(
          (r): r is Reminder =>
            !!r &&
            typeof r.hallId === 'string' &&
            typeof r.ref === 'string' &&
            typeof r.channel === 'string' &&
            typeof r.title === 'string' &&
            typeof r.start === 'number',
        )
      : [];
  } catch {
    cached = [];
  }
  return cached;
}

function save(list: Reminder[]) {
  cached = list.slice(0, 100);
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // Private storage: reminders last until the app closes.
  }
  for (const listener of listeners) listener();
}

export const hasReminder = (reminder: Pick<Reminder, 'hallId' | 'ref' | 'start'>) =>
  reminders().some((r) => same(r, reminder));

export function toggleReminder(reminder: Reminder) {
  const list = reminders();
  save(
    hasReminder(reminder)
      ? list.filter((r) => !same(r, reminder))
      : [...list, reminder].sort((a, b) => a.start - b.start),
  );
}

/** Takes the reminders that are due now; stale ones go silently. */
export function takeDue(now: number) {
  const list = reminders();
  const due = list.filter((r) => r.start <= now + 30_000 && r.start > now - LATE_MS);
  const keep = list.filter((r) => r.start > now + 30_000);
  if (keep.length !== list.length) save(keep);
  return due;
}

export const useReminders = () =>
  useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, reminders);

// "Salonda aç" from a reminder: the hall page opens and plays this channel once it is ready.
let pendingOpen: { hallId: string; ref: string } | null = null;
export const requestHallOpen = (hallId: string, ref: string) => {
  pendingOpen = { hallId, ref };
};
export function takeHallOpen(hallId: string) {
  if (pendingOpen?.hallId !== hallId) return null;
  const ref = pendingOpen.ref;
  pendingOpen = null;
  return ref;
}
