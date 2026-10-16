import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  commandSchema,
  directsSession,
  endsActivity,
  type ActivityCommand,
} from '../packages/activity-protocol/src/index';
import { applyCommand, emptyRoom, pruneDisconnected } from '../apps/services/activities/engine';
import { parseYouTubeVideo, queueProgress, clock } from '../apps/desktop/src/cinema-youtube';

const video = (id: string) => ({
  kind: 'youtube' as const,
  videoId: id.padEnd(11, 'x'),
  title: id,
});

function setup() {
  const room = emptyRoom('room', 1000);
  const send = (userId: string, command: ActivityCommand, now = 1000, control = true) => {
    const envelope = commandSchema.parse({
      protocolVersion: 1,
      commandId: randomUUID(),
      expectedRevision: room.snapshot.revision,
      command,
    });
    return applyCommand(
      room,
      { userId, displayName: userId, canCreate: true, canControl: control },
      envelope,
      now,
    );
  };
  send('host', { type: 'join' });
  send('ece', { type: 'join' }, 1001);
  send('can', { type: 'join' }, 1002);
  send('host', { type: 'start', activity: 'youtube', title: 'Birlikte izle' });
  send('host', { type: 'queue.add', itemId: 'a', media: video('a'), start: true });
  send('ece', { type: 'queue.add', itemId: 'b', media: video('b') });
  return { room, send, state: room.snapshot };
}

describe('watch-together queue', () => {
  it('starts an added video right away and advances to the next one when it ends', () => {
    const { send, state } = setup();
    expect(state.timeline).toMatchObject({ itemId: 'a', playing: true, positionSec: 0 });
    const epoch = state.timeline.epoch;
    expect(send('can', { type: 'queue.next', fromItemId: 'a', reason: 'ended' }, 5000)).toBe(true);
    expect(state.timeline).toMatchObject({ itemId: 'b', playing: true, epoch: epoch + 1 });
  });
  it('treats the same end reported by every viewer as one advance', () => {
    const { send, state } = setup();
    send('ece', { type: 'queue.next', fromItemId: 'a', reason: 'ended' });
    const revision = state.revision;
    expect(send('host', { type: 'queue.next', fromItemId: 'a', reason: 'ended' })).toBe(false);
    expect(state.revision).toBe(revision);
    expect(state.timeline.itemId).toBe('b');
  });
  it('pauses at the end of the list and refuses a skip past it', () => {
    const { send, state } = setup();
    send('host', { type: 'queue.select', itemId: 'b', play: true });
    expect(() => send('host', { type: 'queue.next', fromItemId: 'b', reason: 'skip' })).toThrow(
      'QUEUE_END',
    );
    send('ece', { type: 'queue.next', fromItemId: 'b', reason: 'ended' }, 4000);
    expect(state.timeline).toMatchObject({ itemId: 'b', playing: false, positionSec: 3 });
  });
  it('keeps the old select semantics for clients that do not ask to play', () => {
    const { send, state } = setup();
    send('host', { type: 'queue.select', itemId: 'b' });
    expect(state.timeline).toMatchObject({ itemId: 'b', playing: false });
  });
  it('never autoplays an independent-source item that needs everyone’s own file', () => {
    const room = emptyRoom('room', 0);
    const identity = { userId: 'host', displayName: 'host', canCreate: true, canControl: true };
    const run = (command: ActivityCommand) =>
      applyCommand(
        room,
        identity,
        {
          protocolVersion: 1,
          commandId: randomUUID(),
          expectedRevision: room.snapshot.revision,
          command,
        },
        0,
      );
    run({ type: 'join' });
    run({ type: 'start', activity: 'cinema', title: 'Film' });
    run({
      type: 'queue.add',
      itemId: 'film',
      media: { kind: 'independent-source', referenceId: 'ref', title: 'Film' },
      start: true,
    });
    expect(room.snapshot.timeline).toMatchObject({ itemId: 'film', playing: false });
    expect(room.snapshot.cinema?.itemId).toBe('film');
  });
});

