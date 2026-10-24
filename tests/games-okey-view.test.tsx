// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GamePublicState } from '../packages/activity-protocol/src';
import { okeyFixture, type OkeyScene } from '../apps/desktop/src/games/okey/fixture';
import { OkeyClassicTable } from '../apps/desktop/src/games/okey/OkeyClassicTable';
import type { TableUI } from '../apps/desktop/src/games/shared/table-ui';
import { TableDockContext } from '../apps/desktop/src/games/shared/TableDock';

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

function ui(game: GamePublicState, userId: string | undefined = 'ece') {
  const legal = (game.view.legalActions as string[]) ?? [];
  const action = vi.fn(async () => true);
  const props: TableUI = {
    game,
    userId,
    can: (name) => !!userId && game.turn === 0 && legal.includes(name),
    action: action as TableUI['action'],
    timer: game.status === 'playing' ? 27 : null,
    busy: false,
  };
  return { props, action };
}
const show = (scene: OkeyScene, userId?: string) => {
  const { props, action } = ui(okeyFixture(scene), scene === 'spectator' ? undefined : userId);
  return { action, ...render(<OkeyClassicTable {...props} />) };
};
const rackTiles = () =>
  within(screen.getByRole('group', { name: 'Istaka' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))
    .filter((label) => label !== 'Seçili taşı buraya taşı');
const enabled = (name: string | RegExp) =>
  screen
    .queryAllByRole('button', { name })
    .filter((button) => !(button as HTMLButtonElement).disabled);

describe('classic Okey table', () => {
  it('your draw turn: stock and the left neighbour’s tile are the only moves', () => {
    const { action } = show('draw');
    expect(rackTiles()).toHaveLength(14);
    // The okey keeps its face with a mark, the sahte okey is the ★ tile.
    const okey = screen.getByRole('button', { name: 'Okey · Kırmızı 6' });
    expect(okey.textContent).toContain('6');
    expect(okey.querySelector('.ok-okey-mark')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sahte okey · Kırmızı 6' }).textContent).toContain(
      '★',
    );
    expect(screen.getByRole('button', { name: 'Kırmızı 5' })).toBeTruthy();
    expect(screen.getByText('31')).toBeTruthy();
    // Only draw controls; no discard or finish while drawing.
    expect(screen.queryByRole('button', { name: 'Seçili taşı at' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bitir' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Kapalı taş çek · 31 taş' }));
    expect(action).toHaveBeenLastCalledWith('draw', { payload: { from: 'stock' } });
    // Can (left) threw Sarı 8: clicking it takes it.
    const leftPile = screen.getByText(/Can Abdurrahmanoğlu Uzunisim attı/).parentElement!;
    fireEvent.click(within(leftPile).getByRole('button', { name: 'Sarı 8' }));
    expect(action).toHaveBeenLastCalledWith('draw', { payload: { from: 'discard' } });
    // Other piles are not takeable.
    const osmanPile = screen.getByText('Osman attı').parentElement!;
    expect(
      (within(osmanPile).getByRole('button', { name: 'Mavi 11' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(enabled('Önceki taşı al')).toHaveLength(1);
  });

  it('your discard turn: discard a selected tile or finish with the finishing tile', () => {
    const { action } = show('discard');
    expect(rackTiles()).toHaveLength(15);
    expect(screen.getByText('Bitirebilirsin: Sarı 13')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kapalı taş çek' })).toBeNull();
    expect(
      (screen.getByRole('button', { name: /Kapalı taş çek ·/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    const throwButton = screen.getByRole('button', { name: 'Seçili taşı at' }) as HTMLButtonElement;
    expect(throwButton.disabled).toBe(true);
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Istaka' })).getByRole('button', {
        name: 'Kırmızı 1',
      }),
    );
    expect(throwButton.disabled).toBe(false);
    fireEvent.click(throwButton);
    expect(action).toHaveBeenLastCalledWith('discard', { payload: { tileId: 'red-1-0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bitir' }));
    expect(action).toHaveBeenLastCalledWith('finish', { payload: { tileId: 'yellow-13-0' } });
  });

  it('opponent’s turn: their last discard stays visible and no control is enabled', () => {
    const { container } = show('opponent');
    expect(screen.getByRole('article', { name: 'Ayşe · Sırada' })).toBeTruthy();
    expect(screen.getByText('Osman Mavi 11 attı')).toBeTruthy();
    const osmanPile = screen.getByText('Osman attı').parentElement!;
    expect(osmanPile.querySelector('.ok-pile-top.last')).toBeTruthy();
    // Clock on the seat whose turn it is.
    expect(
      within(screen.getByRole('article', { name: 'Ayşe · Sırada' })).getByText('27'),
    ).toBeTruthy();
    for (const name of ['Kapalı taş çek', 'Önceki taşı al'])
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelectorAll('.ok-pile .rx-tile:not(:disabled)')).toHaveLength(0);
    // Arranging the rack is always allowed.
    expect(enabled('Seri diz')).toHaveLength(1);
  });

  it('round end: the winner’s open rack, the reason and the score line', () => {
    show('finished');
    expect(screen.getByRole('heading', { name: 'Osman okey atarak bitirdi' })).toBeTruthy();
    const rack = screen.getByLabelText('Osman ıstakası');
    expect(within(rack).getAllByRole('button')).toHaveLength(15);
    expect(within(rack).getByRole('button', { name: 'Sahte okey · Kırmızı 6' })).toBeTruthy();
    const rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toBe('Ece-414');
    expect(rows[2].textContent).toBe('Osman020');
    expect(screen.queryByRole('group', { name: 'Istaka' })).toBeNull();
  });

  it('spectator: no rack and no controls', () => {
    show('spectator');
    expect(screen.queryByRole('group', { name: 'Istaka' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Seri diz' })).toBeNull();
    expect(
      screen.getAllByRole('button').every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    expect(screen.getByText('Osman Mavi 11 attı')).toBeTruthy();
  });

  it('Çift diz and Seri diz reorder the rack; dragging moves a tile and is kept for the round', () => {
    show('draw');
    fireEvent.click(screen.getByRole('button', { name: 'Çift diz' }));
    expect(rackTiles().slice(0, 2)).toEqual(['Mavi 7', 'Mavi 7']);
    fireEvent.click(screen.getByRole('button', { name: 'Seri diz' }));
    expect(rackTiles().slice(0, 3)).toEqual(['Kırmızı 1', 'Kırmızı 2', 'Kırmızı 3']);
    const rack = screen.getByRole('group', { name: 'Istaka' });
    const source = within(rack).getByRole('button', { name: 'Kırmızı 1' }).closest('[data-cell]')!;
    const target = rack.querySelector('[data-cell="29"]')!;
    fireEvent.dragStart(source);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    expect(rackTiles().at(-1)).toBe('Kırmızı 1');
    expect(rack.querySelector('[data-cell="29"]')!.textContent).toContain('1');
    const saved = JSON.parse(sessionStorage.getItem('rooms-okey-rack:ece:0:ece')!);
    expect(saved[29]).toBe('red-1-0');
    // Keyboard path: select a tile, then pick an empty cell.
    fireEvent.click(within(rack).getByRole('button', { name: 'Kırmızı 2' }));
    fireEvent.click(within(rack).getAllByRole('button', { name: 'Seçili taşı buraya taşı' })[0]);
    expect(JSON.parse(sessionStorage.getItem('rooms-okey-rack:ece:0:ece')!)).not.toEqual(saved);
  });

  it('dropping a tile on your corner discards it', () => {
    const { action } = show('discard');
    const rack = screen.getByRole('group', { name: 'Istaka' });
    fireEvent.dragStart(
      within(rack).getByRole('button', { name: 'Mavi 4' }).closest('[data-cell]')!,
    );
    const corner = document.querySelector('[data-drop="discard"]')!;
    fireEvent.dragOver(corner);
    fireEvent.drop(corner);
    expect(action).toHaveBeenLastCalledWith('discard', { payload: { tileId: 'blue-4-0' } });
  });

  it('in the shell the rack and the moves sit in the dock; the felt keeps state and the latest move', () => {
    const dock = document.body.appendChild(document.createElement('div'));
    const { props, action } = ui(okeyFixture('draw'));
    const { container } = render(
      <TableDockContext.Provider value={dock}>
        <OkeyClassicTable {...props} />
      </TableDockContext.Provider>,
    );
    // The ıstaka and every move button are portalled into the shell's dock.
    const region = within(dock).getByRole('region', { name: 'Elin' });
    expect(within(region).getByRole('group', { name: 'Istaka' })).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: 'Kapalı taş çek' }));
    expect(action).toHaveBeenLastCalledWith('draw', { payload: { from: 'stock' } });
    expect(container.querySelector('.ok-rack')).toBeNull();
    // No rule chips over the felt (scoring is in the rules popover); the hand number is on the felt.
    expect(container.querySelector('.rx-badges')).toBeNull();
    expect(screen.queryByText('Geri sayım')).toBeNull();
    const felt = screen.getByRole('region', { name: 'Okey masası' });
    expect(within(felt).getByText('El 1')).toBeTruthy();
    // The latest move is a line on the felt, not a list under it.
    expect(within(felt).getByText('Can Abdurrahmanoğlu Uzunisim Sarı 8 attı')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Son hamleler' })).toBeNull();
    // Your seat is marked; the others are not.
    const own = screen.getByRole('article', { name: 'Ece · Sırada' });
    expect(own.className).toContain('own');
    expect(within(own).getByText('· sen')).toBeTruthy();
    expect(screen.getAllByText('· sen')).toHaveLength(1);
    dock.remove();
  });

  it('a spectator sees no “sen” seat, and a finished round never reads “El 0”', () => {
    show('spectator');
    expect(screen.queryByText('· sen')).toBeNull();
    cleanup();
    show('finished');
    expect(screen.queryByText('El 0')).toBeNull();
    expect(screen.getByText('El 1')).toBeTruthy();
  });
});

describe('classic Okey table in English', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.__roomsLocale = 'en';
  });
  afterEach(() => {
    globalThis.__roomsLocale = 'tr';
  });

  it('shows the table text in English', async () => {
    const { OkeyClassicTable: Table } =
      await import('../apps/desktop/src/games/okey/OkeyClassicTable');
    const { okeyFixture: fixture } = await import('../apps/desktop/src/games/okey/fixture');
    const { props } = ui(fixture('draw'));
    render(<Table {...props} />);
    expect(screen.getByRole('button', { name: 'Sort runs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sort pairs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'False okey · Red 6' })).toBeTruthy();
    expect(screen.getByText('Hand 1')).toBeTruthy();
    expect(screen.getByText('· you')).toBeTruthy();
    expect(screen.getByText('Can Abdurrahmanoğlu Uzunisim discarded Yellow 8')).toBeTruthy();
  });
});
