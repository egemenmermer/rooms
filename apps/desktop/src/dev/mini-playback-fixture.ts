import { installPersonalPlaybackFixture } from './personal-playback-fixture';
import { usePersonalPlayback } from '../personal-playback';

export type MiniPlaybackFixtureVariant = 'personal' | 'live';
export function miniPlaybackFixtureVariant(value: string): MiniPlaybackFixtureVariant {
  const variant = value.trim().toLowerCase() || 'personal';
  if (!['personal', 'live'].includes(variant))
    throw new Error(`Unsupported S30 demo fixture: ${value}`);
  return variant as MiniPlaybackFixtureVariant;
}

/** Personal/live use the S29 opt-in local projection, never a provider request. */
export function installMiniPlaybackFixture(value: string): {
  variant: MiniPlaybackFixtureVariant;
  initialRoute: string;
  captureRoute: string;
  cleanup(): void;
} {
  if (!import.meta.env.DEV) throw new Error('S30 demo fixtures are unavailable in production.');
  const variant = miniPlaybackFixtureVariant(value);
  const previous = usePersonalPlayback.getState();
  installPersonalPlaybackFixture(variant);
  return {
    variant,
    initialRoute: '/chat',
    captureRoute: '/chat',
    cleanup: () => usePersonalPlayback.setState(previous, true),
  };
}
