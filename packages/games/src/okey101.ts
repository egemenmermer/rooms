export type TileColor = 'red' | 'yellow' | 'blue' | 'black';
export interface OkeyTile {
  id: string;
  color: TileColor;
  value: number;
  joker?: boolean;
}
/** Table rule switches of the v2 profile. A profile without options keeps the v1 behaviour. */
export interface Okey101Options {
  /** O1: discarding a tile that a table meld accepts (or that frees a table okey) costs the discarder +101. */
  islekPenalty: boolean;
  /** O2: opening and finishing in the same turn without an earlier opening doubles the others' penalties. */
  eldenBitme: boolean;
  /** O4: a side discard still in hand when the player discards costs +101 (undo with Çek is also +101). */
  pickupPenalty: boolean;
  /**
   * O4: Çek may put a side discard back and draw from stock instead (costs +101 with `pickupPenalty`).
   * Always allowed when `pickupPenalty` is off, so the player is never stuck with an unusable tile.
   */
  pickupUndo: boolean;
  /** O5: with folding on, each pair opening must have more pairs than the highest pair opening so far. */
  foldingPairs: boolean;
  /** O5: showing the indicator's twin on the seat's first turn gives −101. */
  gostergeBonus: boolean;
  /** O6: a run may end 12-13-1; that high 1 counts 11. 13-1-2 is never legal. */
  wrapAround: boolean;
  /** O9: an okey taken back from the table must leave the hand in the same turn, otherwise +101. */
  reclaimedOkeyMustBeUsed: boolean;
}
export const okey101DefaultOptions: Readonly<Okey101Options> = Object.freeze({
  islekPenalty: true,
  eldenBitme: true,
  pickupPenalty: true,
  pickupUndo: false,
  foldingPairs: true,
  gostergeBonus: true,
  wrapAround: false,
  reclaimedOkeyMustBeUsed: false,
});
/** Behaviour of rounds and callers that predate the options (rooms-101-v1). */
const legacyOptions: Readonly<Okey101Options> = Object.freeze({
  islekPenalty: false,
  eldenBitme: false,
  pickupPenalty: false,
  pickupUndo: true,
  foldingPairs: false,
  gostergeBonus: false,
  wrapAround: false,
  reclaimedOkeyMustBeUsed: false,
});
export interface OkeyRuleProfile {
  id: 'rooms-101-v1' | 'rooms-101-v2';
  folding: boolean;
  teams: boolean;
  openingMinimum: 101;
  pairsMinimum: 5;
  options?: Okey101Options;
}
export const okeyRuleProfile = (
  folding: boolean,
  teams: boolean,
  options: Partial<Okey101Options> = {},
): OkeyRuleProfile => ({
  id: 'rooms-101-v2',
  folding,
  teams,
  openingMinimum: 101,
  pairsMinimum: 5,
  options: { ...okey101DefaultOptions, ...options },
});
/** Effective switches; a profile without options (v1 or a hand-built client profile) keeps v1 rules. */
export function okey101Options(rules: Pick<OkeyRuleProfile, 'options'>): Okey101Options {
  return { ...legacyOptions, ...rules.options };
}
export interface Okey101MeldOptions {
  /** Allow 12-13-1 with the high 1 worth 11. */
  wrapAround?: boolean;
}
/** True when the last tile is a 1 directly after a 13, the only wrap a 101 run may have. */
function highOne(tiles: OkeyTile[], wrapAround: boolean): boolean {
  return (
    wrapAround &&
    tiles.length >= 3 &&
    tiles[tiles.length - 1].value === 1 &&
    tiles[tiles.length - 2].value === 13
  );
}
/**
 * Validate explicit joker substitutions before counting opening points. Runs do not wrap 13→1.
 * Kept one-argument so callers may pass it to `forEach`/`map`; use `validate101MeldWith` for table options.
 */
