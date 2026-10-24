import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import type { Card } from '../shared/model';

/**
 * Pişti fixture scenes shaped like the server view (`viewPisti` + `asMatch` series), for the view
 * test and the dev fixture page. Names are labelled examples, never production data.
 */
export type PistiScene =
  'your-turn' | 'opponent-turn' | 'pisti' | 'deal-end' | 'match-end' | 'spectator' | 'partners';

const card = (suit: string, rank: number): Card => ({ id: `${suit}-${rank}-0`, suit, rank });
const people = [
  { userId: 'self', name: 'Ece (demo)' },
  { userId: 'demo-ali', name: 'Ali (demo)' },
  { userId: 'demo-zeynep', name: 'Zeynep (demo)' },
  { userId: 'demo-can', name: 'Can (demo)' },
];

function base(count: number, viewer: number | null): GamePublicState {
  return {
    // `builtInGameKinds` in activity-protocol does not list the registry games yet.
    kind: 'rooms-pisti-v1' as GamePublicState['kind'],
    ownerId: 'self',
    status: 'playing',
    seats: people.slice(0, count).map((person, seat) => ({
      ...person,
      seat,
      bot: false,
      chips: 0,
      connected: true,
    })),
    turn: 0,
    history: [],
    view: {
      seats: count,
      teams: count === 4,
      target: 151,
      viewerSeat: viewer,
      turn: 0,
      hand: viewer === null ? null : [card('hearts', 7), card('clubs', 11), card('spades', 3)],
      handCounts: Array(count).fill(3),
      tableCount: 5,
      tableTop: card('diamonds', 7),
      deckCount: 28,
      capturedCounts: Array(count === 4 ? 2 : count).fill(0),
      pisti: Array(count === 4 ? 2 : count).fill(0),
      jackPisti: Array(count === 4 ? 2 : count).fill(0),
      lastPlay: null,
      lastCapture: null,
      result: null,
      series: { totals: Array(count).fill(0), rounds: [], winners: null, previous: null },
      legalActions: viewer === 0 ? ['play'] : [],
      turnDeadline: Date.now() + 30_000,
      capacity: count,
      watching: viewer === null,
      spectatorAccess: true,
      spectators: viewer === null ? [{ userId: 'self', name: 'Ece (demo)' }] : [],
      statistics: {},
      ownRecovery: null,
    },
  };
}

/** A finished deal as `series.previous` / the final `view`: Ali took more cards and one pişti. */
const finishedDeal = (count: number, viewer: number | null) => ({
  ...base(count, viewer).view,
  turn: null,
  hand: viewer === null ? null : [],
  handCounts: Array(count).fill(0),
  tableCount: 0,
  tableTop: null,
  deckCount: 0,
  capturedCounts: [22, 30],
  pisti: [0, 1],
  jackPisti: [0, 0],
  lastPlay: { seq: 48, seat: 0, card: card('spades', 4), captured: false },
  lastCapture: { seq: 48, seat: 1, count: 3, kind: 'remainder', card: null },
  // Ece: aces 2 + ♦10 3 = 5; Ali: aces 2 + jacks 4 + ♣2 2 = 8, most cards 3, pişti 10.
  result: { points: [5, 21], winners: [1] },
});

export function pistiFixture(scene: PistiScene): GamePublicState {
  switch (scene) {
    case 'your-turn': {
      const game = base(2, 0);
      game.view.lastPlay = { seq: 3, seat: 1, card: card('diamonds', 7), captured: false };
      return game;
    }
    case 'opponent-turn': {
      const game = base(2, 0);
      game.turn = 1;
      Object.assign(game.view, {
        turn: 1,
        legalActions: [],
        tableCount: 6,
        tableTop: card('hearts', 9),
        lastPlay: { seq: 4, seat: 0, card: card('hearts', 9), captured: false },
        lastCapture: { seq: 2, seat: 1, count: 4, kind: 'capture', card: card('clubs', 11) },
        capturedCounts: [0, 4],
      });
      return game;
    }
    case 'pisti': {
      const game = base(2, 0);
      Object.assign(game.view, {
        tableCount: 0,
        tableTop: null,
        lastPlay: { seq: 6, seat: 1, card: card('spades', 9), captured: true },
        lastCapture: { seq: 6, seat: 1, count: 2, kind: 'pisti', card: card('spades', 9) },
        capturedCounts: [0, 6],
        pisti: [0, 1],
      });
      return game;
    }
    case 'deal-end': {
      const game = base(2, 0);
      Object.assign(game.view, {
        tableCount: 4,
        tableTop: card('clubs', 13),
        deckCount: 40,
        handCounts: [4, 4],
        hand: [card('hearts', 7), card('clubs', 11), card('spades', 3), card('diamonds', 2)],
        series: {
          totals: [5, 21],
          rounds: [{ points: [5, 21], winners: [1] }],
          winners: null,
          previous: finishedDeal(2, 0),
        },
      });
      return game;
    }
    case 'match-end': {
      const game = base(2, 0);
      game.status = 'finished';
      game.turn = null;
      Object.assign(game.view, finishedDeal(2, 0), {
        legalActions: ['start'],
        series: {
          totals: [98, 156],
          rounds: [
            { points: [40, 60], winners: [1] },
            { points: [53, 75], winners: [1] },
            { points: [5, 21], winners: [1] },
          ],
          winners: [1],
          // The deal before the last one (the match module keeps the final deal as the view).
          previous: {
            ...finishedDeal(2, 0),
            lastPlay: { seq: 48, seat: 1, card: card('hearts', 5), captured: true },
            lastCapture: { seq: 48, seat: 1, count: 2, kind: 'pisti', card: card('hearts', 5) },
          },
        },
      });
      return game;
    }
    case 'spectator': {
      const game = base(2, null);
      game.turn = 1;
      Object.assign(game.view, {
        turn: 1,
        lastPlay: { seq: 4, seat: 0, card: card('diamonds', 7), captured: false },
      });
      return game;
    }
    case 'partners': {
      const game = base(4, 0);
      game.turn = 2;
      Object.assign(game.view, {
        turn: 2,
        legalActions: [],
        lastPlay: { seq: 9, seat: 1, card: card('diamonds', 7), captured: false },
        capturedCounts: [8, 5],
        series: {
          totals: [34, 46, 34, 46],
          rounds: [],
          winners: null,
          previous: null,
        },
      });
      return game;
    }
  }
}
