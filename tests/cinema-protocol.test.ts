import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  commandSchema,
  playbackPosition,
  type ActivityCommand,
} from '../packages/activity-protocol/src/index';
import { applyCommand, emptyRoom, pruneDisconnected } from '../apps/services/activities/engine';

function setup() {
  const room = emptyRoom('room', 1000);
  const send = (userId: string, command: ActivityCommand, now = 1000, control = true) =>
    applyCommand(
      room,
      { userId, displayName: userId, canCreate: true, canControl: control },
      {
        protocolVersion: 1,
        commandId: randomUUID(),
        expectedRevision: room.snapshot.revision,
        command,
      },
      now,
    );
  send('alice', { type: 'join' });
  send('bob', { type: 'join' });
  send('alice', { type: 'start', activity: 'cinema', title: 'Independently owned work' });
  send('alice', {
    type: 'queue.add',
    itemId: 'work',
    media: { kind: 'independent-source', referenceId: 'edition', title: 'Shared title' },
  });
  send('alice', { type: 'queue.select', itemId: 'work' });
  const epoch = room.snapshot.timeline.epoch;
  const version = randomUUID();
  const binding = { itemId: 'work', timelineEpoch: epoch, sourceVersion: version };
  const source = {
    type: 'cinema.source' as const,
    ...binding,
    referenceId: 'edition',
    durationSec: 600,
    expectedSourceVersion: null,
  };
  const ready = { type: 'cinema.ready' as const, ...binding, ready: true };
  const play = {
    type: 'cinema.playback' as const,
    ...binding,
    playing: true,
    positionSec: 20,
    rate: 1,
  };
  return { room, send, source, ready, play, binding };
}

describe('independent Cinema source readiness and guarded timeline', () => {
  it('keeps the selected queue item fixed during removal and reordering', () => {
    const { room, send } = setup();
    send('bob', {
      type: 'queue.add',
      itemId: 'next',
      media: { kind: 'independent-source', referenceId: 'next-edition', title: 'Next title' },
    });
    expect(() => send('alice', { type: 'queue.remove', itemId: 'work' })).toThrow(
      'QUEUE_ACTIVE_ITEM_FIXED',
    );
    expect(() => send('alice', { type: 'queue.reorder', itemIds: ['next', 'work'] })).toThrow(
      'QUEUE_ACTIVE_ITEM_FIXED',
    );
    send('alice', { type: 'queue.reorder', itemIds: ['work', 'next'] });
    expect(room.snapshot.queue.map((item) => item.id)).toEqual(['work', 'next']);
    expect(room.snapshot.timeline.itemId).toBe('work');
  });
  it('requires explicit declaration/readiness and rejects the legacy unguarded Cinema command', () => {
    const { send, source, ready, play } = setup();
    expect(() => send('alice', play)).toThrow('CINEMA_SOURCE_STALE');
    send('alice', source);
    expect(() => send('alice', play)).toThrow('CINEMA_NOT_READY');
    send('alice', ready);
    send('alice', play);
    expect(() =>
      send('alice', { type: 'playback', playing: true, positionSec: 0, rate: 1 }),
    ).toThrow('CINEMA_SOURCE_REQUIRED');
  });
  it('lets ready viewers continue when another viewer is missing, mismatched or loses its source', () => {
    const { room, send, source, ready, play } = setup();
    send('alice', source);
    send('alice', ready);
    send('alice', play);
    send('bob', { ...source, sourceVersion: randomUUID(), durationSec: 580 });
    const bob = room.snapshot.cinema!.sources.find((s) => s.userId === 'bob')!;
    expect(() => send('bob', { ...ready, sourceVersion: bob.sourceVersion })).toThrow(
      'CINEMA_DURATION_MISMATCH',
    );
    send('alice', { ...ready, ready: false }, 3000);
    expect(room.snapshot.timeline.playing).toBe(true);
    expect(playbackPosition(room.snapshot.timeline, 3000)).toBe(22);
    expect(() => send('alice', play)).toThrow('CINEMA_NOT_READY');
  });
  it('rejects stale readiness/playback/source declarations after replacement and queue epochs', () => {
    const { send, source, ready, play } = setup();
    send('alice', source);
    send('alice', ready);
    send('alice', {
      ...source,
      sourceVersion: randomUUID(),
      expectedSourceVersion: source.sourceVersion,
    });
    expect(() => send('alice', ready)).toThrow('CINEMA_SOURCE_STALE');
    expect(() => send('alice', play)).toThrow('CINEMA_SOURCE_STALE');
    expect(() => send('alice', { ...source, sourceVersion: randomUUID() })).toThrow(
      'CINEMA_SOURCE_STALE',
    );
    send('alice', { type: 'queue.select', itemId: 'work' });
    expect(() => send('alice', source)).toThrow('CINEMA_SOURCE_STALE');
  });
  it('expires readiness separately from room presence and never transfers a departed private source', () => {
    const { room, send, source, ready, play } = setup();
    send('alice', source);
    send('alice', ready);
    send('alice', play);
    expect(() => send('alice', play, 17000)).toThrow('CINEMA_NOT_READY');
    expect(pruneDisconnected(room, 17000)).toBe(true);
    expect(room.snapshot.cinema!.sources[0].ready).toBe(false);
    send('alice', { type: 'leave' }, 17000);
    expect(room.snapshot.primary?.hostUserId).toBe('bob');
    expect(room.snapshot.cinema!.sources).toEqual([]);
    expect(room.snapshot.timeline.playing).toBe(true);
  });
  it('withdraws a source permanently so in-flight readiness cannot resurrect it', () => {
    const { room, send, source, ready, binding } = setup();
    send('alice', source);
    send('alice', ready);
    send('alice', { type: 'cinema.release', ...binding });
    expect(() => send('alice', ready)).toThrow('CINEMA_SOURCE_STALE');
    expect(room.snapshot.cinema!.sources).toEqual([]);
  });
  it('checks control and bounds without exposing a private source field', () => {
    const { send, source, ready, play } = setup();
    send('alice', source);
    send('alice', ready);
    expect(() => send('alice', play, 1000, false)).toThrow('ACTIVITY_CONTROL_DENIED');
    expect(() => send('alice', { ...play, positionSec: 601 })).toThrow('CINEMA_POSITION_INVALID');
    for (const extra of [
      { url: 'https://private/token' },
      { path: '/private/movie.mp4' },
      { filename: 'private.mp4' },
    ]) {
      expect(
        commandSchema.safeParse({
          protocolVersion: 1,
          commandId: randomUUID(),
          expectedRevision: 1,
          command: { ...source, ...extra },
        }).success,
      ).toBe(false);
    }
  });
});
