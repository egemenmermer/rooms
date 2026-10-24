// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { commandSchema, type GamePublicState } from '../packages/activity-protocol/src';
import { batakModule } from '../packages/games/src/batak-module';
import {
  ReferenceBatak,
  TRICK_HOLD_MS,
  TRICK_SWEEP_MS,
} from '../apps/desktop/src/games/batak/BatakTable';
import { batakCreate } from '../apps/desktop/src/games/batak/create';
import { batakFixture, type BatakScene } from '../apps/desktop/src/games/batak/fixture';
import { readBatak, relativePosition, sortHand } from '../apps/desktop/src/games/batak/model';
import type { TableUI } from '../apps/desktop/src/games/shared/table-ui';

const cues = vi.hoisted(() => vi.fn());
vi.mock('../apps/desktop/src/games/shared/sounds', async (original) => ({
  ...(await original<typeof import('../apps/desktop/src/games/shared/sounds')>()),
  playGameCue: cues,
}));

afterEach(() => {
  cleanup();
  cues.mockClear();
  vi.useRealTimers();
  globalThis.__roomsLocale = 'tr';
});

const ui = (game: GamePublicState, action = vi.fn(async () => true)): TableUI => ({
  game,
  userId: 'self',
  can: (name) => (game.view.legalActions as string[]).includes(name),
  action,
  timer: game.status === 'playing' ? 30 : null,
  busy: false,
});
const scene = (name: BatakScene) => batakFixture(name);
const handCards = () => [...document.querySelectorAll<HTMLButtonElement>('.bt-hand .playing-card')];
const seatAt = (position: string) =>
  document.querySelector(`.bt-seat.pos-${position} strong`)?.textContent;

it('seats the next player on the right, counter-clockwise like a Turkish table', () => {
  render(<ReferenceBatak {...ui(scene('your-turn'))} />);
  expect(seatAt('bottom')).toBe('Ece (demo)');
  expect(seatAt('right')).toBe('Ali (demo)');
  expect(seatAt('top')).toBe('Zeynep (demo)');
  expect(seatAt('left')).toBe('Can (demo)');
  // Three-handed: the next player top right, the one after top left.
  expect(relativePosition({ seats: 3, viewerSeat: 0 }, 1)).toBe('top-right');
  expect(relativePosition({ seats: 3, viewerSeat: 0 }, 2)).toBe('top-left');
  expect(relativePosition({ seats: 4, viewerSeat: 2 }, 3)).toBe('right');
});

it('sorts the own hand by suit with alternating colours, aces first, trump rightmost', () => {
  const state = readBatak(scene('your-turn'), 'self')!;
  const sorted = sortHand(state.hand!, 'spades').map((item) => item.id);
  expect(sorted).toEqual([
    'hearts-14',
    'hearts-8',
    'hearts-3',
    'clubs-11',
    'clubs-6',
    'clubs-2',
    'diamonds-12',
    'diamonds-7',
    'spades-14',
    'spades-13',
    'spades-10',
    'spades-4',
  ]);
  // Without a trump yet: ♠ ♥ ♣ ♦. A missing suit never puts two reds side by side if avoidable.
  expect([...new Set(sortHand(state.hand!, null).map((item) => item.suit))]).toEqual([
    'spades',
    'hearts',
    'clubs',
    'diamonds',
  ]);
  const noClubs = state.hand!.filter((item) => item.suit !== 'clubs');
  expect([...new Set(sortHand(noClubs, 'hearts').map((item) => item.suit))]).toEqual([
    'diamonds',
    'spades',
    'hearts',
  ]);
  render(<ReferenceBatak {...ui(scene('your-turn'))} />);
  expect(handCards().map((item) => item.getAttribute('aria-label'))[0]).toBe('Kupa As');
});

it('enables only the legal cards on your turn and sends the card id', () => {
  const action = vi.fn(async () => true);
  render(<ReferenceBatak {...ui(scene('your-turn'), action)} />);
  expect(screen.getByText('Sıra sende · bir kart at')).toBeTruthy();
  // Clubs were led up to the 10: the jack must head it, every other card is dimmed.
  const enabled = handCards().filter((item) => !item.disabled);
  expect(enabled.map((item) => item.getAttribute('aria-label'))).toEqual(['Sinek Vale']);
  expect(document.querySelectorAll('.bt-hand-card.illegal')).toHaveLength(11);
  fireEvent.click(screen.getByRole('button', { name: 'Sinek Vale' }));
  expect(action).toHaveBeenCalledWith('play', { cardId: 'clubs-11' });
  // Each card of the trick lies in front of the seat that played it.
  expect(screen.getByLabelText('Ali (demo): Sinek 9').className).toContain('at-right');
  expect(screen.getByLabelText('Can (demo): Sinek 10').className).toContain('at-left');
  // The turn seat carries the clock; trump is still closed under K1.
  expect(screen.getByLabelText('Ece (demo) · sırası · 12 kart')).toBeTruthy();
  expect(screen.getByText('Koz kırılmadı')).toBeTruthy();
});

