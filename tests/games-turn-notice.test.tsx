// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { GamePublicState } from '../packages/activity-protocol/src';

const f = vi.hoisted(() => ({
  room: null as unknown,
  roomIds: [] as (string | null)[],
  cue: vi.fn(),
  status: vi.fn(async () => ({
    enabled: true,
    sound: false,
    pauseDuringVoice: false,
    supported: true,
  })),
  reminder: vi.fn(async () => undefined),
}));
vi.mock('../apps/desktop/src/activity', () => ({
  useActivityRoom: (roomId: string | null) => {
    f.roomIds.push(roomId);
    return { status: 'connected', room: roomId ? f.room : null, serverOffsetMs: 0 };
  },
}));
vi.mock('../apps/desktop/src/games/shared/sounds', () => ({ playGameCue: f.cue }));
vi.mock('../apps/desktop/src/realtime', async () => {
  const { create } = await import('zustand');
  return { useVoiceContext: create(() => ({ channelId: null as string | null, busy: false })) };
});

import { useCommunity } from '../apps/desktop/src/community';
import { useVoiceContext } from '../apps/desktop/src/realtime';
import { GameTurnNotice, ownTurnKey } from '../apps/desktop/src/games/TurnNotice';

const community = useCommunity.getState();
const game = (patch: Partial<GamePublicState> = {}, view: Record<string, unknown> = {}) =>
  ({
    kind: 'batak',
    ownerId: 'osman',
    status: 'playing',
    seats: [
      { seat: 0, userId: 'ece', name: 'Ece', bot: false, chips: 0, connected: true },
      { seat: 1, userId: 'osman', name: 'Osman', bot: false, chips: 0, connected: true },
    ],
    turn: 0,
    view: { legalActions: ['play'], turnDeadline: Date.now() + 32_000, ...view },
    history: [],
    ...patch,
  }) as GamePublicState;
const roomWith = (table: GamePublicState) => ({
  roomId: 'voice-1',
  primary: { activity: table.kind, title: 'Batak' },
  game: table,
});
let focused = false;
beforeEach(() => {
  f.roomIds = [];
  f.cue.mockClear();
  f.status.mockClear();
  f.reminder.mockClear();
  focused = false;
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  (window as unknown as { rooms: unknown }).rooms = {
    notifications: { status: f.status, reminder: f.reminder },
  };
  useCommunity.setState({ user: { id: 'ece' } as never, activeChannelId: 'text-1' });
  useVoiceContext.setState({ channelId: 'voice-1' });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useCommunity.setState(community);
  useVoiceContext.setState({ channelId: null });
  delete (window as unknown as { rooms?: unknown }).rooms;
});

function Where() {
  return <p data-testid="where">{useLocation().pathname + useLocation().search}</p>;
}
const mount = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <GameTurnNotice />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

it('keys a turn only when the server lets the seated viewer move', () => {
  expect(ownTurnKey(game(), 'ece')).toMatch(/^batak:0:0:/);
  expect(ownTurnKey(game({ turn: 1 }), 'ece')).toBeNull();
  expect(ownTurnKey(game({}, { legalActions: [] }), 'ece')).toBeNull();
  expect(ownTurnKey(game({ status: 'finished' }), 'ece')).toBeNull();
  expect(ownTurnKey(game(), 'mert')).toBeNull();
  expect(ownTurnKey(game({}, { ownRecovery: { takeover: true } }), 'ece')).toBeNull();
});

it('shows "Sıra sende" off /games with a way back to the table', async () => {
  f.room = roomWith(game());
  mount('/voice');
  // The voice room is the current room, like the /games route.
  expect(f.roomIds.at(-1)).toBe('voice-1');
  const notice = screen.getByRole('status');
  expect(notice.textContent).toContain('Sıra sende');
  expect(notice.textContent).toMatch(/Batak · 3\d sn/);
  expect(f.cue).toHaveBeenCalledWith('turn');
  fireEvent.click(screen.getByRole('button', { name: 'Masaya dön' }));
  expect(screen.getByTestId('where').textContent).toBe('/games?tab=table');
  expect(screen.queryByRole('status')).toBeNull();
});

it('stays out of the way on /games and when it is not the viewer’s turn', () => {
  f.room = roomWith(game());
  mount('/games');
  expect(screen.queryByRole('status')).toBeNull();
  expect(f.cue).not.toHaveBeenCalled();
  cleanup();
  f.room = roomWith(game({ turn: 1 }));
  mount('/voice');
  expect(screen.queryByRole('status')).toBeNull();
});

it('can be dismissed for this turn and comes back on the next one', () => {
  const first = game();
  f.room = roomWith(first);
  const view = mount('/chat');
  fireEvent.click(screen.getByRole('button', { name: 'Bildirimi kapat' }));
  expect(screen.queryByRole('status')).toBeNull();
  f.room = roomWith(game({}, { turnDeadline: Number(first.view.turnDeadline) + 60_000 }));
  view.rerender(
    <MemoryRouter initialEntries={['/chat']}>
      <GameTurnNotice />
    </MemoryRouter>,
  );
  expect(screen.getByRole('status')).toBeTruthy();
});

it('asks for the desktop notification only when unfocused and opted in', async () => {
  f.room = roomWith(game());
  focused = true;
  mount('/voice');
  await act(async () => {});
  expect(f.reminder).not.toHaveBeenCalled();
  cleanup();

  focused = false;
  f.room = roomWith(game({}, { turnDeadline: Date.now() + 40_000 }));
  mount('/voice');
  await act(async () => {});
  expect(f.reminder).toHaveBeenCalledWith({ title: 'Tayfa', detail: 'Sıra sende · Batak' });
  cleanup();

  f.reminder.mockClear();
  f.status.mockResolvedValueOnce({
    enabled: false,
    sound: false,
    pauseDuringVoice: false,
    supported: true,
  });
  f.room = roomWith(game({}, { turnDeadline: Date.now() + 50_000 }));
  mount('/voice');
  await act(async () => {});
  expect(f.reminder).not.toHaveBeenCalled();
});

it('watches only the joined voice room, whose poll the voice sidebar already runs', () => {
  useVoiceContext.setState({ channelId: null });
  f.room = roomWith(game());
  mount('/chat');
  expect(f.roomIds.at(-1)).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
});
