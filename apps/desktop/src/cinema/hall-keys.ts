import { useSyncExternalStore } from 'react';
import { locale, t } from '../i18n';

/** What the cinema hall's keys do. Esc, digits (channel numbers) and ⌘/Ctrl K stay fixed. */
export type HallCommand =
  | 'playPause'
  | 'seekBack'
  | 'seekForward'
  | 'channelUp'
  | 'channelDown'
  | 'fullscreen'
  | 'mute'
  | 'panel'
  | 'pictureInPicture'
  | 'help';

/** A key as `KeyboardEvent.key` names it (letters lower case), with or without Shift. */
export type KeyChord = { key: string; shift: boolean };

export const hallCommands: { id: HallCommand; label: string }[] = [
  { id: 'playPause', label: t('Oynat / duraklat') },
  { id: 'seekBack', label: t('10 saniye geri (film)') },
  { id: 'seekForward', label: t('10 saniye ileri (film)') },
  { id: 'channelUp', label: t('Önceki kanal') },
  { id: 'channelDown', label: t('Sonraki kanal') },
  { id: 'fullscreen', label: t('Tam ekran') },
  { id: 'mute', label: t('Sesi kapat / aç') },
  { id: 'panel', label: t('Paneli göster / gizle') },
  { id: 'pictureInPicture', label: t('Pencere içinde pencere') },
  { id: 'help', label: t('Kısayolları göster') },
];

export const defaultKeys: Record<HallCommand, KeyChord | null> = {
  playPause: { key: ' ', shift: false },
  seekBack: { key: 'ArrowLeft', shift: false },
  seekForward: { key: 'ArrowRight', shift: false },
  channelUp: { key: 'ArrowUp', shift: false },
  channelDown: { key: 'ArrowDown', shift: false },
  fullscreen: { key: 'f', shift: false },
  mute: { key: 'm', shift: false },
  panel: { key: 'c', shift: false },
  pictureInPicture: { key: 'p', shift: false },
  help: { key: '?', shift: false },
};

const KEY = 'rooms.cinema.keys';
/** Keys that cannot be bound: they close things, type channel numbers or move focus. */
const RESERVED = /^(?:Escape|Tab|Enter|[0-9]|Meta|Control|Alt|Shift|CapsLock|Dead|Unidentified)$/;

const listeners = new Set<() => void>();
let cached: Record<HallCommand, KeyChord | null> | null = null;

const same = (a: KeyChord | null, b: KeyChord | null) =>
  !!a && !!b && a.key === b.key && a.shift === b.shift;

/** The chord a key press makes; letters ignore case, `?` and other symbols carry their own Shift. */
export function chordOf(event: Pick<KeyboardEvent, 'key' | 'shiftKey'>): KeyChord {
  const letter = /^[a-zA-ZçğıöşüÇĞİÖŞÜ]$/.test(event.key);
  // i18n-ignore: stored chords are normalized the same way in every interface language
  const key = letter ? event.key.toLocaleLowerCase('tr') : event.key;
  // A symbol like `?` already says Shift; a letter or an arrow needs it spelled out.
  const shift = letter || key.length > 1 || key === ' ' ? event.shiftKey : false;
  return { key, shift };
}

export function hallKeys(): Record<HallCommand, KeyChord | null> {
  if (cached) return cached;
  const keys = { ...defaultKeys };
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    for (const command of hallCommands)
      if (command.id in stored) {
        const value = stored[command.id] as KeyChord | null;
        keys[command.id] =
          value === null
            ? null
            : value && typeof value.key === 'string' && typeof value.shift === 'boolean'
              ? { key: value.key, shift: value.shift }
              : keys[command.id];
      }
  } catch {
    // Unreadable storage: the defaults.
  }
  cached = keys;
  return keys;
}

function save(keys: Record<HallCommand, KeyChord | null>) {
  cached = keys;
  try {
    const changed = Object.fromEntries(
      hallCommands
        .filter(
          ({ id }) =>
            !same(keys[id], defaultKeys[id]) || (keys[id] === null) !== (defaultKeys[id] === null),
        )
        .map(({ id }) => [id, keys[id]]),
    );
    localStorage.setItem(KEY, JSON.stringify(changed));
  } catch {
    // Private storage: the keys hold until the app closes.
  }
  for (const listener of listeners) listener();
}

/**
 * Binds `chord` to `command`. A command that had the same chord loses it (and is returned, so
 * the screen can say so). Reserved keys are refused with `reserved`.
 */
export function bindHallKey(
  command: HallCommand,
  chord: KeyChord,
): HallCommand | 'reserved' | null {
  if (RESERVED.test(chord.key)) return 'reserved';
  const keys = { ...hallKeys() };
  const taken = hallCommands.find(({ id }) => id !== command && same(keys[id], chord))?.id ?? null;
  if (taken) keys[taken] = null;
  keys[command] = chord;
  save(keys);
  return taken;
}

export function resetHallKeys(command?: HallCommand) {
  if (!command) return save({ ...defaultKeys });
  const keys = { ...hallKeys() };
  const chord = defaultKeys[command];
  // Taking its default back frees it from whichever command borrowed it.
  for (const { id } of hallCommands) if (id !== command && same(keys[id], chord)) keys[id] = null;
  keys[command] = chord;
  save(keys);
}

/** The command a key press runs, if any. */
export function hallCommandOf(event: Pick<KeyboardEvent, 'key' | 'shiftKey'>): HallCommand | null {
  const chord = chordOf(event);
  const keys = hallKeys();
  return hallCommands.find(({ id }) => same(keys[id], chord))?.id ?? null;
}

const names: Record<string, string> = {
  ' ': t('Boşluk'),
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Home: 'Home',
  End: 'End',
  Backspace: '⌫',
  Delete: 'Del',
};

/** `F`, `⇧ →`, `Boşluk`; an em dash for an unbound command. */
export function keyLabel(chord: KeyChord | null) {
  if (!chord) return '—';
  const name =
    names[chord.key] ?? (chord.key.length === 1 ? chord.key.toLocaleUpperCase(locale) : chord.key);
  return chord.shift ? `⇧ ${name}` : name;
}

export const useHallKeys = () =>
  useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, hallKeys);
