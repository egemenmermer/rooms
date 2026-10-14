import { useRooms } from '../store';
export const appearanceVariants = [
  'default',
  'compact',
  'focus',
  'reduced',
  '1280x800',
  '900x700',
  '1920x1080',
] as const;
/** DEV-only deterministic preference baseline; capture drives the actual Settings controls. */
export function installAppearanceFixture(variant: string) {
  if (!import.meta.env.DEV) throw new Error('Appearance fixtures are unavailable in production.');
  if (!appearanceVariants.includes(variant as (typeof appearanceVariants)[number]))
    throw new Error(`Unsupported S66 variant: ${variant}`);
  useRooms.setState((state) => ({
    preferences: {
      ...state.preferences,
      compact: false,
      chatFontSize: 15,
      followSystemAccessibility: true,
      reduceMotion: false,
      reduceTransparency: false,
    },
  }));
}
