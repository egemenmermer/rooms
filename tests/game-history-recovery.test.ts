import { describe, it, expect } from 'vitest';
import {
  createGame,
  gameCommand,
  gameView,
  gameTurn,
  advanceGameBots,
  disconnectGame,
  type GameTable,
} from '../apps/services/activities/games';
const owner = { userId: 'owner', displayName: 'Original owner', canCreate: true };
const guest = { userId: 'guest', displayName: 'Original guest', canCreate: false };
function table() {
  const t = createGame({ type: 'game.create', game: 'holdem' }, owner);
  gameCommand(t, { type: 'game.sit', seat: 3 }, guest, 1);
  gameCommand(t, { type: 'game.action', action: 'start' }, owner, 10);
  return t;
}
function finish(t: GameTable) {
  for (let i = 0; t.status === 'playing' && i < 100; i++) {
    const p = t.seats.find((s) => s.seat === gameTurn(t))!;
    gameCommand(
      t,
      {
        type: 'game.action',
        action:
          t.holdem!.seats.find((s) => s.userId === p.userId)!.streetBet < t.holdem!.maximumBet
            ? 'call'
            : 'check',
      },
      { userId: p.userId, displayName: p.name, canCreate: true },
      100 + i,
    );
  }
  expect(t.status).toBe('finished');
}
describe('authoritative hand history and own recovery', () => {
  it('freezes hand identities and table name, excludes late seats and does not reveal folded cards', () => {
    const t = table();
    const hidden = t.holdem!.seats.flatMap((s) => s.cards.map((c) => c.id));
    gameCommand(t, { type: 'game.sit', seat: 5 }, { ...guest, userId: 'late' }, 11);
    t.seats[0].name = 'Changed later';
    gameCommand(t, { type: 'game.action', action: 'fold' }, owner, 12);
    const h = t.history[0];
    expect(h.seats).toEqual([
      {
        seat: 0,
        position: 0,
        userId: 'owner',
        name: 'Original owner',
        bot: false,
        startingChips: 1000,
      },
      {
        seat: 3,
        position: 1,
        userId: 'guest',
        name: 'Original guest',
        bot: false,
        startingChips: 1000,
      },
    ]);
    expect(h.tableName).toBe('Hold’em');
    expect(h.result.revealedCards).toEqual({});
    expect(hidden.every((id) => !JSON.stringify(h).includes(id))).toBe(true);
    expect(h.result.players).toMatchObject([
      { userId: 'owner', net: -10 },
      { userId: 'guest', net: 10 },
    ]);
    t.handContext!.seats[0].name = 'Mutation';
    expect(h.seats![0].name).toBe('Original owner');
    expect(gameView(t, 'outsider').history).toEqual([]);
  });
  it('archives only legally public showdown cards and actual conserved payouts', () => {
    const t = table();
    finish(t);
    const h = t.history[0];
    expect(Object.keys(h.result.revealedCards as object)).toEqual(['owner', 'guest']);
    expect(h.result.showdown).toBeTruthy();
    expect((h.result.players as { net: number }[]).reduce((a, p) => a + p.net, 0)).toBe(0);
    expect(h.result).not.toHaveProperty('deck');
  });
  it('leaves legacy metadata absent instead of backfilling from current seats', () => {
    const t = table();
    delete t.handContext;
    t.history.push({ hand: 0, endedAt: 0, result: { payouts: {} } });
    finish(t);
    expect(t.history.every((h) => h.seats === undefined && h.tableName === undefined)).toBe(true);
  });
  it('records timeout check/fold evidence only for its owner', () => {
    const t = table();
    advanceGameBots(t, 45010);
    expect(gameView(t, 'owner').view.ownRecovery!.events).toMatchObject([
      { type: 'turn-timeout', hand: 1, at: 45010, action: 'fold', toCall: 10 },
    ]);
    expect(gameView(t, 'guest').view.ownRecovery!.events).toEqual([]);
    expect(JSON.stringify(gameView(t, 'guest'))).not.toContain('turn-timeout');
    const free = table();
    gameCommand(free, { type: 'game.action', action: 'call' }, owner, 100);
    advanceGameBots(free, 45100);
    expect(gameView(free, 'guest').view.ownRecovery!.events).toMatchObject([
      { type: 'turn-timeout', action: 'check', toCall: 0 },
    ]);
  });
  it('preserves the same hand through 30s takeover and explicit safe-turn return, rejects failed return actions', () => {
    const t = table();
    disconnectGame(t, 'guest', 20);
    advanceGameBots(t, 30019);
    expect(t.seats[1].bot).toBe(false);
    advanceGameBots(t, 30020);
    expect(t.seats[1].bot).toBe(true);
    const cards = structuredClone(t.holdem!.seats[1].cards);
    gameCommand(t, { type: 'game.sit', seat: 3 }, guest, 30021);
    gameCommand(t, { type: 'game.sit', seat: 3 }, guest, 30022);
    gameCommand(t, { type: 'game.action', action: 'call' }, owner, 30023);
    expect(() =>
      gameCommand(t, { type: 'game.action', action: 'raise', amount: 1 }, guest, 30024),
    ).toThrow();
    expect(t.seats[1].pendingReturn).toBe(true);
    advanceGameBots(t, 30025);
    expect(t.holdem!.seats[1].cards).toEqual(cards);
    expect(t.handNumber).toBe(1);
    expect(t.turnDeadline).toBe(75025);
    expect(gameView(t, 'guest').view.ownRecovery!.events!.map((e) => e.type)).toEqual([
      'takeover-started',
      'return-requested',
      'control-returned',
    ]);
    expect(gameView(t, 'owner').view.ownRecovery!.events).toEqual([]);
  });
  it.each(['blackjack', 'batak', '101'] as const)(
    'records %s actual final public data without private stock',
    (kind) => {
      const t = createGame({ type: 'game.create', game: kind }, owner);
      if (kind !== 'blackjack')
        for (let seat = 1; seat < t.capacity; seat++)
          gameCommand(t, { type: 'game.bot.add', seat }, owner, 1);
      gameCommand(t, { type: 'game.action', action: 'start' }, owner, 10);
      for (let i = 0; t.status === 'playing' && i < 1000; i++)
        advanceGameBots(t, 100000 + i * 50000);
      expect(t.status).toBe('finished');
      const h = t.history[0];
      expect(h.seats).toHaveLength(kind === 'blackjack' ? 1 : 4);
      expect(h.result).not.toHaveProperty('stock');
      expect(h.result).not.toHaveProperty('shoe');
      expect(h.result).not.toHaveProperty('buried');
      if (kind === 'blackjack') {
        expect(h.result.players).toMatchObject([{ userId: 'owner', finalChips: t.seats[0].chips }]);
        expect(h.result.dealer).toEqual(t.blackjack!.dealer);
      } else if (kind === 'batak') {
        expect(h.result.scores).toEqual(t.batak!.scores);
        expect(h.result.completedTricks).toEqual(t.batak!.completedTricks);
        expect(h.result).not.toHaveProperty('hands');
      } else {
        expect(h.result.scores).toEqual(t.okey!.scores);
        // The public summary marks sahte okey tiles with `fake: true`; the round state does not.
        const unmarked = JSON.parse(
          JSON.stringify(h.result.melds, (key, value) => (key === 'fake' ? undefined : value)),
        );
        expect(unmarked).toEqual(t.okey!.melds);
        const tiles = (h.result.melds as { tiles: { id: string; fake?: boolean }[] }[]).flatMap(
          (meld) => meld.tiles,
        );
        for (const tile of tiles)
          expect(tile.fake === true).toBe(tile.id.startsWith('false-joker-'));
        expect(h.result).not.toHaveProperty('hands');
      }
      expect(gameView(t, 'owner').view.ownRecovery!.events!.length).toBeLessThanOrEqual(8);
    },
  );
});
