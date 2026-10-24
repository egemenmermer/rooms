// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { commandSchema, type GamePublicState } from '../packages/activity-protocol/src';
import { holdemStartBlocker } from '../apps/desktop/src/games/holdem/entry';
import { holdemFixture } from '../apps/desktop/src/games/holdem/fixture';
import { holdemTableRules } from '../apps/desktop/src/games/holdem/HoldemRulesForm';
import { HoldemTable } from '../apps/desktop/src/games/holdem/HoldemTable';
import {
  chipsFor,
  clampRaise,
  raisePresets,
  type RaiseRange,
} from '../apps/desktop/src/games/holdem/model';
import type { LobbyTableProps } from '../apps/desktop/src/games/registry';

afterEach(() => {
  cleanup();
  globalThis.__roomsLocale = 'tr';
});

const table = (game: GamePublicState, patch: Partial<LobbyTableProps> = {}) => {
  const send = vi.fn(async () => true);
  const props: LobbyTableProps = {
    game,
    userId: 'self',
    can: (name) => (game.view.legalActions as string[]).includes(name),
    send,
    onSit: vi.fn(),
    shortcuts: true,
    ready: true,
    busy: false,
    timer: game.status === 'playing' ? 30 : null,
    startReason: '',
    ...patch,
  };
  render(<HoldemTable {...props} />);
  return props;
};
const envelope = (command: unknown) =>
  commandSchema.safeParse({
    protocolVersion: 1,
    commandId: '7c4a52a6-6f7e-4f5c-9a77-0d6f5c3f2b11',
    expectedRevision: 0,
    command,
  });
const seat = (name: string) => screen.getByText(name).closest('.rg-table-seat') as HTMLElement;
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

it('offers only the moves the server lists on your turn, raise presets inside its range', () => {
  const props = table(holdemFixture('your-turn'));
  expect(button('Bırak').disabled).toBe(false);
  expect(button('Gör · 40').disabled).toBe(false);
  expect(screen.queryByRole('button', { name: 'Kontrol et' })).toBeNull();
  // ½ pot after the call: 40 + (160 + 40) / 2 = 140; pot = 240; all-in = stack + street bet.
  for (const label of ['Min · 80', '½ pot · 140', 'Pot · 240', 'All-in · 980'])
    expect(button(label).disabled).toBe(false);
  fireEvent.click(button('Pot · 240'));
  fireEvent.click(button('240 fişe artır'));
  expect(props.send).toHaveBeenCalledWith({ type: 'game.action', action: 'raise', amount: 240 });
  expect(envelope({ type: 'game.action', action: 'raise', amount: 240 }).success).toBe(true);
  fireEvent.click(button('Bırak'));
  expect(props.send).toHaveBeenLastCalledWith({ type: 'game.action', action: 'fold' });
  // The last moves of this street stay over the seats; the blinds are marked.
  expect(within(seat('Zeynep (demo)')).getByRole('status').textContent).toBe('Artır 40');
  expect(within(seat('Can (demo)')).getByRole('status').textContent).toBe('Gör 40');
  expect(within(seat('Can (demo)')).getByText('BB')).toBeTruthy();
  expect(within(seat('Zeynep (demo)')).getByText('SB')).toBeTruthy();
  expect(screen.getByLabelText('Krupiye: Ali (demo)')).toBeTruthy();
  // Bets on the felt as chip stacks.
  expect(screen.getAllByRole('img', { name: '40 fiş' })).toHaveLength(2);
});

it('closes every move the lobby check refuses (not your turn, taken over, fixture)', () => {
  table(holdemFixture('your-turn'), { can: () => false, fixtureReason: 'Yerel örnek' });
  for (const name of ['Bırak', 'Gör · 40', '80 fişe artır', 'Pot · 240'])
    expect(button(name).disabled).toBe(true);
});

it('clamps raise presets and typed totals to the server range', () => {
  const range: RaiseRange = {
    pot: 300,
    maximumBet: 100,
    streetBet: 0,
    minRaise: 200,
    maxRaise: 1000,
  };
  expect(raisePresets(range).map((preset) => [preset.key, preset.amount])).toEqual([
    ['min', 200],
    ['half', 300],
    ['pot', 500],
    ['all-in', 1000],
  ]);
  // A short stack: every preset is the all-in total, never above it.
  const short = { ...range, maxRaise: 150 };
  expect(raisePresets(short).map((preset) => preset.amount)).toEqual([150, 150, 150, 150]);
  // A tiny pot: half pot would be below the minimum raise, so it is lifted to it.
  expect(raisePresets({ ...range, pot: 0, maximumBet: 20, minRaise: 40 })[1].amount).toBe(40);
  expect(clampRaise(range, 99999)).toBe(1000);
  expect(clampRaise(range, 10)).toBe(200);
  expect(chipsFor(1630)).toEqual([1000, 500, 100, 25, 5]);
});