export function validate101Meld(tiles: OkeyTile[]): number {
  return validate101MeldWith(tiles, {});
}
/** `validate101Meld` with table options: `wrapAround` allows 12-13-1 with the high 1 worth 11. */
export function validate101MeldWith(tiles: OkeyTile[], options: Okey101MeldOptions): number {
  if (
    tiles.length < 3 ||
    tiles.length > 13 ||
    new Set(tiles.map((t) => t.id)).size !== tiles.length ||
    tiles.some((t) => !Number.isInteger(t.value) || t.value < 1 || t.value > 13)
  )
    throw new Error('INVALID_MELD');
  const high = highOne(tiles, !!options.wrapAround);
  const values = tiles.map((t, index) => (high && index === tiles.length - 1 ? 14 : t.value));
  const run =
    tiles.every((t) => t.color === tiles[0].color) &&
    values.every((v, index) => index === 0 || v === values[index - 1] + 1);
  const group =
    tiles.length <= 4 &&
    tiles.every((t) => t.value === tiles[0].value) &&
    new Set(tiles.map((t) => t.color)).size === tiles.length;
  if (!run && !group) throw new Error('INVALID_MELD');
  return run && high
    ? values.reduce((sum, v) => sum + (v === 14 ? 11 : v), 0)
    : tiles.reduce((sum, t) => sum + t.value, 0);
}
export function validate101Opening(
  hand: OkeyTile[],
  melds: OkeyTile[][],
  rules: OkeyRuleProfile,
  currentHighestOpening = 100,
): number {
  const used = melds.flat();
  if (
    !used.length ||
    new Set(used.map((t) => t.id)).size !== used.length ||
    used.some(
      (tile) =>
        !hand.some(
          (h) =>
            h.id === tile.id && (h.joker || (h.color === tile.color && h.value === tile.value)),
        ),
    )
  )
    throw new Error('TILES_NOT_IN_HAND');
  const { wrapAround } = okey101Options(rules);
  const total = melds.reduce((sum, meld) => sum + validate101MeldWith(meld, { wrapAround }), 0);
  if (total < rules.openingMinimum || (rules.folding && total <= currentHighestOpening))
    throw new Error('OPENING_TOO_LOW');
  return total;
}
/** Pairs a first pair opening needs. Folding (katlamalı) tables raise it past the highest pair opening. */
export function required101Pairs(rules: OkeyRuleProfile, currentHighestPairs = 0): number {
  return rules.folding && okey101Options(rules).foldingPairs
    ? Math.max(rules.pairsMinimum, currentHighestPairs + 1)
    : rules.pairsMinimum;
}
export function validate101Pairs(
  hand: OkeyTile[],
  pairs: OkeyTile[][],
  rules: OkeyRuleProfile,
  currentHighestPairs = 0,
): void {
  if (
    pairs.length < required101Pairs(rules, currentHighestPairs) ||
    pairs.some(
      (pair) =>
        pair.length !== 2 || pair[0].color !== pair[1].color || pair[0].value !== pair[1].value,
    )
  )
    throw new Error('INVALID_PAIRS_OPENING');
  const used = pairs.flat();
  if (
    new Set(used.map((t) => t.id)).size !== used.length ||
    used.some(
      (t) =>
        !hand.some(
          (h) => h.id === t.id && (h.joker || (h.color === t.color && h.value === t.value)),
        ),
    )
  )
    throw new Error('TILES_NOT_IN_HAND');
}
/**
 * Penalty of a hand that did not finish. `multiplier` (okey/çift/elden finish, at most 4) replaces the
 * legacy `finishedWithJoker` doubling when given.
 */
export function remaining101Penalty(
  hand: OkeyTile[],
  opened: boolean,
  finishedWithJoker: boolean,
  multiplier?: number,
): number {
  const penalty = opened
    ? hand.reduce((sum, tile) => sum + (tile.joker ? 101 : tile.value), 0)
    : 202;
  return penalty * (multiplier ?? (finishedWithJoker ? 2 : 1));
}
