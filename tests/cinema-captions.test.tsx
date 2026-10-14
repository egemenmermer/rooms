// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import CinemaPlayback from '../apps/desktop/src/CinemaPlayback';
import { clearCinemaSession, useCinemaSession } from '../apps/desktop/src/cinema-session';
vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => ({ status: 'disconnected', participants: [], tracks: [] }),
  toggleMic: vi.fn(),
}));
const source = {
  url: 'rooms-media://e65709dd-7fa1-4dbb-a7b5-ce0c7777a034/video',
  name: 'Owned movie',
};
const chooseCaption = vi.fn(),
  revoke = vi.fn(),
  load = vi.fn();
let cueTrack: EventTarget & { mode: string; activeCues: { text: string }[] };
beforeEach(() => {
  vi.clearAllMocks();
  window.rooms = { chooseCaption, releaseMedia: vi.fn(async () => {}) } as unknown as NonNullable<
    Window['rooms']
  >;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:owned-caption'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: load });
  cueTrack = Object.assign(new EventTarget(), {
    mode: 'disabled',
    activeCues: [{ text: '<b>Private cue</b>' }],
  });
  Object.defineProperty(HTMLTrackElement.prototype, 'track', {
    configurable: true,
    get: () => cueTrack,
  });
  useCinemaSession.setState({ media: source, choosing: false });
});
afterEach(() => {
  cleanup();
  clearCinemaSession();
});
function mount() {
  return render(
    <MemoryRouter initialEntries={['/cinema?view=personal']}>
      <Link to="/chat">Browse chat</Link>
      <Link to="/cinema?view=personal">Return</Link>
      <CinemaPlayback notify={vi.fn()} />
    </MemoryRouter>,
  );
}
async function select() {
  fireEvent.click(screen.getByRole('button', { name: 'Oynatma ayarları' }));
  await act(async () => {
    fireEvent.click(screen.getByText('WebVTT dosyası seç'));
  });
}
describe('private persistent Cinema captions', () => {
  it('renders cue text safely without reloading video, retains across navigation and revokes at source clear', async () => {
    chooseCaption.mockResolvedValue({
      content: 'WEBVTT\n\n00:00.000 --> 00:02.000\nPrivate cue',
      name: 'owned.vtt',
    });
    const { container } = mount(),
      video = container.querySelector('video'),
      loads = load.mock.calls.length;
    await select();
    expect(container.querySelector('.cinema-caption')?.textContent).toBe('Private cue');
    expect(container.querySelector('.cinema-caption b')).toBeNull();
    expect(cueTrack.mode).toBe('hidden');
    expect(load).toHaveBeenCalledTimes(loads);
    fireEvent.click(screen.getByText('Browse chat'));
    expect(container.querySelector('video')).toBe(video);
    expect(container.querySelector('track')?.getAttribute('src')).toBe('blob:owned-caption');
    expect(revoke).not.toHaveBeenCalled();
    act(() => clearCinemaSession());
    expect(revoke).toHaveBeenCalledWith('blob:owned-caption');
  });
  it('invalidates a pending native picker when playback is cleared', async () => {
    let resolve!: (value: { content: string; name: string }) => void;
    chooseCaption.mockReturnValue(
      new Promise((value) => {
        resolve = value;
      }),
    );
    const { container } = mount();
    await select();
    act(() => clearCinemaSession());
    await act(async () => resolve({ content: 'WEBVTT\n', name: 'late.vtt' }));
    expect(container.querySelector('track')).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
