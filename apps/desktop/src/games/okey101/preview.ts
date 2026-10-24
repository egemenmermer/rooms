import type { OkeyTile } from '../../../../../packages/games/src/okey101';
import type { Tile } from '../shared/model';

export function previewOkeyGroup(tiles: Tile[], pairs: boolean): OkeyTile[] {
  const result = tiles.map((tile) => ({ ...tile })) as OkeyTile[];
  if (!result.some((tile) => tile.joker)) return result;
  const fixed = result.map((tile, index) => ({ tile, index })).filter((item) => !item.tile.joker);
  if (!fixed.length) {
    if (pairs && result.length === 2) return result;
    throw new Error('MELD_NEEDS_NATURAL_TILE');
  }
  if (pairs) {
    if (result.length !== 2) throw new Error('PAIR_REQUIRED');
    return result.map((tile) =>
      tile.joker ? { ...tile, color: fixed[0].tile.color, value: fixed[0].tile.value } : tile,
    );
  }
  if (
    fixed.every(
      (item) =>
        item.tile.color === fixed[0].tile.color &&
        item.tile.value - item.index === fixed[0].tile.value - fixed[0].index,
    )
  )
    return result.map((tile, index) =>
      tile.joker
        ? {
            ...tile,
            color: fixed[0].tile.color,
            value: fixed[0].tile.value - fixed[0].index + index,
          }
        : tile,
    );
  if (
    fixed.every((item) => item.tile.value === fixed[0].tile.value) &&
    new Set(fixed.map((item) => item.tile.color)).size === fixed.length
  ) {
    const unused = (['red', 'yellow', 'blue', 'black'] as OkeyTile['color'][]).filter(
      (color) => !fixed.some((item) => item.tile.color === color),
    );
    return result.map((tile) =>
      tile.joker ? { ...tile, color: unused.shift()!, value: fixed[0].tile.value } : tile,
    );
  }
  throw new Error('INVALID_WILDCARD_MELD');
}
