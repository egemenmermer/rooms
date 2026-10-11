// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { useCommunity } from '../apps/desktop/src/community';
import { PersonalPlaybackRuntime } from '../apps/desktop/src/PersonalMedia';
import { startPersonalPlayback, stopPersonalPlayback, usePersonalPlayback } from '../apps/desktop/src/personal-playback';
vi.mock('../apps/desktop/src/realtime', () => ({ useRealtime: () => ({ status: 'disconnected', participants: [], tracks: [] }), toggleMic: vi.fn() }));
vi.mock('hls.js', () => ({ default: class { static isSupported() { return false; } } }));
const load = vi.fn(), pause = vi.fn();
const source = { url: 'rooms-provider://e0536721-3849-40d9-9875-71d72cd19e76/stream', name: 'Authorized live source', live: true };
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLMediaElement.prototype, 'textTracks', { configurable: true, get: () => Object.assign(new EventTarget(), { length: 0 }) });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: load });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
  window.rooms = { providers: { status: vi.fn(async () => [{ id: 'connection-one' }]) } } as unknown as NonNullable<Window['rooms']>;
  useCommunity.setState({ user: { id: 'owner', username: 'Owner', displayName: 'Owner', avatar: null }, serverUrl: 'https://social.example.test' });
  startPersonalPlayback(source, 'connection-one', 'owner', 'https://social.example.test');
});
afterEach(() => { cleanup(); stopPersonalPlayback(); });
const mount = () => render(<MemoryRouter initialEntries={['/media?player=1']}><Link to="/chat">Browse chat</Link><PersonalPlaybackRuntime notify={vi.fn()}/></MemoryRouter>);
describe('persistent personal live player', () => {
  it('preserves the media element/source on navigation and return, with an explicit stop', () => {
    const { container } = mount(), video = container.querySelector('video'), loads = load.mock.calls.length;
    fireEvent.click(screen.getByText('Browse chat'));
    expect(container.querySelector('video')).toBe(video);
    expect(video?.getAttribute('src')).toBe(source.url);
    expect(load).toHaveBeenCalledTimes(loads);
    fireEvent.click(screen.getByText('Oynatıcıya dön'));
    expect(container.querySelector('video')).toBe(video);
    fireEvent.click(screen.getByRole('button', { name: 'Kişisel oynatmayı durdur' }));
    expect(usePersonalPlayback.getState().session).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(pause).toHaveBeenCalledOnce();
  });
  it('clears capability and unloads playback on account identity change', async () => {
    const { container } = mount();
    await act(async () => useCommunity.setState({ user: null }));
    expect(usePersonalPlayback.getState().session).toBeNull();
    expect(container.querySelector('video')).toBeNull();
  });
  it('unloads playback when the same user identifier belongs to a different server', async () => {
    const { container } = mount();
    await act(async () => useCommunity.setState({ serverUrl: 'https://different.example.test' }));
    expect(usePersonalPlayback.getState().session).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(pause).toHaveBeenCalledOnce();
  });
});
