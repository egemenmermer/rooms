import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

const mock = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  instances: [] as { url: string; token?: string }[],
  requestSignup: vi.fn(),
  decide: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { isPackaged: true, getPath: () => '/tmp/rooms-approved-signup-ipc-fixture', on: vi.fn() },
  ipcMain: { handle: (name: string, handler: Function) => mock.handlers.set(name, handler) },
  safeStorage: { isEncryptionAvailable: () => false },
  clipboard: { readText: () => '' },
  session: { defaultSession: { setDisplayMediaRequestHandler: vi.fn() } },
  dialog: {},
  desktopCapturer: {},
  systemPreferences: {},
  screen: { on: vi.fn(), removeListener: vi.fn() },
}));
vi.mock('node:fs', async () => ({
  ...(await vi.importActual<object>('node:fs')),
  existsSync: () => false,
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
    requestSignup(input: unknown) {
      mock.requestSignup(input);
      this.token = 'fixture-private-session';
      return Promise.resolve({
        id: 'NEWUSER',
        username: 'friend',
        displayName: 'friend',
        avatar: null,
      });
    }
    decideSignupRequest(...args: unknown[]) {
      return mock.decide(...args);
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
    logout() {
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
const form = {
  serverUrl: 'https://friends.example',
  email: 'friend@example.com',
  password: 'correct horse battery',
  username: 'friend',
};
beforeEach(async () => {
  mock.handlers.clear();
  mock.instances.length = 0;
  mock.requestSignup.mockReset();
  mock.decide.mockReset().mockResolvedValue(undefined);
  const community = await setupCommunity(
    () => windowFixture,
    (invocation) => {
      if (invocation !== event) throw new Error('Untrusted sender');
    },
    () => true,
  );
  close = community.close;
});
afterEach(async () => {
  await close?.();
  close = undefined;
});

describe('approved sign-up IPC (mocked Stoat/Electron, no remote calls)', () => {
  it('rejects untrusted senders before creating a client', async () => {
    await expect(mock.handlers.get('rooms:social-signup-request')!({}, form)).rejects.toThrow(
      'Untrusted sender',
    );
    expect(mock.instances).toHaveLength(0);
  });

  it.each([
    { password: 'short' },
    { username: 'has space' },
    { inviteCode: 'extra' },
    { token: 'renderer-supplied' },
  ])('validates the form natively: %o', async (change) => {
    await expect(invoke('rooms:social-signup-request', { ...form, ...change })).rejects.toThrow(
      'Check the supplied fields',
    );
    expect(mock.requestSignup).not.toHaveBeenCalled();
  });

  it('signs in to the new account without handing its session to the renderer', async () => {
    const session = await invoke('rooms:social-signup-request', form);
    expect(session).toMatchObject({ user: { id: 'NEWUSER' }, instanceUrl: form.serverUrl });
    expect(JSON.stringify(session)).not.toContain('fixture-private-session');
    expect(mock.requestSignup).toHaveBeenCalledWith(form);
  });

  it('accepts only approve or reject decisions on valid ids', async () => {
    await invoke('rooms:social-signup-request', form);
    await invoke('rooms:social-signup-decide', 'SPACE', 'U1', 'approve');
    expect(mock.decide).toHaveBeenCalledWith('SPACE', 'U1', 'approve');
    await expect(invoke('rooms:social-signup-decide', 'SPACE', 'U1', 'delete')).rejects.toThrow(
      'Check the supplied fields',
    );
    await expect(invoke('rooms:social-signup-decide', 'SPACE', '../x', 'reject')).rejects.toThrow(
      'Check the supplied fields',
    );
    expect(mock.decide).toHaveBeenCalledTimes(1);
  });
});