it('shows the opponent on turn with the last card and keeps the hand closed', () => {
  render(<ReferenceBatak {...ui(scene('opponent-turn'))} />);
  expect(screen.getByText('Ali (demo) oynuyor')).toBeTruthy();
  expect(screen.getByLabelText('Ali (demo) · sırası · 12 kart')).toBeTruthy();
  expect(screen.getByLabelText('Ece (demo): Kupa As').className).toContain('at-bottom');
  expect(handCards().every((item) => item.disabled)).toBe(true);
  expect(document.querySelectorAll('.bt-hand-card.illegal')).toHaveLength(0);
  // The bidder carries the contract badge with the trump and tricks against the contract.
  expect(screen.getByLabelText('1 / 7 el')).toBeTruthy();
  // The shared SeatAvatar carries the turn ring on the player whose turn it is.
  expect(document.querySelectorAll('.bt-seat .rg-seat-avatar')).toHaveLength(4);
  expect(document.querySelectorAll('.bt-seat .rg-seat-avatar.turn')).toHaveLength(1);
});

it('keeps a completed trick on the felt, then sweeps it to the winner and clears it', () => {
  vi.useFakeTimers();
  const view = render(<ReferenceBatak {...ui(scene('opponent-turn'))} />);
  view.rerender(<ReferenceBatak {...ui(scene('trick-complete'))} />);
  // All four cards are still there, the winner highlighted, the line says who took it.
  expect(document.querySelectorAll('.bt-trick .bt-played')).toHaveLength(4);
  expect(screen.getByText('Can (demo) eli aldı', { selector: '.bt-trick-winner' })).toBeTruthy();
  expect(document.querySelector('.bt-played.winner')?.getAttribute('aria-label')).toBe(
    'Can (demo): Maça 2',
  );
  expect(cues).toHaveBeenCalledWith('capture');
  act(() => void vi.advanceTimersByTime(TRICK_HOLD_MS - 100));
  expect(document.querySelectorAll('.bt-trick .bt-played')).toHaveLength(4);
  act(() => void vi.advanceTimersByTime(150));
  expect(document.querySelectorAll('.bt-played.sweep-left')).toHaveLength(4);
  act(() => void vi.advanceTimersByTime(TRICK_SWEEP_MS));
  expect(document.querySelectorAll('.bt-trick .bt-played')).toHaveLength(0);
  // K1: trump was played on a hearts lead, so trump is open now.
  expect(screen.getByText('Koz kırıldı')).toBeTruthy();
  // The log kept the trick: the cards nobody had seen yet and who took it.
  expect(screen.getByText('Can (demo) Maça 2 attı', { selector: 'li' })).toBeTruthy();
  expect(screen.getByText('Can (demo) eli aldı', { selector: 'li' })).toBeTruthy();
});

it('does not replay a finished trick when the page opens on it', () => {
  render(<ReferenceBatak {...ui(scene('trick-complete'))} />);
  expect(document.querySelectorAll('.bt-trick .bt-played')).toHaveLength(0);
  expect(cues).not.toHaveBeenCalled();
  // "Son eli göster" shows it on demand.
  fireEvent.click(screen.getByRole('button', { name: 'Son eli göster' }));
  expect(document.querySelectorAll('.bt-trick .bt-played')).toHaveLength(4);
});

it('counts the partnership tricks against the contract in Eşli', () => {
  const game = scene('opponent-turn');
  Object.assign(game.view, { variant: 'esli', bid: 8, bidder: 0, tricks: [4, 1, 4, 3] });
  render(<ReferenceBatak {...ui(game)} />);
  // Ece and Zeynep (across) took 4 + 4 = 8 of their 8: both badges turn green.
  expect(screen.getAllByLabelText('8 / 8 el')).toHaveLength(2);
  expect(document.querySelectorAll('.bt-tricks.made')).toHaveLength(2);
  expect(seatAt('top')).toBe('Zeynep (demo)');
  expect(document.querySelector('.bt-seat.pos-top small')?.textContent).toContain('Eşin');
});

