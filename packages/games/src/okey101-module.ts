import {
  extend101Meld,
  okey101Action,
  okey101GostergeTile,
  okey101IsIslek,
  okey101View,
  startOkey101,
  type OkeyRound,
} from './okey101-table';
import {
  okey101DefaultOptions,
  okey101Options,
  type Okey101Options,
  type OkeyTile,
} from './okey101';
import { caught, parseSwitches, type GameActionInput, type GameModule } from './module';

/** Table settings: the built-in folding/teams fields plus the house rules from `game.create.options`. */
export interface Okey101TableOptions {
  folding: boolean;
  teams: boolean;
  /** Omitted: the published v2 defaults (`okey101DefaultOptions`). */
  rules?: Partial<Okey101Options>;
}
const ruleKeys = Object.keys(okey101DefaultOptions) as (keyof Okey101Options)[];
/** Çek may put a picked side discard back (v1 rounds, or a table with undo on or without the pickup penalty). */
function canUndoPickup(state: OkeyRound, seat: number) {
  const options = okey101Options(state.rules);
  return (
    state.stage === 'discard' &&
    !!state.pickedDiscard &&
    state.hands[seat].some((t) => t.id === state.pickedDiscard) &&
    (options.pickupUndo || !options.pickupPenalty)
  );
}

function botMelds(hand: OkeyTile[]): OkeyTile[][] {
  let available = hand.filter((t) => !t.joker);
  const melds: OkeyTile[][] = [];
  for (let value = 13; value >= 1; value--) {
    const group = [
      ...new Map(available.filter((t) => t.value === value).map((t) => [t.color, t])).values(),
    ];
    if (group.length >= 3) {
      melds.push(group);
      available = available.filter((t) => !group.some((g) => g.id === t.id));
    }
  }
  for (const color of ['red', 'yellow', 'blue', 'black']) {
    const ordered = [
      ...new Map(available.filter((t) => t.color === color).map((t) => [t.value, t])).values(),
    ].sort((a, b) => a.value - b.value);
    let run: OkeyTile[] = [];
    const keep = () => {
      if (run.length >= 3) melds.push(run);
      run = [];
    };
    for (const tile of ordered) {
      if (run.length && tile.value !== run[run.length - 1].value + 1) keep();
      run.push(tile);
    }
    keep();
  }
  // A discard must remain; return the lowest-value meld to the hand if necessary.
  while (melds.flat().length >= hand.length && melds.length) melds.pop();
  return melds;
}

/** 101 Okey (`rooms-101-v1`, every folding/teams profile) over the existing rules in `okey101-table.ts`. */
export const okey101Module = {
  kind: '101',
  title: '101 Okey',
  seats: [4],
  actions: ['draw', 'discard', 'open', 'open-pairs', 'process', 'gosterge'],
  // The rule function validates every field itself and reports its own error codes.
  parseCommand: (input) => input,
  start: (_seatCount, options, first) =>
    startOkey101(options.folding, options.teams, first, options.rules),
  action: (state, seat, command) => caught(() => okey101Action(state, seat, command)),
  view: (state, viewerSeat) => okey101View(state, viewerSeat),
  turn: (state) => state.turn,
  botCommand(state, index) {
    const hand = state.hands[index],
      options = okey101Options(state.rules);
    // Showing the indicator's twin on the first turn is free points (−101) and keeps the turn.
    const gosterge = okey101GostergeTile(state, index);
    if (gosterge) return { action: 'gosterge', cardId: gosterge };
    // Bots only draw from the stock, so a picked side tile is a timed-out human's; put it back when the table
    // allows that, otherwise play on (an unused side tile costs +101 at the discard).
    if (state.stage === 'draw' || canUndoPickup(state, index)) return { action: 'draw' };
    const melds = botMelds(hand),
      points = melds.flat().reduce((sum, tile) => sum + tile.value, 0);
    if (
      melds.length &&
      (state.opened[index] === 'runs' ||
        (!state.opened[index] &&
          points >= 101 &&
          (!state.rules.folding || points > state.highestOpening)))
    )
      return { action: 'open', melds: melds.map((meld) => meld.map((tile) => tile.id)) };
    let extension: { meld: number; tileId: string } | null = null;
    if (state.opened[index] === 'runs' && hand.length > 1)
      for (const [meldIndex, meld] of state.melds.entries()) {
        if (meld.pairs) continue;
        for (const tile of hand.filter((t) => !t.joker))
          if (extend101Meld(meld.tiles, [tile], state.rules))
            extension = { meld: meldIndex, tileId: tile.id };
      }
    if (extension)
      return { action: 'process', amount: extension.meld, tileIds: [extension.tileId] };
    // An işlek discard costs +101, worse than breaking up any pair or near-run (but not than an okey).
    const islek = (tile: OkeyTile) =>
      options.islekPenalty && hand.length > 1 && !tile.joker && okey101IsIslek(state, tile)
        ? 50
        : 0;
    const potential = (tile: OkeyTile) =>
      islek(tile) +
      (tile.joker
        ? 100
        : hand.filter(
            (t) =>
              t.id !== tile.id &&
              ((t.color === tile.color && Math.abs(t.value - tile.value) <= 2) ||
                t.value === tile.value),
          ).length);
    return {
      action: 'discard',
      cardId: [...hand].sort((a, b) => potential(a) - potential(b) || b.value - a.value)[0].id,
    };
  },
  legalActions(state, seat) {
    const mode = state.opened[seat];
    const legal =
      state.stage === 'draw'
        ? ['draw']
        : mode === 'runs'
          ? ['discard', 'open', 'process']
          : mode === 'pairs'
            ? ['discard', 'open-pairs', 'process']
            : ['discard', 'open', 'open-pairs'];
    if (canUndoPickup(state, seat)) legal.push('draw');
    if (okey101GostergeTile(state, seat)) legal.push('gosterge');
    return legal;
  },
  settle: (round) =>
    round.stage !== 'ended'
      ? null
      : { points: round.scores, winners: round.winner === null ? [] : [round.winner] },
  summary: (round) => ({
    scores: round.scores,
    winner: round.winner,
    rules: round.rules,
    opened: round.opened,
    highestOpening: round.highestOpening,
    melds: round.melds,
    lastDiscards: round.discards.map((tiles) => tiles.slice(-1)),
    lastDiscard: round.winner === null ? null : (round.discards[round.winner].at(-1) ?? null),
    penaltyLog: round.penaltyLog ?? [],
    ending: round.ending ?? null,
  }),
  table: {
    stateKey: 'okey',
    parseRules: (input) => parseSwitches<Okey101Options>(input, ruleKeys),
    tableOptions: (fields) => ({
      folding: fields.folding,
      teams: fields.teams,
      ...(fields.options ? { rules: fields.options as Partial<Okey101Options> } : {}),
    }),
  },
} satisfies GameModule<
  OkeyRound,
  GameActionInput,
  ReturnType<typeof okey101View>,
  Okey101TableOptions
>;
