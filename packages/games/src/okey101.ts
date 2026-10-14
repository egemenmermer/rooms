export type TileColor = 'red' | 'yellow' | 'blue' | 'black';
export interface OkeyTile {
  id: string;
  color: TileColor;
  value: number;
  joker?: boolean;
}
export interface OkeyRuleProfile {
  id: 'rooms-101-v1';
  folding: boolean;
  teams: boolean;
  openingMinimum: 101;
  pairsMinimum: 5;
}
export const okeyRuleProfile = (folding: boolean, teams: boolean): OkeyRuleProfile => ({
  id: 'rooms-101-v1',
  folding,
  teams,
  openingMinimum: 101,
  pairsMinimum: 5,
});
/** Validate explicit joker substitutions before counting opening points. Runs do not wrap 13→1. */
export function validate101Meld(tiles: OkeyTile[]): number {
  if (
    tiles.length < 3 ||
    tiles.length > 13 ||
    new Set(tiles.map((t) => t.id)).size !== tiles.length ||
    tiles.some((t) => !Number.isInteger(t.value) || t.value < 1 || t.value > 13)
  )
    throw new Error('INVALID_MELD');
  const run =
    tiles.every((t) => t.color === tiles[0].color) &&
    tiles.every((t, index) => index === 0 || t.value === tiles[index - 1].value + 1);
  const group =
    tiles.length <= 4 &&
    tiles.every((t) => t.value === tiles[0].value) &&
    new Set(tiles.map((t) => t.color)).size === tiles.length;
  if (!run && !group) throw new Error('INVALID_MELD');
  return tiles.reduce((sum, t) => sum + t.value, 0);
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
  const total = melds.reduce((sum, meld) => sum + validate101Meld(meld), 0);
  if (total < rules.openingMinimum || (rules.folding && total <= currentHighestOpening))
    throw new Error('OPENING_TOO_LOW');
  return total;
}
export function validate101Pairs(
  hand: OkeyTile[],
  pairs: OkeyTile[][],
  rules: OkeyRuleProfile,
): void {
  if (
    pairs.length < rules.pairsMinimum ||
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
export function remaining101Penalty(
  hand: OkeyTile[],
  opened: boolean,
  finishedWithJoker: boolean,
): number {
  const penalty = opened
    ? hand.reduce((sum, tile) => sum + (tile.joker ? 101 : tile.value), 0)
    : 202;
  return penalty * (finishedWithJoker ? 2 : 1);
}
