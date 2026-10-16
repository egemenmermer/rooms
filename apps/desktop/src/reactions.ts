// Legacy reaction keys are lowercase codepoint ids such as `2764` or `1f44d-1f3fd`.
const CODEPOINT_KEY = /^[0-9a-f]{4,6}(?:-[0-9a-f]{4,6})*$/;

/** The Unicode emoji to send upstream for a reaction key; emoji and custom ids pass through. */
export function reactionEmoji(key: string) {
  if (!CODEPOINT_KEY.test(key)) return key;
  try {
    return String.fromCodePoint(...key.split('-').map((part) => parseInt(part, 16)));
  } catch {
    return key;
  }
}

/**
 * Codepoint id without variation selectors, so `❤`, `❤️`, `2764` and `2764-fe0f` share one
 * display entry. Custom emoji ids are returned unchanged.
 */
export function reactionCodepoints(key: string) {
  const emoji = reactionEmoji(key);
  if (/^[\x00-\x7F]*$/.test(emoji)) return key;
  return [...emoji]
    .map((char) => char.codePointAt(0)!)
    .filter((point) => point !== 0xfe0f)
    .map((point) => point.toString(16))
    .join('-');
}
