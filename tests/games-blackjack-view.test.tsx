// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { commandSchema, type GamePublicState } from '../packages/activity-protocol/src';
import { blackjackModule } from '../packages/games/src/blackjack-module';
import { BlackjackTable } from '../apps/desktop/src/games/blackjack/BlackjackTable';
import { blackjackCreate } from '../apps/desktop/src/games/blackjack/create';
import { blackjackGame } from '../apps/desktop/src/games/blackjack/entry';
import { blackjackFixture, type BlackjackScene } from '../apps/desktop/src/games/blackjack/fixture';
import {
  blackjackMoves,
  chipStack,
  handTotal,
  totalLabel,
} from '../apps/desktop/src/games/blackjack/model';
import type { TableUI } from '../apps/desktop/src/games/shared/table-ui';

const sounds = vi.hoisted(() => vi.fn());
vi.mock('../apps/desktop/src/games/shared/sounds', () => ({ useGameSounds: sounds }));
vi.mock('../apps/desktop/src/runtime-sources', () => ({
  mediaProvider: () => ({
    snapshot: () => ({ status: 'disconnected', participants: [] }),
    subscribeState: () => () => {},
  }),
}));
vi.mock('../apps/desktop/src/realtime', async () => {
  const { create } = await import('zustand');
  return { useVoiceContext: create(() => ({ channelId: null, busy: false })) };
});

afterEach(() => {
  cleanup();
  sounds.mockClear();
  globalThis.__roomsLocale = 'tr';
});

const ui = (game: GamePublicState, action = vi.fn(async () => true), userId = 'self'): TableUI => {
  const seated = game.seats.some((seat) => seat.userId === userId);
  return {
    game,
    userId,
    can: (name) =>
      seated &&
      ((game.view.legalActions as string[]).includes(name) ||
        (name === 'bet' && game.status !== 'playing')),
    action,
    timer: game.status === 'playing' ? 30 : null,
    busy: false,
  };
};
const scene = (name: BlackjackScene) => blackjackFixture(name);
const spot = (name: string) =>
  screen.getByRole('listitem', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')} · `) });

it('draws every player’s hands at their spot, with the viewer’s split side by side', () => {
  render(<BlackjackTable {...ui(scene('your-turn'))} />);
  // Ali busted, Ece split (two hands), Zeynep holds a soft 17 shown as 7/17.
  expect(within(spot('Ali (demo)')).getAllByRole('article')).toHaveLength(1);
  expect(within(spot('Ali (demo)')).getByText('Aştı')).toBeTruthy();
  const own = within(spot('Ece (demo)')).getAllByRole('article');
  expect(own).toHaveLength(2);
  expect(within(spot('Zeynep (demo)')).getByLabelText('El 1 · 7/17')).toBeTruthy();
  // The active split hand is the second one (8 + A = 9/19) and it alone is highlighted.
  expect(own[0].className).not.toContain('active');
  expect(own[1].className).toContain('active');
  expect(own[1].getAttribute('aria-current')).toBe('true');
  expect(own[1].getAttribute('aria-label')).toBe('El 2 · 9/19');
  expect(screen.getByText('Sıra sende · El 2')).toBeTruthy();
  // Dealer: one up card and the hole card face down.
  const dealer = screen.getByLabelText('Krupiyenin kartları');
  expect(within(dealer).getByRole('button', { name: 'Kupa 9' })).toBeTruthy();
  expect(within(dealer).getByRole('button', { name: 'Kapalı kart' })).toBeTruthy();
});

it('enables only the moves the server lists and maps the keyboard shortcuts to them', () => {
  const action = vi.fn(async () => true);
  render(<BlackjackTable {...ui(scene('your-turn'), action)} />);
  const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });
  expect(button('Kart al').disabled).toBe(false);
  expect(button('Dur').disabled).toBe(false);
  expect(button('İkiye katla').disabled).toBe(false);
  expect(button('Ayır').disabled).toBe(true);
  // Surrender is off at this table: no button at all.
  expect(screen.queryByRole('button', { name: 'Teslim ol' })).toBeNull();
  // No insurance panel outside the insurance phase.
  expect(screen.queryByRole('group', { name: 'Sigorta' })).toBeNull();
  fireEvent.click(button('Kart al'));
  expect(action).toHaveBeenCalledWith('hit');
  fireEvent.keyDown(window, { key: 's' });
  expect(action).toHaveBeenCalledWith('stand');
  fireEvent.keyDown(window, { key: 'p' });
  expect(action).not.toHaveBeenCalledWith('split');
});

