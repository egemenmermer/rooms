// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { GamePublicState } from '../packages/activity-protocol/src';
import { tavlaGame } from '../apps/desktop/src/games/tavla/entry';
import { tavlaFixtureGame, type TavlaScene } from '../apps/desktop/src/games/tavla/fixture';
import { pointSlot, type TavlaTableView } from '../apps/desktop/src/games/tavla/model';

afterEach(() => {
  cleanup();
  globalThis.__roomsLocale = 'tr';
});

const Table = tavlaGame.Table!;

/** Renders the table like TableShell does, with `can` following the server's legalActions. */
function renderScene(scene: TavlaScene, viewer = 'ece') {
  const game = tavlaFixtureGame(scene, viewer),
    legal = (game.view.legalActions as string[]) ?? [],
    own = game.seats.find((seat) => seat.userId === viewer);
  const action = vi.fn(async () => true);
  const can = (name: string) => !!own && own.seat === game.turn && legal.includes(name);
  const utils = render(
    <Table game={game} userId={viewer} can={can} action={action} timer={30} busy={false} />,
  );
  return { ...utils, game, action, view: game.view as unknown as TavlaTableView };
}

const button = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
const point = (container: HTMLElement, index: number) =>
  container.querySelector(`[data-point="${index}"]`) as SVGGElement;

it('maps points so the viewer’s home board is bottom right', () => {
  expect(pointSlot(0, 0)).toEqual({ row: 'bottom', col: 11 });
  expect(pointSlot(11, 0)).toEqual({ row: 'bottom', col: 0 });
  expect(pointSlot(12, 0)).toEqual({ row: 'top', col: 0 });
  expect(pointSlot(23, 0)).toEqual({ row: 'top', col: 11 });
  // Seat 1 sees the mirror: its home (18..23) is bottom right too.
  expect(pointSlot(23, 1)).toEqual({ row: 'bottom', col: 11 });
  expect(pointSlot(0, null)).toEqual(pointSlot(0, 0));
});

it('opening roll: only "Açılış zarını at" is enabled', () => {
  const { action } = renderScene('opening');
  expect(button('Açılış zarını at')).toHaveProperty('disabled', false);
  expect(button('Geri al')).toHaveProperty('disabled', true);
  expect(button('Onayla')).toHaveProperty('disabled', true);
  fireEvent.click(button('Açılış zarını at'));
  expect(action).toHaveBeenCalledWith('roll');
  expect(screen.getByLabelText('Maç skoru').textContent).toContain('0 – 0');
  expect(screen.getByLabelText('Maç skoru').textContent).toContain("5'e");
});

