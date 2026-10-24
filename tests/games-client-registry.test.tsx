// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { GamePublicState } from '../packages/activity-protocol/src';
import type { GameDefinition } from '../apps/desktop/src/games/registry';

const f = vi.hoisted(() => ({
  community: { user: { id: 'ece' }, channels: [{ id: 'room-1', name: 'Salon' }] },
}));
vi.mock('../apps/desktop/src/community', () => ({
  useCommunity: (select?: (value: typeof f.community) => unknown) =>
    select ? select(f.community) : f.community,
}));
vi.mock('../apps/desktop/src/activity', () => ({ useActivityRoom: vi.fn() }));
// A game that exists only in this test: one folder's worth of views, injected as a registry entry.
vi.mock('../apps/desktop/src/games/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../apps/desktop/src/games/registry')>();
  const { TableDock } = await import('../apps/desktop/src/games/shared/TableDock');
  const dummy: GameDefinition = {
    catalog: {
      kind: 'test-dice-v1',
      name: 'Zar Testi',
      players: '',
      detail: '',
      lobbyDetail: '',
      scoring: 'points',
      section: 'tables',
      fallbackCapacity: 2,
      offered: false,
      Art: () => null,
      LobbyArt: () => null,
    },
    Table: ({ game, can, action, timer }) => (
      <section>
        <p>Zar masası · sıra {String(game.turn)}</p>
        <p>süre {String(timer)}</p>
        <TableDock label="Hamle">
          <button disabled={!can('roll')} onClick={() => void action('roll')}>
            Zar at
          </button>
        </TableDock>
      </section>
    ),
    ruleRows: () => [['Zar', '2']],
    HistoryDetail: () => null,
  };
  return {
    ...actual,
    gameDefinition: (kind: string) =>
      kind === dummy.catalog.kind ? dummy : actual.gameDefinition(kind),
  };
});

import { gameCatalogEntries } from '../apps/desktop/src/games/catalog';
import { gameRegistry } from '../apps/desktop/src/games/registry';
import { ReferenceOtherGame } from '../apps/desktop/src/games/shared/TableShell';
import { Kiraathane } from '../apps/desktop/src/Kiraathane';

afterEach(cleanup);

const table = (kind: string, patch: Partial<GamePublicState> = {}, view = {}) =>
  ({
    kind,
    ownerId: 'osman',
    status: 'playing',
    seats: [
      { seat: 0, userId: 'ece', name: 'Ece', bot: false, chips: 0, connected: true },
      { seat: 1, userId: 'osman', name: 'Osman', bot: false, chips: 0, connected: true },
    ],
    turn: 0,
    view: { legalActions: [], watching: false, ownRecovery: null, ...view },
    history: [],
    ...patch,
  }) as unknown as GamePublicState;
