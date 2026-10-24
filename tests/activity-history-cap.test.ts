import { describe, it, expect } from 'vitest';
import {
  createActivityServer,
  POLL_PREVIOUS_HANDS,
  POLL_PREVIOUS_TABLES,
} from '../apps/services/activities/server';
import { MemoryActivityRepository } from '../apps/services/activities/repository';
import { emptyRoom } from '../apps/services/activities/engine';
import { createGame } from '../apps/services/activities/games';

const hand = (n: number) => ({ id: `h${n}` }) as never;
async function setup() {
  const repository = new MemoryActivityRepository();
  const room = emptyRoom('room', 1000);
  room.game = createGame(
    { type: 'game.create', game: 'batak' } as never,
    { userId: 'ece', displayName: 'Ece', canControl: true, canCreate: true } as never,
  );
  room.snapshot.participants.push({
    userId: 'ece',
    displayName: 'Ece',
    joinedAt: 1,
    lastSeenAt: Date.now(),
    canControl: true,
    canCreate: true,
  } as never);
  room.gameArchives = Array.from({ length: 8 }, (_, i) => ({
    kind: 'batak' as const,
    history: Array.from({ length: 60 }, (_, n) => hand(i * 100 + n)),
    statistics: {} as never,
  }));
  await repository.save(room);
  const app = await createActivityServer({
    repository,
    sweepIntervalMs: 3_600_000,
    authorize: async () => ({
      userId: 'ece',
      displayName: 'Ece',
      canControl: true,
      canCreate: true,
    }),
  });
  return app;
}
const get = (app: Awaited<ReturnType<typeof setup>>, query = '') =>
  app.inject({
    url: `/v1/rooms/room/activity${query}`,
    headers: { authorization: 'Bearer t' },
  });

describe('activity poll response caps', () => {
  it('sends only the newest archived tables with short hand lists by default', async () => {
    const app = await setup();
    try {
      const r = await get(app);
      expect(r.statusCode).toBe(200);
      const previous = r.json().room.game.view.previousTables;
      expect(previous).toHaveLength(POLL_PREVIOUS_TABLES);
      expect(previous[0].history).toHaveLength(POLL_PREVIOUS_HANDS);
      // Newest archive last, newest hands last.
      expect(previous.at(-1).history.at(-1).id).toBe('h759');
    } finally {
      await app.close();
    }
  });
  it('returns every archive when explicitly requested', async () => {
    const app = await setup();
    try {
      const r = await get(app, '?previousTables=all');
      const previous = r.json().room.game.view.previousTables;
      expect(previous).toHaveLength(8);
      expect(previous[0].history).toHaveLength(60);
    } finally {
      await app.close();
    }
  });
});
