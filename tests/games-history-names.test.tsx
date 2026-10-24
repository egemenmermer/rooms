// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GamePublicState } from '../packages/activity-protocol/src';

const f = vi.hoisted(() => ({ community: { user: { id: 'self' } } }));
vi.mock('../apps/desktop/src/community', () => ({
  useCommunity: Object.assign(
    (select?: (value: typeof f.community) => unknown) =>
      select ? select(f.community) : f.community,
    { getState: () => f.community, subscribe: () => () => {} },
  ),
}));
vi.mock('../apps/desktop/src/activity', () => ({ useActivityRoom: vi.fn() }));

import { historyTableName, ReferenceGameHistory } from '../apps/desktop/src/games/shared/History';

afterEach(cleanup);

describe('historyTableName', () => {
  it('keeps a real table name', () => {
    expect(historyTableName('Akşam eli', 'holdem')).toBe('Akşam eli');
  });
  it('falls back to the catalog title when the name is missing or a stringified null', () => {
    for (const name of [undefined, null, '', '  ', 'undefined', 'null', 'NaN'])
      expect(historyTableName(name, 'blackjack')).toBe('Blackjack');
  });
  it('replaces the raw game id older servers used as the table name', () => {
    expect(historyTableName('blackjack', 'blackjack')).toBe('Blackjack');
  });
  it('shows the raw kind for a game the client does not know, never "undefined"', () => {
    expect(historyTableName(undefined, 'mystery')).toBe('mystery');
  });
});

const hand = (patch: Record<string, unknown> = {}) => ({
  hand: 1,
  endedAt: Date.UTC(2026, 2, 14, 11, 30),
  result: {},
  ...patch,
});
const game = (previous: unknown[], error: string | null = null) => {
  const state = {
    kind: 'holdem',
    ownerId: 'self',
    status: 'playing',
    seats: [{ seat: 0, userId: 'self', name: 'Ege', bot: false, chips: 1000, connected: true }],
    turn: null,
    history: [hand({ tableName: 'Akşam eli' })],
    view: {
      tableName: 'Akşam eli',
      statistics: { self: { hands: 3, wins: 2 } },
      previousTables: previous,
    },
  } as unknown as GamePublicState;
  const activity = {
    status: error ? 'error' : 'connected',
    error,
    room: { roomId: 'room-1' },
    refresh: vi.fn(async () => undefined),
  };
  render(
    <MemoryRouter>
      <ReferenceGameHistory
        activity={activity as unknown as Parameters<typeof ReferenceGameHistory>[0]['activity']}
        game={state}
      />
    </MemoryRouter>,
  );
};

describe('ReferenceGameHistory', () => {
  it('never renders "undefined" for a hand without a table name', () => {
    game([
      { kind: 'blackjack', history: [hand({ tableName: 'undefined' })], statistics: {} },
      { kind: 'tavla', history: [hand({ hand: 2 })], statistics: {} },
    ]);
    expect(document.body.textContent).not.toMatch(/undefined|null/i);
    expect(screen.getAllByText('Blackjack').length).toBeGreaterThan(0);
  });

  it('shows dashes instead of stale statistics when the history failed to load', () => {
    game([], 'Geçmiş alınamadı.');
    const stats = [...document.querySelectorAll('.rh-stats strong')].map((n) => n.textContent);
    expect(stats).toEqual(['—', '—', '—', '—']);
  });

  it('shows the statistics when the history loaded', () => {
    game([]);
    const stats = [...document.querySelectorAll('.rh-stats strong')].map((n) => n.textContent);
    expect(stats.slice(0, 3)).toEqual(['3', '2', '67%']);
  });
});
