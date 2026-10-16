// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Kiraathane } from '../apps/desktop/src/Kiraathane';
import type { GamePublicState } from '../packages/activity-protocol/src';
afterEach(cleanup);
const callbacks = () => ({
  onCreate: vi.fn(),
  onOpen: vi.fn(),
  onHistory: vi.fn(),
  onRetry: vi.fn(),
});
const base = { error: null, blocked: '', busy: false, otherActivity: null };
const gameButton = (name: string) =>
  screen
    .getByRole('heading', { name })
    .closest('article')!
    .querySelector('button') as HTMLButtonElement;

it('waits for the table service instead of inventing tables', () => {
  const f = callbacks();
  render(<Kiraathane {...f} {...base} game={null} ready={false} />);
  expect(screen.getByRole('status').textContent).toContain('Masalar yükleniyor');
  const button = gameButton('Batak');
  expect(button.disabled).toBe(true);
  expect(button.title).toBe('Masa bağlantısı bekleniyor.');
  fireEvent.click(button);
  expect(f.onCreate).not.toHaveBeenCalled();
});

it('lists only playable games and opens their table setup', () => {
  const f = callbacks();
  render(<Kiraathane {...f} {...base} game={null} ready />);
  expect(screen.queryByText(/Tavla|Satranç/)).toBeNull();
  for (const [name, kind] of [
    ['Texas Hold’em', 'holdem'],
    ['Blackjack', 'blackjack'],
    ['Batak', 'batak'],
    ['101 Okey', '101'],
  ] as const) {
    fireEvent.click(gameButton(name));
    expect(f.onCreate).toHaveBeenLastCalledWith(kind);
  }
});

it('shows the open table with its seats and takes people straight to it', () => {
  const f = callbacks();
  const game = {
    kind: 'holdem',
    status: 'waiting',
    seats: [
      { seat: 0, userId: 'ece', name: 'Ece', bot: false },
      { seat: 1, userId: 'bot-1', name: 'Bot', bot: true },
    ],
    view: { rules: { capacity: 6 }, tableName: 'Akşam eli' },
  } as unknown as GamePublicState;
  render(<Kiraathane {...f} {...base} game={game} ready />);
  expect(screen.getByText('Akşam eli')).toBeTruthy();
  expect(screen.getByText('2/6')).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: /Masaya geç/ })[0]!);
  expect(f.onOpen).toHaveBeenCalledOnce();
  fireEvent.click(gameButton('Blackjack'));
  expect(f.onCreate).toHaveBeenCalledWith('blackjack');
});

it('lets people open a table over another activity, and explains a missing permission', () => {
  const f = callbacks();
  const view = render(<Kiraathane {...f} {...base} otherActivity="Sinema" game={null} ready />);
  expect(screen.getByText(/Odada Sinema açık/)).toBeTruthy();
  expect(gameButton('Batak').disabled).toBe(false);
  view.unmount();
  render(
    <Kiraathane {...f} {...base} blocked="Bu odada masa açma yetkin yok." game={null} ready />,
  );
  expect(gameButton('Batak').disabled).toBe(true);
  expect(gameButton('Batak').title).toBe('Bu odada masa açma yetkin yok.');
});
