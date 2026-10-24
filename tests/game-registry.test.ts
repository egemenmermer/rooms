import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  commandSchema,
  type ActivityCommand,
  type ActivityResponse,
} from '../packages/activity-protocol/src/index';
import type { GameModule } from '../packages/games/src/module';
import { gameKinds, isGameKind, registerGame } from '../packages/games/src/registry';
import { createActivityServer } from '../apps/services/activities/server';
import { FileActivityRepository } from '../apps/services/activities/repository';
import { decodeStoredRoom } from '../apps/services/activities/storage-codec';
import {
  advanceGameBots,
  createGame,
  gameCommand,
  gameView,
} from '../apps/services/activities/games';

// A tiny two-seat game, registered only by this test: each player secretly picks 1-10 and the
// pick closest to a hidden target wins. It proves that a new game needs nothing but a module.
interface PickState {
  target: number;
  picks: (number | null)[];
  turn: number | null;
}
const pickModule = {
  kind: 'test-pick-v1',
  title: 'Pick a number',
  seats: [2],
  actions: ['pick'],
  parseOptions(input) {
    const target = input?.target ?? 0;
    if (typeof target !== 'number' || !Number.isInteger(target) || target < 0 || target > 10)
      return { error: 'INVALID_TARGET' };
    return { target };
  },
  parseCommand(input) {
    const value = (input.payload as { number?: unknown } | undefined)?.number;
    if (input.action !== 'pick') return { error: 'INVALID_PICK_ACTION' };
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10)
      return { error: 'INVALID_PICK' };
    return { action: 'pick', number: value };
  },
  start: (seatCount, options, first, rng) => ({
    // 0 means "let the dealer draw one"; tests fix it to keep the outcome readable.
    target: options.target || 1 + Math.floor(rng() * 10),
    picks: Array(seatCount).fill(null),
    turn: first,
  }),
  action(state, seat, command) {
    if (state.turn !== seat) return { error: 'NOT_YOUR_TURN' };
    const picks = state.picks.map((pick, index) => (index === seat ? command.number : pick));
    const next = picks.findIndex((pick) => pick === null);
    return { ...state, picks, turn: next < 0 ? null : next };
  },
  view: (state, viewerSeat) => ({
    target: state.turn === null ? state.target : null,
    picks: state.picks.map((pick, index) =>
      state.turn === null || index === viewerSeat ? pick : pick === null ? null : 'hidden',
    ),
  }),
  turn: (state) => state.turn,
  botCommand: () => ({ action: 'pick', number: 5 }),
  settle(state) {
    if (state.turn !== null) return null;
    const distance = state.picks.map((pick) => Math.abs((pick ?? 0) - state.target));
    const best = Math.min(...distance);
    return {
      points: distance.map((value) => (value === best ? 1 : 0)),
      winners: distance.flatMap((value, index) => (value === best ? [index] : [])),
    };
  },
} satisfies GameModule<
  PickState,
  { action: 'pick'; number: number },
  { target: number | null; picks: (number | 'hidden' | null)[] },
  { target: number }
>;

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
const actor = (userId: string) => ({
  userId,
  displayName: userId,
  canControl: true,
  canCreate: true,
});

