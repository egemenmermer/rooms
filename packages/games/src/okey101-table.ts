import { secureRandomInt } from './random';
import {
  okey101Options,
  okeyRuleProfile,
  remaining101Penalty,
  required101Pairs,
  validate101MeldWith,
  validate101Opening,
  validate101Pairs,
  type Okey101Options,
  type OkeyRuleProfile,
  type OkeyTile,
  type TileColor,
} from './okey101';
export type Okey101MeldKind = 'run' | 'group';
export type Okey101PenaltyReason = 'islek' | 'pickup' | 'reclaimed-okey' | 'gosterge';
export interface OkeyRound {
  rules: OkeyRuleProfile;
  indicator: OkeyTile;
  stock: OkeyTile[];
  hands: OkeyTile[][];
  discards: OkeyTile[][];
  melds: { owner: number; tiles: OkeyTile[]; pairs: boolean }[];
  opened: ('runs' | 'pairs' | null)[];
  turn: number | null;
  stage: 'draw' | 'discard' | 'ended';
  highestOpening: number;
  pickedDiscard: string | null;
  scores: number[];
  winner: number | null;
  // Fields below were added with rooms-101-v2; rounds stored before it lack them.
  /** Table penalties and bonuses (işlek, unused side discard, gösterge), added to the final scores unscaled. */
  penalties?: number[];
  penaltyLog?: { seat: number; reason: Okey101PenaltyReason; amount: number }[];
  /** Most pairs in a pair opening so far (katlamalı çift). */
  highestPairs?: number;
  /** Seat that made its first opening during the current turn (elden bitme). */
  openedThisTurn?: number | null;
  /** Completed turns (discards) per seat; gösterge is only allowed before the first. */
  turnsPlayed?: number[];
  gostergeShown?: boolean[];
  /** Okey taken back from a table meld during the current turn. */
  reclaimedOkey?: string | null;
  ending?: { okey: boolean; pairs: boolean; elden: boolean; multiplier: number };
}
function makeTiles(): OkeyTile[] {
  const tiles: OkeyTile[] = [];
  for (let copy = 0; copy < 2; copy++)
    for (const color of ['red', 'yellow', 'blue', 'black'] as TileColor[])
      for (let value = 1; value <= 13; value++)
        tiles.push({ id: `${color}-${value}-${copy}`, color, value });
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}
export function startOkey101(
  folding: boolean,
  teams: boolean,
  first: number,
  options: Partial<Okey101Options> = {},
): OkeyRound {
  const stock = makeTiles(),
    indicator = stock.pop()!,
    jokerValue = (indicator.value % 13) + 1;
  stock.forEach((tile) => {
    if (tile.color === indicator.color && tile.value === jokerValue) tile.joker = true;
  });
  stock.push(
    { id: 'false-joker-0', color: indicator.color, value: jokerValue },
    { id: 'false-joker-1', color: indicator.color, value: jokerValue },
  );
  for (let i = stock.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [stock[i], stock[j]] = [stock[j], stock[i]];
  }
  const hands = Array.from({ length: 4 }, () => [] as OkeyTile[]);
  for (let n = 0; n < 21; n++)
    for (let i = 0; i < 4; i++) hands[(first + i) % 4].push(stock.shift()!);
  hands[first].push(stock.shift()!);
  return {
    rules: okeyRuleProfile(folding, teams, options),
    indicator,
    stock,
    hands,
    discards: [[], [], [], []],
    melds: [],
    opened: [null, null, null, null],
    turn: first,
    stage: 'discard',
    highestOpening: 100,
    pickedDiscard: null,
    scores: [],
    winner: null,
    penalties: [0, 0, 0, 0],
    penaltyLog: [],
    highestPairs: 0,
    openedThisTurn: null,
    turnsPlayed: [0, 0, 0, 0],
    gostergeShown: [false, false, false, false],
    reclaimedOkey: null,
  };
}
const colors = ['red', 'yellow', 'blue', 'black'] as TileColor[];
/** Kind of an already resolved meld: a group repeats the value, a run never does. */
function meldKind(tiles: OkeyTile[]): Okey101MeldKind {
  return tiles.length >= 2 && tiles[0].value === tiles[1].value ? 'group' : 'run';
}
/** Run reading of an ordered new meld: jokers take the value of their position (a 14 is a high 1). */
function runReading(tiles: OkeyTile[], wrapAround: boolean): OkeyTile[] | null {
  const fixed = tiles.map((tile, index) => ({ tile, index })).filter((x) => !x.tile.joker);
  if (!fixed.length || fixed.some((x) => x.tile.color !== fixed[0].tile.color)) return null;
  const positions = (x: (typeof fixed)[number]) =>
    wrapAround && x.tile.value === 1 && x.index > 0 ? [1, 14] : [x.tile.value];
  for (const first of positions(fixed[0])) {
    const start = first - fixed[0].index;
    if (!fixed.every((x) => positions(x).includes(start + x.index))) continue;
    if (start < 1 || start + tiles.length - 1 > (wrapAround ? 14 : 13)) continue;
    return tiles.map((t, i) =>
      t.joker ? { ...t, color: fixed[0].tile.color, value: start + i === 14 ? 1 : start + i } : t,
    );
  }
  return null;
}
/** Group reading: jokers take the shared value and the colours no natural tile uses. */
function groupReading(tiles: OkeyTile[]): OkeyTile[] | null {
  const fixed = tiles.filter((t) => !t.joker);
  if (
    !fixed.length ||
    !fixed.every((t) => t.value === fixed[0].value) ||
    new Set(fixed.map((t) => t.color)).size !== fixed.length
  )
    return null;
  const unused = colors.filter((c) => !fixed.some((t) => t.color === c));
  if (tiles.length > fixed.length + unused.length) return null;
  return tiles.map((t) => (t.joker ? { ...t, color: unused.shift()!, value: fixed[0].value } : t));
}
/**
 * Resolve wildcard positions without exposing any other hand. Caller specifies an ordered run/group.
 * With one natural tile both readings can be legal ([7, J, J] is 7-8-9 or 7-7-7): the `kind` hint picks,
 * otherwise the run reading wins as in v1. A reading that cannot validate is never chosen over one that can.
 */
