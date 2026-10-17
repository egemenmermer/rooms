/** Fully mocked Stoat/Electron: checks IPC input validation, not upstream behaviour. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

const mock = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  instances: [] as { url: string; token?: string }[],
  capabilities: {
    emailEnabled: true,
    captcha: { required: false, siteKey: null as string | null },
  },
  request: vi.fn(),
  confirm: vi.fn(),
  react: vi.fn(),
  exists: vi.fn(() => false),
}));
vi.mock('electron', () => ({
  app: { isPackaged: true, getPath: () => '/tmp/rooms-local-recovery-ipc-fixture', on: vi.fn() },
  ipcMain: { handle: (name: string, handler: Function) => mock.handlers.set(name, handler) },
  safeStorage: { isEncryptionAvailable: () => false },
  clipboard: {},
  session: { defaultSession: { setDisplayMediaRequestHandler: vi.fn() } },
  dialog: {},
  desktopCapturer: {},
  systemPreferences: {},
  screen: { on: vi.fn(), removeListener: vi.fn() },
}));
vi.mock('node:fs', async () => ({
  ...(await vi.importActual<object>('node:fs')),
  existsSync: mock.exists,
}));
vi.mock('@rooms/stoat', async () => ({
  ...(await vi.importActual<object>('@rooms/stoat')),
  StoatError: class extends Error {},
  StoatClient: class {
    instanceUrl: string;
    status = 'connected';
    private token: string | undefined;
    constructor(url: string, token?: string) {
      this.instanceUrl = url;
      this.token = token;
      mock.instances.push({ url, token });
    }
    react(channelId: string, messageId: string, emoji: string, remove: boolean) {
      return mock.react(channelId, messageId, emoji, remove);
    }
    passwordRecoveryCapabilities() {
      return Promise.resolve(mock.capabilities);
    }
    requestPasswordRecovery(input: unknown) {
      return mock.request(input);
    }
    confirmPasswordRecovery(input: unknown) {
      return mock.confirm(input);
    }
    logout() {
      return Promise.resolve();
    }
    login() {
      this.token = 'fixture-private-session';
      return Promise.resolve({
        id: '111111',
        username: 'fixture',
        displayName: 'fixture',
        avatar: null,
      });
    }
    getToken() {
      return this.token;
    }
    subscribe() {
      return () => {};
    }
    connect() {
      return Promise.resolve();
    }
    disconnect() {
      return Promise.resolve();
    }
  },
}));
import { setupCommunity } from '../apps/desktop/electron/community';

let close: (() => Promise<void>) | undefined;
const event = { trusted: true, sender: { id: 7 } } as unknown as IpcMainInvokeEvent;
const windowFixture = {
  isFocused: () => false,
  webContents: {
    getURL: () => 'file:///rooms/index.html',
    isDestroyed: () => false,
    send: vi.fn(),
  },
} as unknown as BrowserWindow;
const invoke = (name: string, ...args: unknown[]) => mock.handlers.get(name)!(event, ...args);
const channel = '01M4X4R1YGT9C7GSW99S3H3ZGC';
const message = '01M4X4R1YGT9C7GSW99S3H3ZGD';
beforeEach(async () => {
  mock.handlers.clear();
  mock.react.mockReset().mockResolvedValue(undefined);
  const community = await setupCommunity(
    () => windowFixture,
    (invocation) => {
      if (invocation !== event) throw new Error('Untrusted sender');
    },
    () => true,
  );
  close = community.close;
  await invoke('rooms:social-login', {
    serverUrl: 'https://current.example',
    email: 'friend@example.com',
    password: 'fixture-password',
  });
});
afterEach(async () => {
  await close?.();
  close = undefined;
});
describe('reaction IPC (fully mocked Stoat/Electron)', () => {
  it('forwards Unicode emoji and custom emoji ids to the adapter', async () => {
    for (const emoji of [
      '\u2764\ufe0f',
      '\u2b50',
      '\u{1f44d}\u{1f3fd}',
      '\u{1f1f9}\u{1f1f7}',
      '\u{1f468}\u200d\u{1f4bb}',
      '1\ufe0f\u20e3',
      '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    ])
      await invoke('rooms:social-react', channel, message, emoji);
    await invoke('rooms:social-react', channel, message, '\u{1f642}', true);
    expect(mock.react.mock.calls.map((call) => call[2])).toEqual([
      '\u2764\ufe0f',
      '\u2b50',
      '\u{1f44d}\u{1f3fd}',
      '\u{1f1f9}\u{1f1f7}',
      '\u{1f468}\u200d\u{1f4bb}',
      '1\ufe0f\u20e3',
      '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      '\u{1f642}',
    ]);
    expect(mock.react).toHaveBeenLastCalledWith(channel, message, '\u{1f642}', true);
  });
  it('rejects codepoint ids, text, path-like and oversized values before the adapter', async () => {
    for (const emoji of [
      '2764',
      '1f44d',
      'heart',
      '1',
      '',
      '../reactions',
      '\u2764/../x',
      '\u2764%2F',
      '\u2764\n',
      '<\u2764>',
      '\u{1f44d}'.repeat(17),
      '01arz3ndektsv4rrffq69g5fav',
      42,
      null,
    ])
      await expect(invoke('rooms:social-react', channel, message, emoji)).rejects.toThrow();
    await expect(
      invoke('rooms:social-react', channel, message, '\u2764\ufe0f', 'yes'),
    ).rejects.toThrow();
    expect(mock.react).not.toHaveBeenCalled();
  });
  it('requires a trusted sender', async () => {
    await expect(
      mock.handlers.get('rooms:social-react')!({}, channel, message, '\u2764\ufe0f'),
    ).rejects.toThrow('Untrusted sender');
    expect(mock.react).not.toHaveBeenCalled();
  });
});
