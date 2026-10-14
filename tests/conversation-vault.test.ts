import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { ConversationVault } from '../apps/desktop/electron/conversation-vault';
const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(Buffer.from(value).map((byte) => byte ^ 77)),
  decryptString: (value: Buffer) =>
    Buffer.from(value)
      .map((byte) => byte ^ 77)
      .toString(),
};
const message = {
  id: 'message',
  channelId: 'channel',
  author: {
    id: 'user',
    username: 'User',
    displayName: 'User',
    avatar: 'https://private.example/avatar',
  },
  content: 'private conversation',
  timestamp: '2026-10-11T12:00:00Z',
  editedTimestamp: null,
  attachments: [
    {
      id: 'file',
      name: 'private',
      size: 1,
      mime: 'video/mp4',
      url: 'https://private.example/signed-secret',
    },
  ],
};
it('encrypts persisted text, excludes media URLs, isolates accounts and removes logout history', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rooms-cache-'));
  directories.push(directory);
  const vault = new ConversationVault(directory, encryption);
  vault.select('https://server', 'alice');
  vault.put('channel', [message]);
  vault.flush();
  const bytes = readFileSync(join(directory, readdirSync(directory)[0]!));
  expect(bytes.toString()).not.toContain('private conversation');
  const decoded = encryption.decryptString(bytes);
  expect(decoded).not.toContain('signed-secret');
  expect(decoded).not.toContain('private.example');
  vault.select('https://server', 'bob');
  expect(vault.get('channel')).toEqual([]);
  vault.select('https://server', 'alice');
  expect(vault.get('channel')[0]?.content).toBe('private conversation');
  vault.clear();
  const restored = new ConversationVault(directory, encryption);
  restored.select('https://server', 'alice');
  expect(restored.get('channel')).toEqual([]);
  restored.clear();
});
it('drops revoked channels and keeps disk writes disabled without OS encryption', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rooms-cache-'));
  directories.push(directory);
  const vault = new ConversationVault(directory, {
    ...encryption,
    isEncryptionAvailable: () => false,
  });
  vault.select('https://server', 'user');
  vault.put('channel', [message]);
  vault.flush();
  expect(readdirSync(directory)).toEqual([]);
  vault.remove('channel');
  expect(vault.get('channel')).toEqual([]);
  vault.clear();
});

it('preserves gateway changes during an in-flight history refresh and invalidates revoked tickets', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rooms-cache-'));
  directories.push(directory);
  const vault = new ConversationVault(directory, encryption);
  vault.select('https://server', 'alice');
  vault.put('channel', [message]);
  const before = vault.get('channel'),
    ticket = vault.ticket('channel');
  vault.change({ ...message, content: 'edited during request' });
  vault.reconcile('channel', [message], before);
  expect(vault.get('channel')[0]?.content).toBe('edited during request');
  vault.remove('channel');
  expect(vault.ticket('channel')).not.toBe(ticket);
  vault.clear();
});