function assignedMeld(
  tiles: OkeyTile[],
  pairs = false,
  options: { kind?: Okey101MeldKind | null; wrapAround?: boolean } = {},
): OkeyTile[] {
  if (!tiles.some((t) => t.joker)) return tiles;
  const fixed = tiles.filter((t) => !t.joker);
  if (!fixed.length) {
    if (pairs && tiles.length === 2) return tiles;
    throw new Error('MELD_NEEDS_NATURAL_TILE');
  }
  if (pairs) {
    if (tiles.length !== 2) throw new Error('PAIR_REQUIRED');
    return tiles.map((t) => (t.joker ? { ...t, color: fixed[0].color, value: fixed[0].value } : t));
  }
  const readings = [
    { kind: 'run' as const, tiles: runReading(tiles, !!options.wrapAround) },
    { kind: 'group' as const, tiles: groupReading(tiles) },
  ].filter((r): r is { kind: Okey101MeldKind; tiles: OkeyTile[] } => !!r.tiles);
  const valid = readings.filter((r) => {
    try {
      validate101MeldWith(r.tiles, { wrapAround: options.wrapAround });
      return true;
    } catch {
      return false;
    }
  });
  const chosen = valid.find((r) => r.kind === options.kind) ?? valid[0] ?? readings[0];
  if (!chosen) throw new Error('INVALID_WILDCARD_MELD');
  return chosen.tiles;
}
/** Place added tiles around a table meld whose own tiles (and resolved okeys) stay fixed. */
function placeAround(
  meld: OkeyTile[],
  front: OkeyTile[],
  back: OkeyTile[],
  wrapAround: boolean,
): OkeyTile[] | null {
  if (meldKind(meld) === 'group') {
    const added = [...front, ...back];
    const used = new Set([...meld, ...added].filter((t) => !t.joker).map((t) => t.color));
    if (added.some((t) => !t.joker && t.value !== meld[0].value)) return null;
    const unused = colors.filter((c) => !used.has(c) && !meld.some((t) => t.color === c));
    const placed = added.map((t) =>
      t.joker ? (unused.length ? { ...t, color: unused.shift()!, value: meld[0].value } : null) : t,
    );
    return placed.every(Boolean) ? [...meld, ...(placed as OkeyTile[])] : null;
  }
  const color = meld[0].color,
    start = meld[0].value - front.length,
    candidate = [...front, ...meld, ...back];
  const out: OkeyTile[] = [];
  for (const [i, tile] of candidate.entries()) {
    if (i >= front.length && i < front.length + meld.length) {
      out.push(tile);
      continue;
    }
    const position = start + i;
    if (position < 1 || position > (wrapAround ? 14 : 13)) return null;
    const value = position === 14 ? 1 : position;
    if (tile.joker) out.push({ ...tile, color, value });
    else if (tile.color === color && tile.value === value) out.push(tile);
    else return null;
  }
  return out;
}
/**
 * The meld that results from adding `added` to a table meld, or null. Tiles may go to both ends of a run
 * (front ones first in the given order, or by value); the table meld keeps its kind and its okeys' values.
 */
