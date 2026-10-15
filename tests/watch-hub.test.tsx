// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Cinema from '../apps/desktop/src/Cinema';
const state = vi.hoisted(() => ({
  status: 'connected',
  tracks: [],
  participants: [],
  roomName: 'Test',
}));
vi.mock('../apps/desktop/src/realtime', () => ({ useRealtime: () => state, stopScreen: vi.fn() }));
vi.mock('../apps/desktop/src/community', () => ({ useCommunity: () => ({ user: { id: 'me' } }) }));
vi.mock('../apps/desktop/src/Agent', () => ({ useCurrentRoom: () => 'room' }));
vi.mock('../apps/desktop/src/activity', () => ({
  useActivityRoom: () => ({ status: 'connected', room: null }),
}));
vi.mock('../apps/desktop/src/RealSocial', () => ({ CommunityInvite: () => null }));
vi.mock('../apps/desktop/src/CinemaScreenStage', () => ({ CinemaScreenStage: () => null }));
vi.mock('../apps/desktop/src/VoiceAvatar', () => ({ VoiceAvatar: () => null }));
vi.mock('../apps/desktop/src/cinema-session', () => ({
  useCinemaSession: () => null,
  chooseCinemaMedia: vi.fn(),
}));
vi.mock('../apps/desktop/src/screen-handoff', () => ({ ScreenHandoffControls: () => null }));
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
afterEach(() => {
  cleanup();
  state.status = 'connected';
});
it('opens together YouTube independently of the legacy DJ entry and opens personal media', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Birlikte YouTube aç' }));
  expect(screen.getByTestId('route').textContent).toBe('/watch/youtube');
  fireEvent.click(screen.getByRole('button', { name: 'Medyamı aç' }));
  expect(screen.getByTestId('route').textContent).toBe('/media');
});
it('requests explicit source selection for an external player, only while in voice', () => {
  const select = vi.fn();
  window.addEventListener('rooms:choose-capture', select);
  try {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Uygulama penceresi seç' }));
    expect(select).toHaveBeenCalledOnce();
    view.unmount();
    state.status = 'disconnected';
    mount();
    const button = screen.getByRole('button', {
      name: 'Uygulama penceresi seç',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(select).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener('rooms:choose-capture', select);
  }
});
