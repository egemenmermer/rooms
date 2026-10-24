/**
 * Classic Turkish Okey (`rooms-okey-v1`), four players, no opening and no laying off.
 *
 * Tayfa table profile (house-rule defaults; every scoring value is an option, see OkeyClassicOptions):
 * - 106 tiles: 4 colors x 1-13 x 2 plus two sahte okey. The gösterge is turned up from the 104 normal tiles
 *   (never a sahte okey) and stays out of play. Okey = gösterge + 1 in the same color, 13 -> 1. The two
 *   physical okey tiles are wild (`joker: true`). A sahte okey (`fake: true`, id `false-joker-N`) is not
 *   wild: it stands for the okey's own face value.
 * - The first player (dealer's right) gets 15 tiles and starts by discarding; the others get 14 and 48 stay in
 *   the middle. Play passes to seat + 1. A turn is: draw from the middle or take the top tile the previous
 *   player (seat - 1) discarded, then discard one tile onto your own pile, which the next player may take.
 * - Finish (bitirme): discard the 15th tile so the remaining 14 split into valid sets only: runs (one color,
 *   consecutive, 3+ tiles; 1 may follow 13 as in 12-13-1 but 13-1-2 is not allowed) and groups (one number,
 *   3-4 different colors), or 7 pairs (çift: same color and number). The okey stands for any tile.
 * - Showing the gösterge: a player holding the other physical copy may show it during their own first turn
 *   (before their first discard) for a bonus.
 * - Middle exhausted: when a discard leaves the middle empty and nobody finished, the round ends with no winner
 *   (a gösterge bonus still counts).
 * - Scoring (Okey Plus style): `countdown` (default) writes -2 to every other player for a normal finish, x2
 *   when the finishing discard is an okey, x2 for a çift finish; multipliers do not stack by default (same as
 *   the 101 profile). Showing the gösterge writes -1 to every other player. `winner` mode writes the same
 *   amounts as plus points to the finisher / shower instead (running table).
 * Not implemented on purpose: elden bitme bonus, okey-discard penalties, team play.
 */
import type { OkeyTile, TileColor } from './okey101';

// The deck/dealing code in okey101-table.ts is not exported and uses node:crypto randomInt, so it cannot be
// reused under the seeded-rng contract; this file builds the same physical deck with the caller's rng.

/** Structural copy of GameModule (packages/games/src/module.ts, track G-REG); the coordinator swaps it at merge. */
type GameModuleShape<State, Command, View, Options = unknown> = {
  /** Protocol id, e.g. 'rooms-pisti-v1'. */
  kind: string;
  /** Allowed seat counts, e.g. [2, 4]. */
  seats: readonly number[];
  /** Command names the client may send in game.action (validated server-side before action()). */
  actions: readonly string[];
  /** Zod-free plain validator for the per-game payload; returns the typed command or an error string. */
  parseCommand(input: { action: string; payload?: unknown }): Command | { error: string };
  /** New round. `rng` must be the only randomness source (tests pass a seeded one). */
  start(seatCount: number, options: Options, first: number, rng: () => number): State;
  /** Apply one seated player's command. Returns the new state or an error string (never throws for player mistakes). */
  action(
    state: State,
    seat: number,
    command: Command,
    rng: () => number,
  ): State | { error: string };
  /** What `viewerSeat` may see (null = spectator). MUST hide other players' hidden cards/tiles and the deck order. */
  view(state: State, viewerSeat: number | null): View;
  /** Whose turn it is (seat index) or null when nobody must act (round over). */
  turn(state: State): number | null;
  /** A legal, reasonable command for a bot or a timed-out player in `seat`. */
  botCommand(state: State, seat: number, rng: () => number): Command;
  /** Final result once `turn(state) === null`: points per seat (this round) and winner seats. */
  settle(state: State): { points: number[]; winners: number[] } | null;
};

export const OKEY_CLASSIC_KIND = 'rooms-okey-v1';
const SEATS = 4;
const COLORS: readonly TileColor[] = ['red', 'yellow', 'blue', 'black'];

