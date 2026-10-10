import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Preferences {
  pushToTalk: boolean; reduceMotion: boolean; reduceTransparency: boolean;
  compact: boolean; showFriends: boolean; serverUrl: string; inputId: string;
  outputId: string; notifications: boolean; accent: 'pearl' | 'sage';
}
const defaults: Preferences = { pushToTalk: false, reduceMotion: false, reduceTransparency: false, compact: false, showFriends: true, serverUrl: '', inputId: '', outputId: '', notifications: false, accent: 'pearl' };
interface RoomsState {
  preferences: Preferences;
  setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void;
}
/** Preserve genuine device preferences, discard legacy local social fixtures. */
function preferencesFrom(value: unknown): Preferences {
  const result = { ...defaults };
  if (!value || typeof value !== 'object') return result;
  const previous = (value as { preferences?: Record<string, unknown> }).preferences;
  if (!previous) return result;
  for (const key of Object.keys(defaults) as (keyof Preferences)[]) {
    if (typeof previous[key] === typeof defaults[key] && (key !== 'accent' || previous[key] === 'pearl' || previous[key] === 'sage'))
      Object.assign(result, { [key]: previous[key] });
  }
  return result;
}
export const useRooms = create<RoomsState>()(persist(set => ({
  preferences: { ...defaults },
  setPreference: (key, value) => set(state => ({ preferences: { ...state.preferences, [key]: value } })),
}), {
  name: 'rooms-local-v1', version: 1,
  migrate: previous => ({ preferences: preferencesFrom(previous) }),
  merge: (previous, current) => ({ ...current, preferences: preferencesFrom(previous) }),
  partialize: state => ({ preferences: state.preferences }),
}));
