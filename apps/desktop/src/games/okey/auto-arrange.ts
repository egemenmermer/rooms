/**
 * "Seri diz" and "Çift diz" for the classic Okey rack. Pure functions over the viewer's own tiles; the
 * server still decides whether a finish is valid.
 *
 * The real okeys (`joker`) are wild. A sahte okey (`fake`) is an ordinary tile with the okey's own face.
 */
import {
  okeyClassicArrangement,
  type ClassicTile,
} from '../../../../../packages/games/src/okey-classic';
import { layoutFromBlocks, type RackLayout } from './rack-layout';

type Face = { id: string; color: string; value: number; wild: boolean };
export type OkeyFace = { color: string; value: number };

const COLORS = ['red', 'yellow', 'blue', 'black'];
const colorRank = (color: string) => {
  const index = COLORS.indexOf(color);
  return index < 0 ? COLORS.length : index;
};
const byFace = (a: Face, b: Face) =>
  colorRank(a.color) - colorRank(b.color) || a.value - b.value || a.id.localeCompare(b.id);

function faces(tiles: readonly ClassicTile[], okey: OkeyFace): Face[] {
  return tiles.map((tile) => ({
    id: tile.id,
    color: tile.fake ? okey.color : tile.color,
    value: tile.fake ? okey.value : tile.value,
    wild: !!tile.joker,
  }));
}

/** Search budget: a 15-tile rack needs far fewer nodes; this keeps a pathological rack instant. */
const NODE_LIMIT = 20000;

/** Sets (runs and groups) covering as many tiles as possible, okeys filling gaps. */
function bestSets(all: Face[]): { sets: Face[][]; rest: Face[] } {
  const naturals = all.filter((face) => !face.wild).sort(byFace),
    wilds = all.filter((face) => face.wild);
  let best: Face[][] = [],
    bestCovered = 0,
    nodes = 0;
  const search = (remaining: Face[], free: Face[], sets: Face[][], covered: number) => {
    if (++nodes > NODE_LIMIT) return;
    if (covered + remaining.length + free.length <= bestCovered) return;
    if (!remaining.length) {
      if (covered > bestCovered) {
        bestCovered = covered;
        best = sets.map((set) => [...set]);
      }
      return;
    }
    const [tile, ...others] = remaining;
    // Runs that start with this tile (the lowest of its color still in play).
    const run: Face[] = [tile];
    let pool = others,
      spare = free,
      value = tile.value;
    while (run.length < 13) {
      if (value === 1 && run.length > 1) break; // 12-13-1 ends the run
      const nextValue = value === 13 ? 1 : value + 1;
      const natural = pool.find((face) => face.color === tile.color && face.value === nextValue);
      if (natural) {
        run.push(natural);
        pool = pool.filter((face) => face !== natural);
      } else if (spare.length) {
        run.push(spare[0]);
        spare = spare.slice(1);
      } else break;
      value = nextValue;
      if (run.length >= 3) search(pool, spare, [...sets, [...run]], covered + run.length);
    }
    // Groups with this number: one tile per other color, okeys making up 3 or 4.
    const partners: Face[] = [];
    for (const face of others)
      if (
        face.value === tile.value &&
        face.color !== tile.color &&
        !partners.some((partner) => partner.color === face.color)
      )
        partners.push(face);
    for (let mask = (1 << partners.length) - 1; mask >= 0; mask--) {
      const chosen = partners.filter((_, index) => mask & (1 << index));
      for (let size = 4; size >= 3; size--) {
        const needed = size - 1 - chosen.length;
        if (needed < 0 || needed > free.length) continue;
        const group = [tile, ...chosen, ...free.slice(0, needed)];
        search(
          others.filter((face) => !chosen.includes(face)),
          free.slice(needed),
          [...sets, group],
          covered + group.length,
        );
      }
    }
    search(others, free, sets, covered);
  };
  search(naturals, wilds, [], 0);
  const used = new Set(best.flat().map((face) => face.id));
  const rest = [...naturals.filter((face) => !used.has(face.id))];
  // Okeys the search did not need extend a set that can take them, else stay with the rest.
  for (const wild of wilds.filter((face) => !used.has(face.id))) {
    const target = best.find((set) =>
      set.every((face) => face.wild || face.value === set.find((f) => !f.wild)?.value)
        ? set.length < 4
        : set.length < 13,
    );
    if (target) target.push(wild);
    else rest.push(wild);
  }
  return { sets: best, rest };
}