/** A physical tile. `joker` marks the two real okeys (wild); `fake` marks the two sahte okeys. */
export type ClassicTile = OkeyTile & { fake?: boolean };

export interface OkeyClassicOptions {
  /** `countdown`: others lose points (everyone starts at `startingPoints`); `winner`: the finisher gains them. */
  scoring: 'countdown' | 'winner';
  /** Starting balance for a countdown table; informational for the service and UI. */
  startingPoints: number;
  /** Points for a normal finish. */
  finishPoints: number;
  /** Multiplier when the finishing discard is a real okey. */
  okeyFinishMultiplier: number;
  /** Multiplier for a seven-pairs (çift) finish. */
  pairsFinishMultiplier: number;
  /** Multiply both doubles together (x4) instead of applying only the larger one. */
  stackMultipliers: boolean;
  /** Points for showing the gösterge on your first turn (0 disables showing). */
  indicatorPoints: number;
}

export const OKEY_CLASSIC_DEFAULT_OPTIONS: Readonly<OkeyClassicOptions> = Object.freeze({
  scoring: 'countdown',
  startingPoints: 20,
  finishPoints: 2,
  okeyFinishMultiplier: 2,
  pairsFinishMultiplier: 2,
  stackMultipliers: false,
  indicatorPoints: 1,
});

export type OkeyClassicCommand =
  | { type: 'draw'; from: 'stock' | 'discard' }
  | { type: 'discard'; tileId: string }
  | { type: 'finish'; tileId: string }
  | { type: 'show-indicator' };

export type OkeyClassicLastAction =
  | { seat: number; type: 'draw'; from: 'stock' }
  | { seat: number; type: 'draw'; from: 'discard'; tile: ClassicTile }
  | { seat: number; type: 'discard'; tile: ClassicTile }
  | { seat: number; type: 'show-indicator'; tile: ClassicTile }
  | { seat: number; type: 'finish'; tile: ClassicTile };

export interface OkeyClassicFinish {
  seat: number;
  /** The 15th tile thrown to end the round. */
  discard: ClassicTile;
  /** The winning 14 tiles split into sets (runs are stored as consecutive pieces of 3-5 tiles). */
  melds: ClassicTile[][];
  pairs: boolean;
  okeyDiscard: boolean;
}

export interface OkeyClassicState {
  kind: typeof OKEY_CLASSIC_KIND;
  options: OkeyClassicOptions;
  indicator: ClassicTile;
  okey: { color: TileColor; value: number };
  stock: ClassicTile[];
  hands: ClassicTile[][];
  /** discards[seat] is the pile between `seat` and `seat + 1`; its top tile can be taken by `seat + 1`. */
  discards: ClassicTile[][];
  first: number;
  turn: number;
  stage: 'draw' | 'discard' | 'ended';
  /** Whether the seat has completed its first discard (closes the gösterge window). */
  hasDiscarded: boolean[];
  indicatorShown: { seat: number; tile: ClassicTile } | null;
  lastAction: OkeyClassicLastAction | null;
  outcome: 'finished' | 'stock-exhausted' | null;
  finish: OkeyClassicFinish | null;
}

export interface OkeyClassicView {
  kind: typeof OKEY_CLASSIC_KIND;
  options: OkeyClassicOptions;
  indicator: ClassicTile;
  okey: { color: TileColor; value: number };
  stockCount: number;
  first: number;
  turn: number | null;
  stage: OkeyClassicState['stage'];
  viewerSeat: number | null;
  /** The viewer's own rack; null for spectators. */
  hand: ClassicTile[] | null;
  seats: { seat: number; tileCount: number; discards: ClassicTile[]; showedIndicator: boolean }[];
  canShowIndicator: boolean;
  indicatorShown: { seat: number; tile: ClassicTile } | null;
  lastAction: OkeyClassicLastAction | null;
  outcome: OkeyClassicState['outcome'];
  finish: OkeyClassicFinish | null;
  result: { points: number[]; winners: number[] } | null;
}

