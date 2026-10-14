// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { useCommunity } from '../apps/desktop/src/community';
import { PersonalPlaybackRuntime } from '../apps/desktop/src/PersonalMedia';
import {
  startPersonalPlayback,
  stopPersonalPlayback,
  usePersonalPlayback,
} from '../apps/desktop/src/personal-playback';
vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => ({ status: 'disconnected', participants: [], tracks: [] }),
  toggleMic: vi.fn(),
}));
const hlsMock = vi.hoisted(() => ({ enabled: false, instances: [] as any[] }));
vi.mock('hls.js', () => ({
  default: class {
    static isSupported() {
      return hlsMock.enabled;
    }
    static Events = {
      ERROR: 'error',
      MANIFEST_PARSED: 'manifest',
      AUDIO_TRACKS_UPDATED: 'audio',
      SUBTITLE_TRACKS_UPDATED: 'subtitles',
    };
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
    static ErrorDetails = { MANIFEST_PARSING_ERROR: 'manifestParsingError' };
    handlers = new Map<string, Function>();
    audioTracks = [];
    subtitleTracks = [];
    startLoad = vi.fn();
    stopLoad = vi.fn();
    recoverMediaError = vi.fn();
    destroy = vi.fn();
    loadSource = vi.fn();
    attachMedia = vi.fn();
    constructor() {
      hlsMock.instances.push(this);
    }
    on(event: string, handler: Function) {
      this.handlers.set(event, handler);
    }
    emit(data: any) {
      this.handlers.get('error')?.('error', data);
    }
  },
}));
const load = vi.fn(),
  pause = vi.fn();
const source = {
  url: 'rooms-provider://e0536721-3849-40d9-9875-71d72cd19e76/stream',
  name: 'Authorized live source',
  live: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  hlsMock.enabled = false;
  hlsMock.instances = [];
  Object.defineProperty(HTMLMediaElement.prototype, 'textTracks', {
    configurable: true,
    get: () => Object.assign(new EventTarget(), { length: 0 }),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: load });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
  window.rooms = {
    providers: { status: vi.fn(async () => [{ id: 'connection-one' }]) },
  } as unknown as NonNullable<Window['rooms']>;
  useCommunity.setState({
    user: { id: 'owner', username: 'Owner', displayName: 'Owner', avatar: null },
    serverUrl: 'https://social.example.test',
  });
  startPersonalPlayback(source, 'connection-one', 'owner', 'https://social.example.test');
});
afterEach(() => {
  cleanup();
  stopPersonalPlayback();
});
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/media?player=1']}>
      <Link to="/chat">Browse chat</Link>
      <PersonalPlaybackRuntime notify={vi.fn()} />
    </MemoryRouter>,
  );
describe('persistent personal live player', () => {
  it('preserves the media element/source on navigation and return, with an explicit stop', () => {
    const { container } = mount(),
      video = container.querySelector('video'),
      loads = load.mock.calls.length;
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
  it('renders real now/next programme metadata without replacing the video', async () => {
    window.rooms!.providers.epg = vi.fn(async () => [
      {
        title: 'Current programme',
        description: 'Actual guide description',
        startsAt: new Date(Date.now() - 60000).toISOString(),
        endsAt: new Date(Date.now() + 60000).toISOString(),
      },
      {
        title: 'Next programme',
        description: '',
        startsAt: new Date(Date.now() + 60000).toISOString(),
        endsAt: new Date(Date.now() + 120000).toISOString(),
      },
    ]);
    startPersonalPlayback(
      { ...source, channelId: 'owned-channel' },
      'connection-one',
      'owner',
      'https://social.example.test',
    );
    const { container } = mount(),
      video = container.querySelector('video');
    await screen.findByText('Next programme');
    expect(window.rooms!.providers.epg).toHaveBeenCalledWith('connection-one', 'owned-channel');
    expect(container.querySelector('video')).toBe(video);
    expect(container.querySelector('.personal-playback-runtime')?.classList.contains('inset')).toBe(
      true,
    );
  });
  it('classifies a native unsupported media error and keeps options accessible', () => {
    const { container } = mount(),
      video = container.querySelector('video')!;
    Object.defineProperty(video, 'error', { value: { code: 4 } });
    fireEvent.error(video);
    expect(screen.getByRole('heading', { name: 'Bu medya biçimi oynatılamıyor' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Oynatma seçenekleri' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('records history only after actual playing and only once per capability', async () => {
    window.rooms!.providers.acknowledgePlayback = vi.fn(async () => {});
    const { container } = mount(),
      video = container.querySelector('video')!;
    expect(window.rooms!.providers.acknowledgePlayback).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.playing(video);
      fireEvent.playing(video);
    });
    expect(window.rooms!.providers.acknowledgePlayback).toHaveBeenCalledExactlyOnceWith(source.url);
  });
});

describe('bounded live HLS recovery after genuine playing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hlsMock.enabled = true;
  });
  afterEach(() => vi.useRealTimers());
  const playing = () => {
    const result = mount(),
      video = result.container.querySelector('video')!;
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    fireEvent.playing(video);
    return { ...result, video, hls: hlsMock.instances[0] };
  };
  it('retries temporary transport failures with delay, then stops after two attempts', () => {
    const { video, hls } = playing();
    const error = { fatal: true, type: 'networkError', response: { code: 503 } };
    act(() => hls.emit(error));
    expect(hls.startLoad).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1500));
    expect(hls.startLoad).toHaveBeenCalledOnce();
    fireEvent.playing(video);
    act(() => hls.emit(error));
    act(() => vi.advanceTimersByTime(3000));
    expect(hls.startLoad).toHaveBeenCalledTimes(2);
    fireEvent.playing(video);
    act(() => hls.emit(error));
    expect(screen.getByRole('heading', { name: 'Kaynağa ulaşılamıyor' })).toBeTruthy();
  });
  it('reports authorization failure directly and never retries it', () => {
    const { hls } = playing();
    act(() => hls.emit({ fatal: true, type: 'networkError', response: { code: 403 } }));
    expect(screen.getByRole('heading', { name: 'Kaynak erişimi reddedildi' })).toBeTruthy();
    act(() => vi.advanceTimersByTime(15000));
    expect(hls.startLoad).not.toHaveBeenCalled();
  });
  it('attempts one actual decode recovery, with a deadline and no infinite loop', () => {
    const { video, hls } = playing();
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 3 } });
    fireEvent.error(video);
    expect(hls.recoverMediaError).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByRole('heading', { name: 'Bu medya biçimi oynatılamıyor' })).toBeTruthy();
    fireEvent.error(video);
    expect(hls.recoverMediaError).toHaveBeenCalledOnce();
  });
  it('cancels delayed reload when the account changes', async () => {
    const { hls } = playing();
    act(() => hls.emit({ fatal: true, type: 'networkError', response: { code: 503 } }));
    await act(async () => useCommunity.setState({ user: null }));
    act(() => vi.advanceTimersByTime(15000));
    expect(hls.startLoad).not.toHaveBeenCalled();
    expect(hls.destroy).toHaveBeenCalled();
  });
  it('recovers a real stall without needing a fatal HLS event, and cancels on pause', () => {
    const { video, hls } = playing();
    fireEvent.waiting(video);
    act(() => vi.advanceTimersByTime(20000));
    act(() => vi.advanceTimersByTime(1500));
    expect(hls.startLoad).toHaveBeenCalledOnce();
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 1 });
    fireEvent.timeUpdate(video);
    act(() => vi.advanceTimersByTime(15000));
    expect(screen.queryByRole('heading', { name: 'Kaynağa ulaşılamıyor' })).toBeNull();
    fireEvent.stalled(video);
    fireEvent.pause(video);
    act(() => vi.advanceTimersByTime(25000));
    expect(hls.startLoad).toHaveBeenCalledOnce();
  });
  it('disposes a pending stall watchdog on account change', async () => {
    const { video, hls } = playing();
    fireEvent.stalled(video);
    await act(async () => useCommunity.setState({ user: null }));
    act(() => vi.advanceTimersByTime(30000));
    expect(hls.startLoad).not.toHaveBeenCalled();
  });
});

