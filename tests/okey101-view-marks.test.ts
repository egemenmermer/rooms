import { describe, expect, it } from 'vitest';
import { okey101Module } from '../packages/games/src/okey101-module';
import {
  markFakeTile,
  okey101View,
  startOkey101,
  type OkeyRound,
} from '../packages/games/src/okey101-table';
import type { OkeyTile } from '../packages/games/src/okey101';

const fake = (n: number): OkeyTile => ({ id: `false-joker-${n}`, color: 'black', value: 10 });
const natural = (id: string): OkeyTile => ({ id, color: 'red', value: 4 });
const wild = (id: string): OkeyTile => ({ id, color: 'black', value: 10, joker: true });

/** A round where seat 0 holds both sahte okeys and one is on the table, discarded and melded. */
function marked(): OkeyRound {
  const state = startOkey101(false, false, 0);
  state.indicator = { id: 'indicator', color: 'black', value: 9 };
  state.hands[0] = [fake(0), natural('a'), wild('w')];
  state.discards[1] = [natural('d'), fake(1)];
  state.melds = [{ owner: 2, tiles: [natural('m1'), fake(0), natural('m3')], pairs: false }];
  return state;
}

describe('101 view marks sahte okey tiles', () => {
  it('sets fake: true on the sahte okeys in hands, discards and melds, and nowhere else', () => {
    const view = okey101View(marked(), 0);
    expect(view.hands[0].tiles.map((t) => [t.id, 'fake' in t && t.fake])).toEqual([
      ['false-joker-0', true],
      ['a', false],
      ['w', false],
    ]);
    expect(view.discards[1]).toEqual([{ ...fake(1), fake: true }]);
    expect(view.melds[0].tiles.map((t) => 'fake' in t && t.fake)).toEqual([false, true, false]);
    // The indicator is never a sahte okey.
    expect(view.indicator).toEqual({ id: 'indicator', color: 'black', value: 9 });
  });

  it('marks the tiles of a state stored before the flag existed (by id) and hides other hands', () => {
    const view = okey101View(marked(), 1);
    expect(view.hands[0].tiles).toEqual([]);
    expect(JSON.stringify(view)).not.toContain('"id":"a"');
  });

  it('keeps the indicator and fake marks in the round summary', () => {
    const state = marked();
    state.stage = 'ended';
    state.turn = null;
    state.winner = 1;
    const summary = okey101Module.summary!(state) as {
      indicator: OkeyTile;
      lastDiscards: (OkeyTile & { fake?: boolean })[][];
      lastDiscard: (OkeyTile & { fake?: boolean }) | null;
      melds: { tiles: (OkeyTile & { fake?: boolean })[] }[];
    };
    expect(summary.indicator).toEqual(state.indicator);
    expect(summary.lastDiscard).toEqual({ ...fake(1), fake: true });
    expect(summary.lastDiscards[1]).toEqual([{ ...fake(1), fake: true }]);
    expect(summary.melds[0].tiles[1].fake).toBe(true);
    expect(summary.melds[0].tiles[0].fake).toBeUndefined();
  });

  it('a freshly dealt round has exactly two fake tiles in play', () => {
    const state = startOkey101(false, false, 0);
    state.hands = state.hands.map((tiles) => tiles.slice());
    const all = [...state.stock, ...state.hands.flat()];
    expect(all.filter((t) => markFakeTile(t).fake)).toHaveLength(2);
  });
});
