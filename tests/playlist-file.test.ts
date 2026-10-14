import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYLIST_FILE_LIMIT,
  PlaylistFileImports,
  parsePersonalPlaylistFile,
  readPersonalPlaylistFile,
} from '../apps/desktop/electron/playlist-file';

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  chooser: vi.fn(),
  handlers: new Map<string, (...args: any[]) => Promise<any>>(),
  write: vi.fn(),
  encrypted: vi.fn((value: string) => Buffer.from(value)),
  fetch: vi.fn(),
  encryptionAvailable: true,
}));
vi.mock('node:fs/promises', () => ({ open: mocks.open }));
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  readFileSync: vi.fn(() => {
    throw new Error('No vault');
  }),
  writeFileSync: mocks.write,
  renameSync: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => '/private-user-data' },
  dialog: { showOpenDialog: mocks.chooser },
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => Promise<any>) =>
      mocks.handlers.set(name, handler),
  },
  protocol: { handle: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => mocks.encryptionAvailable,
    encryptString: mocks.encrypted,
  },
  shell: { openExternal: vi.fn() },
}));
vi.mock('../packages/personal-media/src/network', async (original) => ({
  ...(await original<typeof import('../packages/personal-media/src/network')>()),
  privateFetch: mocks.fetch,
}));

const text =
  '#EXTM3U\n#EXTINF:-1 group-title="Personal",Channel\nhttps://example.com/live?token=private';
function mockFile(bytes = Buffer.from(text), regular = true, size = bytes.length) {
  let cursor = 0;
  const file = {
    stat: vi.fn(async () => ({ size, isFile: () => regular })),
    read: vi.fn(async (buffer: Buffer, offset: number, length: number) => {
      const bytesRead = Math.min(length, bytes.length - cursor);
      bytes.copy(buffer, offset, cursor, cursor + bytesRead);
      cursor += bytesRead;
      return { bytesRead };
    }),
    close: vi.fn(async () => {}),
  };
  mocks.open.mockResolvedValue(file);
  return file;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  mocks.encryptionAvailable = true;
  delete process.env.ROOMS_DEV_URL;
});

describe('personal playlist file validation', () => {
  it('reads a bounded UTF-8 regular file and preserves personal URLs internally', async () => {
    const file = mockFile(Buffer.from('\uFEFF' + text));
    const result = await readPersonalPlaylistFile('/private/list.M3U8');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].url).toContain('token=private');
    expect(file.close).toHaveBeenCalledOnce();
  });
  it('rejects extension, directories, empty and oversized files', async () => {
    await expect(readPersonalPlaylistFile('/private/list.txt')).rejects.toThrow('M3U');
    expect(mocks.open).not.toHaveBeenCalled();
    for (const [regular, size] of [
      [false, 1],
      [true, 0],
      [true, PLAYLIST_FILE_LIMIT + 1],
    ] as const) {
      const file = mockFile(Buffer.from(text), regular, size);
      await expect(readPersonalPlaylistFile('/private/list.m3u')).rejects.toThrow('playlist');
      expect(file.read).not.toHaveBeenCalled();
      expect(file.close).toHaveBeenCalledOnce();
    }
  });
  it('bounds reads even if a file grows after stat, and rejects malformed UTF-8', async () => {
    mockFile(Buffer.alloc(PLAYLIST_FILE_LIMIT + 1, 65), true, 1);
    await expect(readPersonalPlaylistFile('/private/list.m3u')).rejects.toThrow('2 MiB');
    mockFile(Buffer.from([0xc3, 0x28]));
    await expect(readPersonalPlaylistFile('/private/list.m3u')).rejects.toThrow('UTF-8');
  });
  it('redacts native access errors', async () => {
    mocks.open.mockRejectedValue(new Error('EACCES /private/secret-token.m3u'));
    await expect(readPersonalPlaylistFile('/private/secret-token.m3u')).rejects.toThrow(
      'accessible regular file',
    );
  });
  it('rejects relative/local/private/userinfo URLs, empty files, HLS and DRM directives', () => {
    for (const url of [
      'stream.ts',
      '//example.com/live',
      'file:///private/media.mp4',
      'https://secret:password@example.com/live',
      'http://127.0.0.1/live',
      'http://192.168.1.2/live',
      'https://localhost/live',
    ])
      expect(() => parsePersonalPlaylistFile('#EXTM3U\n' + url)).toThrow();
    for (const invalid of [
      '#EXTM3UX\nhttps://example.com/live',
      '#EXTM3U',
      text + '\0',
      '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES\nhttps://example.com/live',
      '#EXTM3U\n#KODIPROP:inputstream.adaptive.license_key=secret\nhttps://example.com/live',
    ])
      expect(() => parsePersonalPlaylistFile(invalid)).toThrow();
  });
});

