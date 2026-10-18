import { create } from 'zustand';
import { useCommunity } from './community';

/** People whose personal sounds this listener silenced; each account keeps its own list. */
export const usePersonalSoundMutes = create<{ owner: string; muted: string[] }>(() => ({
  owner: '',
  muted: [],
}));
const MAX_MUTES = 500;
const storageKey = (owner: string) => `rooms-personal-sound-mutes-v1:${owner}`;
const sessionKey = () => {
  const state = useCommunity.getState();
  return state.user ? `${state.serverUrl}:${state.user.id}` : '';
};
function load(owner: string): string[] {
  if (!owner) return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(owner)) ?? '[]');
    return Array.isArray(value)
      ? value
          .filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id))
          .slice(0, MAX_MUTES)
      : [];
  } catch {
    return [];
  }
}
function syncSession() {
  const owner = sessionKey();
  if (usePersonalSoundMutes.getState().owner !== owner)
    usePersonalSoundMutes.setState({ owner, muted: load(owner) });
}
syncSession();
useCommunity.subscribe(syncSession);

export function isPersonalSoundMuted(userId: string) {
  syncSession();
  return usePersonalSoundMutes.getState().muted.includes(userId);
}
export function setPersonalSoundMuted(userId: string, muted: boolean) {
  syncSession();
  const { owner, muted: current } = usePersonalSoundMutes.getState();
  if (!owner || current.includes(userId) === muted) return;
  const next = muted
    ? [...current, userId].slice(-MAX_MUTES)
    : current.filter((id) => id !== userId);
  usePersonalSoundMutes.setState({ muted: next });
  try {
    localStorage.setItem(storageKey(owner), JSON.stringify(next));
  } catch {
    /* The mute still applies for this session. */
  }
}
