import { installCinemaFixture } from './cinema-fixture';
import { installPersonalPlaybackFixture } from './personal-playback-fixture';
import { usePersonalPlayback } from '../personal-playback';

export type MiniPlaybackFixtureVariant = 'default' | 'compact' | 'personal' | 'live';
export function miniPlaybackFixtureVariant(value: string): MiniPlaybackFixtureVariant {
  const variant = value.trim().toLowerCase() || 'default';
  if (!['default', 'compact', 'personal', 'live'].includes(variant))
    throw new Error(`Unsupported S30 demo fixture: ${value}`);
  return variant as MiniPlaybackFixtureVariant;
}

/** Default/compact must first render the Cinema route and confirm their local source.
 * Then navigate to /chat through the real router, preserving that same video element.
 * Personal/live use the S29 opt-in local projection, never a provider request.
 */
export function installMiniPlaybackFixture(value: string): {
  variant: MiniPlaybackFixtureVariant;
  initialRoute: string;
  captureRoute: string;
  cleanup(): void;
} {
  if (!import.meta.env.DEV) throw new Error('S30 demo fixtures are unavailable in production.');
  const variant = miniPlaybackFixtureVariant(value);
  if (variant === 'personal' || variant === 'live') {
    const previous = usePersonalPlayback.getState();
    installPersonalPlaybackFixture(variant);
    return {
      variant,
      initialRoute: '/chat',
      captureRoute: '/chat',
      cleanup: () => usePersonalPlayback.setState(previous, true),
    };
  }
  const cleanup = installCinemaFixture('S25', 'default');
  return { variant, initialRoute: '/cinema?view=personal', captureRoute: '/chat', cleanup };
}
