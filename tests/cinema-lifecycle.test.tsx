// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';
import CinemaPlayback from '../apps/desktop/src/CinemaPlayback';
import {
  chooseCinemaMedia,
  clearCinemaSession,
  useCinemaSession,
} from '../apps/desktop/src/cinema-session';
import { useCommunity } from '../apps/desktop/src/community';

vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => ({ status: 'disconnected', participants: [], tracks: [] }),
  toggleMic: vi.fn(),
}));
const source = {
  url: 'rooms-media://e65709dd-7fa1-4dbb-a7b5-ce0c7777a034/video',
  name: 'Owned video.webm',
};
const release = vi.fn(async () => {});
const choose = vi.fn();
const pause = vi.fn();
const load = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.rooms = { chooseMedia: choose, releaseMedia: release } as unknown as NonNullable<
    Window['rooms']
  >;
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: load });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn(async () => {}),
  });
  useCinemaSession.setState({ media: null, choosing: false });
});
afterEach(() => {
  cleanup();
  clearCinemaSession();
});

function mount() {
  return render(
    <MemoryRouter initialEntries={['/cinema?view=personal']}>
      <Link to="/chat">Chat route</Link>
      <Link to="/cinema?view=queue">Queue route</Link>
      <Link to="/cinema?view=personal">Personal route</Link>
      <CinemaPlayback notify={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('persistent private Cinema lifecycle', () => {
  it('retains the exact video, playhead, source and native PiP through chat, queue and return', () => {
    useCinemaSession.setState({ media: source });
    const { container } = mount();
    const video = container.querySelector('video')!;
    video.currentTime = 137;
    Object.defineProperty(document, 'pictureInPictureElement', {
      configurable: true,
      value: video,
    });
    const exit = vi.fn(async () => {});
    document.exitPictureInPicture = exit;
    act(() => {
      video.dispatchEvent(new Event('enterpictureinpicture'));
    });
    const initialLoads = load.mock.calls.length;
    for (const route of ['Chat route', 'Queue route', 'Personal route']) {
      fireEvent.click(screen.getByText(route));
      expect(container.querySelector('video')).toBe(video);
      expect(video.currentTime).toBe(137);
      expect(video.getAttribute('src')).toBe(source.url);
      expect(document.pictureInPictureElement).toBe(video);
    }
    expect(load).toHaveBeenCalledTimes(initialLoads);
    expect(pause).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, value: null });
  });

  it('stops, detaches and revokes the source explicitly without a navigation side effect', () => {
    useCinemaSession.setState({ media: source });
    const { container } = mount();
    const video = container.querySelector('video')!;
    fireEvent.click(screen.getByText('Chat route'));
    fireEvent.click(screen.getByRole('button', { name: 'Oynatıcıya dön' }));
    fireEvent.click(screen.getByRole('button', { name: 'Oynatmayı bitir' }));
    expect(useCinemaSession.getState().media).toBeNull();
    expect(video.getAttribute('src')).toBeNull();
    expect(pause).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(source.url);
  });

  it('clears active playback when the identity changes', () => {
    useCinemaSession.setState({ media: source });
    mount();
    act(() => {
      useCommunity.setState({ serverUrl: 'https://other-instance.example' });
    });
    expect(useCinemaSession.getState().media).toBeNull();
    expect(release).toHaveBeenCalledWith(source.url);
  });

  it('preserves the existing source when the native picker is cancelled', async () => {
    useCinemaSession.setState({ media: source });
    choose.mockResolvedValueOnce(null);
    expect(await chooseCinemaMedia()).toBe(false);
    expect(useCinemaSession.getState().media).toBe(source);
    expect(release).not.toHaveBeenCalled();
  });

  it('revokes a late picker capability after an identity/stop invalidation', async () => {
    let resolve!: (value: typeof source) => void;
    choose.mockImplementationOnce(
      () =>
        new Promise((value) => {
          resolve = value;
        }),
    );
    const pending = chooseCinemaMedia();
    expect(await chooseCinemaMedia()).toBe(false);
    expect(choose).toHaveBeenCalledOnce();
    clearCinemaSession();
    resolve(source);
    expect(await pending).toBe(false);
    expect(useCinemaSession.getState().media).toBeNull();
    expect(release).toHaveBeenCalledWith(source.url);
    expect(useCinemaSession.getState().choosing).toBe(false);
  });

  it('reuses the video element but reloads and releases the old source on replacement', async () => {
    useCinemaSession.setState({ media: source });
    const { container } = mount();
    const video = container.querySelector('video')!;
    const next = { ...source, url: 'rooms-media://1f8f83ac-289e-45a4-ab53-916b6176b8c7/video' };
    choose.mockResolvedValueOnce(next);
    await act(async () => {
      await chooseCinemaMedia();
    });
    expect(container.querySelector('video')).toBe(video);
    expect(video.getAttribute('src')).toBe(next.url);
    expect(pause).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(source.url);
  });
});
