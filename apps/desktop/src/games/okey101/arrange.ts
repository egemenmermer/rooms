/**
 * "Seri diz" and "Çift diz" for the 101 rack. Pure functions over the viewer's own tiles; nothing is sent to
 * the server. Real okeys (`joker`) are wild; a sahte okey already carries the okey's face, so it is an
 * ordinary tile here. Runs end at 13 unless the table allows 12-13-1 (`wrapAround`).
 */
import type { Tile } from '../shared/model';
import { layoutFromBlocks, type RackLayout } from './rack-layout';

type Face = { id: string; color: string; value: number; wild: boolean };

const COLORS = ['red', 'yellow', 'blue', 'black'];
const colorRank = (color: string) => {
  const index = COLORS.indexOf(color);
  return index < 0 ? COLORS.length : index;
};
const byFace = (a: Face, b: Face) =>
  colorRank(a.color) - colorRank(b.color) || a.value - b.value || a.id.localeCompare(b.id);
const faces = (tiles: readonly Tile[]): Face[] =>
  tiles.map((tile) => ({ id: tile.id, color: tile.color, value: tile.value, wild: !!tile.joker }));
const ids = (list: readonly { id: string }[]) => list.map((item) => item.id);

/** Search budget: keeps a 22-tile rack instant even when it is full of near-runs. */
const NODE_LIMIT = 20000;

/** Runs and groups covering as many tiles (then points) as possible, okeys filling gaps. */
function bestSets(all: Face[], wrapAround: boolean): { sets: Face[][]; rest: Face[] } {
  const naturals = all.filter((face) => !face.wild).sort(byFace),
    wilds = all.filter((face) => face.wild);
  const score = (sets: Face[][]) =>
    sets.reduce((sum, set) => sum + set.length * 1000 + set.reduce((s, f) => s + f.value, 0), 0);
  let best: Face[][] = [],
    bestScore = 0,
    nodes = 0;
  // `skipped`: tiles left out so far; a skipped 1 can still end a 12-13-1 run.
  const search = (remaining: Face[], free: Face[], sets: Face[][], skipped: Face[]) => {
    if (++nodes > NODE_LIMIT) return;
    if (!remaining.length) {
      const value = score(sets);
      if (value > bestScore) {
        bestScore = value;
        best = sets.map((set) => [...set]);
      }
      return;
    }
    const [tile, ...others] = remaining;
    // Runs that start with this tile (the lowest of its colour still in play).
    const run: Face[] = [tile];
    let pool = others,
      spare = free,
      spareSkipped = skipped,
      value = tile.value;
    while (run.length < 13) {
      if (value === 13 && !wrapAround) break;
      if (value === 1 && run.length > 1) break; // 12-13-1 ends the run
      const nextValue = value === 13 ? 1 : value + 1;
      const natural = pool.find((face) => face.color === tile.color && face.value === nextValue);
      const high =
        nextValue === 1
          ? spareSkipped.find((face) => face.color === tile.color && face.value === 1)
          : undefined;
      if (natural) {
        run.push(natural);
        pool = pool.filter((face) => face !== natural);
      } else if (high) {
        run.push(high);
        spareSkipped = spareSkipped.filter((face) => face !== high);
      } else if (spare.length) {
        run.push(spare[0]);
        spare = spare.slice(1);
      } else break;
      value = nextValue;
      if (run.length >= 3) search(pool, spare, [...sets, [...run]], spareSkipped);
    }
    // Groups with this number: one tile per other colour, okeys making up 3 or 4.
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
        search(
          others.filter((face) => !chosen.includes(face)),
          free.slice(needed),
          [...sets, [tile, ...chosen, ...free.slice(0, needed)]],
          skipped,
        );
      }
    }
    search(others, free, sets, [...skipped, tile]);
  };
  search(naturals, wilds, [], []);
  const used = new Set(best.flat().map((face) => face.id));
  return {
    sets: best,
    rest: [...naturals, ...wilds].filter((face) => !used.has(face.id)),
  };
}

/**
 * Seri diz: the largest set of runs and groups, each as its own block (runs and groups in colour order),
 * the remaining tiles on the right sorted by colour and number, unused okeys last.
 */
export function arrangeRuns(tiles: readonly Tile[], wrapAround = false): RackLayout {
  const { sets, rest } = bestSets(faces(tiles), wrapAround);
  return layoutFromBlocks(
    sets.map(ids),
    ids([...rest].sort((a, b) => Number(a.wild) - Number(b.wild) || byFace(a, b))),
  );
}

/** Çift diz: same colour and number side by side, an okey as the partner of the highest single. */
export function arrangePairs(tiles: readonly Tile[]): RackLayout {
  const all = faces(tiles),
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
  const spare = [...wilds];
  singles.sort((a, b) => b.value - a.value || byFace(a, b));
  while (spare.length && singles.length) pairs.push([singles.shift()!, spare.shift()!]);
  while (spare.length >= 2) pairs.push([spare.shift()!, spare.shift()!]);
  return layoutFromBlocks(pairs.map(ids), ids([...singles.sort(byFace), ...spare]));
}

/** Contiguous tile runs on the rack (cells without a gap, never across the two shelves). */
export function rackBlocks(layout: RackLayout, columns: number): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  layout.forEach((id, cell) => {
    if (cell % columns === 0 && current.length) {
      blocks.push(current);
      current = [];
    }
    if (id) current.push(id);
    else if (current.length) {
      blocks.push(current);
      current = [];
    }
  });
  if (current.length) blocks.push(current);
  return blocks;
}