describe('opaque playlist selection capabilities', () => {
  const read = async () => ({ text, entries: parsePersonalPlaylistFile(text) });
  it('cancel creates no capability and selecting again invalidates older tokens', async () => {
    const imports = new PlaylistFileImports(read);
    expect(await imports.pick(async () => null)).toBeNull();
    const first = await imports.pick(async () => '/private/list.m3u');
    const next = await imports.pick(async () => '/private/new.m3u');
    expect(first).toEqual({ token: expect.any(String), fileName: 'list.m3u', channelCount: 1 });
    expect(JSON.stringify(first)).not.toContain('private');
    expect(() => imports.take(first!.token)).toThrow('expired');
    expect(imports.take(next!.token)).toBe(text);
    expect(() => imports.take(next!.token)).toThrow('expired');
  });
  it('expires tokens and clears them on disconnect', async () => {
    let now = 0;
    const imports = new PlaylistFileImports(read, () => now);
    const first = await imports.pick(async () => 'list.m3u');
    now = 300_000;
    expect(() => imports.take(first!.token)).toThrow('expired');
    const next = await imports.pick(async () => 'list.m3u');
    imports.clear();
    expect(() => imports.take(next!.token)).toThrow('expired');
  });
  it('rejects account changes both after selection and while chooser/read is pending', async () => {
    let scope = 'account-a';
    const imports = new PlaylistFileImports(read, Date.now, () => scope);
    const selected = await imports.pick(async () => 'list.m3u');
    scope = 'account-b';
    expect(() => imports.take(selected!.token)).toThrow('expired');
    let finish!: (path: string) => void;
    const choosing = imports.pick(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    scope = 'account-c';
    finish('list.m3u');
    await expect(choosing).rejects.toThrow('expired');
    let finishRead!: (value: Awaited<ReturnType<typeof read>>) => void;
    const delayed = new PlaylistFileImports(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
      Date.now,
      () => scope,
    );
    const reading = delayed.pick(async () => 'list.m3u');
    await Promise.resolve();
    delayed.clear();
    finishRead(await read());
    await expect(reading).rejects.toThrow('expired');
  });
});

describe('native provider file IPC', () => {
  const event = {
    senderFrame: { url: 'file:///app/index.html' },
    sender: { getURL: () => 'file:///app/index.html' },
  };
  async function setup(scope = () => 'account-a') {
    vi.resetModules();
    const { setupProviders } = await import('../apps/desktop/electron/providers');
    const assertSender = vi.fn();
    const runtime = setupProviders(assertSender, scope, () =>
      JSON.stringify(['https://social.example.test', scope()]),
    );
    return {
      runtime,
      assertSender,
      invoke: (method: string, ...args: any[]) =>
        mocks.handlers.get('rooms:provider-' + method)!(event, ...args),
    };
  }
  it('uses native chooser and persists encrypted contents without a path or network request', async () => {
    mockFile();
    mocks.chooser.mockResolvedValue({ canceled: false, filePaths: ['/private/list.m3u'] });
    const { invoke, assertSender } = await setup();
    const picked = await invoke('pick-playlist');
    const saved = await invoke('playlist-file', { name: 'My channels', token: picked.token });
    expect(saved).toMatchObject({ type: 'playlist', name: 'My channels', channelCount: 1 });
    expect(mocks.encrypted.mock.calls[0][0]).toContain('playlistText');
    expect(mocks.encrypted.mock.calls[0][0]).not.toContain('/private/list.m3u');
    expect(await invoke('channels', saved.id)).toEqual([
      { id: expect.any(String), name: 'Channel', group: 'Personal', favorite: false },
    ]);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(assertSender).toHaveBeenCalledTimes(3);
    await expect(invoke('playlist-file', { name: 'Again', token: picked.token })).rejects.toThrow(
      'expired',
    );
  });
  it('cancels without saving and rejects renderer paths', async () => {
    mocks.chooser.mockResolvedValue({ canceled: true, filePaths: [] });
    const { invoke } = await setup();
    expect(await invoke('pick-playlist')).toBeNull();
    await expect(invoke('pick-playlist', '/private/list.m3u')).rejects.toThrow('native chooser');
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('does not save invalid files or selections from a previous account', async () => {
    mockFile(Buffer.from('#EXTM3U'));
    mocks.chooser.mockResolvedValue({ canceled: false, filePaths: ['/private/list.m3u'] });
    let scope = 'account-a';
    const { invoke } = await setup(() => scope);
    await expect(invoke('pick-playlist')).rejects.toThrow('no playable');
    expect(mocks.write).not.toHaveBeenCalled();
    mockFile();
    const picked = await invoke('pick-playlist');
    scope = 'account-b';
    await expect(
      invoke('playlist-file', { name: 'My channels', token: picked.token }),
    ).rejects.toThrow('expired');
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('clears selected capabilities on clearPlayback and requires encrypted storage', async () => {
    mockFile();
    mocks.chooser.mockResolvedValue({ canceled: false, filePaths: ['/private/list.m3u'] });
    const { invoke, runtime } = await setup();
    const picked = await invoke('pick-playlist');
    runtime.clearPlayback();
    await expect(
      invoke('playlist-file', { name: 'My channels', token: picked.token }),
    ).rejects.toThrow('expired');
    mockFile();
    const next = await invoke('pick-playlist');
    mocks.encryptionAvailable = false;
    await expect(
      invoke('playlist-file', { name: 'My channels', token: next.token }),
    ).rejects.toThrow('Encrypted');
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('rolls back an import if encrypted persistence fails and rejects fixture access', async () => {
    mockFile();
    mocks.chooser.mockResolvedValue({ canceled: false, filePaths: ['/private/list.m3u'] });
    const { invoke } = await setup();
    const picked = await invoke('pick-playlist');
    mocks.write.mockImplementationOnce(() => {
      throw new Error('EACCES /private/vault');
    });
    await expect(
      invoke('playlist-file', { name: 'My channels', token: picked.token }),
    ).rejects.toThrow('request failed');
    expect(await invoke('status')).toEqual([]);
    process.env.ROOMS_DEV_URL = 'http://127.0.0.1:5173';
    await expect(
      mocks.handlers.get('rooms:provider-pick-playlist')!({
        ...event,
        senderFrame: { url: 'http://127.0.0.1:5173/?fixture=S34' },
      }),
    ).rejects.toThrow('disabled in development fixtures');
    expect(mocks.chooser).toHaveBeenCalledOnce();
  });
});
