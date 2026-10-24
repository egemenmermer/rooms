import { describe, expect, it } from 'vitest';
import type { ActivityCommand } from '../packages/activity-protocol/src/index';
import {
  advanceGameBots,
  createGame,
  gameCommand,
  gameView,
  type GameTable,
} from '../apps/services/activities/games';
import { blackjackModule } from '../packages/games/src/blackjack-module';
import {
  startBlackjackTable,
  type BlackjackTableRound,
} from '../packages/games/src/blackjack-table';
import type { Card } from '../packages/games/src/cards';
import { okey101Module } from '../packages/games/src/okey101-module';
import type { OkeyRound } from '../packages/games/src/okey101-table';
import { TURN_DURATION_MS } from '../packages/games/src/seats';

// Wave 1 integration: every registered game is reachable through the activity service, and a table full
// of bots (plus the owner, whose turns time out) plays it to the end without a stuck or throwing bot.
const owner = { userId: 'alice', displayName: 'Alice', canCreate: true };
// The service deals with crypto randomness, so each game is played many times to catch a bot that throws.
const REPEAT = Array.from({ length: 25 }, (_, run) => run);
type Create = Extract<ActivityCommand, { type: 'game.create' }>;

function botTable(create: Omit<Create, 'type'>, seats: number) {
  const table = createGame({ type: 'game.create', ...create } as Create, owner);
  for (let seat = 1; seat < seats; seat++)
    gameCommand(table, { type: 'game.bot.add', seat }, owner, 0);
  gameCommand(table, { type: 'game.action', action: 'start' }, owner, 0);
  // A Blackjack deal can settle at once (dealer natural without an ace up).
  expect(table.status).toBe(create.game === 'blackjack' ? table.status : 'playing');
  return table;
}
/** Lets bots (and the owner's timeouts) play until the round is settled. */
function playOut(table: GameTable, start = 0, limit = 30_000) {
  let now = start,
    steps = 0;
  while (table.status === 'playing' && steps < limit) {
    now += TURN_DURATION_MS + 1;
    advanceGameBots(table, now);
    steps++;
  }
  expect(table.status).toBe('finished');
  return { now, steps };
}

describe('wave 1 games through the activity service', () => {
  it.each([2, 4])('plays full %i-seat Pişti matches to the target', (seats) => {
    REPEAT.forEach(() => playPisti(seats));
  });
  function playPisti(seats: number) {
    const table = botTable({ game: 'rooms-pisti-v1', options: { target: 101 } }, seats);
    const view = gameView(table, 'alice');
    expect(view.view).toMatchObject({
      seats,
      target: 101,
      series: { totals: Array(seats).fill(0) },
    });
    expect((view.view as { hand: Card[] }).hand).toHaveLength(4);
    expect(view.view.legalActions).toEqual(view.turn === 0 ? ['play'] : []);
    playOut(table);
    const result = table.history.at(-1)!.result as {
      totals: number[];
      winners: number[];
      rounds: { points: number[] }[];
    };
    expect(table.history).toHaveLength(1);
    expect(result.rounds.length).toBeGreaterThan(1);
    expect(Math.max(...result.totals)).toBeGreaterThanOrEqual(101);
    expect(result.winners.length).toBeGreaterThan(0);
    for (const winner of result.winners)
      expect(result.totals[winner]).toBe(Math.max(...result.totals));
    // The match total is the sum of the deals.
    for (const [seat, total] of result.totals.entries())
      expect(result.rounds.reduce((sum, round) => sum + round.points[seat], 0)).toBe(total);
    if (seats === 4) expect(result.totals[0]).toBe(result.totals[2]);
    expect(Object.values(table.statistics).every((stats) => stats.hands === 1)).toBe(true);
  }

  it('rejects Pişti options outside the published targets', () => {
    expect(() =>
      createGame({ type: 'game.create', game: 'rooms-pisti-v1', options: { target: 100 } }, owner),
    ).toThrow('GAME_OPTIONS_UNSUPPORTED');
  });

  it.each(REPEAT)('plays a full classic Okey round with four seats (run %i)', () => {
    const table = botTable({ game: 'rooms-okey-v1' }, 4);
    const view = gameView(table, 'alice').view as { seats: unknown[] };
    expect(view.seats).toHaveLength(4);
    playOut(table);
    const result = table.history.at(-1)!.result as { outcome: unknown; points: number[] };
    expect(result.outcome).toBeTruthy();
    expect(result.points).toHaveLength(4);
    // The public record keeps the other racks and the middle hidden.
    expect(JSON.stringify(result)).not.toContain('"stock"');
  });

  it.each(REPEAT)('plays a full Tavla match to three points (run %i)', () => {
    const table = botTable({ game: 'rooms-tavla-v1', options: { matchTo: 3 } }, 2);
    // The match wrapper keeps Tavla's own `match` field and adds `series`.
    expect(gameView(table, 'alice').view).toMatchObject({
      match: { matchTo: 3, scores: [0, 0] },
      series: { totals: [0, 0], winners: null },
    });
    playOut(table);
    const result = table.history.at(-1)!.result as { totals: number[]; winners: number[] };
    expect(result.winners).toHaveLength(1);
    expect(result.totals[result.winners[0]]).toBeGreaterThanOrEqual(3);
  });

  it.each(REPEAT)('plays v2 101 rounds to the end with bots (run %i)', () => {
    const table = botTable({ game: '101', options: { islekPenalty: true } }, 4);
    expect(table.okey!.rules).toMatchObject({ id: 'rooms-101-v2', options: { pickupUndo: false } });
    playOut(table);
    expect(table.history.at(-1)!.result).toHaveProperty('penaltyLog');
  });

  it('lets a timed-out 101 seat play on after a side pick that cannot be undone', () => {
    const table = botTable({ game: '101' }, 4);
    const round = table.okey as OkeyRound;
    // Seat 0 deals first and is in its discard stage; hand it a "picked" side discard.
    expect(round).toMatchObject({ turn: 0, stage: 'discard' });
    const picked = round.hands[3].pop()!;
    round.hands[0].push(picked);
    round.pickedDiscard = picked.id;
    expect(gameView(table, 'alice').view.legalActions).not.toContain('draw');
    expect(() => gameCommand(table, { type: 'game.action', action: 'draw' }, owner, 0)).toThrow(
      'PICKUP_UNDO_DISABLED',
    );
    let now = 0;
    // Her timer runs out (a gösterge, if she holds one, keeps the turn): the bot must play on, not try Çek.
    for (let i = 0; i < 4 && table.okey!.turn === 0; i++) {
      now += TURN_DURATION_MS + 1;
      advanceGameBots(table, now);
    }
    expect(table.okey!.turn).not.toBe(0);
    const after = table.okey as OkeyRound;
    expect(
      after.penaltyLog!.some((entry) => entry.seat === 0 && entry.reason === 'pickup') ||
        after.melds.some((meld) => meld.tiles.some((tile) => tile.id === picked.id)),
    ).toBe(true);
  });

  it.each(REPEAT)('plays Batak and Blackjack with table rules from options (run %i)', () => {
    const batak = botTable(
      { game: 'batak', variant: 'ihaleli', options: { writeContract: true } },
      4,
    );
    expect(batak.batak!.rules).toMatchObject({ writeContract: true, noTrumpLeadUntilBroken: true });
    playOut(batak);
    expect(batak.history.at(-1)!.result).toMatchObject({ rules: { writeContract: true } });

    const blackjack = botTable({ game: 'blackjack', options: { surrender: true } }, 3);
    expect(blackjack.blackjack!.rules).toEqual({ insurance: true, surrender: true });
    playOut(blackjack);
    expect(() =>
      createGame({ type: 'game.create', game: 'batak', options: { noSuchRule: true } }, owner),
    ).toThrow('GAME_OPTIONS_UNSUPPORTED');
  });
});

