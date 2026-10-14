import type { Preferences } from './store';

/** Manual reductions always win; system matching never overwrites the saved choices. */
export function applyAppearancePreferences(
  preferences: Preferences,
  root = document.documentElement,
  match = window.matchMedia.bind(window),
): () => void {
  const motion = match('(prefers-reduced-motion: reduce)');
  const transparency = match('(prefers-reduced-transparency: reduce)');
  const apply = () => {
    root.dataset.motion =
      preferences.reduceMotion || (preferences.followSystemAccessibility && motion.matches)
        ? 'reduce'
        : 'full';
    root.dataset.transparency =
      preferences.reduceTransparency ||
      (preferences.followSystemAccessibility && transparency.matches)
        ? 'reduce'
        : 'full';
    root.dataset.accent = preferences.accent;
    root.dataset.compact = String(preferences.compact);
    root.style.setProperty('--chat-font-size', `${preferences.chatFontSize}px`);
  };
  apply();
  motion.addEventListener('change', apply);
  transparency.addEventListener('change', apply);
  return () => {
    motion.removeEventListener('change', apply);
    transparency.removeEventListener('change', apply);
  };
}
