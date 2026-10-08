import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createActivityServer } from '../apps/services/activities/server';
import { FileActivityRepository, MemoryActivityRepository } from '../apps/services/activities/repository';
import type { ActivityCommand, ActivityResponse } from '../packages/activity-protocol/src/index';
import { playbackPosition } from '../packages/activity-protocol/src/index';
import { ActivityError } from '../apps/services/activities/engine';

describe('authoritative Activity service over actual HTTP clients', () => {
  it('synchronizes two users, rejects stale races, replays commands, transfers hosts and restores persisted state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rooms-activity-test-'));
    let time = 100000;
    const authorize = async (token: string) => {
      if (!['alice', 'bob', 'viewer'].includes(token)) throw new ActivityError(403, 'ROOM_ACCESS_DENIED');
      return { userId: token, displayName: token, canControl: token !== 'viewer', canCreate: token !== 'viewer' };
    };
    const app = await createActivityServer({ repository: await FileActivityRepository.open(directory), authorize, clock: () => time });
    const base = await app.listen({ host: '127.0.0.1', port: 0 });
    const url = `${base}/v1/rooms/private-room/activity`;
    const read = async (user: string, suffix = '') => fetch(url + suffix, { headers: { authorization: `Bearer ${user}` } });
    const send = async (user: string, revision: number, command: ActivityCommand, commandId = randomUUID()) => {
      const result = await fetch(url + '/commands', { method: 'POST', headers: { authorization: `Bearer ${user}`, 'content-type': 'application/json' }, body: JSON.stringify({ protocolVersion: 1, commandId, expectedRevision: revision, command }) });
      return { status: result.status, body: await result.json() as ActivityResponse & { error?: string } };
    };
    try {
      expect((await read('outsider')).status).toBe(403);
      expect((await send('alice', 0, { type: 'join' })).body.room.revision).toBe(1);
      expect((await send('bob', 1, { type: 'join' })).body.room.revision).toBe(2);
      await send('alice', 2, { type: 'start', activity: 'cinema', title: 'Authorized local movie' });
      await send('bob', 3, { type: 'queue.add', itemId: 'work-1', media: { kind: 'independent-source', referenceId: 'public-demo-v1', title: 'Demo work' } });
      await send('alice', 4, { type: 'queue.select', itemId: 'work-1' });
      let delivered = false;
      const watch = read('bob', '?afterRevision=5&waitMs=1000').then(result => { delivered = true; return result; });
      await new Promise(resolve => setTimeout(resolve, 25)); expect(delivered).toBe(false);
      const id = randomUUID();
      const playback = { type: 'playback' as const, playing: true, positionSec: 20, rate: 1 };
      expect((await send('alice', 5, playback, id)).status).toBe(200);
      const received = await (await watch).json() as ActivityResponse;
      expect(received.room.timeline.playing).toBe(true); expect(received.room.revision).toBe(6);
      expect((await send('alice', 5, playback, id)).body.room.revision).toBe(6);
      expect((await send('alice', 5, { ...playback, positionSec: 30 }, id)).body.error).toBe('COMMAND_ID_REUSED');
      expect((await send('bob', 5, { ...playback, playing: false })).body.error).toBe('REVISION_CONFLICT');
      time += 2000; expect(playbackPosition(received.room.timeline, time)).toBe(22);
      expect((await send('alice', 6, { type: 'leave' })).body.room.primary?.hostUserId).toBe('bob');
      await send('bob', 7, { type: 'poll.create', pollId: 'poll-1', question: 'Next?', options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] });
      await send('bob', 8, { type: 'poll.vote', pollId: 'poll-1', optionId: 'yes' });
      const restored = await FileActivityRepository.open(directory);
      expect((await restored.load('private-room'))?.snapshot.polls[0].votes.bob).toBe('yes');
      // Bearers and private media sources are never in durable room state.
      expect(JSON.stringify(await restored.list())).not.toContain('Bearer');
      expect((await send('bob', 9, { type: 'leave' })).body.room.primary).toBeNull();
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });
  it('fails closed without authorization, validates strict commands and prevents cross-author board mutation', async () => {
    const closed = await createActivityServer({ repository: new MemoryActivityRepository() });
    expect((await closed.inject({ url: '/v1/rooms/r/activity', headers: { authorization: 'Bearer x' } })).statusCode).toBe(503); await closed.close();
    const app = await createActivityServer({ repository: new MemoryActivityRepository(), authorize: async token => ({ userId: token, displayName: token, canControl: true, canCreate: true }) });
    const send = (user: string, revision: number, command: unknown) => app.inject({ method: 'POST', url: '/v1/rooms/r/activity/commands', headers: { authorization: `Bearer ${user}` }, payload: { protocolVersion: 1, commandId: randomUUID(), expectedRevision: revision, command } });
    try {
      await send('alice', 0, { type: 'join' }); await send('bob', 1, { type: 'join' });
      await send('alice', 2, { type: 'whiteboard.put', element: { id: 'e1', kind: 'stroke', points: [[1, 1]], color: '#aabbcc', width: 2 } });
      expect((await send('bob', 3, { type: 'whiteboard.remove', elementId: 'e1' })).statusCode).toBe(403);
      expect((await send('alice', 3, { type: 'queue.add', itemId: 'secret', media: { kind: 'independent-source', referenceId: 'work', title: 'x', url: 'https://provider/?token=secret' } })).statusCode).toBe(400);
    } finally { await app.close(); }
  });
});