describe('blackjack insurance and surrender in the module', () => {
  // Deal order: each player one card, the dealer one card, then the same again.
  function aceUp() {
    const deck: Card[] = [];
    let n = 0;
    const card = (rank: number): Card => ({ id: `c${n++}`, suit: 'spades', rank });
    deck.push(card(10), card(14), card(6), card(9));
    for (let i = 0; i < 40; i++) deck.push(card(2 + (i % 8)));
    return startBlackjackTable([{ userId: 'p', credits: 1000, bet: 10 }], deck, {
      surrender: true,
    });
  }

  it('opens the insurance prompt with its own timer phase and lets bots decline', () => {
    const round = aceUp();
    expect(round.insurancePending).toBe(true);
    expect(blackjackModule.legalActions(round, 0)).toEqual(['insurance', 'decline-insurance']);
    expect(blackjackModule.botCommand(round, 0)).toEqual({
      action: 'decline-insurance',
    });
    expect(blackjackModule.phase(round)).toBe('insurance');
    const insured = blackjackModule.action(round, 0, {
      action: 'insurance',
    }) as BlackjackTableRound;
    expect(insured.insurancePending).toBe(false);
    expect(blackjackModule.phase(insured)).toBe('play');
    expect(blackjackModule.legalActions(insured, 0)).toEqual([
      'hit',
      'stand',
      'surrender',
      'double',
    ]);
    // Surrender: half the bet back, and the lost insurance stake counts in the net.
    const done = blackjackModule.action(insured, 0, { action: 'surrender' }) as BlackjackTableRound;
    expect(blackjackModule.settle(done)).toEqual({ points: [-10], winners: [] });
    expect(blackjackModule.summary(done).players[0]).toMatchObject({
      insurance: 5,
      insuranceReturned: 0,
      net: -10,
    });
  });
});

describe('101 module integration', () => {
  it('lists gösterge and the bot shows it on its first turn', () => {
    const table = botTable({ game: '101' }, 4);
    const round = structuredClone(table.okey!) as OkeyRound;
    const seat = round.turn!;
    // Give the seat the indicator's twin.
    const twin = {
      id: 'twin',
      color: round.indicator.color,
      value: round.indicator.value,
    };
    round.hands[seat][0] = twin;
    expect(okey101Module.legalActions(round, seat)).toContain('gosterge');
    expect(okey101Module.botCommand(round, seat)).toMatchObject({
      action: 'gosterge',
    });
  });
});
