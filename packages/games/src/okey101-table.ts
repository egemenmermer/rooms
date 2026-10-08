import { randomInt } from 'node:crypto';
import { okeyRuleProfile, remaining101Penalty, validate101Meld, validate101Opening, validate101Pairs, type OkeyRuleProfile, type OkeyTile, type TileColor } from './okey101';
export interface OkeyRound { rules: OkeyRuleProfile; indicator: OkeyTile; stock: OkeyTile[]; hands: OkeyTile[][]; discards: OkeyTile[][]; melds: { owner: number; tiles: OkeyTile[]; pairs: boolean }[]; opened: ('runs' | 'pairs' | null)[]; turn: number | null; stage: 'draw' | 'discard' | 'ended'; highestOpening: number; pickedDiscard: string | null; scores: number[]; winner: number | null }
function makeTiles(): OkeyTile[] {
  const tiles: OkeyTile[] = [];
  for (let copy = 0; copy < 2; copy++) for (const color of ['red', 'yellow', 'blue', 'black'] as TileColor[]) for (let value = 1; value <= 13; value++) tiles.push({ id: `${color}-${value}-${copy}`, color, value });
  for (let i = tiles.length - 1; i > 0; i--) { const j = randomInt(i + 1); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; } return tiles;
}
export function startOkey101(folding: boolean, teams: boolean, first: number): OkeyRound {
  const stock = makeTiles(), indicator = stock.pop()!, jokerValue = indicator.value % 13 + 1;
  stock.forEach(tile => { if (tile.color === indicator.color && tile.value === jokerValue) tile.joker = true; });
  stock.push({ id: 'false-joker-0', color: indicator.color, value: jokerValue }, { id: 'false-joker-1', color: indicator.color, value: jokerValue });
  for (let i = stock.length - 1; i > 0; i--) { const j = randomInt(i + 1); [stock[i], stock[j]] = [stock[j], stock[i]]; }
  const hands = Array.from({ length: 4 }, () => [] as OkeyTile[]); for (let n = 0; n < 21; n++) for (let i = 0; i < 4; i++) hands[(first + i) % 4].push(stock.shift()!); hands[first].push(stock.shift()!);
  return { rules: okeyRuleProfile(folding, teams), indicator, stock, hands, discards: [[], [], [], []], melds: [], opened: [null, null, null, null], turn: first, stage: 'discard', highestOpening: 100, pickedDiscard: null, scores: [], winner: null };
}
/** Resolve wildcard positions without exposing any other hand. Caller specifies an ordered run/group. */
function assignedMeld(tiles: OkeyTile[], pairs = false): OkeyTile[] {
  if (!tiles.some(t => t.joker)) return tiles;
  const fixed = tiles.map((tile, index) => ({ tile, index })).filter(x => !x.tile.joker);
  if (!fixed.length) { if (pairs && tiles.length === 2) return tiles; throw new Error('MELD_NEEDS_NATURAL_TILE'); }
  if (pairs) { if (tiles.length !== 2) throw new Error('PAIR_REQUIRED'); return tiles.map(t => t.joker ? { ...t, color: fixed[0].tile.color, value: fixed[0].tile.value } : t); }
  const run = fixed.every(x => x.tile.color === fixed[0].tile.color && x.tile.value - x.index === fixed[0].tile.value - fixed[0].index);
  if (run) { const start = fixed[0].tile.value - fixed[0].index; return tiles.map((t, i) => t.joker ? { ...t, color: fixed[0].tile.color, value: start + i } : t); }
  if (fixed.every(x => x.tile.value === fixed[0].tile.value) && new Set(fixed.map(x => x.tile.color)).size === fixed.length) { const unused = (['red', 'yellow', 'blue', 'black'] as TileColor[]).filter(c => !fixed.some(x => x.tile.color === c)); return tiles.map(t => t.joker ? { ...t, color: unused.shift()!, value: fixed[0].tile.value } : t); }
  throw new Error('INVALID_WILDCARD_MELD');
}
function finish(state: OkeyRound, winner: number | null, jokerFinish = false) {
  state.winner = winner; state.stage = 'ended'; state.turn = null;
  state.scores = state.hands.map((hand, seat) => seat === winner ? -101 * (jokerFinish ? 2 : 1) : remaining101Penalty(hand, !!state.opened[seat], jokerFinish));
  if (state.rules.teams) { const score = [state.scores[0] + state.scores[2], state.scores[1] + state.scores[3]]; state.scores = [score[0], score[1], score[0], score[1]]; }
}
export function okey101Action(value: OkeyRound, seat: number, action: { action: string; cardId?: string; melds?: string[][]; amount?: number; tileIds?: string[] }): OkeyRound {
  if (value.stage === 'ended' || value.turn !== seat) throw new Error('NOT_YOUR_TURN');
  const state = structuredClone(value), hand = state.hands[seat];
  if (state.stage === 'discard' && state.pickedDiscard && action.action === 'draw') {
    const picked = hand.find(tile => tile.id === state.pickedDiscard);
    if (!picked) throw new Error('DISCARD_ALREADY_USED');
    state.hands[seat] = hand.filter(tile => tile.id !== picked.id); state.discards[(seat + 3) % 4].push(picked); state.pickedDiscard = null;
    const replacement = state.stock.shift(); if (!replacement) { finish(state, null); return state; } state.hands[seat].push(replacement); return state;
  }
  if (state.stage === 'draw') {
    if (action.action !== 'draw') throw new Error('DRAW_REQUIRED');
    if (action.cardId === 'discard') { const discard = state.discards[(seat + 3) % 4].pop(); if (!discard) throw new Error('DISCARD_EMPTY'); hand.push(discard); state.pickedDiscard = discard.id; }
    else { const tile = state.stock.shift(); if (!tile) { finish(state, null); return state; } hand.push(tile); }
    state.stage = 'discard'; return state;
  }
  if (action.action === 'discard') {
    const tile = hand.find(t => t.id === action.cardId); if (!tile) throw new Error('TILE_NOT_IN_HAND');
    if (state.pickedDiscard && hand.some(t => t.id === state.pickedDiscard)) throw new Error('PICKED_DISCARD_MUST_BE_USED');
    state.hands[seat] = hand.filter(t => t.id !== tile.id); state.discards[seat].push(tile); state.pickedDiscard = null;
    if (!state.hands[seat].length) finish(state, seat, !!tile.joker || state.opened[seat] === 'pairs'); else { state.turn = (seat + 1) % 4; state.stage = 'draw'; } return state;
  }
  if (action.action === 'open' || action.action === 'open-pairs') {
    const pairs = action.action === 'open-pairs';
    if (state.opened[seat] && state.opened[seat] !== (pairs ? 'pairs' : 'runs')) throw new Error('OPENING_MODE_LOCKED');
    const melds = (action.melds ?? []).map(ids => assignedMeld(ids.map(id => { const tile = hand.find(t => t.id === id); if (!tile) throw new Error('TILE_NOT_IN_HAND'); return tile; }), pairs));
    if (melds.flat().length >= hand.length) throw new Error('KEEP_ONE_DISCARD_TILE');
    if (!state.opened[seat]) { if (pairs) validate101Pairs(hand, melds, state.rules); else state.highestOpening = Math.max(state.highestOpening, validate101Opening(hand, melds, state.rules, state.highestOpening)); }
    else { const used = melds.flat(); if (!used.length || new Set(used.map(t => t.id)).size !== used.length) throw new Error('INVALID_MELD'); if (pairs) { if (melds.some(m => m.length !== 2 || m[0].color !== m[1].color || m[0].value !== m[1].value)) throw new Error('PAIR_REQUIRED'); } else melds.forEach(validate101Meld); }
    state.opened[seat] = pairs ? 'pairs' : 'runs'; state.melds.push(...melds.map(tiles => ({ owner: seat, tiles, pairs })));
    const ids = new Set(melds.flat().map(t => t.id)); state.hands[seat] = hand.filter(t => !ids.has(t.id)); return state;
  }
  if (action.action === 'process') {
    if (!state.opened[seat] || !Number.isInteger(action.amount) || !state.melds[action.amount!]) throw new Error('OPEN_AND_SELECT_MELD_FIRST');
    const meld = state.melds[action.amount!];
    if (meld.pairs) throw new Error('PAIR_CANNOT_EXTEND');
    const ids = action.tileIds ?? []; if (!ids.length || new Set(ids).size !== ids.length) throw new Error('TILES_REQUIRED');
    const added = ids.map(id => { const tile = hand.find(t => t.id === id); if (!tile) throw new Error('TILE_NOT_IN_HAND'); return tile; });
    if (action.cardId) {
      const wildcard = meld.tiles.find(tile => tile.id === action.cardId && tile.joker);
      if (!wildcard || added.length !== 1 || added[0].joker || added[0].color !== wildcard.color || added[0].value !== wildcard.value) throw new Error('EXACT_JOKER_REPLACEMENT_REQUIRED');
      meld.tiles = meld.tiles.map(tile => tile.id === wildcard.id ? added[0] : tile);
      state.hands[seat] = hand.filter(tile => tile.id !== added[0].id); state.hands[seat].push({ ...wildcard, color: state.indicator.color, value: state.indicator.value % 13 + 1 }); return state;
    }
    if (ids.length >= hand.length) throw new Error('KEEP_ONE_DISCARD_TILE');
    const candidates = [[...added, ...meld.tiles], [...meld.tiles, ...added]];
    let valid: OkeyTile[] | null = null;
    for (const candidate of candidates) try { const assigned = assignedMeld(candidate); validate101Meld(assigned); valid = assigned; break; } catch { /* Try the other end. */ }
    if (!valid) throw new Error('INVALID_MELD_EXTENSION'); meld.tiles = valid; state.hands[seat] = hand.filter(t => !ids.includes(t.id)); return state;
  }
  throw new Error('INVALID_101_ACTION');
}
export function okey101View(state: OkeyRound, seat: number | null) {
  return { rules: state.rules, indicator: state.indicator, remainingStock: state.stock.length, turn: state.turn, stage: state.stage, highestOpening: state.highestOpening, melds: state.melds, opened: state.opened, discards: state.discards.map(cards => cards.slice(-1)), scores: state.scores, winner: state.winner,
    hands: state.hands.map((tiles, index) => ({ seat: index, tiles: index === seat ? tiles : [], count: tiles.length })) };
}
