import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyRoom, applyCommand } from '../apps/services/activities/engine';
import { FileActivityRepository } from '../apps/services/activities/repository';
import { decodeStoredRoom, encodeStoredRoom } from '../apps/services/activities/storage-codec';
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
function historical() {
  const room = emptyRoom('legacy', 1000),
    identity = { userId: 'alice', displayName: 'Alice', canControl: true, canCreate: true };
  const send = (command: any) =>
    applyCommand(
      room,
      identity,
      {
        protocolVersion: 1,
        commandId: randomUUID(),
        expectedRevision: room.snapshot.revision,
        command,
      },
      1000,
    );
  send({ type: 'join' });
  send({
    type: 'poll.create',
    pollId: 'poll',
    question: 'Keep data?',
    options: [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
  });
  send({ type: 'poll.vote', pollId: 'poll', optionId: 'yes' });
  send({
    type: 'whiteboard.put',
    element: {
      id: 'note',
      kind: 'text',
      points: [[1, 2]],
      text: 'Existing note',
      color: '#ffffff',
      width: 2,
    },
  });
  return room;
}
it('reads supported unversioned polls/board/receipts without rewriting or dropping extension data', () => {
  const legacy = { ...historical(), extension: { keep: 'original' } };
  const before = JSON.stringify(legacy);
  const decoded = decodeStoredRoom(legacy, 'legacy');
  expect(decoded.schemaVersion).toBe(1);
  expect(decoded.snapshot).toEqual(legacy.snapshot);
  expect(decoded.receipts).toEqual(legacy.receipts);
  expect(JSON.parse(encodeStoredRoom(decoded)).extension).toEqual(legacy.extension);
  expect(JSON.stringify(legacy)).toBe(before);
});
it('rejects unknown versions, corrupt nested data and cross-room records without silently resetting', () => {
  const legacy = historical();
  expect(() => decodeStoredRoom({ ...legacy, schemaVersion: 99 })).toThrow('unsupported-version');
  expect(() =>
    decodeStoredRoom({ ...legacy, snapshot: { ...legacy.snapshot, polls: [{ id: 'broken' }] } }),
  ).toThrow('invalid-state');
  expect(() => decodeStoredRoom(legacy, 'another-room')).toThrow('room-mismatch');
});
it('preserves file bytes on read and failed save, then writes versioned data atomically on normal mutation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rooms-data-'));
  directories.push(directory);
  const path = join(directory, 'activities.json'),
    legacy = historical(),
    original = JSON.stringify([legacy]);
  await writeFile(path, original);
  const repo = await FileActivityRepository.open(directory);
  expect(await readFile(path, 'utf8')).toBe(original);
  expect((await repo.load('legacy'))?.snapshot.polls[0].votes.alice).toBe('yes');
  await expect(repo.save({ ...legacy, schemaVersion: 99 } as any)).rejects.toThrow(
    'unsupported-version',
  );
  expect(await readFile(path, 'utf8')).toBe(original);
  await repo.save(legacy);
  const reopened = await FileActivityRepository.open(directory);
  expect((await reopened.load('legacy'))?.receipts).toEqual(legacy.receipts);
  expect(JSON.parse(await readFile(path, 'utf8'))[0].schemaVersion).toBe(1);
});
it('refuses a duplicate or unsupported file repository without overwriting the original', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rooms-data-'));
  directories.push(directory);
  const path = join(directory, 'activities.json'),
    room = historical(),
    original = JSON.stringify([room, room]);
  await writeFile(path, original);
  await expect(FileActivityRepository.open(directory)).rejects.toThrow('Duplicate');
  expect(await readFile(path, 'utf8')).toBe(original);
});
it.each(['holdem', 'blackjack', 'batak', '101'] as const)(
  'keeps supported legacy %s game history and optional configuration',
  async (kind) => {
    const { createGame } = await import('../apps/services/activities/games');
    const room = historical();
    room.game = createGame(
      { type: 'game.create', game: kind },
      { userId: 'alice', displayName: 'Alice', canCreate: true },
    );
    room.game.history = [{ hand: 1, endedAt: 1000, result: { score: 42 } }];
    room.gameArchives = [{ kind, history: room.game.history, statistics: room.game.statistics }];
    const decoded = decodeStoredRoom(room);
    expect(decoded.game).toEqual(room.game);
    expect(decoded.gameArchives).toEqual(room.gameArchives);
  },
);
