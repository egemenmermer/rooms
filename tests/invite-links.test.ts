import { describe, expect, it } from 'vitest';
import {
  inviteAppLink,
  inviteOrigin,
  inviteServerUrl,
  inviteShareLink,
  parseInviteLink,
} from '@rooms/social';
import { validateInstanceUrl } from '@rooms/stoat';

const token = 'a'.repeat(64);

describe('invitation links', () => {
  it('builds one https share link and the matching app link from the session server', () => {
    expect(inviteShareLink('https://friends.example/api', token)).toBe(
      `https://friends.example/davet/${token}`,
    );
    expect(inviteAppLink('https://friends.example', token)).toBe(
      `rooms://invite?server=https%3A%2F%2Ffriends.example&code=${token}`,
    );
    expect(inviteShareLink('http://127.0.0.1:4100', token)).toBe(
      `http://127.0.0.1:4100/davet/${token}`,
    );
    expect(inviteShareLink('http://friends.example', token)).toBeNull();
    expect(inviteShareLink('https://friends.example', 'not-a-token')).toBeNull();
  });

  it('round-trips share and app links', () => {
    const share = inviteShareLink('https://friends.example', token)!;
    const app = inviteAppLink('https://friends.example', token)!;
    expect(parseInviteLink(share)).toEqual({ serverUrl: 'https://friends.example', code: token });
    expect(parseInviteLink(app)).toEqual({ serverUrl: 'https://friends.example', code: token });
  });

  it('accepts pasted links with messenger noise and rejects lookalikes', () => {
    expect(parseInviteLink(` <https://friends.example/davet/${token}/?fbclid=x#top> `)).toEqual({
      serverUrl: 'https://friends.example',
      code: token,
    });
    for (const raw of [
      `http://friends.example/davet/${token}`,
      `https://user:pass@friends.example/davet/${token}`,
      `https://friends.example/invite/${token}`,
      `https://friends.example/davet/${token.slice(1)}`,
      `https://friends.example/davet/${token}/extra`,
      `ftp://friends.example/davet/${token}`,
      'https://friends.example/davet/',
      '',
    ])
      expect(parseInviteLink(raw)).toBeNull();
  });

  it('accepts a bare token only when the server is already known', () => {
    expect(parseInviteLink(token)).toBeNull();
    expect(parseInviteLink(token, { fallbackServer: 'https://friends.example' })).toEqual({
      serverUrl: 'https://friends.example',
      code: token,
    });
    expect(parseInviteLink('short-code', { fallbackServer: 'https://friends.example' })).toBeNull();
  });

  it('keeps legacy app links strict', () => {
    expect(
      parseInviteLink('rooms://invite?server=https%3A%2F%2Ffriends.example%2Fapi&code=Abcd_123'),
    ).toEqual({ serverUrl: 'https://friends.example/api', code: 'Abcd_123' });
    for (const raw of [
      'rooms://anything?server=https://friends.example&code=abc',
      'rooms://invite?server=file:///etc/passwd&code=abc',
      'rooms://invite?server=https://secret@friends.example&code=abc',
      'rooms://invite?server=https://friends.example&code=abc&code=def',
      'rooms://invite?server=https://friends.example&code=abc&shell=rm',
      'rooms://invite?server=https://friends.example&code=abc#x',
    ])
      expect(parseInviteLink(raw)).toBeNull();
  });

  it('applies the same server rules as the Stoat adapter', () => {
    for (const value of [
      'https://friends.example',
      'https://friends.example/',
      'https://friends.example/api',
      'http://127.0.0.1:3021',
      'http://localhost',
    ])
      expect(inviteServerUrl(value)).toBe(validateInstanceUrl(value));
    for (const value of [
      'http://friends.example',
      'https://friends.example/other',
      'https://friends.example/?x=1',
      'https://a:b@friends.example',
    ]) {
      expect(inviteServerUrl(value)).toBeNull();
      expect(() => validateInstanceUrl(value)).toThrow();
    }
    expect(inviteOrigin('https://friends.example/api')).toBe('https://friends.example');
  });
});