it("shows the opponent's last move while someone else is on the clock", () => {
  table(holdemFixture('opponent-turn'));
  expect(within(seat('Ali (demo)')).getByRole('status').textContent).toBe('Artır 120');
  expect(within(seat('Ece (demo) · sen')).getByRole('status').textContent).toBe('Kontrol');
  expect(screen.getByText('Sıra Zeynep (demo) kişisinde')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Zeynep (demo) bekleniyor' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Bırak' })).toBeNull();
  expect(screen.queryByRole('group', { name: 'Artırma tutarı' })).toBeNull();
  // The street's moves in the hand log.
  expect(screen.getByText('Ali (demo) 120 yaptı')).toBeTruthy();
});

it('ends the hand with labelled main and side pots, the mucked hand and a next-hand button', () => {
  const props = table(holdemFixture('showdown'));
  expect(screen.getByText(/Ana pot · 560 · Ece \(demo\) \+560/)).toBeTruthy();
  expect(screen.getByText(/Yan pot 1 · 280 · Ece \(demo\) \+280/)).toBeTruthy();
  expect(within(seat('Ali (demo)')).getByText('Kartını açmadı')).toBeTruthy();
  expect(within(seat('Ece (demo) · sen')).getByText('Kazanan · Üçlü')).toBeTruthy();
  expect(screen.getByText(/Ece \(demo\) · 840 fiş · Üçlü/)).toBeTruthy();
  // Winning five highlighted; the mucked hand stays face down.
  expect(document.querySelectorAll('.rg-center .playing-card.winning')).toHaveLength(3);
  expect(within(seat('Ali (demo)')).getAllByLabelText('Kapalı kart')).toHaveLength(2);
  // The pot is pushed to the winner.
  expect(document.querySelector('.ho-push')?.getAttribute('aria-label')).toBe('840 fiş');
  fireEvent.click(button('Sonraki el'));
  expect(props.send).toHaveBeenCalledWith({ type: 'game.action', action: 'start' });
});

it('shows a spectator only public cards and no controls', () => {
  table(holdemFixture('spectator'), { can: () => false });
  expect(screen.getByText('İzleyici · Gizli kartlar gösterilmez.')).toBeTruthy();
  expect(document.querySelectorAll('.rg-seat-cards .playing-card:not(.back)')).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Bırak' })).toBeNull();
  expect(
    (screen.getAllByRole('button', { name: 'Boş koltuk' })[0] as HTMLButtonElement).disabled,
  ).toBe(false);
});

it('speaks English in the English interface', async () => {
  vi.resetModules();
  globalThis.__roomsLocale = 'en';
  const { HoldemTable: Table } = await import('../apps/desktop/src/games/holdem/HoldemTable');
  const game = holdemFixture('your-turn');
  render(
    <Table
      game={game}
      userId="self"
      can={(name) => (game.view.legalActions as string[]).includes(name)}
      send={vi.fn(async () => true)}
      onSit={vi.fn()}
      shortcuts
      ready
      busy={false}
      timer={30}
      startReason=""
    />,
  );
  expect(within(seat('Can (demo)')).getByRole('status').textContent).toBe('Call 40');
  expect(button('Fold').disabled).toBe(false);
  expect(button('½ pot · 140')).toBeTruthy();
  expect(button('Raise to 80 chips')).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/[çğıöşüİ]/);
});

it('deals with short stacks: only two empty stacks block the start', () => {
  const game = holdemFixture('your-turn');
  game.seats = game.seats.map((item, index) => ({ ...item, chips: index ? 5 : 3 }));
  expect(holdemStartBlocker(game)).toBe('');
  game.seats = game.seats.map((item, index) => ({ ...item, chips: index ? 0 : 3 }));
  expect(holdemStartBlocker(game)).toBe('En az iki oyuncunun fişi olmalı');
});

it('sends the muck rule as a game.create option and keeps it out of the table rules', () => {
  const value = { ...holdemTableRules.initial(null)!, muckLosers: true };
  const command = { type: 'game.create', game: 'holdem', ...holdemTableRules.command(value) };
  expect(command).toMatchObject({ options: { muckLosers: true } });
  expect(command.holdem).not.toHaveProperty('muckLosers');
  expect(envelope(command).success).toBe(true);
  expect(holdemTableRules.command({ ...value, muckLosers: false })).not.toHaveProperty('options');
});

