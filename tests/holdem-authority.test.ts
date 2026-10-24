import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  commandSchema,
  type ActivityCommand,
  type HoldemTableRules,
} from '../packages/activity-protocol/src/index';
import {
  createGame,
  gameCommand,
  gameView,
  defaultHoldemRules,
  disconnectGame,
  advanceGameBots,
} from '../apps/services/activities/games';
import {
  applyCommand,
  emptyRoom,
  response,
  type ActivityIdentity,
} from '../apps/services/activities/engine';
import { holdemAction, holdemView, startHoldem } from '../packages/games/src/holdem';
import { evaluateHoldemDetailed, shuffledDeck, type Card } from '../packages/games/src/cards';
const owner = { userId: 'owner', displayName: 'Owner', canCreate: true, canControl: true };
const guest = { userId: 'guest', displayName: 'Guest', canCreate: false, canControl: false };
const rules: HoldemTableRules = {
  name: 'Evening table',
  capacity: 6,
  smallBlind: 20,
  bigBlind: 40,
  minBuyIn: 500,
  maxBuyIn: 2000,
  initialChips: 1000,
  spectatorsAllowed: true,
};
const envelope = (command: ActivityCommand, revision = 0) => ({
  protocolVersion: 1 as const,
  commandId: randomUUID(),
  expectedRevision: revision,
  command,
});
const deckWith = (cards: [number, Card['suit']][]) => {
  const deck = shuffledDeck();
  const picked = cards.map(([rank, suit]) =>
    deck.find((card) => card.rank === rank && card.suit === suit)!,
  );
  return [...picked, ...deck.filter((card) => !picked.includes(card))];
};
describe('authoritative Holdem configuration and join rules', () => {
  it('publishes the muckLosers house rule in view.rules, also for tables stored without options', () => {
    const house = createGame(
      { type: 'game.create', game: 'holdem', options: { muckLosers: true } },
      owner,
    );
    expect(gameView(house, 'owner').view.rules).toMatchObject({ muckLosers: true, capacity: 9 });
    // Viewers outside the table see the same published rule.
    expect(gameView(house, 'stranger').view.rules).toMatchObject({ muckLosers: true });
    const stored = createGame({ type: 'game.create', game: 'holdem' }, owner);
    delete stored.options;
    expect(gameView(stored, 'owner').view.rules).toMatchObject({ muckLosers: false });
  });
  it('preserves legacy defaults and validates consistent bounded rules before mutation', () => {
    const legacy = createGame({ type: 'game.create', game: 'holdem' }, owner);
    expect(legacy.capacity).toBe(9);
    expect(legacy.seats[0].chips).toBe(1000);
    expect(gameView(legacy, 'owner').view.rules).toEqual({
      ...defaultHoldemRules(),
      muckLosers: false,
    });
    expect(
      commandSchema.safeParse(
        envelope({ type: 'game.create', game: 'holdem', holdem: { ...rules, minBuyIn: 10 } }),
      ).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse(
        envelope({
          type: 'game.create',
          game: 'holdem',
          holdem: { ...rules, name: 'x'.repeat(33) },
        }),
      ).success,
    ).toBe(false);
    const table = createGame({ type: 'game.create', game: 'holdem', holdem: rules }, owner);
    const before = structuredClone(table);
    expect(() => gameCommand(table, { type: 'game.configure', holdem: rules }, guest, 1)).toThrow(
      'TABLE_OWNER_REQUIRED',
    );
    expect(table).toEqual(before);
    gameCommand(table, { type: 'game.bot.add', seat: 5 }, owner, 1);
    const beforeCapacity = structuredClone(table);
    expect(() =>
      gameCommand(table, { type: 'game.configure', holdem: { ...rules, capacity: 2 } }, owner, 2),
    ).toThrow('EXISTING_SEATS_CONFLICT');
    expect(table).toEqual(beforeCapacity);
  });
  it('uses actual selected blinds, explicit buy-in, locked rules and deferred late seating', () => {
    const table = createGame({ type: 'game.create', game: 'holdem', holdem: rules }, owner);
    gameCommand(table, { type: 'game.sit', seat: 1, buyIn: 500 }, guest, 1);
    expect(table.seats[1].chips).toBe(500);
    gameCommand(table, { type: 'game.action', action: 'start' }, owner, 10);
    expect(table.holdem!.bigBlind).toBe(40);
    expect(table.holdem!.seats.map((seat) => seat.streetBet)).toEqual([20, 40]);
    expect(table.turnDeadline).toBe(45010);
    const hand = structuredClone(table.holdem);
    const late = { ...guest, userId: 'late' };
    gameCommand(table, { type: 'game.sit', seat: 3, buyIn: 2000 }, late, 11);
    expect(table.holdem).toEqual(hand);
    expect(
      gameView(table, 'late').seats.find((seat) => seat.userId === 'late')!.pendingNextHand,
    ).toBe(true);
    expect(gameView(table, 'late').view.ownHand).toBeNull();
    gameCommand(table, { type: 'game.sit', seat: 1 }, guest, 12);
    expect(table.holdem).toEqual(hand);
    expect(() => gameCommand(table, { type: 'game.sit', seat: 1, buyIn: 1000 }, guest, 13)).toThrow(
      'CHIP_CHANGE_DURING_HAND',
    );
    expect(() => gameCommand(table, { type: 'game.configure', holdem: rules }, owner, 14)).toThrow(
      'TABLE_RULES_LOCKED',
    );
  });
  it('checks or folds human timeouts without spending extra chips, and refreshes the deadline on a new street', () => {
    const table = createGame({ type: 'game.create', game: 'holdem' }, owner);
    gameCommand(table, { type: 'game.sit', seat: 1 }, guest, 1);
    gameCommand(table, { type: 'game.action', action: 'start' }, owner, 10);
    advanceGameBots(table, 45010);
    expect(table.holdem!.seats[0].folded).toBe(true);
    expect(table.holdem!.seats[0].contribution).toBe(10);
    const free = createGame({ type: 'game.create', game: 'holdem' }, owner);
    gameCommand(free, { type: 'game.sit', seat: 1 }, guest, 1);
    gameCommand(free, { type: 'game.action', action: 'start' }, owner, 10);
    gameCommand(free, { type: 'game.action', action: 'call' }, owner, 100);
    gameCommand(free, { type: 'game.action', action: 'check' }, guest, 1000);
    expect(free.holdem!.stage).toBe('flop');
    expect(free.turnDeadline).toBe(46000);
    advanceGameBots(free, 46000);
    expect(free.holdem!.seats[1].folded).toBe(false);
    expect(free.holdem!.seats[1].contribution).toBe(20);
  });
  it('requires explicit spectating and never projects a seat or private hand for the observer', () => {
    const table = createGame({ type: 'game.create', game: 'holdem', holdem: rules }, owner);
    gameCommand(table, { type: 'game.bot.add', seat: 1 }, owner, 1);
    gameCommand(table, { type: 'game.action', action: 'start' }, owner, 2);
    expect(gameView(table, 'guest').view.spectatorAccess).toBe(false);
    expect(gameView(table, 'guest').view.seats).toBeUndefined();
    gameCommand(table, { type: 'game.watch', watching: true }, guest, 3);
    const view = gameView(table, 'guest');
    expect(view.view.watching).toBe(true);
    expect(view.seats.some((seat) => seat.userId === 'guest')).toBe(false);
    expect(view.view.ownHand).toBeNull();
    expect((view.view.seats as { cards: Card[] }[]).every((seat) => seat.cards.length === 0)).toBe(
      true,
    );
    disconnectGame(table, 'guest', 4);
    expect(gameView(table, 'guest').view.spectators).toEqual([]);
    const closed = createGame(
      { type: 'game.create', game: 'holdem', holdem: { ...rules, spectatorsAllowed: false } },
      owner,
    );
    expect(() => gameCommand(closed, { type: 'game.watch', watching: true }, guest, 1)).toThrow(
      'SPECTATORS_DISABLED',
    );
  });
});
describe('evaluated private/public poker results', () => {
  it('reports actual main/side eligibility, distinct winners and only legally revealed best fives', () => {
    const deck = deckWith([
      [13, 'hearts'],
      [14, 'hearts'],
      [12, 'hearts'],
      [13, 'diamonds'],
      [14, 'diamonds'],
      [12, 'diamonds'],
      [5, 'clubs'],
      [12, 'clubs'],
      [9, 'spades'],
      [6, 'hearts'],
      [7, 'clubs'],
      [4, 'clubs'],
      [8, 'clubs'],
      [2, 'spades'],
    ]);
    let hand = startHoldem(
      [
        { userId: 'a', chips: 100 },
        { userId: 'b', chips: 200 },
        { userId: 'c', chips: 300 },
      ],
      0,
      10,
      20,
      deck,
    );
    expect(holdemView(hand, 'a').ownHand).toBeNull();
    expect(holdemView(hand, 'a').showdown).toBeNull();
    hand = holdemAction(hand, 'a', 1, { type: 'raise', to: 100 });
    hand = holdemAction(hand, 'b', 2, { type: 'raise', to: 200 });
    hand = holdemAction(hand, 'c', 3, { type: 'call' });
    const view = holdemView(hand, 'a');
    expect(view.pots).toMatchObject([
      {
        kind: 'main',
        amount: 300,
        eligible: ['a', 'b', 'c'],
        winners: ['a'],
        awards: { a: 300 },
        split: false,
      },
      {
        kind: 'side',
        amount: 200,
        eligible: ['b', 'c'],
        winners: ['c'],
        awards: { c: 200 },
        split: false,
      },
    ]);
    expect(view.ownHand!.category).toBe('three-of-a-kind');
    expect(view.showdown!.b.category).toBe('one-pair');
    expect(hand.seats.reduce((sum, seat) => sum + seat.chips, 0)).toBe(600);
    expect(
      view.pots.reduce((sum, pot) => sum + Object.values(pot.awards).reduce((a, b) => a + b, 0), 0),
    ).toBe(500);
    for (const seat of view.seats) {
      expect(
        view.showdown![seat.userId].bestFiveCardIds.every((id) =>
          [...seat.cards, ...view.board].some((card) => card.id === id),
        ),
      ).toBe(true);
    }
  });
  it('keeps folded/uncalled hidden hands out of public evaluations', () => {
    let hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 1000 },
      ],
      0,
      10,
      20,
    );
    const hidden = hand.seats.map((seat) => seat.cards.map((card) => card.id)).flat();
    hand = holdemAction(hand, 'a', 1, { type: 'fold' });
    const outsider = holdemView(hand, 'spectator');
    expect(outsider.showdown).toBeNull();
    expect(outsider.settlementReason).toBe('uncontested');
    expect(outsider.ownHand).toBeNull();
    expect(outsider.seats.every((seat) => seat.cards.length === 0)).toBe(true);
    expect(hidden.every((id) => !JSON.stringify(outsider).includes(id))).toBe(true);
  });
  it('distinguishes equal-ranked split pots from separate winners and detects the ace-low wheel', () => {
    const deck = deckWith([
      [9, 'hearts'],
      [10, 'hearts'],
      [11, 'hearts'],
      [12, 'clubs'],
      [13, 'diamonds'],
      [14, 'spades'],
      [8, 'clubs'],
      [2, 'clubs'],
      [3, 'diamonds'],
      [4, 'spades'],
      [8, 'diamonds'],
      [5, 'hearts'],
      [8, 'spades'],
      [6, 'clubs'],
    ]);
    let hand = startHoldem(
      [
        { userId: 'a', chips: 100 },
        { userId: 'b', chips: 200 },
        { userId: 'c', chips: 300 },
      ],
      0,
      10,
      20,
      deck,
    );
    hand = holdemAction(hand, 'a', 1, { type: 'raise', to: 100 });
    hand = holdemAction(hand, 'b', 2, { type: 'raise', to: 200 });
    hand = holdemAction(hand, 'c', 3, { type: 'call' });
    expect(hand.settlement!.pots.every((pot) => pot.split)).toBe(true);
    expect(hand.seats.map((seat) => seat.chips)).toEqual([100, 200, 300]);
    const wheel = evaluateHoldemDetailed([
      { id: 'a', rank: 14, suit: 'spades' },
      { id: '2', rank: 2, suit: 'hearts' },
      { id: '3', rank: 3, suit: 'clubs' },
      { id: '4', rank: 4, suit: 'diamonds' },
      { id: '5', rank: 5, suit: 'clubs' },
      { id: 'k', rank: 13, suit: 'spades' },
    ]);
    expect(wheel.category).toBe('straight');
    expect(wheel.score).toEqual([4, 5]);
  });
});
describe('atomic authorized primary activity replacement', () => {
  it('keeps old queue/events/game on invalid, stale or denied replacement and commits once when authorized', () => {
    const room = emptyRoom('test-room', 100);
    const send = (command: ActivityCommand, actor: ActivityIdentity = owner) =>
      applyCommand(
        room,
        actor,
        envelope(command, room.snapshot.revision),
        200 + room.snapshot.revision,
      );
    send({ type: 'join' });
    send({ type: 'join' }, guest);
    send({ type: 'start', activity: 'cinema', title: 'Shared film' });
    send({
      type: 'queue.add',
      itemId: 'film',
      media: { kind: 'independent-source', referenceId: 'edition', title: 'Film' },
    });
    send({ type: 'queue.select', itemId: 'film' });
    const primary = room.snapshot.primary!;
    const replacePrimary = { activity: primary.activity, startedAt: primary.startedAt };
    const before = structuredClone(room);
    expect(() =>
      send({
        type: 'game.create',
        game: 'holdem',
        holdem: { ...rules, minBuyIn: 1 },
        replacePrimary,
      }),
    ).toThrow();
    expect(room).toEqual(before);
    expect(() =>
      send({
        type: 'game.create',
        game: 'holdem',
        holdem: rules,
        replacePrimary: { ...replacePrimary, startedAt: 0 },
      }),
    ).toThrow('PRIMARY_ACTIVITY_STALE');
    expect(room).toEqual(before);
    expect(() =>
      send(
        { type: 'game.create', game: 'holdem', holdem: rules, replacePrimary },
        { ...guest, canCreate: true },
      ),
    ).toThrow('ACTIVITY_CONTROL_DENIED');
    expect(room).toEqual(before);
    send({ type: 'game.create', game: 'holdem', holdem: rules, replacePrimary });
    expect(room.snapshot.queue).toEqual(before.snapshot.queue);
    expect(room.snapshot.cinema).toBeNull();
    expect(room.snapshot.timeline.playing).toBe(false);
    expect(room.snapshot.timeline.epoch).toBe(before.snapshot.timeline.epoch + 1);
    expect(room.events.slice(0, -1)).toEqual(before.events);
    expect(room.snapshot.primary!.title).toBe(rules.name);
    expect(response(room, 0, 500, 'guest').room.game!.view.spectatorAccess).toBe(false);
    send({ type: 'end' });
    send({ type: 'start', activity: 'cinema', title: 'Return to film' });
    expect(room.snapshot.queue).toEqual(before.snapshot.queue);
    expect(room.snapshot.timeline.itemId).toBeNull();
    expect(room.snapshot.cinema).toBeNull();
  });
});

describe('live pot display', () => {
  const act = (hand: ReturnType<typeof startHoldem>, action: Parameters<typeof holdemAction>[3]) =>
    holdemAction(hand, hand.seats[hand.turn!]!.userId, hand.revision, action);
  it('shows the blinds as one pot until someone is all-in', () => {
    const hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 1000 },
      ],
      0,
      10,
      20,
    );
    expect(holdemView(hand, 'a').pots).toEqual([
      expect.objectContaining({ kind: 'main', amount: 30 }),
    ]);
  });
  it('keeps a real side pot once a short stack is all-in', () => {
    let hand = startHoldem(
      [
        { userId: 'a', chips: 100 },
        { userId: 'b', chips: 500 },
        { userId: 'c', chips: 500 },
      ],
      0,
      10,
      20,
    );
    hand = act(hand, { type: 'raise', to: 100 });
    hand = act(hand, { type: 'raise', to: 300 });
    hand = act(hand, { type: 'call' });
    const pots = holdemView(hand, 'a').pots;
    expect(pots.map((pot) => pot.amount)).toEqual([300, 400]);
    expect(pots[1]!.eligible.sort()).toEqual(['b', 'c']);
  });
});