const ACTIONS = ['draw', 'discard', 'finish', 'show-indicator'] as const;

// ---------------------------------------------------------------------------------------------------------
// Options and deck

function intOption(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
    ? value
    : fallback;
}

/** Coerce table options from the creator; unknown or out-of-range values fall back to the defaults. */
export function resolveOkeyClassicOptions(input: unknown): OkeyClassicOptions {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = OKEY_CLASSIC_DEFAULT_OPTIONS;
  return {
    scoring: raw.scoring === 'winner' || raw.scoring === 'countdown' ? raw.scoring : d.scoring,
    startingPoints: intOption(raw.startingPoints, d.startingPoints, 1000),
    finishPoints: intOption(raw.finishPoints, d.finishPoints, 100),
    okeyFinishMultiplier: intOption(raw.okeyFinishMultiplier, d.okeyFinishMultiplier, 8) || 1,
    pairsFinishMultiplier: intOption(raw.pairsFinishMultiplier, d.pairsFinishMultiplier, 8) || 1,
    stackMultipliers:
      typeof raw.stackMultipliers === 'boolean' ? raw.stackMultipliers : d.stackMultipliers,
    indicatorPoints: intOption(raw.indicatorPoints, d.indicatorPoints, 100),
  };
}

function shuffle<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

const nextValue = (value: number) => (value % 13) + 1;

