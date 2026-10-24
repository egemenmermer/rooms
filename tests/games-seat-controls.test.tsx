// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GamePublicState } from '../packages/activity-protocol/src';
import type { GameDefinition } from '../apps/desktop/src/games/registry';

const f = vi.hoisted(() => ({
  community: { user: { id: 'ece' } as { id: string } | null, channels: [] },
  speaking: new Set<string>(),
}));
vi.mock('../apps/desktop/src/community', () => ({
  useCommunity: (select?: (value: typeof f.community) => unknown) =>
    select ? select(f.community) : f.community,
}));
vi.mock('../apps/desktop/src/activity', () => ({ useActivityRoom: vi.fn() }));
vi.mock('../apps/desktop/src/runtime-sources', () => ({
  mediaProvider: () => ({
    snapshot: () => ({
      status: 'connected',
      deafened: false,
      participants: [...f.speaking].map((id) => ({ id, speaking: true, muted: false })),
    }),
    subscribeState: () => () => {},
  }),
}));
vi.mock('../apps/desktop/src/realtime', async () => {
  const { create } = await import('zustand');
  return { useVoiceContext: create(() => ({ channelId: null, busy: false })) };
});
// A seat-only table: every seat through the shared SeatAvatar, like the per-game tables adopt it.
vi.mock('../apps/desktop/src/games/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../apps/desktop/src/games/registry')>();
  const { SeatAvatar } = await import('../apps/desktop/src/games/shared/SeatAvatar');
  const definition = (kind: string, scoring: 'chips' | 'points'): GameDefinition => ({
    catalog: {
      kind,
      name: kind,
      players: '',
      detail: '',
      lobbyDetail: '',
      scoring,
      section: 'tables',
      fallbackCapacity: 4,
      offered: false,
      Art: () => null,
      LobbyArt: () => null,
    },
    Table: ({ game, timer }) => (
      <section>
        {game.seats.map((seat) => (
          <article key={seat.seat} data-testid={`seat-${seat.seat}`}>
            <SeatAvatar seat={seat} game={game} timer={timer} />
            <strong>{seat.name}</strong>
          </article>
        ))}
      </section>
    ),
    ruleRows: () => [],
    HistoryDetail: () => null,
  });
  const tables: Record<string, GameDefinition> = {
    'test-seats-v1': definition('test-seats-v1', 'points'),
    'test-chips-v1': definition('test-chips-v1', 'chips'),
  };
  return { ...actual, gameDefinition: (kind: string) => tables[kind] ?? actual.gameDefinition(kind) };
});

import { ReferenceOtherGame } from '../apps/desktop/src/games/shared/TableShell';
import { seatRemovable } from '../apps/desktop/src/games/shared/SeatAvatar';

beforeEach(() => {
  f.community.user = { id: 'ece' };
  f.speaking.clear();
});
afterEach(cleanup);

const table = (patch: Partial<GamePublicState> = {}, kind = 'test-seats-v1') =>
  ({
    kind,
    ownerId: 'ece',
    status: 'playing',
    seats: [
      { seat: 0, userId: 'ece', name: 'Ece', bot: false, chips: 1, connected: true },
      { seat: 1, userId: 'osman', name: 'Osman', bot: false, chips: 500, connected: true },
      { seat: 2, userId: 'bot-2', name: 'Bot Ayşe', bot: true, chips: 500, connected: true },
      { seat: 3, userId: 'can', name: 'Can', bot: false, chips: 500, connected: false },
    ],
    turn: 1,
    view: {
      legalActions: [],
      watching: false,
      ownRecovery: null,
      turnDeadline: Date.now() + 8_000,
    },
    history: [],
    ...patch,
  }) as unknown as GamePublicState;
const shell = (game: GamePublicState, hostUserId = 'mert') => {
  const activity = {
    status: 'connected' as const,
    busy: false,
    error: null,
    serverOffsetMs: 0,
    room: { roomId: 'room-1', primary: { hostUserId } },
    send: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
  };
  render(
    <MemoryRouter>
      <ReferenceOtherGame
        activity={activity as unknown as Parameters<typeof ReferenceOtherGame>[0]['activity']}
        game={game}
      />
    </MemoryRouter>,
  );
  return activity;
};
const removeButtons = () => screen.queryAllByRole('button', { name: /koltuğunu boşalt$/ });

it('offers "Koltuğu boşalt" to the owner on bot and away seats only', () => {
  const activity = shell(table());
  expect(removeButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
    'Bot Ayşe koltuğunu boşalt',
    'Can koltuğunu boşalt',
  ]);
  fireEvent.click(removeButtons()[0]);
  expect(activity.send).toHaveBeenCalledWith({ type: 'game.seat.remove', seat: 2 });
});

it('gives the room host the same control and nobody else', () => {
  f.community.user = { id: 'osman' };
  shell(table(), 'osman');
  expect(removeButtons()).toHaveLength(2);
  cleanup();
  shell(table(), 'mert');
  expect(removeButtons()).toHaveLength(0);
  // The predicate never lets anyone free their own seat.
  expect(seatRemovable(table(), table().seats[0], 'ece', 'ece')).toBe(false);
});

it('shows the speaking ring, the bot badge and the clock of whoever is playing', () => {
  f.speaking.add('osman');
  shell(table());
  const osman = screen.getByTestId('seat-1').querySelector('.rg-seat-avatar')!;
  expect(osman.className).toContain('speaking');
  expect(osman.className).toContain('turn');
  // Under 10 seconds the clock turns red.
  expect(osman.className).toContain('low');
  expect(screen.getByLabelText(/saniye kaldı$/).textContent).toMatch(/^[78]$/);
  expect(screen.getByTestId('seat-0').querySelector('.rg-seat-clock')).toBeNull();
  expect(screen.getByTestId('seat-2').textContent).toContain('Bot');
});

it('offers "Para al" between hands of a chip table once the stack cannot cover a bet', () => {
  const activity = shell(table({ status: 'finished', turn: null }, 'test-chips-v1'));
  fireEvent.click(screen.getByRole('button', { name: 'Para al' }));
  expect(activity.send).toHaveBeenCalledWith({ type: 'game.sit', seat: 0, buyIn: 999 });
  cleanup();
  const funded = table({ status: 'finished', turn: null }, 'test-chips-v1');
  funded.seats[0] = { ...funded.seats[0], chips: 40 };
  shell(funded);
  expect(screen.queryByRole('button', { name: 'Para al' })).toBeNull();
  cleanup();
  // A points game has no chips to buy.
  shell(table({ status: 'finished', turn: null }));
  expect(screen.queryByRole('button', { name: 'Para al' })).toBeNull();
});
