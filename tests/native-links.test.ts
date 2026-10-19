import { it, expect } from 'vitest';
import { parseInviteLink } from '../apps/desktop/electron/native-links';
it('accepts only bounded invitation links to HTTPS origins or explicit development loopback', () => {
  expect(
    parseInviteLink('rooms://invite?server=https%3A%2F%2Ffriends.example&code=Abcd_123'),
  ).toEqual({ serverUrl: 'https://friends.example', code: 'Abcd_123' });
  const token = 'b'.repeat(64);
  expect(parseInviteLink(`https://friends.example/davet/${token}`)).toEqual({
    serverUrl: 'https://friends.example',
    code: token,
  });
  for (const raw of [
    'rooms://anything?server=https://friends.example&code=abc',
    'rooms://invite?server=file:///etc/passwd&code=abc',
    'rooms://invite?server=https://secret@friends.example&code=abc',
    'rooms://invite?server=https://friends.example&code=abc&code=def',
    'rooms://invite?server=https://friends.example&code=abc&shell=rm',
    // A bare token has no server; OS-delivered links must always name one.
    token,
  ])
    expect(parseInviteLink(raw)).toBeNull();
});
