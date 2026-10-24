/**
 * 101 Okey fixture scenes (development screens and view tests). Four seats: Ece (seat 0, the viewer), Osman,
 * Ayşe (bot) and Can. The gösterge is Sarı 7, so the okey is Sarı 8 (two okeys, two ★ sahte okeys).
 */
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import type { OkeyTile, TileColor } from '../../../../../packages/games/src/okey101';

const tile = (color: TileColor, value: number, copy = 0): OkeyTile => ({
  id: `${color}-${value}-${copy}`,
  color,
  value,
});
const okey = (copy: number): OkeyTile => ({ ...tile('yellow', 8, copy), joker: true });
/** As the server marks it (`fake: true`) on the two sahte okeys. */
const sahte: OkeyTile & { fake: true } = {
  id: 'false-joker-0',
  color: 'yellow',
  value: 8,
  fake: true,
};
const indicator = tile('yellow', 7, 0);

export type Okey101Scene = 'draw' | 'discard' | 'opponent' | 'finished' | 'spectator';

/** Ece's 22 tiles when she starts: an ambiguous 7-okey-okey, three runs, the gösterge twin, a sahte okey. */
const startHand: OkeyTile[] = [
  tile('red', 7),
  okey(0),
  okey(1),
  tile('black', 11),
  tile('black', 12),
  tile('black', 13),
  tile('blue', 11),
  tile('blue', 12),
  tile('blue', 13),
  tile('yellow', 10),
  tile('yellow', 11),
  tile('yellow', 12),
  tile('yellow', 7, 1),
  sahte,
  tile('red', 1),
  tile('red', 3),
  tile('blue', 2),
  tile('blue', 2, 1),
  tile('black', 5),
  tile('black', 5, 1),
  tile('red', 9),
  tile('blue', 6),
];
const drawHand = startHand.slice(0, 21);

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

/** Osman opened with runs; his second meld holds an okey standing in for Mavi 6. */
const osmanMelds = [
  { owner: 1, tiles: [tile('red', 10, 1), tile('red', 11, 1), tile('red', 12, 1)], pairs: false },
  {
    owner: 1,
    tiles: [tile('blue', 4), tile('blue', 5), { ...okey(1), color: 'blue' as const, value: 6 }],
    pairs: false,
  },
  {
    owner: 1,
    tiles: [tile('black', 9), tile('red', 9, 1), tile('blue', 9, 1)],
    pairs: false,
  },
];

const options = {
  islekPenalty: true,
  eldenBitme: true,
  pickupPenalty: true,
  pickupUndo: false,
  foldingPairs: true,
  gostergeBonus: true,
  wrapAround: false,
  reclaimedOkeyMustBeUsed: false,
};

export function okey101Fixture(scene: Okey101Scene, viewer?: string): GamePublicState {
  const viewerSeat = seats.find((seat) => seat.userId === viewer)?.seat ?? null;
  const ended = scene === 'finished',
    turn = scene === 'draw' || scene === 'discard' ? 0 : ended ? null : 2,
    stage = ended ? 'ended' : scene === 'discard' ? 'discard' : 'draw';
  const own = scene === 'discard' ? startHand : drawHand;
  const counts =
    scene === 'discard' ? [22, 21, 21, 21] : scene === 'draw' ? [21, 20, 21, 21] : [21, 11, 21, 20];
  const legalActions =
    viewerSeat !== 0
      ? []
      : scene === 'draw'
        ? ['draw', 'gosterge']
        : scene === 'discard'
          ? ['discard', 'open', 'open-pairs', 'gosterge']
          : [];
  const view = {
    rules: {
      id: 'rooms-101-v2',
      folding: false,
      teams: false,
      openingMinimum: 101,
      pairsMinimum: 5,
      options,
    },
    indicator,
    remainingStock: ended ? 0 : 38,
    turn,
    stage,
    highestOpening: scene === 'discard' ? 100 : 108,
    highestPairs: 0,
    requiredPairs: 5,
    melds: scene === 'discard' ? [] : osmanMelds,
    opened: scene === 'discard' ? [null, null, null, null] : [null, 'runs', null, null],
    discards:
      scene === 'discard'
        ? [[], [], [], []]
        : [[tile('blue', 3, 1)], [tile('blue', 11, 1)], [tile('black', 2)], [tile('red', 5)]],
    scores: ended ? [303, -101, 182, 404] : [],
    winner: ended ? 1 : null,
    penalties: ended ? [101, 0, -101, 0] : [0, 0, 0, 0],
    penaltyLog: ended
      ? [
          { seat: 2, reason: 'gosterge', amount: -101 },
          { seat: 0, reason: 'islek', amount: 101 },
        ]
      : [],
    gostergeShown: [false, false, ended, false],
    ending: ended ? { okey: false, pairs: false, elden: true, multiplier: 2 } : null,
    hands: [0, 1, 2, 3].map((seat) => ({
      seat,
      tiles: seat === viewerSeat && !ended ? own : [],
      count: ended ? (seat === 1 ? 0 : counts[seat]) : counts[seat],
    })),
    legalActions,
  };
  return {
    kind: '101',
    ownerId: 'ece',
    status: ended ? 'finished' : 'playing',
    seats,
    turn,
    view,
    history: [],
  } as unknown as GamePublicState;
}