it('shows the opponent on turn and names their last move', () => {
  const view = render(<BlackjackTable {...ui(scene('opponent-turn'))} />);
  expect(screen.getByText('Zeynep (demo) oynuyor')).toBeTruthy();
  expect(spot('Zeynep (demo)').className).toContain('acting');
  expect(
    screen
      .getAllByRole('button')
      .filter((item) => ['Kart al', 'Dur', 'İkiye katla', 'Ayır'].includes(item.textContent!))
      .every((item) => (item as HTMLButtonElement).disabled),
  ).toBe(true);
  // Zeynep hits: the log names the move and her hand marks the new card.
  view.rerender(<BlackjackTable {...ui(scene('opponent-hit'))} />);
  expect(
    within(screen.getByLabelText('Son hamleler')).getByText('Zeynep (demo) kart aldı'),
  ).toBeTruthy();
  expect(within(spot('Zeynep (demo)')).getByRole('article').className).toContain('moved');
  expect(within(spot('Zeynep (demo)')).getByLabelText('El 1 · 9/19')).toBeTruthy();
});

it('opens the insurance panel exactly as legalActions allow it', () => {
  const action = vi.fn(async () => true);
  const first = render(<BlackjackTable {...ui(scene('insurance'), action)} />);
  // The felt names who is asked; the viewer's own answer sits with the other controls.
  expect(within(screen.getByRole('group', { name: 'Sigorta' })).queryByRole('button')).toBeNull();
  const panel = screen.getByRole('group', { name: 'Sigorta kararı' });
  expect(
    within(panel).getByText('Sigorta 50 fiş. Krupiye blackjack yaparsa 2:1 öder.'),
  ).toBeTruthy();
  fireEvent.click(within(panel).getByRole('button', { name: 'Sigorta al' }));
  expect(action).toHaveBeenCalledWith('insurance');
  // Hit/stand are not offered while the prompt is open.
  expect(screen.queryByRole('button', { name: 'Kart al' })).toBeNull();
  // No hand is highlighted until play starts.
  expect(document.querySelector('.bj-hand.active')).toBeNull();
  first.unmount();

  render(<BlackjackTable {...ui(scene('insurance-decline-only'))} />);
  const short = screen.getByRole('group', { name: 'Sigorta kararı' });
  const take = within(short).getByRole<HTMLButtonElement>('button', { name: 'Sigorta al' });
  expect(take.disabled).toBe(true);
  expect(take.title).toBe('Fişin sigortaya yetmiyor');
  expect(
    within(short).getByRole<HTMLButtonElement>('button', { name: 'Sigorta alma' }).disabled,
  ).toBe(false);
  cleanup();

  render(<BlackjackTable {...ui(scene('insurance-other'))} />);
  const waiting = screen.getByRole('group', { name: 'Sigorta' });
  expect(within(waiting).queryByRole('button')).toBeNull();
  expect(screen.queryByRole('group', { name: 'Sigorta kararı' })).toBeNull();
  expect(within(waiting).getByText('Sigorta soruluyor · Ali (demo)')).toBeTruthy();
});

it('settles the round: dealer revealed, outcomes per hand, nets and the chip bet panel', () => {
  const action = vi.fn(async () => true);
  render(<BlackjackTable {...ui(scene('round-end'), action)} />);
  const dealer = screen.getByLabelText('Krupiyenin kartları');
  expect(within(dealer).queryByRole('button', { name: 'Kapalı kart' })).toBeNull();
  const summary = screen.getByRole('region', { name: 'El sonucu' });
  expect(within(summary).getByText('Krupiye 17')).toBeTruthy();
  expect(within(summary).getByText('+200 fiş · Kazandı · Kazandı')).toBeTruthy();
  expect(within(spot('Ece (demo)')).getByText('+200')).toBeTruthy();
  expect(within(spot('Ali (demo)')).getByText('-100')).toBeTruthy();
  // Bets as chip stacks: 100 = one black chip; a win pays a matching stack.
  const stacks = within(spot('Ece (demo)')).getAllByRole('img', { name: '100 fiş' });
  expect(stacks.length).toBe(4);
  expect(stacks[0].querySelectorAll('.bj-chip.bj-v100')).toHaveLength(1);
  // Next bet: even chips only, clear and send.
  fireEvent.click(screen.getByRole('button', { name: 'Temizle' }));
  fireEvent.click(screen.getByRole('button', { name: '50 fiş ekle' }));
  fireEvent.click(screen.getByRole('button', { name: '10 fiş ekle' }));
  fireEvent.click(screen.getByRole('button', { name: 'Bahsi belirle' }));
  expect(action).toHaveBeenCalledWith('bet', { amount: 60 });
});