describe('game registry', () => {
  it('hosts the four built-in games and rejects malformed modules', () => {
    expect(gameKinds()).toEqual([
      'holdem',
      'blackjack',
      'batak',
      '101',
      'rooms-pisti-v1',
      'rooms-okey-v1',
      'rooms-tavla-v1',
    ]);
    expect(() => registerGame({ ...pickModule, kind: 'Bad Kind' })).toThrow('kind');
    expect(() => registerGame({ ...pickModule, kind: 'cinema' })).toThrow('kind');
    expect(() => registerGame({ ...pickModule, actions: ['start'] })).toThrow('actions');
    expect(() => registerGame({ ...pickModule, seats: [] })).toThrow('seats');
    expect(() => registerGame({ ...pickModule, kind: 'holdem' })).toThrow('already registered');
    expect(isGameKind('test-pick-v1')).toBe(false);
  });

  it('keeps every legacy desktop and iPhone game message valid', () => {
    const envelope = (command: unknown) => ({
      protocolVersion: 1,
      commandId: randomUUID(),
      expectedRevision: 0,
      command,
    });
    for (const command of [
      { type: 'game.create', game: '101', folding: true, teams: true },
      { type: 'game.create', game: 'batak', variant: 'gommeli' },
      { type: 'game.action', action: 'raise', amount: 40 },
      { type: 'game.action', action: 'open-pairs', melds: [['red-1-0', 'red-1-1']] },
      { type: 'game.action', action: 'trump', trump: 'spades' },
      { type: 'game.action', action: 'bury', tileIds: ['a', 'b', 'c', 'd'] },
      { type: 'game.sit', seat: 8, buyIn: 1000 },
    ])
      expect(commandSchema.safeParse(envelope(command)).success, JSON.stringify(command)).toBe(
        true,
      );
    for (const command of [
      { type: 'game.create', game: 'No Such Game!' },
      { type: 'game.action', action: 'pick', payload: { big: 'x'.repeat(9000) } },
      { type: 'game.action', action: 'DROP TABLE' },
      { type: 'game.create', game: 'holdem', options: { 'bad key': 1 } },
    ])
      expect(commandSchema.safeParse(envelope(command)).success, JSON.stringify(command)).toBe(
        false,
      );
  });

  it('plays a registered dummy game end to end through the activity service', async () => {
    cleanups.push(registerGame(pickModule));
    const directory = await mkdtemp(join(tmpdir(), 'rooms-game-registry-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    // The file repository decodes every saved room, so storage must accept the new kind too.
    const repository = await FileActivityRepository.open(directory);
    const app = await createActivityServer({
      repository,
      authorize: async (userId) => actor(userId),
    });
    cleanups.push(() => app.close());
    const base = await app.listen({ host: '127.0.0.1', port: 0 });
    const endpoint = `${base}/v1/rooms/friends/activity`;
    let revision = 0;
    const post = async (user: string, command: ActivityCommand) => {
      const result = await fetch(endpoint + '/commands', {
        method: 'POST',
        headers: { authorization: `Bearer ${user}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          protocolVersion: 1,
          commandId: randomUUID(),
          expectedRevision: revision,
          command,
        }),
      });
      const body = (await result.json()) as ActivityResponse & { error?: string };
      if (result.status === 200) revision = body.room.revision;
      return { status: result.status, body };
    };
    const send = async (user: string, command: ActivityCommand) => {
      const { status, body } = await post(user, command);
      expect(status, body.error).toBe(200);
      return body;
    };
    const read = async (user: string) =>
      (await (
        await fetch(endpoint, { headers: { authorization: `Bearer ${user}` } })
      ).json()) as ActivityResponse;

    await send('alice', { type: 'join' });
    await send('bob', { type: 'join' });
    expect(await post('alice', { type: 'game.create', game: 'no-such-game' })).toMatchObject({
      status: 409,
      body: { error: 'UNKNOWN_GAME' },
    });
    expect(
      await post('alice', { type: 'game.create', game: 'test-pick-v1', options: { target: 11 } }),
    ).toMatchObject({ status: 409, body: { error: 'INVALID_TARGET' } });
    const created = await send('alice', {
      type: 'game.create',
      game: 'test-pick-v1',
      options: { target: 4 },
    });
    expect(created.room.primary).toMatchObject({
      activity: 'test-pick-v1',
      title: 'Pick a number',
    });
    expect(created.room.game).toMatchObject({ kind: 'test-pick-v1', status: 'waiting' });
    expect(created.room.game!.view.capacity).toBe(2);
    expect(await post('alice', { type: 'game.action', action: 'start' })).toMatchObject({
      status: 409,
      body: { error: 'MORE_SEATS_REQUIRED' },
    });
    await send('bob', { type: 'game.sit', seat: 1 });
    const started = await send('alice', { type: 'game.action', action: 'start' });
    expect(started.room.game).toMatchObject({ status: 'playing', turn: 0 });
    expect(started.room.game!.view.legalActions).toEqual(['pick']);
    // The hidden target is never projected while the round runs.
    expect(started.room.game!.view.target).toBeNull();

    expect(
      await post('bob', { type: 'game.action', action: 'pick', payload: { number: 3 } }),
    ).toMatchObject({ status: 409, body: { error: 'NOT_YOUR_TURN' } });
    expect(
      await post('alice', { type: 'game.action', action: 'pick', payload: { number: 99 } }),
    ).toMatchObject({ status: 409, body: { error: 'INVALID_PICK' } });
    expect(await post('alice', { type: 'game.action', action: 'jump' })).toMatchObject({
      status: 409,
      body: { error: 'INVALID_PICK_ACTION' },
    });
    const picked = await send('alice', {
      type: 'game.action',
      action: 'pick',
      payload: { number: 3 },
    });
    expect(picked.room.game!.view.picks).toEqual([3, null]);
    expect(picked.room.game!.turn).toBe(1);
    // Bob sees that Alice picked, not what she picked.
    const bobView = (await read('bob')).room.game!;
    expect(bobView.view.picks).toEqual(['hidden', null]);
    expect(bobView.view.legalActions).toEqual(['pick']);

    const finished = await send('bob', {
      type: 'game.action',
      action: 'pick',
      payload: { number: 9 },
    });
    const game = finished.room.game!;
    expect(game.status).toBe('finished');
    expect(game.turn).toBeNull();
    expect(game.view).toMatchObject({ target: 4, picks: [3, 9], legalActions: [] });
    expect((await read('alice')).room.game!.view.legalActions).toEqual(['start']);
    expect(game.history).toHaveLength(1);
    expect(game.history[0]).toMatchObject({
      hand: 1,
      result: { points: [1, 0], winners: [0] },
      tableName: 'test-pick-v1',
    });
    expect(game.history[0].seats!.map((seat) => seat.userId)).toEqual(['alice', 'bob']);
    expect(game.view.statistics).toEqual({
      alice: { hands: 1, wins: 1, score: 1 },
      bob: { hands: 1, wins: 0, score: 0 },
    });

    // Rematch: the second round rotates the first seat.
    const rematch = await send('alice', { type: 'game.action', action: 'start' });
    expect(rematch.room.game).toMatchObject({ status: 'playing', turn: 1 });

    // The stored room survives a restart of the file repository.
    const reopened = await FileActivityRepository.open(directory);
    const stored = (await reopened.load('friends'))!;
    expect(stored.game).toMatchObject({ kind: 'test-pick-v1', status: 'playing' });
    expect(stored.game!.round).toMatchObject({ target: 4, picks: [null, null], turn: 1 });
    // A room whose game left the registry is refused instead of loading half-understood state.
    cleanups.shift()!();
    expect(() => decodeStoredRoom(structuredClone(stored))).toThrow('invalid-state');
  });

  it('lets a bot finish a registered game for a timed-out player', () => {
    cleanups.push(registerGame(pickModule));
    const table = createGame(
      { type: 'game.create', game: 'test-pick-v1', options: { target: 6 } },
      actor('owner'),
    );
    gameCommand(table, { type: 'game.bot.add', seat: 1 }, actor('owner'), 1000);
    expect(() =>
      gameCommand(table, { type: 'game.bot.add', seat: 2 }, actor('owner'), 1000),
    ).toThrow('SEAT_UNAVAILABLE');
    gameCommand(table, { type: 'game.action', action: 'start' }, actor('owner'), 1000);
    // The owner lets the 45 s turn timer run out; the bot picks for them, then for itself.
    expect(advanceGameBots(table, 1000 + 45_000)).toBe(true);
    const owner = table.seats.find((seat) => seat.userId === 'owner')!;
    expect(owner.recoveryEvents?.at(-1)).toMatchObject({ type: 'turn-timeout', action: 'pick' });
    expect(advanceGameBots(table, 1000 + 46_000)).toBe(true);
    expect(table.status).toBe('finished');
    expect(gameView(table, 'owner').view).toMatchObject({ target: 6, picks: [5, 5] });
    expect(table.statistics.owner).toEqual({ hands: 1, wins: 1, score: 1 });
  });
});
