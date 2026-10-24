// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
const f = vi.hoisted(() => ({
  voice: { status: 'connected', channelId: 'room', participants: [] } as Record<string, unknown>,
  activity: { room: null as unknown },
  dj: vi.fn(),
  cinema: { available: false, status: null, hallId: null } as Record<string, unknown>,
}));
vi.mock('../apps/desktop/src/cinema/cinema-status', () => ({ useCommunityCinema: () => f.cinema }));
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
  f.cinema = { available: false, status: null, hallId: null };
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

it('keeps screen sharing unavailable until a voice room is joined, and leaves the assistant out of the launcher', () => {
  f.voice = { status: 'idle', channelId: null, participants: [] };
  mount(false);
  const screenShare = screen.getByRole('button', { name: /Ekran paylaş/ }) as HTMLButtonElement;
  expect(screenShare.disabled).toBe(true);
  expect(screenShare.textContent).toContain('Önce bir ses odasına katıl.');
  expect(screen.getByRole('button', { name: /DJ Recep/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Asistan/ })).toBeNull();
});

it('puts what is already running in the room first', () => {
  f.activity = { room: { primary: { activity: 'holdem', title: 'holdem' } } };
  mount();
  fireEvent.click(screen.getByRole('button', { name: /Şu an odada Texas Hold’em/ }));
  expect(screen.getByTestId('route').textContent).toBe('/games');
});

const highlights = () =>
  [...document.querySelectorAll('.appdir-featured .appdir-card strong')].map((n) => n.textContent);

it('offers the Sinema hall only where the community has one, and features it', () => {
  mount(false);
  expect(screen.queryByRole('button', { name: /Sinema/ })).toBeNull();
  expect(highlights()).toEqual(['Texas Hold’em', '101 Okey', 'Beyaz tahta', 'Anket']);
  const search = screen.getByRole('textbox', { name: 'Uygulama ve etkinlik ara' });
  fireEvent.change(search, { target: { value: 'sinema' } });
  expect(screen.getByText('“sinema” için bir şey bulunamadı.')).toBeTruthy();
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(screen.getByTestId('route').textContent).toBe('/chat');
  expect(onClose).not.toHaveBeenCalled();
  cleanup();

  // The owner sees it before a hall exists: the hall page is where it is set up.
  f.cinema = { available: true, status: { isOwner: true }, hallId: null };
  mount(false);
  expect(highlights()).toEqual(['Sinema salonu', 'Texas Hold’em', '101 Okey', 'Beyaz tahta']);
  fireEvent.change(screen.getByRole('textbox', { name: 'Uygulama ve etkinlik ara' }), {
    target: { value: 'iptv' },
  });
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
    expect.stringContaining('Sinema salonu'),
  ]);
  fireEvent.click(screen.getByRole('button', { name: /Sinema salonu/ }));
  expect(screen.getByTestId('route').textContent).toBe('/cinema');
  expect(onClose).toHaveBeenCalled();
  cleanup();

  // A member with no hall to watch is not offered one.
  f.cinema = { available: true, status: { isOwner: false }, hallId: null };
  mount(false);
  expect(screen.queryByRole('button', { name: /Sinema/ })).toBeNull();
});

it('sends an old-cinema session from an older client to the launcher that explains it', () => {
  f.activity = { room: { primary: { activity: 'youtube', title: 'Birlikte izle' } } };
  const opened = vi.fn();
  window.addEventListener('rooms:open-activity-launcher', opened);
  mount();
  fireEvent.click(screen.getByRole('button', { name: /Şu an odada Birlikte izle Eski Sinema/ }));
  window.removeEventListener('rooms:open-activity-launcher', opened);
  expect(opened).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalled();
  expect(screen.getByTestId('route').textContent).toBe('/chat');
});