describe('native personal-player controls', () => {
  it('uses the native engine once and closes its own token', async () => {
    const observer = { observe: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observer.observe;
        disconnect = observer.disconnect;
      },
    );
    const native = {
      status: vi.fn(async () => ({ available: true })),
      start: vi.fn(async () => ({ token: 'own-native-session' })),
      state: vi.fn(async () => ({
        state: 3,
        displayedFrames: 1,
        decodedFrames: 1,
        audioBuffers: 1,
        time: 5,
        duration: 0,
        width: 640,
        height: 360,
        seekable: 0,
        audioId: 1,
        captionId: -1,
        audio: [{ id: 1, label: 'English' }],
        captions: [],
      })),
      bounds: vi.fn(async () => {}),
      control: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    window.rooms!.providers.nativePlayer = native;
    window.rooms!.providers.acknowledgePlayback = vi.fn(async () => {});
    let rendered!: ReturnType<typeof render>;
    await act(async () => {
      rendered = render(
        <MemoryRouter initialEntries={['/media?player=1']}>
          <PersonalPlaybackRuntime notify={() => {}} />
        </MemoryRouter>,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(native.start).toHaveBeenCalledExactlyOnceWith(source.url);
    expect(hlsMock.instances).toHaveLength(0);
    const video = rendered.container.querySelector('video')!;
    expect(video.getAttribute('src')).toBeNull();
    expect(window.rooms!.providers.acknowledgePlayback).toHaveBeenCalledExactlyOnceWith(source.url);
    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 640, 360));
    const controlBar = rendered.container.querySelector('.personal-live-controls')!;
    vi.spyOn(controlBar, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 380, 640, 80));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 130));
    });
    expect(native.bounds).toHaveBeenLastCalledWith(
      'own-native-session',
      expect.objectContaining({ y: 100, height: 280 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
    expect(native.control).toHaveBeenCalledWith('own-native-session', {
      action: 'pause',
      value: 1,
    });
    rendered.unmount();
    expect(native.stop).toHaveBeenCalledWith('own-native-session');
    vi.unstubAllGlobals();
  });
});

it('exits its own fullscreen with Escape even while a player button holds focus', async () => {
  const original = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
  const originalExit = document.exitFullscreen;
  const exit = vi.fn(async () => {});
  const rendered = mount();
  const stage = rendered.container.querySelector('.ref-personal-player')!;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => stage });
  document.exitFullscreen = exit;
  try {
    const control = rendered.container.querySelector('button')!;
    control.focus();
    fireEvent.keyDown(control, { key: 'Escape' });
    expect(exit).toHaveBeenCalledOnce();
  } finally {
    if (original) Object.defineProperty(document, 'fullscreenElement', original);
    else Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    document.exitFullscreen = originalExit;
  }
});
