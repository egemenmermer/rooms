import { it, expect } from 'vitest';
import { mentionedBot } from '../apps/services/agent/discord';
it('official bot listens only to actual mentions from non-bot authors', () => {
  expect(mentionedBot({ author: {}, mentions: [], content: 'normal conversation' }, '42')).toBe(
    false,
  );
  expect(
    mentionedBot({ author: { bot: true }, mentions: [{ id: '42' }], content: 'loop' }, '42'),
  ).toBe(false);
  expect(
    mentionedBot({ author: {}, mentions: [{ id: '42' }], content: 'research this' }, '42'),
  ).toBe(true);
});