it('slides every street’s bets into the pot and keeps a dealt card flipping across clock ticks', () => {
  const start = holdemFixture('your-turn');
  const props: LobbyTableProps = {
    game: start,
    userId: 'self',
    can: () => false,
    send: vi.fn(async () => true),
    onSit: vi.fn(),
    shortcuts: true,
    ready: true,
    busy: false,
    timer: 30,
    startReason: '',
  };
  const view = render(<HoldemTable {...props} />);
  expect(document.querySelectorAll('.ho-dealt')).toHaveLength(0);
  const street = (
    game: GamePublicState,
    stage: string,
    log: unknown[],
    board: unknown[],
    bets: Record<string, number> = {},
  ): GamePublicState => ({
    ...game,
    view: {
      ...game.view,
      stage,
      board,
      log,
      seats: (game.view.seats as Record<string, unknown>[]).map((seat) => ({
        ...seat,
        streetBet: bets[String(seat.userId)] ?? 0,
      })),
    },
  });
  const call = (street: string, userId: string, to: number) => ({
    street,
    userId,
    action: 'call',
    amount: to,
    to,
    allIn: false,
  });
  const flopLog = [
    ...(start.view.log as unknown[]),
    call('flop', 'self', 40),
    call('flop', 'demo-ali', 40),
  ];
  const turnCard = { id: 'diamonds-14', suit: 'diamonds', rank: 14 };
  const turn = street(start, 'turn', flopLog, [...(start.view.board as unknown[]), turnCard]);
  view.rerender(<HoldemTable {...props} game={turn} />);
  // The flop's four 40-chip bets (the last call came with the street change) go to the pot.
  expect(document.querySelectorAll('.ho-sweep')).toHaveLength(4);
  expect(document.querySelectorAll('.ho-dealt')).toHaveLength(1);
  // A clock tick re-renders the same view: the new card keeps flipping.
  view.rerender(<HoldemTable {...props} game={{ ...turn }} timer={29} />);
  expect(document.querySelectorAll('.ho-dealt')).toHaveLength(1);
  const turnLog = [...flopLog, { ...call('turn', 'demo-zeynep', 60), action: 'raise' }];
  const betting = street(turn, 'turn', turnLog, turn.view.board as unknown[], {
    'demo-zeynep': 60,
  });
  view.rerender(<HoldemTable {...props} game={betting} />);
  const river = street(
    betting,
    'river',
    [...turnLog, call('turn', 'demo-can', 60)],
    [...(turn.view.board as unknown[]), { id: 'clubs-2', suit: 'clubs', rank: 2 }],
  );
  view.rerender(<HoldemTable {...props} game={river} />);
  expect(
    [...document.querySelectorAll('.ho-sweep')].map((item) => item.getAttribute('class')),
  ).toHaveLength(2);
});

it('docks your cards, status and moves; the felt keeps one status line per seat and no raw clock', () => {
  table(holdemFixture('your-turn'), { timer: 2208341980 });
  const dock = screen.getByRole('region', { name: 'Elin' });
  // Your hole cards are in the dock, not on your seat on the felt.
  expect(within(dock).getByLabelText('Kartların').querySelectorAll('.playing-card')).toHaveLength(
    2,
  );
  expect(seat('Ece (demo) · sen').querySelector('.rg-seat-cards')).toBeNull();
  expect(within(dock).getByRole('button', { name: 'Bırak' })).toBeTruthy();
  expect(within(dock).getByRole('group', { name: 'Artırma tutarı' })).toBeTruthy();
  // A value that cannot be a turn time is never printed.
  expect(document.body.textContent).not.toContain('2208341980');
  expect(document.querySelector('.rg-timer')).toBeNull();
  // The dealer button rides on its seat chip; a live bet shows as chips, not as a second line.
  expect(within(seat('Ali (demo)')).getByLabelText('Krupiye: Ali (demo)')).toBeTruthy();
  expect(within(seat('Can (demo)')).queryByText(/Bahis/)).toBeNull();
  // The street sits in the pot line; the hand log starts closed over the felt.
  expect(document.querySelector('.ho-pot')?.textContent).toMatch(/^Flop/);
  expect((document.querySelector('.ho-hand-log') as HTMLDetailsElement).open).toBe(false);
});
