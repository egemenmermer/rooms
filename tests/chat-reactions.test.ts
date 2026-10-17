import { describe, expect, it } from 'vitest';
import { reactionCodepoints, reactionEmoji } from '../apps/desktop/src/reactions';

describe('chat reaction keys', () => {
  it('turns legacy codepoint ids into the emoji Stoat accepts', () => {
    expect(reactionEmoji('2764')).toBe('\u2764');
    expect(reactionEmoji('2764-fe0f')).toBe('\u2764\ufe0f');
    expect(reactionEmoji('1f44d-1f3fd')).toBe('\u{1f44d}\u{1f3fd}');
  });
  it('passes emoji, custom emoji ids and unknown keys through unchanged', () => {
    expect(reactionEmoji('\u2764\ufe0f')).toBe('\u2764\ufe0f');
    expect(reactionEmoji('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(reactionEmoji('heart')).toBe('heart');
    expect(reactionEmoji('110000')).toBe('110000');
  });
  it('maps emoji and codepoint keys to one display id', () => {
    for (const key of ['2764', '2764-fe0f', '\u2764', '\u2764\ufe0f'])
      expect(reactionCodepoints(key)).toBe('2764');
    expect(reactionCodepoints('\u{1f44d}')).toBe('1f44d');
    expect(reactionCodepoints('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(reactionCodepoints('heart')).toBe('heart');
  });
});
