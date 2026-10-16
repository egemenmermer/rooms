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
  getChannel: vi.fn(),
  upload: vi.fn(),
  clipboardItems: vi.fn(
    async () => [] as { types: string[]; getType: (type: string) => Promise<Blob> }[],
  ),
  confirm: vi.fn(),
  clipboard: vi.fn(),
  exists: vi.fn(() => false),
}));
vi.mock('electron', () => ({
  app: { isPackaged: true, getPath: () => '/tmp/rooms-local-recovery-ipc-fixture', on: vi.fn() },
  ipcMain: { handle: (name: string, handler: Function) => mock.handlers.set(name, handler) },
  safeStorage: { isEncryptionAvailable: () => false },
  clipboard: { readText: () => mock.clipboard(), read: () => mock.clipboardItems() },
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
    getChannel(channelId: string) {
      return mock.getChannel(channelId);
    }
    uploadAttachment(bytes: Uint8Array, name: string, mime: string) {
      return mock.upload(bytes, name, mime);
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
beforeEach(async () => {
  mock.handlers.clear();
  mock.getChannel.mockReset().mockResolvedValue({ id: channel });
  mock.upload
    .mockReset()
    .mockImplementation(async (bytes: Uint8Array, name: string, mime: string) => ({
      id: 'uploaded',
      name,
      size: bytes.byteLength,
      mime,
    }));
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
describe('dropped attachment IPC (fully mocked Stoat/Electron)', () => {
  it('uploads dropped bytes after checking channel access and type', async () => {
    await expect(
      invoke('rooms:social-drop-attachment', channel, 'foto.PNG', new Uint8Array([1, 2, 3])),
    ).resolves.toEqual({ id: 'uploaded', name: 'foto.PNG', size: 3, mime: 'image/png' });
    expect(mock.getChannel).toHaveBeenCalledWith(channel);
    expect(mock.upload).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), 'foto.PNG', 'image/png');
  });
  it('rejects unsupported, empty, oversized and path-like files without uploading', async () => {
    await expect(
      invoke('rooms:social-drop-attachment', channel, 'tool.exe', new Uint8Array([1])),
    ).rejects.toThrow('not supported');
    await expect(
      invoke('rooms:social-drop-attachment', channel, 'empty.png', new Uint8Array()),
    ).rejects.toThrow('25 MB');
    await expect(
      invoke(
        'rooms:social-drop-attachment',
        channel,
        'big.png',
        new Uint8Array(25 * 1024 * 1024 + 1),
      ),
    ).rejects.toThrow('25 MB');
    await expect(
      invoke('rooms:social-drop-attachment', channel, '../secret.png', new Uint8Array([1])),
    ).rejects.toThrow();
    await expect(
      invoke('rooms:social-drop-attachment', channel, 'foto.png', 'not bytes'),
    ).rejects.toThrow('25 MB');
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it('requires a trusted sender', async () => {
    await expect(
      mock.handlers.get('rooms:social-drop-attachment')!(
        {},
        channel,
        'foto.png',
        new Uint8Array([1]),
      ),
    ).rejects.toThrow('Untrusted sender');
  });
  it('attaches a screenshot copied to the clipboard as image data', async () => {
    mock.clipboardItems.mockResolvedValueOnce([
      {
        types: ['image/png', 'electron application/osclipboard;format="Apple PNG pasteboard type"'],
        getType: async () => new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' }),
      },
    ]);
    const result = await invoke('rooms:social-paste-attachment', channel);
    expect(result).toMatchObject({ id: 'uploaded', size: 3, mime: 'image/png' });
    expect(result.name).toMatch(/^pano-\d{14}\.png$/);
    expect(mock.getChannel).toHaveBeenCalledWith(channel);
  });
  it('returns nothing when the clipboard has no image or file', async () => {
    mock.clipboardItems.mockResolvedValueOnce([
      { types: ['text/plain'], getType: async () => new Blob(['selam']) },
    ]);
    await expect(invoke('rooms:social-paste-attachment', channel)).resolves.toBeNull();
    expect(mock.upload).not.toHaveBeenCalled();
  });
});