it('shows the auction over the table with every bid and pass, and bids from the minimum', () => {
  const action = vi.fn(async () => true);
  render(<ReferenceBatak {...ui(scene('bidding'), action)} />);
  const log = screen.getByRole('list', { name: 'İhale geçmişi' });
  expect(
    within(log)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Ali (demo)5', 'Zeynep (demo)Pas', 'Can (demo)6']);
  // Bid bubbles beside the seats, the hand stays visible but not playable.
  expect(screen.getByLabelText('Son sözü: Pas')).toBeTruthy();
  expect(handCards()).toHaveLength(12);
  expect(handCards().every((item) => item.disabled)).toBe(true);
  const amounts = within(screen.getByRole('group', { name: 'İhale miktarı' }))
    .getAllByRole('button')
    .map((item) => item.textContent);
  expect(amounts[0]).toBe('7');
  expect(amounts.at(-1)).toBe('13');
  fireEvent.click(screen.getByRole('button', { name: '9' }));
  fireEvent.click(screen.getByRole('button', { name: '9 · İhale ver' }));
  expect(action).toHaveBeenCalledWith('bid', { amount: 9 });
  fireEvent.click(screen.getByRole('button', { name: 'Pas' }));
  expect(action).toHaveBeenCalledWith('pass');
});

it('lets the bidder pick trump and shows the gömü only to the Gömmeli bidder', () => {
  const action = vi.fn(async () => true);
  render(<ReferenceBatak {...ui(scene('trump'), action)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Kupa' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kozu onayla' }));
  expect(action).toHaveBeenCalledWith('trump', { trump: 'hearts' });
  cleanup();
  render(<ReferenceBatak {...ui(scene('gommeli'))} />);
  const gomu = screen.getByRole('heading', { name: 'Gömü' }).closest('section')!;
  expect(within(gomu).getAllByRole('button')).toHaveLength(4);
  expect(seatAt('top-right')).toBe('Ali (demo)');
  expect(seatAt('top-left')).toBe('Zeynep (demo)');
});

it('summarises the round with tricks against the contract, batak marks and the score sheet', () => {
  render(<ReferenceBatak {...ui(scene('round-end'))} />);
  const summary = screen.getByRole('region', { name: 'El özeti' });
  expect(within(summary).getByRole('heading').textContent).toBe('Ece (demo) battı');
  const row = (name: string) =>
    [...within(summary).getByRole('rowheader', { name }).parentElement!.children].map(
      (cell) => cell.textContent,
    );
  expect(row('Ece (demo)')).toEqual(['Ece (demo)', '6 / 7Battı', '-7']);
  expect(row('Zeynep (demo)')).toEqual(['Zeynep (demo)', '0Batak', '-7']);
  expect(row('Can (demo)')).toEqual(['Can (demo)', '4', '+4']);
  const sheet = screen.getByRole('region', { name: 'Puan cetveli' });
  const totals = [
    ...within(sheet).getByRole('rowheader', { name: 'Toplam' }).parentElement!.children,
  ];
  expect(totals.map((cell) => cell.textContent)).toEqual(['Toplam', '1', '-3', '-5', '7']);
  // No hand to play once the round is over.
  expect(handCards()).toHaveLength(0);
});

it('shows a spectator the open table only, with no controls', () => {
  const game = scene('spectator');
  render(<ReferenceBatak {...ui(game)} />);
  expect(document.querySelector('.bt-hand')).toBeNull();
  expect(document.querySelector('.bt-seat.own')).toBeNull();
  expect(screen.getByLabelText('Ali (demo) · sırası · 12 kart')).toBeTruthy();
  expect(
    screen.queryAllByRole('button').filter((item) => !(item as HTMLButtonElement).disabled),
  ).toHaveLength(0);
});

it('renders the table in English', async () => {
  vi.resetModules();
  globalThis.__roomsLocale = 'en';
  const { ReferenceBatak: Table } = await import('../apps/desktop/src/games/batak/BatakTable');
  const { batakFixture: fixture } = await import('../apps/desktop/src/games/batak/fixture');
  const view = render(<Table {...ui(fixture('your-turn'))} />);
  expect(screen.getByText('Your turn · play a card')).toBeTruthy();
  expect(screen.getByText('Trump not broken')).toBeTruthy();
  view.rerender(<Table {...ui(fixture('round-end'))} />);
  expect(screen.getByRole('region', { name: 'Score sheet' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Ece (demo) went down' })).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/[çğıöşüİ]/);
});

it('creates a table with house rules the protocol and the Batak module accept', () => {
  const command = {
    type: 'game.create',
    game: 'batak',
    ...batakCreate.command({ ...batakCreate.defaults, writeContract: true }),
  };
  expect(command).toMatchObject({
    variant: 'ihaleli',
    options: { noTrumpLeadUntilBroken: true, defenderBatakPenalty: false, writeContract: true },
  });
  const envelope = commandSchema.parse({
    protocolVersion: 1,
    commandId: '7c4a52a6-6f7e-4f5c-9a77-0d6f5c3f2b11',
    expectedRevision: 0,
    command,
  });
  const options = (envelope.command as { options?: Record<string, boolean> }).options;
  expect(batakModule.table.parseRules(options)).toEqual(options);
});
