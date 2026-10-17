// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
const f = vi.hoisted(() => ({
  voice: { status: 'connected', channelId: 'room', participants: [] } as Record<string, unknown>,
  activity: { room: null as unknown },
  dj: vi.fn(),
}));
vi.mock('../apps/desktop/src/realtime', () => ({ useRealtime: () => f.voice }));
vi.mock('../apps/desktop/src/activity', () => ({ useActivityRoom: () => f.activity }));
vi.mock('../apps/desktop/src/MusicDJ', () => ({
  openMusicDJ: f.dj,
  openRoomActivity: (path: string, navigate: (path: string) => void) => navigate(path),
}));
import { AppDirectory } from '../apps/desktop/src/AppDirectory';
import { useCommunity } from '../apps/desktop/src/community';

function Where() {
  const location = useLocation();
  return <output data-testid="route">{location.pathname + location.search}</output>;
}
const onClose = vi.fn();
const mount = (apps = true) =>
  render(
    <MemoryRouter initialEntries={['/chat']}>
      <AppDirectory apps={apps} onClose={onClose} />
      <Where />
    </MemoryRouter>,
  );
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  f.voice = { status: 'connected', channelId: 'room', participants: [] };
  f.activity = { room: null };
  useCommunity.setState({ activeChannelId: 'room' });
});

it('lists apps, watch-together, games and tools, and opens a game straight at its table setup', () => {
  mount();
  for (const name of ['Uygulamalar', 'Birlikte izle', 'Kart oyunları', 'Masa oyunları', 'Araçlar'])
    expect(screen.getByRole('heading', { name })).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: /Batak/ })[0]!);
  expect(screen.getByTestId('route').textContent).toBe('/games?create=batak');
  expect(onClose).toHaveBeenCalled();
});

it('finds things by Turkish keywords and launches the first match with Enter', () => {
  mount();
  const search = screen.getByRole('textbox', { name: 'Uygulama ve etkinlik ara' });
  fireEvent.change(search, { target: { value: 'çizim' } });
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
    expect.stringContaining('Beyaz tahta'),
  ]);
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(screen.getByTestId('route').textContent).toBe('/together?tab=board');
  fireEvent.change(search, { target: { value: 'müzik' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(f.dj).toHaveBeenCalled();
});

it('keeps screen sharing unavailable until a voice room is joined, and hides bots when asked', () => {
  f.voice = { status: 'idle', channelId: null, participants: [] };
  mount(false);
  const screenShare = screen.getByRole('button', { name: /Ekran paylaş/ }) as HTMLButtonElement;
  expect(screenShare.disabled).toBe(true);
  expect(screenShare.textContent).toContain('Önce bir ses odasına katıl.');
  expect(screen.queryByRole('heading', { name: 'Uygulamalar' })).toBeNull();
});

it('puts what is already running in the room first', () => {
  f.activity = { room: { primary: { activity: 'holdem', title: 'holdem' } } };
  mount();
  fireEvent.click(screen.getByRole('button', { name: /Şu an odada Texas Hold’em/ }));
  expect(screen.getByTestId('route').textContent).toBe('/games');
});
