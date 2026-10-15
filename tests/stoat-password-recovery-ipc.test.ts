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
  clipboard: vi.fn(),
  exists: vi.fn(() => false),
}));
vi.mock('electron', () => ({
  app: { isPackaged: true, getPath: () => '/tmp/rooms-local-recovery-ipc-fixture', on: vi.fn() },
  ipcMain: { handle: (name: string, handler: Function) => mock.handlers.set(name, handler) },
  safeStorage: { isEncryptionAvailable: () => false },
  clipboard: { readText: () => mock.clipboard() },
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
beforeEach(async () => {
  mock.handlers.clear();
  mock.instances.length = 0;
  mock.capabilities = { emailEnabled: true, captcha: { required: false, siteKey: null } };
  mock.request.mockReset().mockResolvedValue({ accepted: true });
  mock.confirm.mockReset().mockResolvedValue({ completed: true });
  mock.clipboard
    .mockReset()
    .mockReturnValue('https://selected.example/login/reset/' + 'a'.repeat(32));
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
describe('native recovery IPC (fully mocked Stoat/Electron, no remote calls)', () => {
  it('rejects untrusted senders before creating a client', async () => {
    await expect(
      mock.handlers.get('rooms:social-password-recovery-capabilities')!(
        {},
        'https://selected.example',
      ),
    ).rejects.toThrow('Untrusted sender');
    expect(mock.instances).toHaveLength(0);
  });
  it('uses a new unauthenticated client and preserves a signed-in session', async () => {
    await invoke('rooms:social-login', {
      serverUrl: 'https://current.example',
      email: 'friend@example.com',
      password: 'fixture-password',
    });
    const before = await invoke('rooms:social-session');
    await expect(
      invoke('rooms:social-password-recovery-capabilities', 'https://selected.example'),
    ).resolves.toMatchObject({ emailEnabled: true });
    await expect(
      invoke('rooms:social-password-recovery-request', {
        serverUrl: 'https://selected.example',
        email: 'friend@example.com',
      }),
    ).resolves.toEqual({ accepted: true });
    expect(mock.instances.slice(1)).toEqual([
      { url: 'https://selected.example', token: undefined },
      { url: 'https://selected.example', token: undefined },
    ]);
    expect(await invoke('rooms:social-session')).toEqual(before);
    expect(mock.request).toHaveBeenCalledWith({ email: 'friend@example.com' });
  });
  it.each(['token', 'password', 'captcha'])('rejects forbidden extra %s inputs', async (key) => {
    await expect(
      invoke('rooms:social-password-recovery-request', {
        serverUrl: 'https://selected.example',
        email: 'friend@example.com',
        [key]: 'private-fixture-secret',
      }),
    ).rejects.toThrow('Check the supplied fields');
    expect(mock.request).not.toHaveBeenCalled();
    expect(mock.instances).toHaveLength(0);
  });
  it('blocks SMTP and captcha prerequisites natively, even if renderer attempts a request', async () => {
    mock.capabilities.emailEnabled = false;
    await expect(
      invoke('rooms:social-password-recovery-request', {
        serverUrl: 'https://selected.example',
        email: 'friend@example.com',
      }),
    ).rejects.toThrow('Sunucuda kurtarma e-postası yapılandırılmamış');
    mock.capabilities.emailEnabled = true;
    mock.capabilities.captcha.required = true;
    mock.capabilities.captcha.siteKey = 'public-site-key';
    await expect(
      invoke('rooms:social-password-recovery-request', {
        serverUrl: 'https://selected.example',
        email: 'friend@example.com',
      }),
    ).rejects.toThrow('hCaptcha');
    expect(mock.request).not.toHaveBeenCalled();
  });
  it('allows one pending request and clears its guard after failure', async () => {
    let reject: (reason: Error) => void = () => {};
    mock.request.mockImplementationOnce(
      () =>
        new Promise((_resolve, no) => {
          reject = no;
        }),
    );
    const pending = invoke('rooms:social-password-recovery-request', {
      serverUrl: 'https://selected.example',
      email: 'friend@example.com',
    });
    await vi.waitFor(() => expect(mock.request).toHaveBeenCalledTimes(1));
    await expect(
      invoke('rooms:social-password-recovery-request', {
        serverUrl: 'https://selected.example',
        email: 'other@example.com',
      }),
    ).rejects.toThrow('Kurtarma isteği sürüyor');
    reject(new Error('private-fixture-secret'));
    await expect(pending).rejects.toThrow('This operation could not complete');
    await expect(
      invoke('rooms:social-password-recovery-request', {
        serverUrl: 'https://selected.example',
        email: 'friend@example.com',
      }),
    ).resolves.toEqual({ accepted: true });
  });

  it.each(['import', 'confirm', 'cancel'])(
    'rejects untrusted %s handlers before reading clipboard or calling upstream',
    async (operation) => {
      await expect(
        mock.handlers.get(`rooms:social-password-recovery-${operation}`)!(
          { sender: { id: 99 } },
          {},
        ),
      ).rejects.toThrow('Untrusted sender');
      expect(mock.clipboard).not.toHaveBeenCalled();
      expect(mock.confirm).not.toHaveBeenCalled();
    },
  );
  it('imports clipboard token main-only, binds selected server and consumes confirmation once', async () => {
    const selected = await invoke('rooms:social-password-recovery-import', {
      serverUrl: 'https://selected.example',
    });
    expect(JSON.stringify(selected)).not.toContain('a'.repeat(32));
    expect(selected.serverOrigin).toBe('https://selected.example');
    await expect(
      invoke('rooms:social-password-recovery-confirm', {
        serverUrl: 'https://selected.example',
        handle: selected.handle,
        password: 'new-fixture-password',
      }),
    ).resolves.toEqual({ state: 'completed' });
    expect(mock.confirm).toHaveBeenCalledWith({
      token: 'a'.repeat(32),
      password: 'new-fixture-password',
      removeSessions: true,
    });
    await expect(
      invoke('rooms:social-password-recovery-confirm', {
        serverUrl: 'https://selected.example',
        handle: selected.handle,
        password: 'new-fixture-password',
      }),
    ).resolves.toEqual({ state: 'selection-expired' });
    expect(mock.confirm).toHaveBeenCalledTimes(1);
  });
  it('sanitizes bad imports and rejects token/password extras before clipboard access', async () => {
    await expect(
      invoke('rooms:social-password-recovery-import', {
        serverUrl: 'https://selected.example',
        token: 'secret',
      }),
    ).rejects.toThrow('Seçili sunucunun');
    expect(mock.clipboard).not.toHaveBeenCalled();
    mock.clipboard.mockReturnValue('https://other.example/login/reset/' + 'a'.repeat(32));
    await expect(
      invoke('rooms:social-password-recovery-import', { serverUrl: 'https://selected.example' }),
    ).rejects.toThrow('Seçili sunucunun');
    expect(mock.confirm).not.toHaveBeenCalled();
  });
  it('cancels selections and fences them after native login changes epoch', async () => {
    const selected = await invoke('rooms:social-password-recovery-import', {
      serverUrl: 'https://selected.example',
    });
    await invoke('rooms:social-password-recovery-cancel', { handle: selected.handle });
    await expect(
      invoke('rooms:social-password-recovery-confirm', {
        serverUrl: 'https://selected.example',
        handle: selected.handle,
        password: 'new-fixture-password',
      }),
    ).resolves.toEqual({ state: 'selection-expired' });
    const next = await invoke('rooms:social-password-recovery-import', {
      serverUrl: 'https://selected.example',
    });
    await invoke('rooms:social-login', {
      serverUrl: 'https://selected.example',
      email: 'friend@example.com',
      password: 'fixture-password',
    });
    await expect(
      invoke('rooms:social-password-recovery-confirm', {
        serverUrl: 'https://selected.example',
        handle: next.handle,
        password: 'new-fixture-password',
      }),
    ).resolves.toEqual({ state: 'selection-expired' });
    expect(mock.confirm).not.toHaveBeenCalled();
  });
});