const ids = (list: readonly { id: string }[]) => list.map((item) => item.id);

/**
 * Seri diz: a finished rack in its finishing order when the tiles allow it, otherwise the largest set of
 * runs and groups, each as its own block, with the remaining tiles on the right.
 */
export function arrangeRuns(tiles: readonly ClassicTile[], okey: OkeyFace): RackLayout {
  const finish = finishingArrangement(tiles);
  if (finish && !finish.pairs) return layoutFromBlocks(finish.melds.map(ids), finish.rest);
  const { sets, rest } = bestSets(faces(tiles, okey));
  return layoutFromBlocks(
    sets.map(ids),
    ids([...rest].sort((a, b) => Number(a.wild) - Number(b.wild) || byFace(a, b))),
  );
}

/** Çift diz: same color and number side by side, an okey as the partner of a single tile. */
export function arrangePairs(tiles: readonly ClassicTile[], okey: OkeyFace): RackLayout {
  const all = faces(tiles, okey),
    naturals = all.filter((face) => !face.wild).sort(byFace),
    wilds = all.filter((face) => face.wild);
  const pairs: Face[][] = [],
    singles: Face[] = [];
  for (let index = 0; index < naturals.length; index++) {
    const face = naturals[index],
      next = naturals[index + 1];
    if (next && next.color === face.color && next.value === face.value) {
      pairs.push([face, next]);
      index++;
    } else singles.push(face);
  }
  // Okeys pair with the highest singles (the costliest tiles to keep alone), then with each other.
  const spare = [...wilds];
  singles.sort((a, b) => b.value - a.value || byFace(a, b));
  while (spare.length && singles.length) pairs.push([singles.shift()!, spare.shift()!]);
  while (spare.length >= 2) pairs.push([spare.shift()!, spare.shift()!]);
  return layoutFromBlocks(pairs.map(ids), ids([...singles.sort(byFace), ...spare]));
}

/** The 14 finishing tiles split into sets plus the tile to throw, when the rack can finish now. */
export function finishingArrangement(
  tiles: readonly ClassicTile[],
): { melds: ClassicTile[][]; pairs: boolean; rest: string[] } | null {
  if (tiles.length === 14) {
    const arrangement = okeyClassicArrangement([...tiles]);
    return arrangement ? { ...arrangement, rest: [] } : null;
  }
  if (tiles.length !== 15) return null;
  const tile = finishingTile(tiles);
  if (!tile) return null;
  const arrangement = okeyClassicArrangement(tiles.filter((other) => other.id !== tile.id));
  return arrangement ? { ...arrangement, rest: [tile.id] } : null;
}

/** A tile whose discard finishes this 15-tile rack (an okey first: it doubles the score), or null. */
export function finishingTile(tiles: readonly ClassicTile[]): ClassicTile | null {
  if (tiles.length !== 15) return null;
  const order = [...tiles.filter((tile) => tile.joker), ...tiles.filter((tile) => !tile.joker)];
  for (const tile of order)
    if (okeyClassicArrangement(tiles.filter((other) => other.id !== tile.id))) return tile;
  return null;
}

/** Whether throwing `tileId` from this rack finishes the round. */
export function canFinishWith(tiles: readonly ClassicTile[], tileId: string): boolean {
  if (tiles.length !== 15 || !tiles.some((tile) => tile.id === tileId)) return false;
  return !!okeyClassicArrangement(tiles.filter((tile) => tile.id !== tileId));
}
