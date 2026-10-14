import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const harness = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  create: vi.fn(async () => {}),
  dispose: vi.fn(async () => {}),
  play: vi.fn(),
  control: vi.fn(),
  bounds: vi.fn(),
  state: vi.fn(() => ({
    state: 3,
    displayedFrames: 1,
    decodedFrames: 1,
    audioBuffers: 1,
    time: 1,
    duration: 60,
    width: 640,
    height: 360,
    seekable: 1,
    audioId: 1,
    captionId: -1,
    audio: [{ id: 1, label: 'English' }],
    captions: [],
  })),
}));
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/tmp/native-test' },
  screen: { getDisplayMatching: () => ({ scaleFactor: 1 }) },
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      harness.handlers.set(name, handler),
  },
}));
vi.mock('node:fs', () => ({ existsSync: () => true }));
vi.mock('node:module', () => ({
  createRequire: () => () => ({
    initialize: () => {},
    create: harness.create,
    dispose: harness.dispose,
    play: harness.play,
    control: harness.control,
    bounds: harness.bounds,
    state: harness.state,
  }),
}));
import { setupPersonalVLC } from '../apps/desktop/electron/personal-vlc';
import type { setupProviders } from '../apps/desktop/electron/providers';
const url = 'rooms-provider://11111111-1111-4111-8111-111111111111/stream';
function invoke(name: string, ...args: unknown[]) {
  return harness.handlers.get(`rooms:provider-native-${name}`)!({}, ...args);
}
beforeEach(() => {
  vi.stubGlobal('process', { ...process, platform: 'darwin' });
  vi.clearAllMocks();
  harness.handlers.clear();
});
afterEach(() => vi.unstubAllGlobals());
function setup() {
  let current = true;
  let revoke = () => {};
  const events = new Map();
  const providers = {
    authorizePlayback: () => () => {
      if (!current) throw new Error('Expired');
    },
    fetchPlayback: async () => new Response(new Uint8Array([0x47])),
    onPlaybackRevoked: (callback: () => void) => {
      revoke = callback;
      return () => {};
    },
  } as unknown as ReturnType<typeof setupProviders>;
  const win = {
    isDestroyed: () => false,
    getNativeWindowHandle: () => Buffer.alloc(8),
    isVisible: () => true,
    isMinimized: () => false,
    getContentSize: () => [900, 700],
    getBounds: () => ({ width: 900, height: 700, x: 0, y: 0 }),
    webContents: { getZoomFactor: () => 1 },
    once: (name: string, callback: () => void) => events.set(name, callback),
    off: (name: string) => events.delete(name),
  };
  const bridge = setupPersonalVLC(
    () => {},
    () => win as never,
    providers,
  );
  return {
    bridge,
    expire() {
      current = false;
      revoke();
    },
  };
}
describe('native player IPC ownership and cancellation', () => {
  it('returns a session token while keeping local decoder URLs out of the renderer', async () => {
    const { bridge } = setup();
    try {
      const result = (await invoke('start', url)) as { token: string };
      expect(result).toEqual({ token: expect.any(String) });
      expect(JSON.stringify(result)).not.toContain('http:');
      expect(harness.play.mock.calls[0][0]).toMatch(/^http:\/\/127\.0\.0\.1:/);
    } finally {
      await bridge.close();
    }
  });
  it('old session cleanup cannot stop a newer stream', async () => {
    const { bridge } = setup();
    try {
      const first = (await invoke('start', url)) as { token: string };
      const next = (await invoke('start', url)) as { token: string };
      const stops = harness.dispose.mock.calls.length;
      await invoke('stop', first.token);
      expect(harness.dispose.mock.calls.length).toBe(stops);
      expect(invoke('state', next.token)).toMatchObject({ state: 3 });
    } finally {
      await bridge.close();
    }
  });
  it('never plays an obsolete source when a newer start arrives during initialization', async () => {
    const { bridge } = setup();
    let entered!: () => void;
    let release!: () => void;
    const initializing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    harness.create.mockImplementationOnce(async () => {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    try {
      const old = Promise.resolve(invoke('start', url));
      const rejected = expect(old).rejects.toThrow('VLC');
      await initializing;
      const latest = Promise.resolve(invoke('start', url));
      release();
      await rejected;
      const result = (await latest) as { token: string };
      expect(harness.play).toHaveBeenCalledTimes(1);
      expect(invoke('state', result.token)).toMatchObject({ state: 3 });
    } finally {
      await bridge.close();
    }
  });
  it('does not publish a player created after account revocation', async () => {
    const { bridge, expire } = setup();
    let entered!: () => void;
    let release!: () => void;
    const initializing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    harness.create.mockImplementationOnce(async () => {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    try {
      const pending = Promise.resolve(invoke('start', url));
      const rejected = expect(pending).rejects.toThrow('VLC');
      await initializing;
      expire();
      release();
      await rejected;
      expect(harness.play).not.toHaveBeenCalled();
    } finally {
      await bridge.close();
    }
  });
  it('rejects stale controls and clamps the video surface to its own window', async () => {
    const { bridge } = setup();
    try {
      const { token } = (await invoke('start', url)) as { token: string };
      expect(() => invoke('control', 'stale', { action: 'pause', value: 1 })).toThrow();
      expect(() => invoke('control', token, { action: 'volume', value: 101 })).toThrow();
      invoke('bounds', token, { x: 880, y: 680, width: 500, height: 500, visible: true });
      expect(harness.bounds).toHaveBeenLastCalledWith(880, 680, 20, 20, true);
    } finally {
      await bridge.close();
    }
  });
  it('revokes the stream and controls after an account change', async () => {
    const { bridge, expire } = setup();
    try {
      const { token } = (await invoke('start', url)) as { token: string };
      expire();
      expect(() => invoke('state', token)).toThrow();
      expect(harness.bounds).toHaveBeenLastCalledWith(0, 0, 0, 0, false);
    } finally {
      await bridge.close();
    }
  });
});
