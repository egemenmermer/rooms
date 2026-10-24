// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GamePublicState } from '../packages/activity-protocol/src';
import { okey101Fixture, type Okey101Scene } from '../apps/desktop/src/games/okey101/fixture';
import { ReferenceOkey } from '../apps/desktop/src/games/okey101/OkeyTable';
import { OkeyHistory } from '../apps/desktop/src/games/okey101/OkeyHistory';
import type { TableUI } from '../apps/desktop/src/games/shared/table-ui';

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

function ui(game: GamePublicState, userId: string | undefined) {
  const legal = (game.view.legalActions as string[]) ?? [];
  const action = vi.fn(async () => true);
  const props: TableUI = {
    game,
    userId,
    can: (name) => !!userId && legal.includes(name),
    action: action as TableUI['action'],
    timer: game.status === 'playing' ? 27 : null,
    busy: false,
  };
  return { props, action };
}
const show = (scene: Okey101Scene, edit?: (game: GamePublicState) => void) => {
  const viewer = scene === 'spectator' ? undefined : 'ece';
  const game = okey101Fixture(scene, viewer);
  edit?.(game);
  const { props, action } = ui(game, viewer);
  return { action, props, ...render(<ReferenceOkey {...props} />) };
};
const rack = () => screen.getByRole('group', { name: 'Istaka' });
const rackTiles = () =>
  within(rack())
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))
    .filter((label) => label !== 'Seçili taşı buraya taşı');
const pick = (name: string, index = 0) =>
  fireEvent.click(within(rack()).getAllByRole('button', { name })[index]);
const pileOf = (text: string | RegExp) => screen.getByText(text).parentElement!;

