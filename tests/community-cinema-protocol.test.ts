import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { commandSchema, type ActivityCommand } from '../packages/activity-protocol/src/index';
import { applyCommand, emptyRoom } from '../apps/services/activities/engine';

function hall() {
  const room = emptyRoom('hall', 1000);
  const send = (userId: string, command: ActivityCommand, now = 1000) =>
    applyCommand(
      room,
      { userId, displayName: userId, canCreate: true, canControl: true },
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
  send('alice', { type: 'start', activity: 'hall', title: 'Sinema' });
  return { room, send };
}

const live = {
  kind: 'community-media' as const,
  ref: 'l-1001',
  title: 'TRT 1',
  live: true,
  art: null,
};
const movie = { kind: 'community-media' as const, ref: 'm-3001', title: 'Kış Uykusu', live: false };

describe('community cinema hall protocol', () => {
  it('starts a catalog item for everyone at once', () => {
    const { room, send } = hall();
    send('alice', { type: 'queue.add', itemId: 'a', media: live, start: true });
    expect(room.snapshot.timeline).toMatchObject({ itemId: 'a', playing: true });
    expect(room.snapshot.cinema).toBeNull();
  });

  it('keeps live channels on the live edge and lets VOD be steered', () => {
    const { room, send } = hall();
    send('alice', { type: 'queue.add', itemId: 'a', media: live, start: true });
    expect(() =>
      send('bob', { type: 'playback', playing: false, positionSec: 30, rate: 1 }),
    ).toThrow(/LIVE_PLAYBACK_FIXED/);
    send('alice', { type: 'queue.add', itemId: 'b', media: movie, start: true });
    send('bob', { type: 'playback', playing: false, positionSec: 30, rate: 1 }, 2000);
    expect(room.snapshot.timeline).toMatchObject({ itemId: 'b', playing: false, positionSec: 30 });
  });

  it('accepts YouTube in the hall but not personal files, and keeps catalog items out of other players', () => {
    const { send } = hall();
    send('bob', {
      type: 'queue.add',
      itemId: 'y',
      media: { kind: 'youtube', videoId: 'dQw4w9WgXcQ', title: 'Video' },
    });
    expect(() =>
      send('bob', {
        type: 'queue.add',
        itemId: 'f',
        media: { kind: 'independent-source', referenceId: 'edition', title: 'File' },
      }),
    ).toThrow(/MEDIA_KIND_MISMATCH/);
    const other = emptyRoom('room', 1000);
    const identity = { userId: 'carol', displayName: 'carol', canCreate: true, canControl: true };
    const run = (command: ActivityCommand) =>
      applyCommand(
        other,
        identity,
        {
          protocolVersion: 1,
          commandId: randomUUID(),
          expectedRevision: other.snapshot.revision,
          command,
        },
        1000,
      );
    run({ type: 'join' });
    run({ type: 'start', activity: 'youtube', title: 'YouTube' });
    expect(() => run({ type: 'queue.add', itemId: 'a', media: live })).toThrow(
      /MEDIA_KIND_MISMATCH/,
    );
  });

  it('rejects provider data in catalog references', () => {
    const envelope = (media: unknown) => ({
      protocolVersion: 1,
      commandId: randomUUID(),
      expectedRevision: 0,
      command: { type: 'queue.add', itemId: 'a', media },
    });
    expect(commandSchema.safeParse(envelope(live)).success).toBe(true);
    for (const media of [
      { ...live, ref: 'http://host/live/u/p/1.ts' },
      { ...live, ref: 'l-1001/../x' },
      { ...live, url: 'http://host/live/u/p/1.ts' },
      { ...live, art: 'https://img' },
      { kind: 'community-media', ref: 'l-1', title: 'x' },
    ])
      expect(commandSchema.safeParse(envelope(media)).success).toBe(false);
  });
});
