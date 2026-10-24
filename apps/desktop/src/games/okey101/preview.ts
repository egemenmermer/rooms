/**
 * Client preview of 101 melds. Mirrors the server's okey readings in `packages/games/src/okey101-table.ts`
 * (that module imports node:crypto, so the renderer cannot import it); the server still decides.
 */
import {
  validate101MeldWith,
  type OkeyTile,
  type TileColor,
} from '../../../../../packages/games/src/okey101';
import type { Tile } from '../shared/model';

export type MeldKind = 'run' | 'group';
export type PreviewOptions = { kind?: MeldKind | null; wrapAround?: boolean };

const colors: TileColor[] = ['red', 'yellow', 'blue', 'black'];

/** Run reading of an ordered meld: okeys take the value of their position (a 14 is a high 1). */
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

/** Group reading: okeys take the shared value and the colours no natural tile uses. */
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

function validates(tiles: OkeyTile[], wrapAround: boolean) {
  try {
    validate101MeldWith(tiles, { wrapAround });
    return true;
  } catch {
    return false;
  }
}

function readings(tiles: OkeyTile[], wrapAround: boolean) {
  return [
    { kind: 'run' as const, tiles: runReading(tiles, wrapAround) },
    { kind: 'group' as const, tiles: groupReading(tiles) },
  ].filter((r): r is { kind: MeldKind; tiles: OkeyTile[] } => !!r.tiles);
}

/** Valid readings of a new run/group meld with okeys, in the server's order (run first). */
export function meldReadings(tiles: Tile[], wrapAround = false) {
  const list = tiles as OkeyTile[];
  if (!list.some((t) => t.joker)) return [];
  return readings(list, wrapAround).filter((r) => validates(r.tiles, wrapAround));
}

/** True when the okeys allow both a run and a group, so the player should choose (`meldKinds`). */
export const isAmbiguousMeld = (tiles: Tile[], wrapAround = false) =>
  meldReadings(tiles, wrapAround).length > 1;

/**
 * The tiles of a draft meld as the server will read them: okeys get the value they stand for. With both
 * readings legal the `kind` hint picks, otherwise the first valid one (the run, as on the server). A
 * reading that cannot validate is never chosen over one that can.
 */
export function previewOkeyGroup(
  tiles: Tile[],
  pairs: boolean,
  options: PreviewOptions = {},
): OkeyTile[] {
  const result = tiles.map((tile) => ({ ...tile })) as OkeyTile[];
  if (!result.some((tile) => tile.joker)) return result;
  const fixed = result.filter((tile) => !tile.joker);
  if (!fixed.length) {
    if (pairs && result.length === 2) return result;
    throw new Error('MELD_NEEDS_NATURAL_TILE');
  }
  if (pairs) {
    if (result.length !== 2) throw new Error('PAIR_REQUIRED');
    return result.map((tile) =>
      tile.joker ? { ...tile, color: fixed[0].color, value: fixed[0].value } : tile,
    );
  }
  const wrapAround = !!options.wrapAround,
    all = readings(result, wrapAround),
    valid = all.filter((r) => validates(r.tiles, wrapAround));
  const chosen = valid.find((r) => r.kind === options.kind) ?? valid[0] ?? all[0];
  if (!chosen) throw new Error('INVALID_WILDCARD_MELD');
  return chosen.tiles;
}

/** Points of a resolved meld (a high 1 after 13 counts 11); throws when the meld is not valid. */
export const meldPoints = (tiles: OkeyTile[], wrapAround = false) =>
  validate101MeldWith(tiles, { wrapAround });