describe('101 Okey table', () => {
  it('your draw turn: stock, the left neighbour’s tile and the gösterge are the moves', () => {
    const { action } = show('draw');
    expect(rackTiles()).toHaveLength(21);
    // The okey keeps its face with a mark; the sahte okey is the ★ tile.
    const okey = within(rack()).getAllByRole('button', { name: 'Okey · Sarı 8' })[0];
    expect(okey.textContent).toContain('8');
    expect(okey.querySelector('.o1-okey-mark')).toBeTruthy();
    expect(
      within(rack()).getByRole('button', { name: 'Sahte okey · Sarı 8' }).textContent,
    ).toContain('★');
    // Seats counter-clockwise: Osman (next) on the right, Ayşe on top, Can on the left.
    expect(document.querySelector('.o1-seat.right')!.textContent).toContain('Osman');
    expect(document.querySelector('.o1-seat.top')!.textContent).toContain('Ayşe');
    expect(document.querySelector('.o1-seat.left')!.textContent).toContain('Can');
    // Every seat uses the shared SeatAvatar; the turn ring sits on the own (bottom) seat.
    expect(document.querySelectorAll('.o1-seat .rg-seat-avatar')).toHaveLength(4);
    expect(document.querySelector('.o1-seat.bottom .rg-seat-avatar.turn')).toBeTruthy();
    expect(document.querySelector('.o1-pile.bottom-left')!.textContent).toContain('Can');
    fireEvent.click(screen.getByRole('button', { name: 'Kapalı taş çek · 38 taş' }));
    expect(action).toHaveBeenLastCalledWith('draw', undefined);
    fireEvent.click(
      within(pileOf(/Can Abdurrahmanoğlu Uzunisim attı/)).getByRole('button', {
        name: 'Kırmızı 5',
      }),
    );
    expect(action).toHaveBeenLastCalledWith('draw', { cardId: 'discard' });
    expect(
      (within(pileOf('Osman attı')).getByRole('button', { name: 'Mavi 11' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    // Gösterge is legal in the draw stage too and sends the twin.
    fireEvent.click(screen.getByRole('button', { name: 'Göstergeyi göster' }));
    expect(action).toHaveBeenLastCalledWith('gosterge', { cardId: 'yellow-7-1' });
    // Opened melds sit on the table with their owner; the okey shows the value it stands for.
    const melds = screen.getByLabelText('Osman perleri');
    expect(within(melds).getByLabelText('Okey · Mavi 6 yerine')).toBeTruthy();
    // Meld tiles are drawn inside the meld button, never as nested buttons.
    expect(document.querySelector('button button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Seçili taşı at' })).toBeNull();
  });

  it('the gösterge button follows legalActions', () => {
    show('discard', (game) => {
      game.view.legalActions = ['discard', 'open', 'open-pairs'];
    });
    expect(screen.queryByRole('button', { name: 'Göstergeyi göster' })).toBeNull();
    cleanup();
    show('discard');
    expect(screen.getByRole('button', { name: 'Göstergeyi göster' })).toBeTruthy();
  });

  it('opening with okeys: the player chooses run or group and meldKinds is sent', () => {
    const { action } = show('discard');
    pick('Kırmızı 7');
    pick('Okey · Sarı 8', 0);
    pick('Okey · Sarı 8', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Seçimi seri yap' }));
    const choice = screen.getByRole('group', { name: 'Okey nasıl okunsun? · Per 1' });
    expect(
      within(choice).getByRole('button', { name: 'Sıralı' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(within(choice).getByRole('button', { name: 'Aynı sayı' }));
    for (const color of ['Siyah', 'Mavi', 'Sarı']) {
      for (const value of color === 'Sarı' ? [10, 11, 12] : [11, 12, 13]) pick(`${color} ${value}`);
      fireEvent.click(screen.getByRole('button', { name: 'Seçimi seri yap' }));
    }
    // 7-7-7 (21) + 36 + 36 + 33.
    expect(screen.getByText('126 puan · Hazır')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Seri aç' }));
    expect(action).toHaveBeenLastCalledWith('open', {
      melds: [
        ['red-7-0', 'yellow-8-0', 'yellow-8-1'],
        ['black-11-0', 'black-12-0', 'black-13-0'],
        ['blue-11-0', 'blue-12-0', 'blue-13-0'],
        ['yellow-10-0', 'yellow-11-0', 'yellow-12-0'],
      ],
      meldKinds: ['group', null, null, null],
    });
  });

  it('dragging reorders the rack and is kept per round; Seri diz / Çift diz rearrange it', () => {
    const { action } = show('discard');
    const source = within(rack())
      .getByRole('button', { name: 'Kırmızı 7' })
      .closest('[data-cell]')!;
    const target = rack().querySelector('[data-cell="29"]')!;
    fireEvent.dragStart(source);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    expect(rackTiles().at(-1)).toBe('Kırmızı 7');
    const saved = JSON.parse(sessionStorage.getItem('rooms-101-rack:ece:0:ece')!);
    expect(saved[29]).toBe('red-7-0');
    fireEvent.click(screen.getByRole('button', { name: 'Çift diz' }));
    expect(rackTiles().slice(0, 2)).toEqual(['Mavi 2', 'Mavi 2']);
    fireEvent.click(screen.getByRole('button', { name: 'Seri diz' }));
    expect(rack().querySelector('[data-cell="3"]')!.getAttribute('data-tile')).toBeNull();
    // Taking the rack's sets drafts only valid melds, never the leftover block.
    fireEvent.click(screen.getByRole('button', { name: 'Istakadaki dizileri al' }));
    expect(screen.getAllByRole('button', { name: /^Grup \d+ kaldır$/ }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Hazır gruplardan biri geçersiz')).toBeNull();
    // Dropping a tile on your own corner discards it.
    fireEvent.dragStart(
      within(rack()).getByRole('button', { name: 'Mavi 6' }).closest('[data-cell]')!,
    );
    const corner = document.querySelector('[data-drop="discard"]')!;
    fireEvent.dragOver(corner);
    fireEvent.drop(corner);
    expect(action).toHaveBeenLastCalledWith('discard', { cardId: 'blue-6-0' });
  });

  it('opponent’s turn: the last discard is highlighted, the clock is on their seat, no control is live', () => {
    const { props, rerender, container } = show('opponent');
    const ayse = screen.getByRole('article', { name: 'Ayşe · Sırada' });
    expect(within(ayse).getByText('27')).toBeTruthy();
    expect(pileOf('Osman attı').querySelector('.o1-pile-top.last')).toBeTruthy();
    for (const name of ['Kapalı taş çek', 'Önceki taşı al'])
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelectorAll('.o1-pile .rx-tile:not(:disabled)')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Seri diz' })).toBeTruthy();
    // Ayşe draws from the stock: the move log says so.
    const next = structuredClone(props.game);
    (next.view.hands as { count: number }[])[2].count = 22;
    (next.view as Record<string, unknown>).stage = 'discard';
    rerender(<ReferenceOkey {...props} game={next} />);
    expect(screen.getByText('Ayşe ortadan çekti')).toBeTruthy();
  });

  it('round end: ending, multiplier, penalties and points', () => {
    show('finished');
    expect(screen.getByRole('heading', { name: 'Osman elden bitirdi' })).toBeTruthy();
    expect(screen.getByText('Cezalar ×2')).toBeTruthy();
    const penalties = screen.getByRole('list', { name: 'Cezalar ve bonuslar' });
    expect(within(penalties).getByText('İşlek taş attı')).toBeTruthy();
    expect(within(penalties).getByText('Göstergeyi gösterdi')).toBeTruthy();
    const rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toBe('EceAçmadı+101303');
    expect(rows[2].textContent).toBe('OsmanBitirdi—-101');
    expect(screen.queryByRole('group', { name: 'Istaka' })).toBeNull();
  });

  it('spectator: no rack and no controls', () => {
    show('spectator');
    expect(screen.queryByRole('group', { name: 'Istaka' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Göstergeyi göster' })).toBeNull();
    expect(
      screen.getAllByRole('button').every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
  });

  it('history shows the ending and the penalties', () => {
    const game = okey101Fixture('finished', 'ece');
    render(
      <OkeyHistory
        entry={{
          hand: 0,
          endedAt: 1,
          result: { ...game.view },
          seats: game.seats.map((seat) => ({ ...seat, position: seat.seat })),
        }}
      />,
    );
    expect(screen.getByText('Osman elden bitirdi · Cezalar ×2')).toBeTruthy();
    expect(screen.getByText('İşlek taş attı')).toBeTruthy();
  });
});

describe('101 Okey table in English', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.__roomsLocale = 'en';
  });
  afterEach(() => {
    globalThis.__roomsLocale = 'tr';
  });

  it('shows the table text in English', async () => {
    const { ReferenceOkey: Table } = await import('../apps/desktop/src/games/okey101/OkeyTable');
    const { okey101Fixture: fixture } = await import('../apps/desktop/src/games/okey101/fixture');
    const { props } = ui(fixture('draw', 'ece'), 'ece');
    render(<Table {...props} />);
    expect(screen.getByRole('button', { name: 'Sort runs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sort pairs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show the indicator' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'False okey · Yellow 8' })).toBeTruthy();
  });
});
