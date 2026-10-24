import { describe, expect, it } from 'vitest';
import type { ClassicTile } from '../packages/games/src/okey-classic';
import {
  arrangePairs,
  arrangeRuns,
  canFinishWith,
  finishingTile,
} from '../apps/desktop/src/games/okey/auto-arrange';
import {
  layoutFromBlocks,
  moveTile,
  RACK_CELLS,
  reconcileLayout,
  type RackLayout,
} from '../apps/desktop/src/games/okey/rack-layout';

const tile = (color: ClassicTile['color'], value: number, copy = 0): ClassicTile => ({
  id: `${color}-${value}-${copy}`,
  color,
  value,
});
const okey = { color: 'red', value: 6 };
const okeyTile: ClassicTile = { ...tile('red', 6, 1), joker: true };
const fake: ClassicTile = { id: 'false-joker-0', color: 'red', value: 6, fake: true };

/** Consecutive non-empty cells (a row break also ends a block). */
function blocks(layout: RackLayout): string[][] {
  const result: string[][] = [];
  let current: string[] = [];
  layout.forEach((id, cell) => {
    if (cell % 15 === 0 && current.length) {
      result.push(current);
      current = [];
    }
    if (id) current.push(id);
    else if (current.length) {
      result.push(current);
      current = [];
    }
  });
  if (current.length) result.push(current);
  return result;
}

const drawHand = [
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
  fake,
  tile('blue', 4),
  tile('black', 11),
  tile('yellow', 12),
];
const finishingHand = [
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

describe('Seri diz', () => {
  it('lays a finishing rack as its sets with the tile to throw last', () => {
    const layout = arrangeRuns(finishingHand, okey);
    expect(layout).toHaveLength(RACK_CELLS);
    const found = blocks(layout);
    expect(found.at(-1)).toEqual(['yellow-13-0']);
    expect(found.slice(0, -1).flat()).toHaveLength(14);
    expect(new Set(layout.filter(Boolean)).size).toBe(15);
  });

  it('puts runs and groups in their own blocks and the leftovers on the right', () => {
    const layout = arrangeRuns(drawHand, okey);
    const found = blocks(layout);
    const red = found.find((block) => block.includes('red-1-0'))!;
    expect(red.slice(0, 3)).toEqual(['red-1-0', 'red-2-0', 'red-3-0']);
    expect(found).toContainEqual(['black-9-0', 'black-10-0', 'black-11-0']);
    const fours = found.find((block) => block.includes('yellow-4-0'))!;
    expect(fours).toEqual(expect.arrayContaining(['yellow-4-0', 'blue-4-0', 'black-4-0']));
    // The okey joins a set (10 tiles in sets); every tile stays on the rack exactly once.
    expect([...red, ...fours]).toContain('red-6-1');
    expect(layout.filter(Boolean).sort()).toEqual(drawHand.map((t) => t.id).sort());
    const leftovers = ['blue-7-0', 'blue-7-1', 'yellow-12-0', 'false-joker-0'];
    const lastSet = Math.max(
      ...layout.map((id, cell) => (id && !leftovers.includes(id) ? cell : -1)),
    );
    expect(leftovers.every((id) => layout.indexOf(id) > lastSet)).toBe(true);
  });
});

describe('Çift diz', () => {
  it('puts pairs side by side and pairs the okey with the highest single', () => {
    const found = blocks(arrangePairs(drawHand, okey));
    expect(found[0]).toEqual(['blue-7-0', 'blue-7-1']);
    expect(found).toContainEqual(['yellow-12-0', 'red-6-1']);
    expect(found.slice(0, 2).every((block) => block.length === 2)).toBe(true);
    expect(found.flat()).toHaveLength(14);
  });

  it('pairs two sahte okeys with each other', () => {
    const fake2: ClassicTile = { ...fake, id: 'false-joker-1' };
    const found = blocks(arrangePairs([fake, tile('blue', 2), fake2], okey));
    expect(found[0]).toEqual(['false-joker-0', 'false-joker-1']);
  });
});

describe('finish helpers', () => {
  it('finds the tile that finishes the rack', () => {
    expect(finishingTile(finishingHand)?.id).toBe('yellow-13-0');
    expect(canFinishWith(finishingHand, 'yellow-13-0')).toBe(true);
    expect(canFinishWith(finishingHand, 'red-1-0')).toBe(false);
    expect(finishingTile(drawHand)).toBeNull();
  });
});

describe('rack layout', () => {
  const row = (ids: (string | null)[]) => [...ids, ...Array(RACK_CELLS - ids.length).fill(null)];

  it('keeps positions, drops tiles that left and puts new ones in the first empty cell', () => {
    const layout = row([null, 'a', null, 'b', 'gone']);
    expect(reconcileLayout(layout, ['a', 'b', 'c']).slice(0, 5)).toEqual(['c', 'a', null, 'b', null]);
  });

  it('moves a tile to an empty cell', () => {
    const next = moveTile(row(['a', 'b']), 'a', 20);
    expect(next[0]).toBeNull();
    expect(next[20]).toBe('a');
  });

  it('slides neighbours toward the nearest gap when dropped on a tile', () => {
    const next = moveTile(row(['a', 'b', 'c', null, 'd']), 'd', 1);
    expect(next.slice(0, 5)).toEqual(['a', 'd', 'b', 'c', null]);
  });

  it('swaps when the row has no gap', () => {
    const full = Array.from({ length: 15 }, (_, i) => `t${i}`);
    const next = moveTile(row([...full, 'x']), 'x', 3);
    expect(next[3]).toBe('x');
    expect(next[15]).toBe('t3');
  });

  it('never splits a block across the two rows', () => {
    const layout = layoutFromBlocks(
      [
        ['a1', 'a2', 'a3', 'a4', 'a5'],
        ['b1', 'b2', 'b3', 'b4', 'b5'],
        ['c1', 'c2', 'c3', 'c4'],
      ],
      ['r'],
    );
    expect(layout.slice(12, 15)).toEqual([null, null, null]);
    expect(layout.slice(15, 19)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(layout[20]).toBe('r');
  });
});