it('flips the hole card in place when the round settles, and pays winners with chips', () => {
  const view = render(<BlackjackTable {...ui(scene('opponent-turn'))} />);
  const hole = screen.getByLabelText('Krupiyenin kartları').children[1];
  expect(hole.className).toContain('hole');
  view.rerender(<BlackjackTable {...ui(scene('round-end'))} />);
  const revealed = screen.getByLabelText('Krupiyenin kartları').children[1];
  expect(revealed).toBe(hole);
  expect(revealed.className).toContain('flip');
  expect(within(revealed as HTMLElement).getByRole('button', { name: 'Sinek 8' })).toBeTruthy();
  // Lost bets slide to the dealer, wins get a paid stack sliding in.
  expect(within(spot('Ali (demo)')).getByRole('img', { name: '100 fiş' }).className).toContain(
    'collect animate',
  );
  expect(document.querySelectorAll('.bj-chips.pay.animate')).toHaveLength(3);
});

it('gives a spectator every hand and no controls', () => {
  render(<BlackjackTable {...ui(scene('spectator'), undefined, 'self')} />);
  expect(within(spot('Can (demo)')).getAllByRole('article')).toHaveLength(2);
  expect(within(spot('Ali (demo)')).getAllByRole('article')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Kart al' })).toBeNull();
  expect(screen.queryByRole('group', { name: 'Sonraki el bahsi' })).toBeNull();
  // Still shows whose hand is being played.
  expect(spot('Can (demo)').className).toContain('acting');
});

it('renders in English', async () => {
  vi.resetModules();
  globalThis.__roomsLocale = 'en';
  const { BlackjackTable: Table } =
    await import('../apps/desktop/src/games/blackjack/BlackjackTable');
  render(<Table {...ui(scene('your-turn'))} />);
  expect(screen.getByRole('button', { name: 'Hit' })).toBeTruthy();
  expect(screen.getByText('Your turn · Hand 2')).toBeTruthy();
  expect(screen.getByText('DEALER')).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/[çğıöşüİ]/);
});

it('totals soft hands as low/high and breaks bets into coloured chips', () => {
  const c = (rank: number) => ({ id: `x-${rank}`, suit: 'spades', rank });
  expect(totalLabel([c(14), c(6)])).toBe('7/17');
  expect(totalLabel([c(14), c(6)], true)).toBe('17');
  expect(totalLabel([c(14), c(13)])).toBe('21');
  expect(handTotal([c(14), c(14), c(9)]).best).toBe(21);
  expect(handTotal([c(10), c(6), c(9)]).best).toBe(25);
  expect(chipStack(160)).toEqual([100, 25, 25, 5, 5]);
  expect(chipStack(2)).toEqual([1, 1]);
});

it('derives moves from two views: split, double, stand', () => {
  const before = scene('opponent-turn');
  const next = structuredClone(before);
  const players = next.view.players as {
    hands: { bet: number; cards: unknown[]; state: string }[];
  }[];
  players[2].hands[0].state = 'stood';
  expect(blackjackMoves(before, next)).toEqual([{ kind: 'stand', userId: 'demo-zeynep', hand: 0 }]);
  players[2].hands[0].state = 'playing';
  players[2].hands[0].bet = 200;
  players[2].hands[0].cards.push({ id: 'c', suit: 'clubs', rank: 2 });
  expect(blackjackMoves(before, next)[0].kind).toBe('double');
});

it('sends the table switches as game.create options the server parses', () => {
  const command = {
    type: 'game.create' as const,
    game: 'blackjack' as const,
    ...blackjackCreate.command({ ...blackjackCreate.defaults, surrender: true }),
  };
  expect(command.options).toEqual({ insurance: true, surrender: true });
  expect(
    commandSchema.safeParse({
      protocolVersion: 1,
      commandId: '7c4a52a6-6f7e-4f5c-9a77-0d6f5c3f2b11',
      expectedRevision: 0,
      command,
    }).success,
  ).toBe(true);
  expect(blackjackModule.parseOptions(command.options)).toEqual({
    insurance: true,
    surrender: true,
  });
  // The playing table reads the same switches from view.rules.
  const rows = blackjackGame.ruleRows(scene('your-turn'));
  expect(rows.find(([label]) => label === 'Sigorta')?.[1]).toContain('Açık');
  expect(rows.find(([label]) => label === 'Teslim')?.[1]).toBe('Kapalı');
});