const activityRoom = () => ({
  status: 'connected' as const,
  busy: false,
  error: null,
  serverOffsetMs: 0,
  room: { roomId: 'room-1', primary: null },
  send: vi.fn(async () => undefined),
  refresh: vi.fn(async () => undefined),
});
const shell = (game: GamePublicState, activity = activityRoom()) => {
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

it('renders a registered game through the shared table shell', () => {
  const activity = shell(table('test-dice-v1', {}, { legalActions: ['roll'] }));
  expect(screen.getByRole('heading', { level: 1, name: 'Zar Testi' })).toBeTruthy();
  expect(screen.getByText('Zar masası · sıra 0')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Zar at' }));
  expect(activity.send).toHaveBeenCalledWith({ type: 'game.action', action: 'roll' });
  fireEvent.click(screen.getByRole('button', { name: /Masa kuralları/ }));
  expect(screen.getByText('Zar').nextElementSibling?.textContent).toBe('2');
});

it('keeps a move closed when the server does not list it', () => {
  shell(table('test-dice-v1', {}, { legalActions: [] }));
  expect((screen.getByRole('button', { name: 'Zar at' }) as HTMLButtonElement).disabled).toBe(true);
});

it('shows the coming-soon table for server games without a client view', () => {
  for (const kind of ['rooms-chess-v9']) {
    shell(table(kind));
    expect(screen.getByRole('status').textContent).toContain('Bu oyunun masası yakında');
    cleanup();
  }
});

it('lets whoever the server allows deal the next hand, not only the owner', () => {
  const activity = shell(table('batak', { status: 'finished' }, { legalActions: ['start'] }));
  const next = screen.getByRole('button', { name: 'Sonraki el' }) as HTMLButtonElement;
  expect(screen.getByText('Yeni el başlatabilirsin.')).toBeTruthy();
  expect(next.disabled).toBe(false);
  fireEvent.click(next);
  expect(activity.send).toHaveBeenCalledWith({ type: 'game.action', action: 'start' });
  cleanup();
  shell(table('batak', { status: 'finished', ownerId: 'ece' }, { legalActions: [] }));
  expect((screen.getByRole('button', { name: 'Sonraki el' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.getByText('Masa sahibi bekleniyor.')).toBeTruthy();
});

it('has one registry entry per catalog entry and offers only finished views', () => {
  expect([...gameRegistry.keys()]).toEqual(gameCatalogEntries.map((entry) => entry.kind));
  for (const [kind, definition] of gameRegistry) {
    expect(definition.catalog.kind).toBe(kind);
    expect(!!definition.Table || definition.tableInLobby === true).toBe(true);
  }
  render(
    <Kiraathane
      game={null}
      ready
      error={null}
      blocked=""
      busy={false}
      otherActivity={null}
      onCreate={vi.fn()}
      onOpen={vi.fn()}
      onHistory={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getAllByRole('heading', { level: 2 }).map((item) => item.textContent)).toEqual([
    'Texas Hold’em',
    'Blackjack',
    'Batak',
    '101 Okey',
    'Pişti',
    'Okey',
    'Tavla',
  ]);
});

it('docks the table controls under the table area and keeps the header to one row', () => {
  shell(table('test-dice-v1', {}, { legalActions: ['roll'] }));
  const roll = screen.getByRole('button', { name: 'Zar at' });
  expect(roll.closest('.rx-dock')).toBeTruthy();
  expect(roll.closest('.rx-stage')).toBeNull();
  expect(screen.getByText('Zar masası · sıra 0').closest('.rx-stage')).toBeTruthy();
  // The rules chip opens a popover; Escape closes it.
  const rules = screen.getByRole('button', { name: /Masa kuralları/ });
  fireEvent.click(rules);
  expect(rules.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('dialog', { name: 'Masa kuralları' }).textContent).toContain('Zar');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Masa kuralları' })).toBeNull();
});

it('hides a turn clock that cannot be a real turn time', () => {
  shell(table('test-dice-v1', {}, { turnDeadline: 4_000_000_000_000 }));
  expect(screen.getByText('süre null')).toBeTruthy();
});

it('leaves and closes the table from the actions menu, each after a confirm', () => {
  const activity = shell(table('test-dice-v1', { ownerId: 'ece' }));
  expect(screen.queryByText('Masayı kapat')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Masa işlemleri' }));
  const menu = screen.getByRole('menu', { name: 'Masa işlemleri' });
  expect([...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual([
    'Masadan kalk',
    'Masayı kapat',
  ]);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Masadan kalk' }));
  expect(activity.send).not.toHaveBeenCalled();
  expect(screen.getByText(/elini bot bitirir/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
  fireEvent.click(screen.getByRole('button', { name: 'Masa işlemleri' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Masadan kalk' }));
  const leave = screen
    .getAllByRole('button', { name: 'Masadan kalk' })
    .find((button) => button.classList.contains('danger'))!;
  fireEvent.click(leave);
  expect(activity.send).toHaveBeenCalledWith({ type: 'game.leave' });
  cleanup();
  // A seated player who does not own the table only gets "Masadan kalk".
  shell(table('test-dice-v1'));
  fireEvent.click(screen.getByRole('button', { name: 'Masa işlemleri' }));
  expect(screen.queryByRole('menuitem', { name: 'Masayı kapat' })).toBeNull();
});