it('your move: a checker highlights exactly its legal targets and moves there', () => {
  const { container, view, action } = renderScene('yourMove');
  expect(view.dice).toEqual([5, 3]);
  const sources = [...new Set(view.legalMoves.map((step) => step.from))];
  for (let index = 0; index < 24; index++)
    expect(point(container, index).classList.contains('source')).toBe(sources.includes(index));
  const from = sources.find((source) => typeof source === 'number') as number;
  fireEvent.click(point(container, from));
  const expected = view.legalMoves.filter((step) => step.from === from).map((step) => step.to);
  for (let index = 0; index < 24; index++)
    expect(point(container, index).classList.contains('target')).toBe(expected.includes(index));
  expect(point(container, from).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(point(container, expected[0] as number));
  expect(action).toHaveBeenCalledWith('move', { payload: { from, to: expected[0] } });
  expect(button('Zar at')).toHaveProperty('disabled', true);
  expect(button('Geri al')).toHaveProperty('disabled', true);
  expect(button('Onayla')).toHaveProperty('disabled', true);
});

it('a real mouse click onto your own point moves there (pointer events included)', () => {
  const { container, view, action } = renderScene('yourMove');
  const step = view.legalMoves.find(
    (move) =>
      typeof move.from === 'number' &&
      typeof move.to === 'number' &&
      view.points[move.to].seat === 0,
  )!;
  const press = (node: Element) => {
    fireEvent.pointerDown(node);
    fireEvent.pointerUp(node);
    fireEvent.click(node);
  };
  press(point(container, step.from as number));
  press(point(container, step.to as number));
  expect(action).toHaveBeenCalledTimes(1);
  expect(action).toHaveBeenCalledWith('move', { payload: { from: step.from, to: step.to } });
});

it('dragging a checker onto a lit point moves it once', () => {
  const { container, view, action } = renderScene('yourMove');
  const step = view.legalMoves.find((move) => typeof move.from === 'number')!;
  fireEvent.pointerDown(point(container, step.from as number));
  fireEvent.pointerUp(point(container, step.to as number));
  expect(action).toHaveBeenCalledTimes(1);
  expect(action).toHaveBeenCalledWith('move', { payload: { from: step.from, to: step.to } });
});

it('an opening tie is explained', () => {
  renderScene('openingTie');
  expect(screen.getByText(/Zarlar eşit geldi \(4\)/)).toBeTruthy();
  expect(button('Açılış zarını at')).toHaveProperty('disabled', false);
});

it('undo and confirm follow legalActions', () => {
  renderScene('yourMovePartial');
  expect(button('Geri al')).toHaveProperty('disabled', false);
  expect(button('Onayla')).toHaveProperty('disabled', true);
  cleanup();
  const { action } = renderScene('yourConfirm');
  expect(button('Geri al')).toHaveProperty('disabled', false);
  expect(button('Onayla')).toHaveProperty('disabled', false);
  fireEvent.click(button('Onayla'));
  expect(action).toHaveBeenCalledWith('confirm');
});

it('opponent’s last move stays visible as arrows until you roll', () => {
  const { container, view } = renderScene('opponentLast');
  expect(view.lastTurn?.seat).toBe(1);
  expect(container.querySelectorAll('.tv-trail path')).toHaveLength(view.lastTurn!.moves.length);
  expect(container.querySelectorAll('.tv-checker.ghost').length).toBeGreaterThan(0);
  expect(screen.getByLabelText('Son hamleler').textContent).toContain('Osman');
  expect(button('Zar at')).toHaveProperty('disabled', false);
  expect(container.querySelectorAll('.tv-point.source')).toHaveLength(0);
});

it('opponent’s turn: no controls enabled, their live steps drawn, no targets lit', () => {
  const { container, view } = renderScene('opponentMoving');
  expect(view.turn).toBe(1);
  expect(view.legalMoves.length).toBeGreaterThan(0);
  expect(container.querySelectorAll('.tv-point.source, .tv-point.target')).toHaveLength(0);
  expect(container.querySelectorAll('.tv-trail path')).toHaveLength(view.moves.length);
  for (const name of ['Zar at', 'Geri al', 'Onayla'])
    expect(button(name)).toHaveProperty('disabled', true);
  expect(screen.getByRole('status', { name: '' }).textContent ?? '').toBeTruthy();
  expect(container.querySelector('.tv-seat.top')?.classList.contains('turn')).toBe(true);
});

it('bar entry: only the bar is a source and its targets are entry points', () => {
  const { container, view, action } = renderScene('bar');
  expect(view.bar[0]).toBe(1);
  expect(container.querySelectorAll('.tv-point.source')).toHaveLength(0);
  const bar = container.querySelector('.tv-bar-stack.source') as SVGGElement;
  expect(bar).not.toBeNull();
  // The only source is preselected: entry points light up at once.
  const lit = [...container.querySelectorAll('.tv-point.target')].map((node) =>
    Number(node.getAttribute('data-point')),
  );
  expect(lit.sort()).toEqual([...new Set(view.legalMoves.map((step) => step.to as number))].sort());
  expect(lit.every((index) => index >= 18)).toBe(true);
  fireEvent.click(point(container, lit[0]));
  expect(action).toHaveBeenCalledWith('move', { payload: { from: 'bar', to: lit[0] } });
});

it('a passed roll says "Oynayacak hamle yok"', () => {
  const { view } = renderScene('passed');
  expect(view.lastTurn).toMatchObject({ seat: 0, passed: true });
  expect(screen.getAllByText(/Oynayacak hamle yok/).length).toBeGreaterThan(0);
  expect(button('Zar at')).toHaveProperty('disabled', true);
});

it('bear-off: the tray is a target and sends to "off"', () => {
  const { container, action } = renderScene('bearOff');
  const from = Number(container.querySelector('.tv-point.source')?.getAttribute('data-point'));
  fireEvent.click(point(container, from));
  const tray = container.querySelector('[data-tray="own"]') as SVGGElement;
  expect(tray.classList.contains('target')).toBe(true);
  fireEvent.click(tray);
  expect(action).toHaveBeenCalledWith('move', { payload: { from, to: 'off' } });
});

it('round end: summary shows the mars and the match score', () => {
  const { view } = renderScene('roundEnd');
  expect(view.series?.previous?.result).toMatchObject({ winner: 0, mars: true, points: 2 });
  const summary = screen.getByText('Mars! (2 puan)').closest('section')!;
  expect(within(summary).getByText(/Eli Ece kazandı/)).toBeTruthy();
  expect(screen.getByLabelText('Maç skoru').textContent).toContain('2 – 0');
  // Seats take turns opening the rounds: Osman rolls first in round 2.
  expect(screen.getByText('Osman açılış zarını atıyor.')).toBeTruthy();
  expect(button('Açılış zarını at')).toHaveProperty('disabled', true);
});

it('match end: winner named, no move controls', () => {
  const { game } = renderScene('matchEnd');
  expect(game.status).toBe('finished');
  expect(screen.getByText(/Maçı Ece kazandı/)).toBeTruthy();
  expect(screen.getByLabelText('Maç skoru').textContent).toContain('3 – 0');
  // The shell's result strip takes the dock; no dead move buttons stay under it.
  expect(screen.queryByRole('button', { name: /Zar at|Geri al|Onayla/ })).toBeNull();
});

it('spectator: board and score, no controls and no highlights', () => {
  const { container } = renderScene('yourMove', 'zeynep');
  expect(screen.queryByRole('button', { name: /Zar at|Geri al|Onayla/ })).toBeNull();
  expect(container.querySelectorAll('.tv-point.source, .tv-point.target')).toHaveLength(0);
  expect(screen.getByText(/Ece açılış|Ece oynuyor/)).toBeTruthy();
});

it('reads in English', async () => {
  vi.resetModules();
  globalThis.__roomsLocale = 'en';
  const { tavlaGame: english } = await import('../apps/desktop/src/games/tavla/entry');
  const { tavlaFixtureGame: scene } = await import('../apps/desktop/src/games/tavla/fixture');
  const EnglishTable = english.Table!;
  render(
    <EnglishTable
      game={scene('roundEnd')}
      userId="ece"
      can={(name) => name === 'roll'}
      action={vi.fn(async () => true)}
      timer={null}
      busy={false}
    />,
  );
  expect(screen.getByText('Gammon! (2 points)')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Roll opening die/ })).toHaveProperty(
    'disabled',
    false,
  );
});

it('table rules and history follow the match options', () => {
  const game = tavlaFixtureGame('yourMove') as GamePublicState;
  expect(tavlaGame.ruleRows(game)[0]).toEqual(['Maç', '5 puan']);
  expect(tavlaGame.create?.command({ matchTo: 7, starterRerolls: true })).toEqual({
    options: { matchTo: 7, starterRerolls: true },
  });
  const entry = {
    hand: 1,
    endedAt: 0,
    result: { totals: [3, 1], winners: [0], rounds: [{ points: [2, 0], winners: [0] }] },
    seats: [
      { seat: 0, position: 0, userId: 'ece', name: 'Ece', bot: false },
      { seat: 1, position: 1, userId: 'osman', name: 'Osman', bot: false },
    ],
  };
  expect(tavlaGame.historyResult?.(entry.result, entry, 'ece')).toBe('3 puan');
});

it('shows a loading state until the round view arrives', () => {
  const game = { ...tavlaFixtureGame('opening'), view: { legalActions: [] } } as GamePublicState;
  render(
    <Table game={game} userId="ece" can={() => false} action={vi.fn()} timer={null} busy={false} />,
  );
  expect(screen.getByRole('status').textContent).toContain('Tavla tahtası hazırlanıyor…');
});
