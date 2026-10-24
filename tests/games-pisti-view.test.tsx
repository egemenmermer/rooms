// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { commandSchema, type GamePublicState } from '../packages/activity-protocol/src';
import { pistiMatchModule } from '../packages/games/src/matches';
import { pistiCreate } from '../apps/desktop/src/games/pisti/create';
import { pistiGame } from '../apps/desktop/src/games/pisti/entry';
import { pistiFixture, type PistiScene } from '../apps/desktop/src/games/pisti/fixture';
import { PistiHistory, pistiHistoryResult } from '../apps/desktop/src/games/pisti/PistiHistory';
import { PistiTable } from '../apps/desktop/src/games/pisti/PistiTable';
import type { TableUI } from '../apps/desktop/src/games/shared/table-ui';

const cues = vi.hoisted(() => vi.fn());
vi.mock('../apps/desktop/src/games/pisti/sounds', () => ({ playPistiCue: cues }));

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
const scene = (name: PistiScene) => pistiFixture(name);
const handButtons = () => [
  ...document.querySelectorAll<HTMLButtonElement>('.pp-hand .playing-card'),
];

it('lets the viewer play any card on their turn and sends the card id as payload', () => {
  const action = vi.fn(async () => true);
  render(<PistiTable {...ui(scene('your-turn'), action)} />);
  expect(screen.getByText('Sıra sende · bir kart at')).toBeTruthy();
  const cards = handButtons();
  expect(cards).toHaveLength(3);
  expect(cards.every((card) => !(card as HTMLButtonElement).disabled)).toBe(true);
  // Pile: top card face up, its size in words, the deck count.
  expect(screen.getByLabelText('Yerde 5 kart · üstte Karo 7')).toBeTruthy();
  expect(screen.getByLabelText('Destede 28 kart')).toBeTruthy();
  // The jack and the matching 7 would take the pile.
  expect(document.querySelectorAll('.pp-hand-card.takes')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Kupa 7' }));
  expect(action).toHaveBeenCalledWith('play', { payload: { cardId: 'hearts-7-0' } });
  // The turn seat carries the clock.
  expect(screen.getByLabelText('Ece (demo) · sırası · 3 kart')).toBeTruthy();
});

it('shows the opponent on turn with the last play and capture, and keeps the hand closed', () => {
  render(<PistiTable {...ui(scene('opponent-turn'))} />);
  expect(screen.getByText('Ali (demo) oynuyor')).toBeTruthy();
  expect(screen.getByLabelText('Ali (demo) · sırası · 3 kart')).toBeTruthy();
  expect(handButtons().every((card) => (card as HTMLButtonElement).disabled)).toBe(true);
  const last = document.querySelector('.pp-last')!.textContent!;
  expect(last).toContain('Ali (demo) valeyle 4 kart aldı');
  expect(last).toContain('Ece (demo) Kupa 9 attı');
  expect(screen.getByLabelText('Ali (demo) · 4 kart aldı')).toBeTruthy();
});

it('plays the PİŞTİ! moment only for a capture that happens while the table is open', () => {
  vi.useFakeTimers();
  // Opening the page on a pişti (baseline) replays nothing.
  const first = render(<PistiTable {...ui(scene('pisti'))} />);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(cues).not.toHaveBeenCalled();
  first.unmount();
  const view = render(<PistiTable {...ui(scene('your-turn'))} />);
  view.rerender(<PistiTable {...ui(scene('pisti'))} />);
  const moment = screen.getByRole('alert');
  expect(moment.textContent).toContain('PİŞTİ!');
  expect(moment.textContent).toContain('+10');
  expect(cues).toHaveBeenCalledWith('pisti');
  expect(document.querySelector('.pp-ghost.sweep-top')).toBeTruthy();
  expect(screen.getByText('Ali (demo) pişti yaptı · +10', { selector: 'li' })).toBeTruthy();
  act(() => void vi.advanceTimersByTime(2000));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(document.querySelector('.pp-ghost')).toBeNull();
});

it('summarises a finished deal from series.previous without blocking the next one', () => {
  const view = render(<PistiTable {...ui(scene('your-turn'))} />);
  view.rerender(<PistiTable {...ui(scene('deal-end'))} />);
  const summary = screen.getByRole('heading', { name: 'El 1 bitti' }).closest('section')!;
  const row = (label: string) =>
    [...within(summary).getByRole('rowheader', { name: label }).parentElement!.children].map(
      (cell) => cell.textContent,
    );
  expect(row('Alınan kart')).toEqual(['Alınan kart', '22', '30']);
  expect(row('En çok kart')).toEqual(['En çok kart', '—', '+3']);
  expect(row('Pişti (10)')).toEqual(['Pişti (10)', '—', '1 · +10']);
  expect(row('As, vale, ♣2, ♦10')).toEqual(['As, vale, ♣2, ♦10', '+5', '+8']);
  expect(row('Bu el')).toEqual(['Bu el', '5', '21']);
  // The new deal is already playable underneath.
  expect(handButtons().filter((card) => !(card as HTMLButtonElement).disabled)).toHaveLength(4);
  // The remainder of the finished deal is reported as a line.
  expect(
    screen.getByText('Yerde kalan 3 kart son alan Ali (demo) tarafına gitti', { selector: 'li' }),
  ).toBeTruthy();
  fireEvent.click(within(summary).getByRole('button', { name: 'Kapat' }));
  expect(screen.queryByRole('heading', { name: 'El 1 bitti' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Önceki el özeti' }));
  expect(screen.getByRole('heading', { name: 'El 1 bitti' })).toBeTruthy();
  // Match score per side towards the target.
  expect(screen.getByLabelText('Ali (demo) · 21 / 151')).toBeTruthy();
});

it('sends a play the protocol accepts and the Pişti module understands', () => {
  // The command TableShell builds from action('play', { payload: { cardId } }).
  const command = { type: 'game.action', action: 'play', payload: { cardId: 'hearts-7-0' } };
  const envelope = commandSchema.parse({
    protocolVersion: 1,
    commandId: '7c4a52a6-6f7e-4f5c-9a77-0d6f5c3f2b11',
    expectedRevision: 0,
    command,
  });
  expect(pistiMatchModule.parseCommand(envelope.command as typeof command)).toEqual({
    type: 'play',
    cardId: 'hearts-7-0',
  });
});

it('reads the last play of the final deal from the view, not from series.previous', () => {
  const view = render(<PistiTable {...ui(scene('your-turn'))} />);
  view.rerender(<PistiTable {...ui(scene('match-end'))} />);
  // series.previous holds an older pişti: it must not replay.
  expect(screen.queryByRole('alert')).toBeNull();
  expect(cues).not.toHaveBeenCalledWith('pisti');
  expect(
    screen.getByText('Yerde kalan 3 kart son alan Ali (demo) tarafına gitti', { selector: 'li' }),
  ).toBeTruthy();
  expect(screen.getByText('Ece (demo) Maça 4 attı', { selector: 'li' })).toBeTruthy();
});

it('shows the match result with every deal and no playable cards at the end', () => {
  render(<PistiTable {...ui(scene('match-end'))} />);
  const end = screen.getByRole('region', { name: 'Maç sonucu' });
  expect(within(end).getByRole('heading', { name: 'Maç bitti · Ali (demo) kazandı' })).toBeTruthy();
  const total = within(end).getByRole('rowheader', { name: 'Toplam' }).parentElement!;
  expect([...total.children].map((cell) => cell.textContent)).toEqual(['Toplam', '98', '156']);
  expect(within(end).getAllByRole('rowheader', { name: /^[123]$/ })).toHaveLength(3);
  expect(handButtons()).toHaveLength(0);
});

it('gives a spectator the open table only: no hand, no controls', () => {
  render(<PistiTable {...ui(scene('spectator'))} />);
  expect(screen.queryByText(/ELİN/)).toBeNull();
  expect(handButtons()).toHaveLength(0);
  expect(
    screen.getAllByRole('button').filter((button) => !(button as HTMLButtonElement).disabled),
  ).toHaveLength(0);
  expect(screen.getByLabelText('Ali (demo) · sırası · 3 kart')).toBeTruthy();
});

it('seats partners across in a four-player game and scores by team', () => {
  render(<PistiTable {...ui(scene('partners'))} />);
  const partner = document.querySelector('.pp-seat.pos-top')!;
  expect(partner.textContent).toContain('Zeynep (demo)');
  expect(partner.textContent).toContain('Eşin');
  expect(document.querySelector('.pp-seat.pos-right')!.textContent).toContain('Ali (demo)');
  expect(screen.getByLabelText('Ece (demo) + Zeynep (demo) · 34 / 151')).toBeTruthy();
  expect(screen.getByLabelText('Ali (demo) + Can (demo) · 46 / 151')).toBeTruthy();
  expect(handButtons().filter((card) => !(card as HTMLButtonElement).disabled)).toHaveLength(0);
});

it('creates tables with the server options and blocks a three-player start', () => {
  expect(pistiCreate.command({ target: '101', reshuffleJackTop: false })).toEqual({
    options: { target: 101, reshuffleJackTop: false },
  });
  expect(pistiCreate.command(pistiCreate.defaults)).toEqual({
    options: { target: 151, reshuffleJackTop: true },
  });
  expect(pistiGame.minSeats).toBe(2);
  const seated = (count: number) => ({
    ...scene('partners'),
    seats: scene('partners').seats.slice(0, count),
  });
  expect(pistiGame.startBlocker!(seated(3))).not.toBe('');
  expect(pistiGame.startBlocker!(seated(2))).toBe('');
  expect(pistiGame.startBlocker!(seated(4))).toBe('');
  expect(pistiGame.catalog.offered).toBe(true);
});

it('records a match in history with deals and totals', () => {
  const entry = {
    hand: 1,
    endedAt: 0,
    seats: [
      { position: 0, userId: 'self', name: 'Ece' },
      { position: 1, userId: 'ali', name: 'Ali' },
    ],
    result: {
      totals: [98, 156],
      winners: [1],
      rounds: [{ points: [40, 60] }, { points: [58, 96] }],
    },
  } as unknown as Parameters<typeof PistiHistory>[0]['entry'];
  render(<PistiHistory entry={entry} />);
  expect(screen.getByText('Ali · Kazandı')).toBeTruthy();
  expect(screen.getByText('156 puan')).toBeTruthy();
  expect(pistiHistoryResult(entry.result, entry, 'self')).toBe('98 puan');
});

it('renders the table in English', async () => {
  vi.resetModules();
  globalThis.__roomsLocale = 'en';
  const { PistiTable: Table } = await import('../apps/desktop/src/games/pisti/PistiTable');
  const { pistiFixture: fixture } = await import('../apps/desktop/src/games/pisti/fixture');
  const view = render(<Table {...ui(fixture('your-turn'))} />);
  expect(screen.getByText('Your turn · play a card')).toBeTruthy();
  view.rerender(<Table {...ui(fixture('deal-end'))} />);
  expect(screen.getByRole('heading', { name: 'Hand 1 over' })).toBeTruthy();
  expect(screen.getByRole('rowheader', { name: 'Cards taken' })).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/[çğıöşüİ]/);
});
