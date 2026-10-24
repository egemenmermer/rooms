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
type Create = Extract<ActivityCommand, { type: 'game.create' }>;

function botTable(create: Omit<Create, 'type'>, seats: number) {
  const table = createGame({ type: 'game.create', ...create } as Create, owner);
  for (let seat = 1; seat < seats; seat++)
    gameCommand(table, { type: 'game.bot.add', seat }, owner, 0);
  gameCommand(table, { type: 'game.action', action: 'start' }, owner, 0);
  expect(table.status).toBe('playing');
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
  it.each([2, 4])('plays a full %i-seat Pişti match to the target', (seats) => {
    const table = botTable({ game: 'rooms-pisti-v1', options: { target: 101 } }, seats);
    const view = gameView(table, 'alice');
    expect(view.view).toMatchObject({
      seats,
      target: 101,
      match: { totals: Array(seats).fill(0) },
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
  });

  it('rejects Pişti options outside the published targets', () => {
    expect(() =>
      createGame({ type: 'game.create', game: 'rooms-pisti-v1', options: { target: 100 } }, owner),
    ).toThrow('GAME_OPTIONS_UNSUPPORTED');
  });

  it('plays a full classic Okey round with four seats', () => {
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

  it('plays a full Tavla match to three points', () => {
    const table = botTable({ game: 'rooms-tavla-v1', options: { matchTo: 3 } }, 2);
    playOut(table);
    const result = table.history.at(-1)!.result as { totals: number[]; winners: number[] };
    expect(result.winners).toHaveLength(1);
    expect(result.totals[result.winners[0]]).toBeGreaterThanOrEqual(3);
  });

  it('plays v2 101 to the end, including a timed-out side pick that cannot be undone', () => {
    const table = botTable({ game: '101', options: { islekPenalty: true } }, 4);
    expect(table.okey!.rules).toMatchObject({
      id: 'rooms-101-v2',
      options: { pickupUndo: false },
    });
    let now = 0;
    // Run until Alice must draw while her left neighbour's discard is available, then take it.
    for (let i = 0; i < 400 && table.status === 'playing'; i++) {
      const round = table.okey as OkeyRound;
      if (round.turn === 0 && round.stage === 'draw' && round.discards[3].length) break;
      now += TURN_DURATION_MS + 1;
      advanceGameBots(table, now);
    }
    if (table.status === 'playing') {
      gameCommand(table, { type: 'game.action', action: 'draw', cardId: 'discard' }, owner, now);
      const legal = gameView(table, 'alice').view.legalActions;
      expect(legal).not.toContain('draw');
      expect(() => gameCommand(table, { type: 'game.action', action: 'draw' }, owner, now)).toThrow(
        'PICKUP_UNDO_DISABLED',
      );
      // Her timer runs out: the bot must play on instead of trying Çek.
      advanceGameBots(table, now + TURN_DURATION_MS + 1);
      now += TURN_DURATION_MS + 1;
    }
    playOut(table, now);
    expect(table.history.at(-1)!.result).toHaveProperty('penaltyLog');
  });

  it('plays Batak and Blackjack with table rules from game.create options', () => {
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
    const insured = blackjackModule.action(
      round,
      0,
      { action: 'insurance' }) as BlackjackTableRound;
    expect(insured.insurancePending).toBe(false);
    expect(blackjackModule.phase(insured)).toBe('play');
    expect(blackjackModule.legalActions(insured, 0)).toEqual([
      'hit',
      'stand',
      'surrender',
      'double',
    ]);
    // Surrender: half the bet back, and the lost insurance stake counts in the net.
    const done = blackjackModule.action(
      insured,
      0,
      { action: 'surrender' }) as BlackjackTableRound;
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
