import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createActivityServer } from '../apps/services/activities/server';
import { MemoryActivityRepository } from '../apps/services/activities/repository';
import type { ActivityCommand, ActivityResponse } from '../packages/activity-protocol/src/index';
describe('private authoritative tables over actual service clients', () => {
  it('plays a full two-human Holdem hand with isolated hands, unchanged mid-hand bot join, history and idempotent actions', async () => {
    const repository = new MemoryActivityRepository();
    const app = await createActivityServer({ repository, authorize: async userId => ({ userId, displayName: userId, canControl: true, canCreate: true }) });
    const base = await app.listen({ host: '127.0.0.1', port: 0 });
    const endpoint = `${base}/v1/rooms/friends/activity`;
    const read = async (user: string) => await (await fetch(endpoint, { headers: { authorization: `Bearer ${user}` } })).json() as ActivityResponse;
    let revision = 0;
    const send = async (user: string, command: ActivityCommand, id = randomUUID(), expected = revision) => {
      const result = await fetch(endpoint + '/commands', { method: 'POST', headers: { authorization: `Bearer ${user}`, 'content-type': 'application/json' }, body: JSON.stringify({ protocolVersion: 1, commandId: id, expectedRevision: expected, command }) });
      const response = await result.json() as ActivityResponse & { error?: string }; expect(result.status, response.error).toBe(200); revision = response.room.revision; return response;
    };
    try {
      await send('alice', { type: 'join' }); await send('bob', { type: 'join' }); await send('alice', { type: 'game.create', game: 'holdem' }); await send('bob', { type: 'game.sit', seat: 1 });
      const started = await send('alice', { type: 'game.action', action: 'start' });
      const aSeats = started.room.game!.view.seats as { userId: string; cards: unknown[] }[]; expect(aSeats.find(s => s.userId === 'alice')!.cards).toHaveLength(2); expect(aSeats.find(s => s.userId === 'bob')!.cards).toEqual([]);
      const bSeats = (await read('bob')).room.game!.view.seats as { userId: string; cards: unknown[] }[]; expect(bSeats.find(s => s.userId === 'alice')!.cards).toEqual([]); expect(bSeats.find(s => s.userId === 'bob')!.cards).toHaveLength(2);
      const ownCards = aSeats[0].cards;
      await send('alice', { type: 'game.bot.add', seat: 2 });
      expect(((await read('alice')).room.game!.view.seats as { cards: unknown[] }[])[0].cards).toEqual(ownCards);
      const id = randomUUID(); const before = revision; const turnOwner = started.room.game!.seats.find(s => s.seat === started.room.game!.turn)!.userId;
      const actions = started.room.game!.view.legalActions as string[];
      // The starter owns the heads-up first action; duplicate commands cannot debit chips twice.
      const action = actions.includes('check') ? 'check' : 'call';
      const first = await send(turnOwner, { type: 'game.action', action }, id);
      const repeated = await send(turnOwner, { type: 'game.action', action }, id, before); expect(repeated.room.revision).toBe(first.room.revision);
      for (let step = 0; step < 30; step++) {
        const room = (await read('alice')).room, game = room.game!; if (game.status === 'finished') break;
        const user = game.seats.find(s => s.seat === game.turn)!.userId;
        const view = (await read(user)).room.game!.view;
        const legal = view.legalActions as string[]; await send(user, { type: 'game.action', action: legal.includes('check') ? 'check' : 'call' });
      }
      const done = (await read('alice')).room.game!; expect(done.status).toBe('finished'); expect(done.history).toHaveLength(1); expect(done.seats.reduce((sum, s) => sum + s.chips, 0)).toBe(3000);
      expect(JSON.stringify(done.history)).not.toContain('deck'); expect(JSON.stringify(done.history)).not.toContain('cards');
      expect((done.view.statistics as Record<string, { hands: number }>).alice.hands).toBe(1);
      const bot = done.seats.find(s => s.bot)!; expect((done.view.statistics as Record<string, unknown>)[bot.userId]).toBeUndefined();
    } finally { await app.close(); }
  });
  it('drives all shared table types through validated bots and persists complete hand results', async () => {
    for (const game of ['blackjack', 'batak', '101'] as const) {
      let time = 100000;
      const repository = new MemoryActivityRepository();
      const app = await createActivityServer({ repository, clock: () => time, sweepIntervalMs: 5, authorize: async userId => ({ userId, displayName: userId, canControl: true, canCreate: true }) });
      const base = await app.listen({ host: '127.0.0.1', port: 0 }), endpoint = `${base}/v1/rooms/${game}/activity`;
      let revision = 0;
      const command = async (value: ActivityCommand) => { const result = await fetch(endpoint + '/commands', { method: 'POST', headers: { authorization: 'Bearer human', 'content-type': 'application/json' }, body: JSON.stringify({ protocolVersion: 1, commandId: randomUUID(), expectedRevision: revision, command: value }) }); const data = await result.json() as ActivityResponse & { error?: string }; expect(result.status, data.error).toBe(200); revision = data.room.revision; return data; };
      try {
        await command({ type: 'join' }); await command({ type: 'game.create', game });
        for (let seat = 1; seat < (game === 'blackjack' ? 2 : 4); seat++) await command({ type: 'game.bot.add', seat });
        await command({ type: 'game.action', action: 'start' });
        // An idle human's turn timeout uses the same rules; bot seats do not reset the hand.
        for (let step = 0; step < 160; step++) { // The viewer remains authenticated and watching; advance the game deadline without expiring its 30-second room lease.
          for (let heartbeat = 0; heartbeat < 2; heartbeat++) { time += 25000; await fetch(endpoint, { headers: { authorization: 'Bearer human' } }); }
          await new Promise(resolve => setTimeout(resolve, 6)); const saved = await repository.load(game); if (saved?.game?.status === 'finished') break; }
        const saved = await repository.load(game); expect(saved!.game!.status).toBe('finished'); expect(saved!.game!.history).toHaveLength(1);
      } finally { await app.close(); }
    }
  }, 10000);
});
