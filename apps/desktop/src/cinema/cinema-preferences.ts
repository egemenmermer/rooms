import { useSyncExternalStore } from 'react';
import { getLocale } from '../i18n';

/** This viewer's own cinema choices; they never reach the hall or other members. */
export type CinemaPreferences = {
  /** Blur the stills of episodes the hall has not finished (no spoilers). */
  blurUnwatched: boolean;
  /** Subtitles a film starts with: Turkish when the audio is another language, or a fixed one. */
  subtitleLanguage: 'auto' | 'tur' | 'eng' | 'off';
};

const KEY = 'rooms.cinema.preferences';
// Until a viewer chooses, subtitles follow the interface language ('auto' is Turkish).
const DEFAULTS: CinemaPreferences = {
  blurUnwatched: false,
  subtitleLanguage: getLocale() === 'en' ? 'eng' : 'auto',
};
const listeners = new Set<() => void>();
let cached: CinemaPreferences | null = null;

export function cinemaPreferences(): CinemaPreferences {
  if (cached) return cached;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<CinemaPreferences>;
    cached = {
      blurUnwatched:
        typeof stored.blurUnwatched === 'boolean' ? stored.blurUnwatched : DEFAULTS.blurUnwatched,
      subtitleLanguage: ['auto', 'tur', 'eng', 'off'].includes(stored.subtitleLanguage as string)
        ? stored.subtitleLanguage!
        : DEFAULTS.subtitleLanguage,
    };
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached;
}

export function setCinemaPreferences(patch: Partial<CinemaPreferences>) {
  cached = { ...cinemaPreferences(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // Private storage: the choice holds until the app closes.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useCinemaPreferences = () => useSyncExternalStore(subscribe, cinemaPreferences);
