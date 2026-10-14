// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import CinemaPlayback from '../apps/desktop/src/CinemaPlayback';
import { clearCinemaSession, useCinemaSession } from '../apps/desktop/src/cinema-session';
import { miniPlaybackFixtureVariant } from '../apps/desktop/src/dev/mini-playback-fixture';

const pause = vi.fn(),
  load = vi.fn(),
  mic = vi.fn(async () => {});
vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => ({
    status: 'connected',
    muted: false,
    roomName: 'Salon',
    participants: [],
    tracks: [],
  }),
  toggleMic: () => mic(),
}));
const source = {
  url: 'rooms-media://e65709dd-7fa1-4dbb-a7b5-ce0c7777a034/video',
  name: 'Owned source',
};
beforeEach(() => {
  vi.clearAllMocks();
  window.rooms = { releaseMedia: vi.fn(async () => {}) } as unknown as NonNullable<Window['rooms']>;
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: load });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn(async () => {}),
  });
  useCinemaSession.setState({ media: source, choosing: false });
});
afterEach(() => {
  cleanup();
  clearCinemaSession();
});
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/chat']}>
      <Link to="/cinema?view=personal">Main player</Link>
      <Link to="/chat">Chat</Link>
      <CinemaPlayback notify={vi.fn()} />
    </MemoryRouter>,
  );
describe('S30 persistent miniature playback', () => {
  it('hides the miniature without stopping/revoking/reloading the source and restores it after return', () => {
    const { container } = mount();
    const video = container.querySelector('video')!;
    video.currentTime = 137;
    const loads = load.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Küçük oynatıcıyı gizle' }));
    expect(container.querySelector('.cinema-mini-hidden')).not.toBeNull();
    expect(container.querySelector('video')).toBe(video);
    expect(video.currentTime).toBe(137);
    expect(useCinemaSession.getState().media).toBe(source);
    expect(pause).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(loads);
    fireEvent.click(screen.getByText('Main player'));
    fireEvent.click(screen.getByText('Chat'));
    expect(container.querySelector('.cinema-mini-hidden')).toBeNull();
    expect(container.querySelector('video')).toBe(video);
  });
  it('collapses/expands only presentation and retains the current video and voice operation', async () => {
    const { container } = mount();
    const video = container.querySelector('video');
    fireEvent.click(screen.getByRole('button', { name: 'Kompakt oynatıcıya geç' }));
    expect(container.querySelector('.cinema-mini-collapsed')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mikrofonu kapat' }));
    expect(mic).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Küçük oynatıcıyı büyüt' }));
    expect(container.querySelector('.cinema-mini-collapsed')).toBeNull();
    expect(container.querySelector('video')).toBe(video);
    expect(pause).not.toHaveBeenCalled();
    await act(async () => {});
  });
  it('rejects unlisted development variants', () => {
    expect(miniPlaybackFixtureVariant('')).toBe('default');
    for (const value of ['default', 'compact', 'personal', 'live'])
      expect(miniPlaybackFixtureVariant(value)).toBe(value);
    expect(() => miniPlaybackFixtureVariant('fake_native')).toThrow();
  });
});
