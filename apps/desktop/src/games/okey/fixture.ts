/**
 * Classic Okey fixture scenes (development screens and view tests). Four seats: Ece (round seat 0, the
 * viewer), Osman, Ayşe (bot) and Can; the indicator is Kırmızı 5, so the okey is Kırmızı 6.
 */
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import type { ClassicTile, OkeyClassicView } from '../../../../../packages/games/src/okey-classic';

type Color = ClassicTile['color'];
const tile = (color: Color, value: number, copy = 0): ClassicTile => ({
  id: `${color}-${value}-${copy}`,
  color,
  value,
});
const okeyTile: ClassicTile = { ...tile('red', 6, 1), joker: true };
const fakeOkey: ClassicTile = { id: 'false-joker-0', color: 'red', value: 6, fake: true };

export type OkeyScene = 'draw' | 'discard' | 'opponent' | 'finished' | 'spectator';

/** Draw stage: 14 tiles, Can's discard (Sarı 8) can be taken. */
const drawHand: ClassicTile[] = [
  tile('red', 1),
  tile('blue', 7),
  tile('black', 10),
  tile('red', 3),
  tile('yellow', 4),
  okeyTile,
  tile('black', 9),
  tile('blue', 7, 1),
  tile('red', 2),
  tile('black', 4),
  fakeOkey,
  tile('blue', 4),
  tile('black', 11),
  tile('yellow', 12),
];
/** Discard stage: 15 tiles that finish by throwing Sarı 13. */
const finishingHand: ClassicTile[] = [
  tile('red', 1),
  tile('blue', 8),
  tile('black', 10),
  tile('yellow', 13),
  tile('red', 3),
  tile('yellow', 4),
  tile('black', 9),
  tile('blue', 7),
  okeyTile,
  tile('red', 2),
  tile('black', 4),
  tile('blue', 9),
  tile('blue', 4),
  tile('black', 11),
  tile('red', 4),
];

const seats = [
  { seat: 0, userId: 'ece', name: 'Ece', bot: false, chips: 0, connected: true },
  { seat: 1, userId: 'osman', name: 'Osman', bot: false, chips: 0, connected: true },
  // i18n-ignore (player name)
  { seat: 2, userId: 'bot-ayse', name: 'Ayşe', bot: true, chips: 0, connected: true },
  {
    seat: 3,
    userId: 'can',
    // i18n-ignore (player name)
    name: 'Can Abdurrahmanoğlu Uzunisim',
    bot: false,
    chips: 0,
    connected: true,
  },
];

function baseView(): OkeyClassicView {
  return {
    kind: 'rooms-okey-v1',
    options: {
      scoring: 'countdown',
      startingPoints: 20,
      finishPoints: 2,
      okeyFinishMultiplier: 2,
      pairsFinishMultiplier: 2,
      stackMultipliers: false,
      indicatorPoints: 1,
    },
    indicator: tile('red', 5),
    okey: { color: 'red', value: 6 },
    stockCount: 31,
    first: 1,
    turn: 0,
    stage: 'draw',
    viewerSeat: 0,
    hand: drawHand,
    seats: [
      {
        seat: 0,
        tileCount: 14,
        discards: [tile('black', 13), tile('yellow', 1)],
        showedIndicator: false,
      },
      {
        seat: 1,
        tileCount: 14,
        discards: [tile('blue', 2), tile('blue', 11)],
        showedIndicator: false,
      },
      { seat: 2, tileCount: 14, discards: [tile('red', 12)], showedIndicator: false },
      {
        seat: 3,
        tileCount: 14,
        discards: [tile('black', 2), tile('yellow', 8)],
        showedIndicator: false,
      },
    ],
    canShowIndicator: false,
    indicatorShown: null,
    lastAction: { seat: 3, type: 'discard', tile: tile('yellow', 8) },
    outcome: null,
    finish: null,
    result: null,
  };
}

const statistics = {
  ece: { hands: 2, wins: 0, score: -6 },
  osman: { hands: 2, wins: 2, score: 0 },
  'bot-ayse': { hands: 2, wins: 0, score: -6 },
  can: { hands: 2, wins: 0, score: -6 },
};

/** A table in one of the fixture scenes, as the server sends it to `viewer`. */
export function okeyFixture(scene: OkeyScene): GamePublicState {
  const view: OkeyClassicView = baseView();
  let legalActions: string[] = ['draw'],
    status: GamePublicState['status'] = 'playing',
    turn: number | null = 0;
  if (scene === 'discard') {
    view.stage = 'discard';
    view.hand = finishingHand;
    view.seats[0].tileCount = 15;
    view.seats[3].discards = [tile('black', 2)];
    view.lastAction = { seat: 0, type: 'draw', from: 'discard', tile: tile('yellow', 8) };
    view.stockCount = 31;
    legalActions = ['discard', 'finish'];
  }
  if (scene === 'opponent' || scene === 'spectator') {
    view.turn = 2;
    turn = 2;
    view.seats[0].discards.push(tile('blue', 5));
    view.lastAction = { seat: 1, type: 'discard', tile: tile('blue', 11) };
    legalActions = [];
  }
  if (scene === 'spectator') {
    view.viewerSeat = null;
    view.hand = null;
  }
  if (scene === 'finished') {
    status = 'finished';
    turn = null;
    view.turn = null;
    view.stage = 'ended';
    view.outcome = 'finished';
    view.seats[1].tileCount = 14;
    view.lastAction = { seat: 1, type: 'finish', tile: okeyTile };
    view.finish = {
      seat: 1,
      discard: okeyTile,
      melds: [
        [tile('red', 9), tile('red', 10), tile('red', 11)],
        [tile('blue', 1), tile('blue', 2, 1), tile('blue', 3)],
        [tile('yellow', 7), tile('black', 7), tile('blue', 7, 1), fakeOkey],
        [tile('black', 5), tile('black', 6), tile('black', 7, 1), tile('black', 8)],
      ],
      pairs: false,
      okeyDiscard: true,
    };
    view.result = { points: [-4, 0, -4, -4], winners: [1] };
    legalActions = ['start'];
  }
  return {
    kind: 'rooms-okey-v1',
    ownerId: 'ece',
    status,
    seats,
    turn,
    view: {
      ...view,
      legalActions,
      watching: scene === 'spectator',
      ownRecovery: null,
      turnDeadline: 0,
      statistics: scene === 'finished' ? statistics : {},
    },
    history: [],
  } as unknown as GamePublicState;
}
