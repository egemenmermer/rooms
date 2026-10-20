import { it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error Operator script is JavaScript.
import { announcementContent, announceRelease } from '../scripts/release-announcement.mjs';
const version = '0.1.18-rc.13',
  notes = { version, changes: ['Fotoğraf görünümü düzeltildi.'] };
it('requires version-matched notes and refuses mass mentions', () => {
  expect(announcementContent(version, notes)).toContain('Tayfa 0.1.18-rc.13 yayınlandı');
  expect(() => announcementContent(version, { ...notes, version: '0.0.1' })).toThrow();
  expect(() => announcementContent(version, { version, changes: ['@everyone update'] })).toThrow();
});
it('announces once, uses stable nonce and never persists the credential', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rooms-announcement-'));
  try {
    const tokenFile = join(dir, 'token');
    await writeFile(tokenFile, 'fixture-secret');
    const config = {
      origin: 'https://rooms.test',
      channelId: 'news',
      tokenType: 'session',
      tokenFile,
    };
    const request = vi.fn(
      async (_url: string, options: { method?: string }) =>
        new Response(JSON.stringify(options.method === 'POST' ? { _id: 'message' } : [])),
    );
    const args = { version, notes, config, stateDirectory: join(dir, 'state'), request };
    expect(await announceRelease(args)).toEqual({ status: 'sent' });
    expect(await announceRelease(args)).toEqual({ status: 'already-sent' });
    expect(request).toHaveBeenCalledTimes(2);
    const posted = request.mock.calls[1][1] as unknown as {
      body: string;
      headers: Record<string, string>;
    };
    expect(JSON.parse(posted.body)).not.toHaveProperty('nonce');
    expect(posted.headers['Idempotency-Key']).toMatch(/^rooms-release-v2-[a-f0-9]{32}$/);
    for (const file of await readdir(join(dir, 'state')))
      expect(await readFile(join(dir, 'state', file), 'utf8')).not.toContain('fixture-secret');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('does not send a second message after an ambiguous network failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rooms-announcement-'));
  try {
    const tokenFile = join(dir, 'token');
    await writeFile(tokenFile, 'test');
    const request = vi.fn(async (_url: string, options: { method?: string }) => {
      if (options.method === 'POST') throw Error('connection lost');
      return new Response('[]');
    });
    const args = {
      version,
      notes,
      config: { origin: 'https://rooms.test', channelId: 'news', tokenType: 'session', tokenFile },
      stateDirectory: join(dir, 'state'),
      request,
    };
    await expect(announceRelease(args)).rejects.toThrow();
    await expect(announceRelease(args)).rejects.toThrow('uncertain');
    expect(request.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('reconciles a delivered announcement from channel history without posting again', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rooms-announcement-'));
  try {
    const tokenFile = join(dir, 'token');
    await writeFile(tokenFile, 'test');
    let delivered = false;
    const request = vi.fn(async (_url: string, options: { method?: string }) => {
      if (options.method === 'POST') {
        delivered = true;
        throw Error('response lost');
      }
      return new Response(
        JSON.stringify(
          delivered ? [{ _id: 'existing', content: announcementContent(version, notes) }] : [],
        ),
      );
    });
    const args = {
      version,
      notes,
      config: { origin: 'https://rooms.test', channelId: 'news', tokenType: 'session', tokenFile },
      stateDirectory: join(dir, 'state'),
      request,
    };
    await expect(announceRelease(args)).rejects.toThrow();
    expect(await announceRelease(args)).toEqual({ status: 'already-sent' });
    expect(request.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
