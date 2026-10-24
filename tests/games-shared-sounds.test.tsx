// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { GamePublicState } from '../packages/activity-protocol/src';
import { useRooms } from '../apps/desktop/src/store';
import { useCommunity } from '../apps/desktop/src/community';

const f = vi.hoisted(() => ({
  deafened: false,
  audios: [] as { src: string; volume: number; sink?: string }[],
  urls: 0,
}));
vi.mock('../apps/desktop/src/runtime-sources', () => ({
  mediaProvider: () => ({
    snapshot: () => ({ deafened: f.deafened, status: 'connected', participants: [] }),
    subscribeState: () => () => {},
  }),
}));

import {
  gameCueSource,
  gameCues,
  useGameSounds,
  wonLatestHand,
} from '../apps/desktop/src/games/shared/sounds';

const prefs = useRooms.getState().preferences,
  community = useCommunity.getState();
let clock = 0;
beforeEach(() => {
  f.deafened = false;
  f.audios = [];
  clock += 10_000; // Past the per-cue repeat window of the previous test.
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal(
    'Audio',
    class {
      volume = 0;
      constructor(public src = '') {
        f.audios.push(this);
      }
      async setSinkId(id: string) {
        (this as { sink?: string }).sink = id;
      }
      async play() {}
    },
  );
  URL.createObjectURL = () => `blob:cue-${++f.urls}`;
  useRooms.setState({ preferences: { ...prefs, roomEventSounds: true, soundEffectsLevel: 0.5 } });
  useCommunity.setState({ user: { id: 'ece' } as never });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useRooms.setState({ preferences: prefs });
  useCommunity.setState(community);
});

const table = (patch: Partial<GamePublicState> = {}): GamePublicState =>
  ({
    kind: 'batak',
    ownerId: 'osman',
    status: 'playing',
    seats: [
      { seat: 0, userId: 'ece', name: 'Ece', bot: false, chips: 0, connected: true },
      { seat: 1, userId: 'osman', name: 'Osman', bot: false, chips: 0, connected: true },
      { seat: 2, userId: 'bot-1', name: 'Bot', bot: true, chips: 0, connected: true },
    ],
    turn: 1,
    view: { legalActions: [] },
    history: [],
    ...patch,
  }) as GamePublicState;
const finishedHand = (winners: number[]) => ({
  hand: 1,
  endedAt: 1,
  result: { winners },
  seats: [
    { seat: 0, position: 0, userId: 'ece', name: 'Ece', bot: false },
    { seat: 1, position: 1, userId: 'osman', name: 'Osman', bot: false },
  ],
});

it('treats the first view as a baseline and never bursts cues', () => {
  expect(gameCues(null, table({ turn: 0 }), 'ece')).toEqual([]);
});

it('plays your-turn only when the turn moves to the viewer', () => {
  expect(gameCues(table({ turn: 1 }), table({ turn: 0 }), 'ece')).toEqual(['play', 'turn']);
  // The same view polled again plays nothing.
  expect(gameCues(table({ turn: 0 }), table({ turn: 0 }), 'ece')).toEqual([]);
  // A spectator hears the move but never "your turn".
  expect(gameCues(table({ turn: 1 }), table({ turn: 0 }), 'mert')).toEqual(['play']);
  // A seat a bot took over is not the viewer's turn.
  const takenOver = table({ turn: 0 });
  takenOver.seats[0] = { ...takenOver.seats[0], bot: true };
  expect(gameCues(table({ turn: 1 }), takenOver, 'ece')).toEqual(['play']);
});

it('plays the deal when a hand starts and the round end when it finishes', () => {
  expect(gameCues(table({ status: 'finished', turn: null }), table({ turn: 1 }), 'ece')).toEqual([
    'deal',
  ]);
  expect(gameCues(table({ status: 'waiting', turn: null }), table({ turn: 0 }), 'ece')).toEqual([
    'deal',
    'turn',
  ]);
  const won = table({ status: 'finished', turn: null, history: [finishedHand([0])] });
  expect(gameCues(table({ turn: 2 }), won, 'ece')).toEqual(['win']);
  const lost = table({ status: 'finished', turn: null, history: [finishedHand([1])] });
  expect(gameCues(table({ turn: 2 }), lost, 'ece')).toEqual(['end']);
  expect(wonLatestHand(lost, 'osman')).toBe(true);
  // A chip game records nets instead of winners.
  const chips = table({
    status: 'finished',
    history: [{ hand: 1, endedAt: 1, result: { players: [{ userId: 'ece', net: 40 }] } }],
  });
  expect(wonLatestHand(chips, 'ece')).toBe(true);
});

it('follows game signals for exact move cues instead of turn changes', () => {
  const signals = (game: GamePublicState) => ({
    play: Number(game.view.played ?? 0),
    capture: Number(game.view.captured ?? 0),
  });
  const before = table({ turn: 1, view: { played: 3, captured: 0 } }),
    after = table({ turn: 2, view: { played: 4, captured: 1 } });
  expect(gameCues(before, after, 'ece', { signals })).toEqual(['capture', 'play']);
  // No counter moved: the turn change alone is not a card on the felt.
  expect(gameCues(before, table({ turn: 2, view: { played: 3 } }), 'ece', { signals })).toEqual([]);
  expect(gameCues(table({ turn: 1 }), table({ turn: 2 }), 'ece', { move: 'tile' })).toEqual([
    'tile',
  ]);
});

it('ignores a different table and a reset history', () => {
  expect(gameCues(table(), table({ ownerId: 'mert', turn: 0 }), 'ece')).toEqual([]);
  expect(gameCues(table({ history: [finishedHand([0])] }), table({ turn: 0 }), 'ece')).toEqual([]);
});

function Table({ game }: { game: GamePublicState }) {
  useGameSounds(game);
  return null;
}

it('plays cues through an audio element at the sound effects level and output device', () => {
  useRooms.setState({
    preferences: { ...useRooms.getState().preferences, outputId: 'speakers-2' },
  });
  const view = render(<Table game={table({ turn: 1 })} />);
  expect(f.audios).toHaveLength(0);
  view.rerender(<Table game={table({ turn: 0 })} />);
  expect(f.audios.map((audio) => audio.src)).toEqual([
    gameCueSource('play'),
    gameCueSource('turn'),
  ]);
  expect(f.audios[0].volume).toBeCloseTo(0.4);
  return Promise.resolve().then(() => expect(f.audios[0].sink).toBe('speakers-2'));
});

it('stays silent with room sounds off, while deafened or signed out', () => {
  useRooms.setState({
    preferences: { ...useRooms.getState().preferences, roomEventSounds: false },
  });
  const view = render(<Table game={table({ turn: 1 })} />);
  view.rerender(<Table game={table({ turn: 0 })} />);
  expect(f.audios).toHaveLength(0);
  useRooms.setState({ preferences: { ...useRooms.getState().preferences, roomEventSounds: true } });
  f.deafened = true;
  view.rerender(<Table game={table({ turn: 1 })} />);
  expect(f.audios).toHaveLength(0);
  f.deafened = false;
  useCommunity.setState({ user: null });
  view.rerender(<Table game={table({ turn: 0 })} />);
  expect(f.audios).toHaveLength(0);
});

it('synthesizes each cue once as a WAV blob', () => {
  const first = gameCueSource('dice');
  expect(first).toMatch(/^blob:/);
  expect(gameCueSource('dice')).toBe(first);
  expect(gameCueSource('win')).not.toBe(first);
});
