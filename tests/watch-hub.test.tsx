// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { RoomSnapshot } from '../packages/activity-protocol/src';
import Cinema from '../apps/desktop/src/Cinema';
const state = vi.hoisted(() => ({
  status: 'connected',
  tracks: [],
  participants: [],
  roomName: 'Test',
  channelId: 'room',
  sharing: false,
}));
const activity = vi.hoisted(() => ({
  status: 'connected' as const,
  room: null as RoomSnapshot | null,
  busy: false,
  error: null,
  serverOffsetMs: 0,
  send: vi.fn(async () => {}),
  refresh: vi.fn(async () => {}),
  clearError: vi.fn(),
}));
vi.mock('../apps/desktop/src/realtime', () => ({ useRealtime: () => state, stopScreen: vi.fn() }));
vi.mock('../apps/desktop/src/community', () => ({ useCommunity: () => ({ user: { id: 'me' } }) }));
vi.mock('../apps/desktop/src/Agent', () => ({ useCurrentRoom: () => 'room' }));
vi.mock('../apps/desktop/src/activity', () => ({ useActivityRoom: () => activity }));
vi.mock('../apps/desktop/src/RealSocial', () => ({ CommunityInvite: () => null }));
vi.mock('../apps/desktop/src/CinemaShareView', () => ({ CinemaShareView: () => null }));
vi.mock('../apps/desktop/src/CinemaYouTubeStage', () => ({
  CinemaYouTubeStage: ({ item }: { item: { media: { title: string } } }) => (
    <div data-testid="youtube-stage">{item.media.title}</div>
  ),
}));
vi.mock('../apps/desktop/src/VoiceAvatar', () => ({ VoiceAvatar: () => null }));
vi.mock('../apps/desktop/src/cinema-session', () => ({
  useCinemaSession: () => null,
  chooseCinemaMedia: vi.fn(),
}));
function Route() {
  return <output data-testid="route">{useLocation().pathname}</output>;
}
function mount() {
  return render(
    <MemoryRouter initialEntries={['/cinema']}>
      <Cinema notify={vi.fn()} />
      <Route />
    </MemoryRouter>,
  );
}
function room(patch: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    roomId: 'room',
    revision: 4,
    participants: [
      { userId: 'me', displayName: 'Ben', joinedAt: 1, lastSeenAt: 1, canControl: true },
      { userId: 'ece', displayName: 'Ece', joinedAt: 0, lastSeenAt: 1, canControl: true },
    ],
    primary: null,
    timeline: {
      playing: false,
      positionSec: 0,
      rate: 1,
      effectiveServerTimeMs: 0,
      epoch: 1,
      itemId: null,
    },
    queue: [],
    polls: [],
    whiteboard: [],
    ...patch,
  };
}
afterEach(() => {
  cleanup();
  state.status = 'connected';
  activity.room = null;
  activity.send.mockClear();
  localStorage.clear();
});
it('opens the closed curtain with YouTube, window sharing and personal media sources', () => {
  activity.room = room();
  mount();
  expect(screen.getByRole('heading', { name: 'Bugün ne izliyoruz?' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Medyam ve IPTV/ }));
  expect(screen.getByTestId('route').textContent).toBe('/media');
});
it('requests explicit window selection, only while in voice', () => {
  activity.room = room();
  const select = vi.fn();
  window.addEventListener('rooms:choose-capture', select);
  try {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: /Pencere paylaş/ }));
    expect(select).toHaveBeenCalledOnce();
    view.unmount();
    state.status = 'disconnected';
    mount();
    const button = screen.getByRole('button', { name: /Pencere paylaş/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(select).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener('rooms:choose-capture', select);
  }
});
it('puts the playing YouTube item on the screen and lets the host lock the remote', () => {
  activity.room = room({
    primary: {
      activity: 'youtube',
      title: 'Birlikte izle',
      hostUserId: 'me',
      startedAt: 1,
      state: 'live',
    },
    queue: [
      { id: 'a', addedBy: 'ece', media: { kind: 'youtube', videoId: 'aaaaaaaaaaa', title: 'İlk' } },
      {
        id: 'b',
        addedBy: 'me',
        media: { kind: 'youtube', videoId: 'bbbbbbbbbbb', title: 'İkinci' },
      },
    ],
    timeline: {
      playing: true,
      positionSec: 0,
      rate: 1,
      effectiveServerTimeMs: 0,
      epoch: 2,
      itemId: 'a',
    },
  });
  mount();
  expect(screen.getByTestId('youtube-stage').textContent).toBe('İlk');
  expect(screen.getByText('İkinci')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Kumanda herkeste/ }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Yalnızca ben ve izin verdiklerim/ }));
  expect(activity.send).toHaveBeenCalledWith({ type: 'session.control', mode: 'host' });
});
it('shows a locked remote to viewers and lets the host hand it to a seat', () => {
  const youtube = {
    primary: {
      activity: 'youtube' as const,
      title: 'Birlikte izle',
      hostUserId: 'ece',
      startedAt: 1,
      state: 'live' as const,
      controlMode: 'host' as const,
      controllers: [],
    },
  };
  activity.room = room(youtube);
  const view = mount();
  const chip = screen.getByRole('button', { name: /Kumanda hostta/ }) as HTMLButtonElement;
  expect(chip.disabled).toBe(true);
  view.unmount();
  activity.room = room({ ...youtube, primary: { ...youtube.primary, hostUserId: 'me' } });
  mount();
  fireEvent.click(screen.getByTitle('Ece'));
  fireEvent.click(screen.getByRole('menuitem', { name: /Kumandayı ver/ }));
  expect(activity.send).toHaveBeenCalledWith({
    type: 'session.permit',
    userId: 'ece',
    allowed: true,
  });
});
