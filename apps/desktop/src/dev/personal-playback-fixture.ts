import { usePersonalPlayback } from '../personal-playback';

const variants = ['default', 'captions', 'controls_hidden', 'live', 'personal', '1920x1080'] as const;
export type PersonalPlaybackFixtureVariant = typeof variants[number];

export function installPersonalPlaybackFixture(value: string): PersonalPlaybackFixtureVariant {
  const variant = value.trim().toLowerCase() || 'default';
  if (!variants.includes(variant as PersonalPlaybackFixtureVariant)) {
    throw new Error(`Unsupported S29 reference fixture variant: ${value}`);
  }
  const normalized = /^\d+x\d+$/.test(variant) ? 'default' : variant as PersonalPlaybackFixtureVariant;
  usePersonalPlayback.setState({
    session: {
      media: {
        // The renderer fixture never resolves or requests this capability.
        url: 'rooms-provider://00000000-0000-4000-8000-000000000029/stream',
        name: normalized === 'live' ? 'Şehrin kıyısında' : 'Gecenin Kıyısında',
        live: normalized === 'live',
        startAt: normalized === 'personal' ? 2068 : undefined,
      },
      connectionId: 'dev-s29-personal-provider',
      ownerId: 'demo-deniz',
    },
  });
  return normalized;
}