export function extend101Meld(
  meld: OkeyTile[],
  added: OkeyTile[],
  rules: OkeyRuleProfile,
): OkeyTile[] | null {
  if (!added.length || added.length > 12) return null;
  const { wrapAround } = okey101Options(rules);
  const orders = [added];
  if (!added.some((t) => t.joker))
    orders.push([...added].sort((a, b) => a.value - b.value || a.id.localeCompare(b.id)));
  for (const order of orders)
    for (let k = order.length; k >= 0; k--) {
      const candidate = placeAround(meld, order.slice(0, k), order.slice(k), wrapAround);
      if (!candidate) continue;
      try {
        validate101MeldWith(candidate, { wrapAround });
        return candidate;
      } catch {
        /* Try the next split. */
      }
    }
  return null;
}
/**
 * İşlek taş: the tile fits a run or group on the table, or it is the natural tile a table okey stands for.
 * Bots should avoid discarding these when `islekPenalty` is on.
 */
export function okey101IsIslek(state: OkeyRound, tile: OkeyTile): boolean {
  return state.melds.some(
    (meld) =>
      !meld.pairs &&
      ((!tile.joker &&
        meld.tiles.some((t) => t.joker && t.color === tile.color && t.value === tile.value)) ||
        !!extend101Meld(meld.tiles, [tile], state.rules)),
  );
}
/** Id of the indicator's twin the seat may still show for the gösterge bonus, or null. */
export function okey101GostergeTile(state: OkeyRound, seat: number): string | null {
  if (
    state.stage === 'ended' ||
    state.turn !== seat ||
    !okey101Options(state.rules).gostergeBonus ||
    state.gostergeShown?.[seat] ||
    (state.turnsPlayed?.[seat] ?? 0) > 0
  )
    return null;
  return (
    state.hands[seat].find(
      (t) =>
        !t.joker &&
        t.id !== state.indicator.id &&
        t.color === state.indicator.color &&
        t.value === state.indicator.value,
    )?.id ?? null
  );
}
function addPenalty(state: OkeyRound, seat: number, reason: Okey101PenaltyReason, amount: number) {
  state.penalties ??= [0, 0, 0, 0];
  state.penaltyLog ??= [];
  state.penalties[seat] += amount;
  state.penaltyLog.push({ seat, reason, amount });
}
function finish(state: OkeyRound, winner: number | null, okey = false, pairs = false) {
  const options = okey101Options(state.rules);
  const elden = winner !== null && options.eldenBitme && state.openedThisTurn === winner;
  // Okey and çift finishes double once together (v1); elden bitme doubles again, so at most ×4.
  const base = okey || pairs ? 2 : 1,
    multiplier = Math.min(4, base * (elden ? 2 : 1));
  state.winner = winner;
  state.stage = 'ended';
  state.turn = null;
  state.ending = { okey, pairs, elden, multiplier };
  state.scores = state.hands.map(
    (hand, seat) =>
      (seat === winner
        ? -101 * base
        : remaining101Penalty(hand, !!state.opened[seat], false, multiplier)) +
      (state.penalties?.[seat] ?? 0),
  );
  if (state.rules.teams) {
    const score = [state.scores[0] + state.scores[2], state.scores[1] + state.scores[3]];
    state.scores = [score[0], score[1], score[0], score[1]];
  }
}
export function okey101Action(
  value: OkeyRound,
  seat: number,
  action: {
    action: string;
    cardId?: string;
    melds?: string[][];
    /** Per-meld reading hint for openings whose okeys allow both a run and a group. */
    meldKinds?: (Okey101MeldKind | null)[];
    amount?: number;
    tileIds?: string[];
  },
): OkeyRound {
  if (value.stage === 'ended' || value.turn !== seat) throw new Error('NOT_YOUR_TURN');
  const state = structuredClone(value),
    hand = state.hands[seat],
    options = okey101Options(state.rules);
  if (action.action === 'gosterge') {
    const shown = okey101GostergeTile(state, seat);
    if (!shown || (action.cardId && action.cardId !== shown))
      throw new Error('GOSTERGE_NOT_ALLOWED');
    state.gostergeShown ??= [false, false, false, false];
    state.gostergeShown[seat] = true;
    addPenalty(state, seat, 'gosterge', -101);
    return state;
  }
  if (state.stage === 'discard' && state.pickedDiscard && action.action === 'draw') {
    const picked = hand.find((tile) => tile.id === state.pickedDiscard);
    if (!picked) throw new Error('DISCARD_ALREADY_USED');
    // Without undo the side tile stays: use it, or discard and take the +101 pickup penalty.
    if (options.pickupPenalty && !options.pickupUndo) throw new Error('PICKUP_UNDO_DISABLED');
    // With both switches on the side tile may still go back, but it costs the same +101.
    if (options.pickupPenalty) addPenalty(state, seat, 'pickup', 101);
    state.hands[seat] = hand.filter((tile) => tile.id !== picked.id);
    state.discards[(seat + 3) % 4].push(picked);
    state.pickedDiscard = null;
    const replacement = state.stock.shift();
    if (!replacement) {
      finish(state, null);
      return state;
    }
    state.hands[seat].push(replacement);
    return state;
  }
  if (state.stage === 'draw') {
    if (action.action !== 'draw') throw new Error('DRAW_REQUIRED');
    if (action.cardId === 'discard') {
      const discard = state.discards[(seat + 3) % 4].pop();
      if (!discard) throw new Error('DISCARD_EMPTY');
      hand.push(discard);
      state.pickedDiscard = discard.id;
    } else {
      const tile = state.stock.shift();
      if (!tile) {
        finish(state, null);
        return state;
      }
      hand.push(tile);
    }
    state.stage = 'discard';
    return state;
  }
  if (action.action === 'discard') {
    const tile = hand.find((t) => t.id === action.cardId);
    if (!tile) throw new Error('TILE_NOT_IN_HAND');
    const pickupUnused = !!state.pickedDiscard && hand.some((t) => t.id === state.pickedDiscard);
    if (pickupUnused && !options.pickupPenalty) throw new Error('PICKED_DISCARD_MUST_BE_USED');
    if (pickupUnused) addPenalty(state, seat, 'pickup', 101);
    // The finishing tile ends the hand: nobody can process it, so it is never işlek.
    if (hand.length > 1) {
      if (
        options.reclaimedOkeyMustBeUsed &&
        state.reclaimedOkey &&
        hand.some((t) => t.id === state.reclaimedOkey)
      )
        addPenalty(state, seat, 'reclaimed-okey', 101);
      if (options.islekPenalty && okey101IsIslek(state, tile))
        addPenalty(state, seat, 'islek', 101);
    }
    state.hands[seat] = hand.filter((t) => t.id !== tile.id);
    state.discards[seat].push(tile);
    state.pickedDiscard = null;
    state.reclaimedOkey = null;
    if (state.turnsPlayed) state.turnsPlayed[seat] += 1;
    if (!state.hands[seat].length)
      finish(state, seat, !!tile.joker, state.opened[seat] === 'pairs');
    else {
      state.openedThisTurn = null;
      state.turn = (seat + 1) % 4;
      state.stage = 'draw';
    }
    return state;
  }
  if (action.action === 'open' || action.action === 'open-pairs') {
    const pairs = action.action === 'open-pairs';
    if (state.opened[seat] && state.opened[seat] !== (pairs ? 'pairs' : 'runs'))
      throw new Error('OPENING_MODE_LOCKED');
    const melds = (action.melds ?? []).map((ids, index) =>
      assignedMeld(
        ids.map((id) => {
          const tile = hand.find((t) => t.id === id);
          if (!tile) throw new Error('TILE_NOT_IN_HAND');
          return tile;
        }),
        pairs,
        { kind: action.meldKinds?.[index], wrapAround: options.wrapAround },
      ),
    );
    if (melds.flat().length >= hand.length) throw new Error('KEEP_ONE_DISCARD_TILE');
    if (!state.opened[seat]) {
      if (pairs) {
        validate101Pairs(hand, melds, state.rules, state.highestPairs ?? 0);
        state.highestPairs = Math.max(state.highestPairs ?? 0, melds.length);
      } else
        state.highestOpening = Math.max(
          state.highestOpening,
          validate101Opening(hand, melds, state.rules, state.highestOpening),
        );
      state.openedThisTurn = seat;
    } else {
      const used = melds.flat();
      if (!used.length || new Set(used.map((t) => t.id)).size !== used.length)
        throw new Error('INVALID_MELD');
      if (pairs) {
        if (
          melds.some(
            (m) => m.length !== 2 || m[0].color !== m[1].color || m[0].value !== m[1].value,
          )
        )
          throw new Error('PAIR_REQUIRED');
      } else melds.forEach((meld) => validate101MeldWith(meld, { wrapAround: options.wrapAround }));
    }
    state.opened[seat] = pairs ? 'pairs' : 'runs';
    state.melds.push(...melds.map((tiles) => ({ owner: seat, tiles, pairs })));
    const ids = new Set(melds.flat().map((t) => t.id));
    state.hands[seat] = hand.filter((t) => !ids.has(t.id));
    return state;
  }
  if (action.action === 'process') {
    if (!state.opened[seat] || !Number.isInteger(action.amount) || !state.melds[action.amount!])
      throw new Error('OPEN_AND_SELECT_MELD_FIRST');
    const meld = state.melds[action.amount!];
    if (meld.pairs) throw new Error('PAIR_CANNOT_EXTEND');
    const ids = action.tileIds ?? [];
    if (!ids.length || new Set(ids).size !== ids.length) throw new Error('TILES_REQUIRED');
    const added = ids.map((id) => {
      const tile = hand.find((t) => t.id === id);
      if (!tile) throw new Error('TILE_NOT_IN_HAND');
      return tile;
    });
    if (action.cardId) {
      const wildcard = meld.tiles.find((tile) => tile.id === action.cardId && tile.joker);
      if (
        !wildcard ||
        added.length !== 1 ||
        added[0].joker ||
        added[0].color !== wildcard.color ||
        added[0].value !== wildcard.value
      )
        throw new Error('EXACT_JOKER_REPLACEMENT_REQUIRED');
      meld.tiles = meld.tiles.map((tile) => (tile.id === wildcard.id ? added[0] : tile));
      state.hands[seat] = hand.filter((tile) => tile.id !== added[0].id);
      state.hands[seat].push({
        ...wildcard,
        color: state.indicator.color,
        value: (state.indicator.value % 13) + 1,
      });
      state.reclaimedOkey = wildcard.id;
      return state;
    }
    if (ids.length >= hand.length) throw new Error('KEEP_ONE_DISCARD_TILE');
    const valid = extend101Meld(meld.tiles, added, state.rules);
    if (!valid) throw new Error('INVALID_MELD_EXTENSION');
    meld.tiles = valid;
    state.hands[seat] = hand.filter((t) => !ids.includes(t.id));
    return state;
  }
  throw new Error('INVALID_101_ACTION');
}
export function okey101View(state: OkeyRound, seat: number | null) {
  return {
    rules: state.rules,
    indicator: state.indicator,
    remainingStock: state.stock.length,
    turn: state.turn,
    stage: state.stage,
    highestOpening: state.highestOpening,
    highestPairs: state.highestPairs ?? 0,
    requiredPairs: required101Pairs(state.rules, state.highestPairs ?? 0),
    melds: state.melds,
    opened: state.opened,
    discards: state.discards.map((cards) => cards.slice(-1)),
    scores: state.scores,
    winner: state.winner,
    penalties: state.penalties ?? [0, 0, 0, 0],
    penaltyLog: state.penaltyLog ?? [],
    gostergeShown: state.gostergeShown ?? [false, false, false, false],
    ending: state.ending ?? null,
    hands: state.hands.map((tiles, index) => ({
      seat: index,
      tiles: index === seat ? tiles : [],
      count: tiles.length,
    })),
  };
}
