import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_PUSH_TO_TALK_KEY, parsePushToTalkKey } from './push-to-talk-key';

export interface Preferences {
  roomEventSounds: boolean;
  followSystemAccessibility: boolean;
  noiseSuppression: boolean;
  noiseSuppressionMode: 'standard' | 'strong';
  pushToTalk: boolean;
  pushToTalkKey: string;
  reduceMotion: boolean;
  reduceTransparency: boolean;
  compact: boolean;
  showFriends: boolean;
  serverUrl: string;
  inputId: string;
  outputId: string;
  notifications: boolean;
  chatFontSize: number;
  accent: 'pearl' | 'sage';
  /** The microphone as the person last left it; a first join starts muted. */
  microphoneOn: boolean;
}
const defaults: Preferences = {
  roomEventSounds: true,
  followSystemAccessibility: true,
  noiseSuppression: true,
  noiseSuppressionMode: 'strong',
  pushToTalk: false,
  pushToTalkKey: DEFAULT_PUSH_TO_TALK_KEY,
  reduceMotion: false,
  reduceTransparency: false,
  compact: false,
  showFriends: true,
  serverUrl: '',
  inputId: '',
  outputId: '',
  notifications: false,
  chatFontSize: 15,
  accent: 'pearl',
  microphoneOn: false,
};
interface RoomsState {
  preferences: Preferences;
  setPreferences(value: Preferences): void;
  setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void;
}
export function normalizeChatFontSize(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(14, Math.min(18, Math.round(value)))
    : 15;
}
/** Preserve genuine device preferences, discard legacy local social fixtures. */
function preferencesFrom(value: unknown): Preferences {
  const result = { ...defaults };
  if (!value || typeof value !== 'object') return result;
  const previous = (value as { preferences?: Record<string, unknown> }).preferences;
  if (!previous) return result;
  for (const key of Object.keys(defaults) as (keyof Preferences)[]) {
    if (key === 'noiseSuppressionMode') {
      result.noiseSuppressionMode = previous[key] === 'standard' ? 'standard' : 'strong';
      continue;
    }
    if (key === 'pushToTalkKey') {
      if (parsePushToTalkKey(previous[key])) result.pushToTalkKey = previous[key] as string;
      continue;
    }
    if (key === 'chatFontSize') {
      result.chatFontSize = normalizeChatFontSize(previous[key]);
      continue;
    }
    if (
      typeof previous[key] === typeof defaults[key] &&
      (key !== 'accent' || previous[key] === 'pearl' || previous[key] === 'sage')
    )
      Object.assign(result, { [key]: previous[key] });
  }
  return result;
}
export const useRooms = create<RoomsState>()(
  persist(
    (set) => ({
      preferences: { ...defaults },
      setPreferences: (value) => set({ preferences: preferencesFrom({ preferences: value }) }),
      setPreference: (key, value) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            [key]: key === 'chatFontSize' ? normalizeChatFontSize(value) : value,
          },
        })),
    }),
    {
      name: 'rooms-local-v1',
      version: 1,
      migrate: (previous) => ({ preferences: preferencesFrom(previous) }),
      merge: (previous, current) => ({ ...current, preferences: preferencesFrom(previous) }),
      partialize: (state) => ({ preferences: state.preferences }),
    },
  ),
);
