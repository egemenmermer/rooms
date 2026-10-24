import { describe, expect, it } from 'vitest';
import { arrangePairs, arrangeRuns, rackBlocks } from '../apps/desktop/src/games/okey101/arrange';
import {
  isAmbiguousMeld,
  meldPoints,
  previewOkeyGroup,
} from '../apps/desktop/src/games/okey101/preview';
import {
  moveTile,
  RACK_COLUMNS,
  reconcileLayout,
} from '../apps/desktop/src/games/okey101/rack-layout';
import type { Tile } from '../apps/desktop/src/games/shared/model';

const tile = (color: string, value: number, copy = 0): Tile => ({
  id: `${color}-${value}-${copy}`,
  color,
  value,
});
const okey = (copy: number): Tile => ({ ...tile('yellow', 8, copy), joker: true });
const cells = (layout: (string | null)[], count: number) => layout.slice(0, count);

describe('101 client preview mirrors the server readings', () => {
  it('reads [12, okey, okey] as a group without 12-13-1', () => {
    const meld = [tile('blue', 12), okey(0), okey(1)];
    expect(isAmbiguousMeld(meld)).toBe(false);
    const read = previewOkeyGroup(meld, false);
    expect(read.map((t) => t.value)).toEqual([12, 12, 12]);
    expect(new Set(read.map((t) => t.color)).size).toBe(3);
    expect(meldPoints(read)).toBe(36);
  });

  it('with 12-13-1 on, [12, okey, okey] is ambiguous: run by default (high 1 = 11), group on request', () => {
    const meld = [tile('blue', 12), okey(0), okey(1)];
    expect(isAmbiguousMeld(meld, true)).toBe(true);
    const run = previewOkeyGroup(meld, false, { wrapAround: true });
    expect(run.map((t) => t.value)).toEqual([12, 13, 1]);
    expect(meldPoints(run, true)).toBe(36);
    const group = previewOkeyGroup(meld, false, { wrapAround: true, kind: 'group' });
    expect(group.map((t) => t.value)).toEqual([12, 12, 12]);
  });

  it('[7, okey, okey] is ambiguous; the kind hint picks the reading', () => {
    const meld = [tile('red', 7), okey(0), okey(1)];
    expect(isAmbiguousMeld(meld)).toBe(true);
    expect(previewOkeyGroup(meld, false).map((t) => t.value)).toEqual([7, 8, 9]);
    expect(previewOkeyGroup(meld, false, { kind: 'group' }).map((t) => t.value)).toEqual([7, 7, 7]);
    // A hint for a reading that cannot validate is ignored.
    const run = [tile('red', 4), tile('red', 5), okey(0)];
    expect(previewOkeyGroup(run, false, { kind: 'group' }).map((t) => t.value)).toEqual([4, 5, 6]);
  });

  it('never wraps 13-1-2 and needs a natural tile', () => {
    expect(() =>
      meldPoints(previewOkeyGroup([tile('red', 13), okey(0), tile('red', 2)], false)),
    ).toThrow();
    expect(() => previewOkeyGroup([okey(0), okey(1), okey(1)], false)).toThrow(
      'MELD_NEEDS_NATURAL_TILE',
    );
  });
});

describe('101 Seri diz / Çift diz', () => {
  it('Seri diz: each set its own block, leftovers on the right', () => {
    const hand = [
      tile('black', 9),
      tile('blue', 2),
      tile('red', 9),
      tile('red', 4),
      okey(0),
      tile('yellow', 9),
      tile('red', 3),
      tile('red', 5),
    ];
    const layout = arrangeRuns(hand);
    expect(cells(layout, 10)).toEqual([
      'red-3-0',
      'red-4-0',
      'red-5-0',
      null,
      'red-9-0',
      'yellow-9-0',
      'black-9-0',
      'yellow-8-0',
      null,
      'blue-2-0',
    ]);
    expect(rackBlocks(layout, RACK_COLUMNS)).toEqual([
      ['red-3-0', 'red-4-0', 'red-5-0'],
      ['red-9-0', 'yellow-9-0', 'black-9-0', 'yellow-8-0'],
      ['blue-2-0'],
    ]);
  });

  it('Seri diz does not run past 13 unless the table allows 12-13-1', () => {
    const hand = [tile('red', 12), tile('red', 13), tile('red', 1), tile('blue', 5)];
    expect(rackBlocks(arrangeRuns(hand), RACK_COLUMNS)[0]).toEqual([
      'red-1-0',
      'red-12-0',
      'red-13-0',
      'blue-5-0',
    ]);
    expect(rackBlocks(arrangeRuns(hand, true), RACK_COLUMNS)[0]).toEqual([
      'red-12-0',
      'red-13-0',
      'red-1-0',
    ]);
  });

  it('Çift diz: pairs side by side, an okey with the highest single', () => {
    const hand = [tile('blue', 2), tile('red', 5), okey(0), tile('black', 9), tile('red', 5, 1)];
    expect(cells(arrangePairs(hand), 7)).toEqual([
      'red-5-0',
      'red-5-1',
      null,
      'black-9-0',
      'yellow-8-0',
      null,
      'blue-2-0',
    ]);
  });

  it('moving a tile pushes neighbours and keeps the rest', () => {
    const layout = reconcileLayout(null, ['a', 'b', 'c']);
    expect(cells(moveTile(layout, 'c', 0), 3)).toEqual(['c', 'a', 'b']);
    expect(moveTile(layout, 'a', 20)[20]).toBe('a');
    // New tiles fall into the first empty cell, removed ones leave their cell empty.
    expect(cells(reconcileLayout(['a', null, 'c'], ['a', 'c', 'd']), 3)).toEqual(['a', 'd', 'c']);
  });
});