export function startOkeyClassic(
  options: unknown,
  first: number,
  rng: () => number,
): OkeyClassicState {
  if (!Number.isInteger(first) || first < 0 || first >= SEATS)
    throw new Error('INVALID_FIRST_SEAT');
  const normals: ClassicTile[] = [];
  for (let copy = 0; copy < 2; copy++)
    for (const color of COLORS)
      for (let value = 1; value <= 13; value++)
        normals.push({ id: `${color}-${value}-${copy}`, color, value });
  shuffle(normals, rng);
  const indicator = normals.pop()!;
  const okey = { color: indicator.color, value: nextValue(indicator.value) };
  for (const tile of normals)
    if (tile.color === okey.color && tile.value === okey.value) tile.joker = true;
  const stock = [
    ...normals,
    { id: 'false-joker-0', color: okey.color, value: okey.value, fake: true },
    { id: 'false-joker-1', color: okey.color, value: okey.value, fake: true },
  ];
  shuffle(stock, rng);
  const hands = Array.from({ length: SEATS }, () => [] as ClassicTile[]);
  for (let n = 0; n < 14; n++)
    for (let i = 0; i < SEATS; i++) hands[(first + i) % SEATS].push(stock.shift()!);
  hands[first].push(stock.shift()!);
  return {
    kind: OKEY_CLASSIC_KIND,
    options: resolveOkeyClassicOptions(options),
    indicator,
    okey,
    stock,
    hands,
    discards: Array.from({ length: SEATS }, () => []),
    first,
    turn: first,
    stage: 'discard',
    hasDiscarded: Array.from({ length: SEATS }, () => false),
    indicatorShown: null,
    lastAction: null,
    outcome: null,
    finish: null,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Set search (pure, used for finish validation and by the bot)

const colorRank = (color: TileColor) => COLORS.indexOf(color);
const sortTiles = (tiles: ClassicTile[]) =>
  [...tiles].sort(
    (a, b) =>
      colorRank(a.color) - colorRank(b.color) || a.value - b.value || a.id.localeCompare(b.id),
  );

interface Candidate {
  mask: number;
  jokers: number;
  /** Natural tile index per slot, or -1 for an okey. Slots are in run/group order. */
  slots: number[];
}

/** Every set of 3-5 (run) or 3-4 (group) tiles that contains natural `i`, using naturals in `mask` and okeys. */
function setsContaining(naturals: ClassicTile[], mask: number, jokers: number, i: number) {
  const out: Candidate[] = [];
  const tile = naturals[i];
  const find = (color: TileColor, value: number, used: number) => {
    for (let k = 0; k < naturals.length; k++)
      if (
        mask & (1 << k) &&
        !(used & (1 << k)) &&
        naturals[k].color === color &&
        naturals[k].value === value
      )
        return k;
    return -1;
  };
  // Groups: one number, different colors.
  const others = COLORS.filter((c) => c !== tile.color)
    .map((c) => find(c, tile.value, 1 << i))
    .filter((k) => k >= 0);
  for (let pick = 0; pick < 1 << others.length; pick++) {
    const chosen = others.filter((_, n) => pick & (1 << n));
    for (let j = 0; j <= jokers; j++) {
      const size = 1 + chosen.length + j;
      if (size < 3 || size > 4) continue;
      out.push({
        mask: chosen.reduce((m, k) => m | (1 << k), 1 << i),
        jokers: j,
        slots: [i, ...chosen, ...Array(j).fill(-1)],
      });
    }
  }
  // Runs: one color, positions 1..14 where 14 is a 1 placed after 13. Longer runs split into 3-5 pieces.
  const positions = tile.value === 1 ? [1, 14] : [tile.value];
  for (const pos of positions)
    for (let length = 3; length <= 5; length++)
      for (
        let start = Math.max(1, pos - length + 1);
        start <= pos && start + length - 1 <= 14;
        start++
      ) {
        const fill = (q: number, used: number, j: number, slots: number[]): void => {
          if (q > start + length - 1) {
            out.push({ mask: used, jokers: j, slots });
            return;
          }
          if (q === pos) return fill(q + 1, used, j, [...slots, i]);
          const k = find(tile.color, q === 14 ? 1 : q, used);
          if (k >= 0) fill(q + 1, used | (1 << k), j, [...slots, k]);
          if (j < jokers) fill(q + 1, used, j + 1, [...slots, -1]);
        };
        fill(start, 1 << i, 0, []);
      }
  return out;
}

interface SetSearch {
  naturals: ClassicTile[];
  jokers: ClassicTile[];
  /** Most tiles (naturals + okeys) that can be placed into valid sets. */
  best: number;
  /** One arrangement reaching `best`, as natural index / -1 slots. */
  sets: number[][];
}

/** Exhaustive memoized search for the arrangement that places the most tiles into runs and groups. */
function searchSets(tiles: ClassicTile[]): SetSearch {
  const naturals = sortTiles(tiles.filter((t) => !t.joker));
  const jokers = tiles.filter((t) => t.joker);
  const memo = new Map<number, { best: number; sets: number[][] }>();
  const solve = (mask: number, j: number): { best: number; sets: number[][] } => {
    if (!mask) return { best: 0, sets: [] };
    const key = mask * 4 + j;
    const known = memo.get(key);
    if (known) return known;
    let i = 0;
    while (!(mask & (1 << i))) i++;
    let result = solve(mask & ~(1 << i), j);
    for (const set of setsContaining(naturals, mask, j, i)) {
      const rest = solve(mask & ~set.mask, j - set.jokers);
      const total = rest.best + set.slots.length;
      if (total > result.best) result = { best: total, sets: [set.slots, ...rest.sets] };
    }
    memo.set(key, result);
    return result;
  };
  const found = solve((1 << naturals.length) - 1, jokers.length);
  return { naturals, jokers, ...found };
}

/** Pair (çift) arrangement: same color and number; an okey pairs with anything. */
function pairArrangement(tiles: ClassicTile[]): { pairs: ClassicTile[][]; singles: ClassicTile[] } {
  const naturals = sortTiles(tiles.filter((t) => !t.joker));
  const jokers = tiles.filter((t) => t.joker);
  const pairs: ClassicTile[][] = [];
  const singles: ClassicTile[] = [];
  for (let k = 0; k < naturals.length; k++) {
    const next = naturals[k + 1];
    if (next && next.color === naturals[k].color && next.value === naturals[k].value) {
      pairs.push([naturals[k], next]);
      k++;
    } else singles.push(naturals[k]);
  }
  for (const single of [...singles]) {
    if (!jokers.length) break;
    pairs.push([single, jokers.shift()!]);
    singles.splice(singles.indexOf(single), 1);
  }
  while (jokers.length >= 2) pairs.push([jokers.shift()!, jokers.shift()!]);
  return { pairs, singles: [...singles, ...jokers] };
}

/** Split 14 tiles into a finishing arrangement, or null. Seven pairs win over sets (çift scores double). */
export function okeyClassicArrangement(
  tiles: ClassicTile[],
): { melds: ClassicTile[][]; pairs: boolean } | null {
  if (tiles.length !== 14 || new Set(tiles.map((t) => t.id)).size !== 14) return null;
  const pairs = pairArrangement(tiles);
  if (pairs.pairs.length === 7) return { melds: pairs.pairs, pairs: true };
  const search = searchSets(tiles);
  if (search.best === 14) {
    const jokers = [...search.jokers];
    return {
      melds: search.sets.map((slots) =>
        slots.map((k) => (k >= 0 ? search.naturals[k] : jokers.shift()!)),
      ),
      pairs: false,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Rules

type Result = OkeyClassicState | { error: string };

function endRound(state: OkeyClassicState, outcome: 'finished' | 'stock-exhausted') {
  state.stage = 'ended';
  state.outcome = outcome;
}

function canShowIndicator(state: OkeyClassicState, seat: number): boolean {
  return (
    state.stage !== 'ended' &&
    state.turn === seat &&
    state.options.indicatorPoints > 0 &&
    !state.indicatorShown &&
    !state.hasDiscarded[seat] &&
    state.hands[seat].some((t) => isIndicatorCopy(state, t))
  );
}

const isIndicatorCopy = (state: OkeyClassicState, tile: ClassicTile) =>
  !tile.joker &&
  !tile.fake &&
  tile.color === state.indicator.color &&
  tile.value === state.indicator.value;

export function okeyClassicAction(
  value: OkeyClassicState,
  seat: number,
  command: OkeyClassicCommand,
): Result {
  if (value.stage === 'ended') return { error: 'ROUND_OVER' };
  if (value.turn !== seat) return { error: 'NOT_YOUR_TURN' };
  const state = structuredClone(value);
  const hand = state.hands[seat];
  switch (command.type) {
    case 'show-indicator': {
      if (!canShowIndicator(state, seat)) return { error: 'CANNOT_SHOW_INDICATOR' };
      const tile = hand.find((t) => isIndicatorCopy(state, t))!;
      state.indicatorShown = { seat, tile };
      state.lastAction = { seat, type: 'show-indicator', tile };
      return state;
    }
    case 'draw': {
      if (state.stage !== 'draw') return { error: 'DISCARD_REQUIRED' };
      if (command.from === 'discard') {
        const tile = state.discards[(seat + SEATS - 1) % SEATS].pop();
        if (!tile) return { error: 'DISCARD_EMPTY' };
        hand.push(tile);
        state.lastAction = { seat, type: 'draw', from: 'discard', tile };
      } else {
        const tile = state.stock.shift();
        if (!tile) return { error: 'STOCK_EMPTY' };
        hand.push(tile);
        state.lastAction = { seat, type: 'draw', from: 'stock' };
      }
      state.stage = 'discard';
      return state;
    }
    case 'discard':
    case 'finish': {
      if (state.stage !== 'discard') return { error: 'DRAW_REQUIRED' };
      const tile = hand.find((t) => t.id === command.tileId);
      if (!tile) return { error: 'TILE_NOT_IN_HAND' };
      const rest = hand.filter((t) => t.id !== tile.id);
      if (command.type === 'finish') {
        const arrangement = okeyClassicArrangement(rest);
        if (!arrangement) return { error: 'HAND_NOT_FINISHED' };
        state.hands[seat] = rest;
        state.hasDiscarded[seat] = true;
        state.finish = { seat, discard: tile, ...arrangement, okeyDiscard: !!tile.joker };
        state.lastAction = { seat, type: 'finish', tile };
        endRound(state, 'finished');
        return state;
      }
      state.hands[seat] = rest;
      state.discards[seat].push(tile);
      state.hasDiscarded[seat] = true;
      state.lastAction = { seat, type: 'discard', tile };
      if (!state.stock.length) endRound(state, 'stock-exhausted');
      else {
        state.turn = (seat + 1) % SEATS;
        state.stage = 'draw';
      }
      return state;
    }
    default:
      return { error: 'INVALID_OKEY_ACTION' };
  }
}

export function settleOkeyClassic(
  state: OkeyClassicState,
): { points: number[]; winners: number[] } | null {
  if (state.stage !== 'ended') return null;
  const { options } = state;
  const points = Array.from({ length: SEATS }, () => 0);
  const award = (seat: number, amount: number) => {
    if (!amount) return;
    if (options.scoring === 'winner') points[seat] += amount;
    else for (let other = 0; other < SEATS; other++) if (other !== seat) points[other] -= amount;
  };
  if (state.indicatorShown) award(state.indicatorShown.seat, options.indicatorPoints);
  const winners: number[] = [];
  if (state.finish) {
    const multipliers = [
      state.finish.okeyDiscard ? options.okeyFinishMultiplier : 1,
      state.finish.pairs ? options.pairsFinishMultiplier : 1,
    ];
    const multiplier = options.stackMultipliers
      ? multipliers[0] * multipliers[1]
      : Math.max(...multipliers);
    award(state.finish.seat, options.finishPoints * multiplier);
    winners.push(state.finish.seat);
  }
  return { points, winners };
}

export function okeyClassicView(
  state: OkeyClassicState,
  viewerSeat: number | null,
): OkeyClassicView {
  const seated =
    viewerSeat !== null && Number.isInteger(viewerSeat) && viewerSeat >= 0 && viewerSeat < SEATS
      ? viewerSeat
      : null;
  const ended = state.stage === 'ended';
  return {
    kind: state.kind,
    options: { ...state.options },
    indicator: { ...state.indicator },
    okey: { ...state.okey },
    stockCount: state.stock.length,
    first: state.first,
    turn: ended ? null : state.turn,
    stage: state.stage,
    viewerSeat: seated,
    hand: seated === null ? null : state.hands[seated].map((t) => ({ ...t })),
    seats: state.hands.map((tiles, seat) => ({
      seat,
      tileCount: tiles.length,
      discards: state.discards[seat].map((t) => ({ ...t })),
      showedIndicator: state.indicatorShown?.seat === seat,
    })),
    canShowIndicator: seated !== null && canShowIndicator(state, seated),
    indicatorShown: state.indicatorShown ? structuredClone(state.indicatorShown) : null,
    // A stock draw never carries the drawn tile, so this is safe for every viewer.
    lastAction: state.lastAction ? structuredClone(state.lastAction) : null,
    outcome: state.outcome,
    // The winner lays the finished rack open; other racks stay hidden after the round too.
    finish: state.finish ? structuredClone(state.finish) : null,
    result: settleOkeyClassic(state),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Bot: greedy set building that keeps the okey

/** Tiles placed into sets, or the pair count when the rack leans toward a çift finish. */
function rackScore(tiles: ClassicTile[]): number {
  const sets = searchSets(tiles).best;
  const pairs = pairArrangement(tiles).pairs.length;
  return Math.max(sets, pairs >= 5 ? pairs * 2 : 0);
}

/** How many other tiles could form a set with `tile` (same number in another color, or a near run neighbour). */
function connections(tile: ClassicTile, rack: ClassicTile[]): number {
  let count = 0;
  for (const other of rack) {
    if (other.id === tile.id || other.joker) continue;
    if (other.value === tile.value && other.color !== tile.color) count++;
    else if (other.color === tile.color) {
      const gap = Math.abs(other.value - tile.value);
      if (gap === 1 || gap === 2 || gap === 12 || gap === 11) count++;
      else if (gap === 0) count += 0.5;
    }
  }
  return count;
}

/** Best non-okey tile to throw: keeps the highest rack score, then the fewest connections, then the highest value. */
function bestDiscard(hand: ClassicTile[]): { tile: ClassicTile; score: number } {
  const candidates = hand.filter((t) => !t.joker);
  const pool = candidates.length ? candidates : hand;
  let best: { tile: ClassicTile; score: number; links: number } | null = null;
  for (const tile of pool) {
    const rest = hand.filter((t) => t.id !== tile.id);
    const score = rackScore(rest);
    const links = connections(tile, rest);
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        (links < best.links ||
          (links === best.links &&
            (tile.value > best.tile.value ||
              (tile.value === best.tile.value && tile.id < best.tile.id)))))
    )
      best = { tile, score, links };
  }
  return { tile: best!.tile, score: best!.score };
}

function finishingTile(hand: ClassicTile[]): ClassicTile | null {
  const order = [...hand.filter((t) => t.joker), ...sortTiles(hand.filter((t) => !t.joker))];
  for (const tile of order)
    if (okeyClassicArrangement(hand.filter((t) => t.id !== tile.id))) return tile;
  return null;
}

export function okeyClassicBotCommand(state: OkeyClassicState, seat: number): OkeyClassicCommand {
  const hand = state.hands[seat] ?? [];
  if (canShowIndicator(state, seat)) return { type: 'show-indicator' };
  if (state.stage === 'draw') {
    const top = state.discards[(seat + SEATS - 1) % SEATS].at(-1);
    if (top) {
      const withTop = [...hand, top];
      if (finishingTile(withTop)) return { type: 'draw', from: 'discard' };
      // Take the tile only when it strictly improves the rack after the best discard (and the discard is not it).
      const after = bestDiscard(withTop);
      if (after.tile.id !== top.id && after.score > rackScore(hand))
        return { type: 'draw', from: 'discard' };
    }
    return { type: 'draw', from: 'stock' };
  }
  const finisher = finishingTile(hand);
  if (finisher) return { type: 'finish', tileId: finisher.id };
  return { type: 'discard', tileId: bestDiscard(hand).tile.id };
}

// ---------------------------------------------------------------------------------------------------------
// Module

function parseTileId(payload: unknown): string | { error: string } {
  const tileId =
    payload && typeof payload === 'object' ? (payload as { tileId?: unknown }).tileId : undefined;
  return typeof tileId === 'string' && tileId.length > 0 && tileId.length <= 64
    ? tileId
    : { error: 'TILE_ID_REQUIRED' };
}

export function parseOkeyClassicCommand(input: {
  action: string;
  payload?: unknown;
}): OkeyClassicCommand | { error: string } {
  switch (input.action) {
    case 'draw': {
      const from =
        input.payload && typeof input.payload === 'object'
          ? (input.payload as { from?: unknown }).from
          : undefined;
      if (from === undefined || from === 'stock') return { type: 'draw', from: 'stock' };
      if (from === 'discard') return { type: 'draw', from: 'discard' };
      return { error: 'INVALID_DRAW_SOURCE' };
    }
    case 'discard':
    case 'finish': {
      const tileId = parseTileId(input.payload);
      return typeof tileId === 'string' ? { type: input.action, tileId } : tileId;
    }
    case 'show-indicator':
      return { type: 'show-indicator' };
    default:
      return { error: 'INVALID_OKEY_ACTION' };
  }
}

export const okeyClassicModule = {
  kind: OKEY_CLASSIC_KIND,
  seats: [SEATS],
  actions: ACTIONS,
  parseCommand: parseOkeyClassicCommand,
  start(seatCount, options, first, rng) {
    if (seatCount !== SEATS) throw new Error('OKEY_NEEDS_FOUR_SEATS');
    return startOkeyClassic(options, first, rng);
  },
  action: (state, seat, command) => okeyClassicAction(state, seat, command),
  view: okeyClassicView,
  turn: (state) => (state.stage === 'ended' ? null : state.turn),
  botCommand: (state, seat) => okeyClassicBotCommand(state, seat),
  settle: settleOkeyClassic,
} satisfies GameModuleShape<
  OkeyClassicState,
  OkeyClassicCommand,
  OkeyClassicView,
  Partial<OkeyClassicOptions> | undefined
>;