describe('host-granted control', () => {
  it('lets everyone steer by default', () => {
    const { send, state } = setup();
    send('can', { type: 'playback', playing: false, positionSec: 10, rate: 1 });
    expect(state.timeline.playing).toBe(false);
    expect(directsSession(state.primary, 'can', true)).toBe(true);
  });
  it('limits playback to the host and invited people, while others still suggest', () => {
    const { send, state } = setup();
    expect(() => send('ece', { type: 'session.control', mode: 'host' })).toThrow(
      'SESSION_HOST_REQUIRED',
    );
    send('host', { type: 'session.control', mode: 'host' });
    expect(() =>
      send('can', { type: 'playback', playing: false, positionSec: 5, rate: 1 }),
    ).toThrow('SESSION_HOST_CONTROL');
    expect(() => send('can', { type: 'queue.next', fromItemId: 'a', reason: 'skip' })).toThrow(
      'SESSION_HOST_CONTROL',
    );
    expect(() =>
      send('can', { type: 'queue.add', itemId: 'c', media: video('c'), start: true }),
    ).toThrow('SESSION_HOST_CONTROL');
    send('can', { type: 'queue.add', itemId: 'c', media: video('c') });
    send('can', { type: 'queue.remove', itemId: 'c' });
    expect(() => send('can', { type: 'queue.remove', itemId: 'b' })).toThrow(
      'SESSION_HOST_CONTROL',
    );
    // Reporting the natural end is not a playback decision.
    send('can', { type: 'queue.next', fromItemId: 'a', reason: 'ended' });
    expect(state.timeline.itemId).toBe('b');

    send('host', { type: 'session.permit', userId: 'can', allowed: true });
    send('can', { type: 'playback', playing: false, positionSec: 5, rate: 1 });
    expect(state.timeline.playing).toBe(false);
    send('host', { type: 'session.permit', userId: 'can', allowed: false });
    expect(() => send('can', { type: 'playback', playing: true, positionSec: 5, rate: 1 })).toThrow(
      'SESSION_HOST_CONTROL',
    );
    expect(() => send('host', { type: 'session.permit', userId: 'ghost', allowed: true })).toThrow(
      'SESSION_PARTICIPANT_NOT_FOUND',
    );
  });
  it('hands the host role over and keeps the previous host on the remote', () => {
    const { send, state } = setup();
    send('host', { type: 'session.control', mode: 'host' });
    send('host', { type: 'session.host', userId: 'ece' });
    expect(state.primary).toMatchObject({ hostUserId: 'ece', controllers: ['host'] });
    expect(() => send('host', { type: 'session.control', mode: 'everyone' })).toThrow(
      'SESSION_HOST_REQUIRED',
    );
    send('host', { type: 'playback', playing: false, positionSec: 1, rate: 1 });
    expect(() => send('can', { type: 'end' })).toThrow('SESSION_HOST_REQUIRED');
  });
  it('lets only the host end the shared player for everyone, even when everyone steers', () => {
    const { send, state } = setup();
    expect(state.primary?.controlMode ?? 'everyone').toBe('everyone');
    send('ece', { type: 'playback', playing: false, positionSec: 2, rate: 1 });
    expect(() => send('ece', { type: 'end' })).toThrow('SESSION_HOST_REQUIRED');
    expect(state.primary).not.toBeNull();
    send('host', { type: 'end' });
    expect(state.primary).toBeNull();
  });
  it('keeps games endable by anyone with room control', () => {
    const table = { title: 'Masa', hostUserId: 'host', startedAt: 1, state: 'live' as const };
    expect(endsActivity({ ...table, activity: 'holdem' }, 'ece', true)).toBe(true);
    expect(endsActivity({ ...table, activity: 'youtube' }, 'ece', true)).toBe(false);
    expect(endsActivity({ ...table, activity: 'screen' }, 'host', true)).toBe(true);
    expect(endsActivity({ ...table, activity: 'holdem' }, 'ece', false)).toBe(false);
    expect(endsActivity(null, 'ece', true)).toBe(true);
  });
  it('gives the remote to an invited person first when the host disappears', () => {
    const { room, send, state } = setup();
    send('host', { type: 'session.control', mode: 'host' });
    send('host', { type: 'session.permit', userId: 'can', allowed: true });
    for (const person of state.participants)
      person.lastSeenAt = person.userId === 'host' ? 0 : 60000;
    expect(pruneDisconnected(room, 60000)).toBe(true);
    expect(state.primary).toMatchObject({ hostUserId: 'can', controllers: [] });
  });
});

describe('cinema link helpers', () => {
  it('reads the usual YouTube link shapes and rejects other sites', () => {
    for (const link of [
      'dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ])
      expect(parseYouTubeVideo(link)).toBe('dQw4w9WgXcQ');
    for (const link of [
      'https://vimeo.com/123',
      'https://www.youtube.com/watch?v=short',
      'https://evil.example/watch?v=dQw4w9WgXcQ',
      'film adı',
    ])
      expect(parseYouTubeVideo(link)).toBeNull();
  });
  it('formats long durations and splits watched items from the rest', () => {
    expect(clock(65)).toBe('1:05');
    expect(clock(3725)).toBe('1:02:05');
    const { state, send } = setup();
    send('host', { type: 'queue.select', itemId: 'b', play: true });
    const progress = queueProgress(state);
    expect(progress.current?.id).toBe('b');
    expect(progress.next).toBeNull();
    expect(progress.watched.map((item) => item.id)).toEqual(['a']);
  });
});

describe('tables over a shared player', () => {
  it('lets only the shared player’s host replace it with a game table', () => {
    const { send, state } = setup();
    const replacePrimary = { activity: 'youtube' as const, startedAt: state.primary!.startedAt };
    expect(() => send('ece', { type: 'game.create', game: 'blackjack', replacePrimary })).toThrow(
      'SESSION_HOST_REQUIRED',
    );
    expect(state.primary?.activity).toBe('youtube');
    send('host', { type: 'game.create', game: 'blackjack', replacePrimary });
    expect(state.primary).toMatchObject({ activity: 'blackjack', title: 'Blackjack' });
  });
});
