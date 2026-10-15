import { expect, it } from 'vitest';
import { editMentionBindings, serializeMentions } from '../apps/desktop/src/mentions';
it('keeps identical display names attached to the distinct selected users', () => {
  const text = '@Sems ve @Sems';
  expect(
    serializeMentions(text, [
      { start: 0, end: 5, text: '@Sems', userId: 'one' },
      { start: 9, end: 14, text: '@Sems', userId: 'two' },
    ]),
  ).toBe('<@one> ve <@two>');
});
it('moves selected mentions with surrounding edits but cancels identity when their text changes', () => {
  const bindings = [{ start: 0, end: 5, text: '@Sems', userId: 'one' }];
  const moved = editMentionBindings('@Sems merhaba', 'selam @Sems merhaba', bindings);
  expect(serializeMentions('selam @Sems merhaba', moved)).toBe('selam <@one> merhaba');
  expect(editMentionBindings('@Sems merhaba', '@Sema merhaba', bindings)).toEqual([]);
  expect(serializeMentions('@Sema merhaba', bindings)).toBe('@Sema merhaba');
});
