import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => Promise<any>>(),
  protocol: undefined as undefined | ((request: Request) => Promise<Response>),
  fetch: vi.fn(),
  open: vi.fn(),
  chooser: vi.fn(),
  write: vi.fn(),
  encrypted: vi.fn((value: string) => Buffer.from(value)),
  external: vi.fn(async () => {}),
  stored: [] as any[],
  readPaths: [] as string[],
  vaults: null as Map<string, any[]> | null,
}));
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  readFileSync: (path: string) => {
    mocks.readPaths.push(path);
    const values = mocks.vaults ? mocks.vaults.get(path) : mocks.stored;
    if (!values) throw new Error('No scoped vault');
    return Buffer.from(JSON.stringify(values));
  },
  writeFileSync: mocks.write,
  renameSync: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({ open: mocks.open }));
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => '/private-data' },
  dialog: { showOpenDialog: mocks.chooser },
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => Promise<any>) =>
      mocks.handlers.set(name, handler),
  },
  protocol: {
    handle: (_scheme: string, handler: (request: Request) => Promise<Response>) => {
      mocks.protocol = handler;
    },
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: mocks.encrypted,
    decryptString: (value: Buffer) => value.toString(),
  },
  shell: { openExternal: mocks.external },
}));
vi.mock('../packages/personal-media/src/network', async (original) => ({
  ...(await original<typeof import('../packages/personal-media/src/network')>()),
  privateFetch: mocks.fetch,
}));

const playlistId = '11111111-1111-4111-8111-111111111111';
const xtreamId = '22222222-2222-4222-8222-222222222222';
const playlist = '#EXTM3U\n#EXTINF:-1,Old channel\nhttps://example.com/old?secret=old';
const replacement = '#EXTM3U\n#EXTINF:-1,New channel\nhttps://example.com/new?secret=new';
const event = {
  senderFrame: { url: 'file:///app/index.html' },
  sender: { getURL: () => 'file:///app/index.html' },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const device = () =>
  new Response(
    JSON.stringify({
      device_code: 'private-device',
      user_code: 'USER',
      verification_url: 'https://real-debrid.com/device',
      expires_in: 600,
      interval: 5,
    }),
  );
const credentials = () =>
  new Response(JSON.stringify({ client_id: 'personal-client', client_secret: 'personal-secret' }));
const grant = () =>
  new Response(
    JSON.stringify({
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
      expires_in: 600,
    }),
  );
async function setup() {
  vi.resetModules();
  let scope = 'epoch-1:user-a';
  let identity: string | null = 'stable-server:user-a';
  const { setupProviders } = await import('../apps/desktop/electron/providers');
  const runtime = setupProviders(
    vi.fn(),
    () => scope,
    () => identity,
  );
  return {
    runtime,
    setIdentity: (value: string | null) => {
      identity = value;
    },
    setScope: (value: string) => {
      scope = value;
    },
    changeScope: () => {
      scope = 'epoch-2:user-b';
    },
    invoke: (method: string, ...args: any[]) =>
      mocks.handlers.get('rooms:provider-' + method)!(event, ...args),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockReset();
  mocks.open.mockReset();
  mocks.chooser.mockReset();
  mocks.write.mockReset();
  mocks.external.mockReset().mockResolvedValue(undefined);
  mocks.handlers.clear();
  mocks.vaults = null;
  mocks.readPaths = [];
  mocks.stored = [
    {
      id: playlistId,
      type: 'playlist',
      name: 'Old playlist',
      playlistText: playlist,
      xmltvUrl: 'https://example.com/epg',
      favorites: [],
    },
    {
      id: xtreamId,
      type: 'xtream',
      name: 'Old Xtream',
      url: 'https://example.com/',
      username: 'private-user',
      password: 'private-password',
      favorites: [],
    },
  ];
  process.env.ROOMS_RD_CLIENT_ID = 'registered-client';
  delete process.env.ROOMS_DEV_URL;
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.ROOMS_RD_CLIENT_ID;
});

describe('atomic personal connection updates', () => {
  it('preserves omitted source secrets, clears XMLTV explicitly and returns only metadata', async () => {
    const { invoke } = await setup();
    const result = await invoke('playlist-update', {
      id: playlistId,
      name: 'Renamed',
      xmltvUrl: null,
    });
    expect(result).toEqual({
      id: playlistId,
      type: 'playlist',
      name: 'Renamed',
      status: 'connected',
      channelCount: 1,
    });
    const stored = JSON.parse(mocks.encrypted.mock.calls[0][0]).find(
      (c: any) => c.id === playlistId,
    );
    expect(stored.playlistText).toBe(playlist);
    expect(stored.xmltvUrl).toBeUndefined();
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify([{ stream_id: 9, name: 'Actual channel' }])),
    );
    const xtream = await invoke('xtream-update', { id: xtreamId, name: 'Renamed Xtream' });
    expect(Object.keys(xtream).sort()).toEqual(['channelCount', 'id', 'name', 'status', 'type']);
    expect(mocks.fetch.mock.calls[0][0]).toContain(
      'username=private-user&password=private-password',
    );
  });
  it('keeps the original record, cached channel and playback capability on fetch/parser/persist failure', async () => {
    const { invoke } = await setup();
    const [old] = await invoke('channels', playlistId);
    const playback = await invoke('play', playlistId, old.id);
    mocks.fetch.mockRejectedValueOnce(new Error('secret network failure'));
    await expect(
      invoke('playlist-update', {
        id: playlistId,
        name: 'Failed',
        url: 'https://example.com/new-list',
      }),
    ).rejects.toThrow('request failed');
    mocks.fetch.mockResolvedValueOnce(new Response('invalid playlist'));
    await expect(
      invoke('playlist-update', {
        id: playlistId,
        name: 'Failed',
        url: 'https://example.com/new-list',
      }),
    ).rejects.toThrow('valid M3U');
    mocks.fetch.mockResolvedValueOnce(new Response(replacement));
    mocks.write.mockImplementationOnce(() => {
      throw new Error('vault private path');
    });
    await expect(
      invoke('playlist-update', {
        id: playlistId,
        name: 'Failed',
        url: 'https://example.com/new-list',
      }),
    ).rejects.toThrow('request failed');
    expect((await invoke('status')).find((c: any) => c.id === playlistId).name).toBe(
      'Old playlist',
    );
    expect(await invoke('channels', playlistId)).toEqual([old]);
    mocks.fetch.mockResolvedValueOnce(
      new Response('bytes', { headers: { 'content-type': 'video/mp2t' } }),
    );
    expect((await mocks.protocol!(new Request(playback.url))).status).toBe(200);
  });
  it('revokes old playback capabilities only after a valid replacement is persisted', async () => {
    const { invoke } = await setup();
    const [old] = await invoke('channels', playlistId);
    const playback = await invoke('play', playlistId, old.id);
    mocks.fetch.mockResolvedValueOnce(new Response(replacement));
    expect(
      await invoke('playlist-update', {
        id: playlistId,
        name: 'Replacement',
        url: 'https://example.com/list',
      }),
    ).toMatchObject({ name: 'Replacement', channelCount: 1 });
    expect((await mocks.protocol!(new Request(playback.url))).status).toBe(410);
    mocks.fetch.mockResolvedValueOnce(new Response(replacement));
    expect((await invoke('channels', playlistId))[0].name).toBe('New channel');
  });
  it('discards a completed candidate after account change, disconnect or concurrent update', async () => {
    for (const action of ['scope', 'disconnect', 'update']) {
      const { invoke, changeScope } = await setup();
      const pending = deferred<Response>();
      mocks.fetch.mockReturnValueOnce(pending.promise);
      const updating = invoke('playlist-update', {
        id: playlistId,
        name: 'Stale',
        url: 'https://example.com/replacement',
      });
      if (action === 'scope') changeScope();
      else if (action === 'disconnect') await invoke('disconnect', playlistId);
      else await invoke('playlist-update', { id: playlistId, name: 'Current' });
      pending.resolve(new Response(replacement));
      await expect(updating).rejects.toThrow('changed');
      const result = (await invoke('status')).find((c: any) => c.id === playlistId);
      expect(result?.name).toBe(
        action === 'disconnect' ? undefined : action === 'update' ? 'Current' : 'Old playlist',
      );
    }
  });
  it('strictly rejects duplicate source fields, wrong provider types and empty replacement secrets', async () => {
    const { invoke } = await setup();
    await expect(
      invoke('playlist-update', {
        id: playlistId,
        name: 'Invalid',
        url: 'https://example.com/list',
        token: xtreamId,
      }),
    ).rejects.toThrow('one URL or file');
    await expect(invoke('xtream-update', { id: playlistId, name: 'Invalid' })).rejects.toThrow(
      'not Xtream',
    );
    await expect(
      invoke('xtream-update', { id: xtreamId, name: 'Invalid', password: '' }),
    ).rejects.toThrow('fields');
    await expect(
      invoke('playlist-update', { id: playlistId, name: 'Invalid', path: '/private/file' }),
    ).rejects.toThrow('fields');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('updates a remote playlist from an actual parsed native file token without returning its path or contents', async () => {
    delete mocks.stored[0].playlistText;
    mocks.stored[0].url = 'https://example.com/old-list';
    mocks.chooser.mockResolvedValue({ canceled: false, filePaths: ['/private/replacement.m3u'] });
    let consumed = false;
    const bytes = Buffer.from(replacement);
    mocks.open.mockResolvedValue({
      stat: async () => ({ isFile: () => true, size: bytes.length }),
      read: async (buffer: Buffer, offset: number) => {
        if (consumed) return { bytesRead: 0 };
        bytes.copy(buffer, offset);
        consumed = true;
        return { bytesRead: bytes.length };
      },
      close: async () => {},
    });
    const { invoke } = await setup();
    const picked = await invoke('pick-playlist');
    const saved = await invoke('playlist-update', {
      id: playlistId,
      name: 'File replacement',
      token: picked.token,
    });
    expect(saved).toMatchObject({ name: 'File replacement', channelCount: 1 });
    const stored = JSON.parse(mocks.encrypted.mock.calls[0][0]).find(
      (item: any) => item.id === playlistId,
    );
    expect(stored.playlistText).toBe(replacement);
    expect(stored.url).toBeUndefined();
    expect(JSON.stringify(saved)).not.toContain('secret');
    expect(mocks.encrypted.mock.calls[0][0]).not.toContain('/private/replacement.m3u');
    expect(mocks.fetch).not.toHaveBeenCalled();
    await expect(
      invoke('playlist-update', { id: playlistId, name: 'Replay', token: picked.token }),
    ).rejects.toThrow('expired');
  });
});

describe('Real-Debrid pending attempt cancellation', () => {
  async function started() {
    mocks.fetch.mockReset();
    vi.useFakeTimers();
    const context = await setup();
    mocks.fetch.mockResolvedValueOnce(device());
    await context.invoke('rd-start');
    vi.advanceTimersByTime(5000);
    return context;
  }
  it('cancels in-flight start before device receipt without opening a browser or persisting', async () => {
    const { invoke } = await setup();
    const request = deferred<Response>();
    mocks.fetch.mockReturnValueOnce(request.promise);
    const starting = invoke('rd-start');
    await invoke('rd-cancel');
    request.resolve(device());
    await expect(starting).rejects.toThrow('cancelled');
    expect(mocks.external).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(await invoke('rd-poll')).toEqual({ state: 'expired' });
  });
  it('fences cancellation while external browser launch is pending', async () => {
    const { invoke } = await setup();
    const browser = deferred<void>();
    mocks.external.mockReturnValueOnce(browser.promise);
    mocks.fetch.mockResolvedValueOnce(device());
    const starting = invoke('rd-start');
    await vi.waitFor(() => expect(mocks.external).toHaveBeenCalledOnce());
    await invoke('rd-cancel');
    browser.resolve();
    await expect(starting).rejects.toThrow('cancelled');
    expect(await invoke('rd-poll')).toEqual({ state: 'expired' });
  });
  it('discards credential and token receipts after cancellation or account change', async () => {
    for (const stage of ['credentials', 'token'])
      for (const action of ['cancel', 'scope']) {
        const { invoke, changeScope } = await started();
        const request = deferred<Response>();
        if (stage === 'token') mocks.fetch.mockResolvedValueOnce(credentials());
        mocks.fetch.mockReturnValueOnce(request.promise);
        const polling = invoke('rd-poll');
        if (stage === 'token') await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3));
        if (action === 'cancel') await invoke('rd-cancel');
        else changeScope();
        request.resolve(stage === 'token' ? grant() : credentials());
        await expect(polling).rejects.toThrow(
          action === 'cancel' ? 'cancelled' : 'account changed',
        );
        expect(mocks.write).not.toHaveBeenCalled();
        expect((await invoke('status')).filter((c: any) => c.type === 'real-debrid')).toEqual([]);
      }
  });
  it('superseding start rejects a stale poll, while successful grant persists once', async () => {
    const { invoke } = await started();
    const stale = deferred<Response>();
    mocks.fetch.mockReturnValueOnce(stale.promise);
    const polling = invoke('rd-poll');
    mocks.fetch.mockResolvedValueOnce(device());
    await invoke('rd-start');
    stale.resolve(credentials());
    await expect(polling).rejects.toThrow('cancelled');
    vi.advanceTimersByTime(5000);
    mocks.fetch.mockResolvedValueOnce(credentials()).mockResolvedValueOnce(grant());
    expect(await invoke('rd-poll')).toEqual({ state: 'connected' });
    expect(mocks.write).toHaveBeenCalledOnce();
    await invoke('rd-cancel');
    expect((await invoke('status')).filter((c: any) => c.type === 'real-debrid')).toHaveLength(1);
    expect(await invoke('rd-poll')).toEqual({ state: 'expired' });
  });
  it('does not persist a grant if encrypted storage fails or clearPlayback invalidates the attempt', async () => {
    const { invoke, runtime } = await started();
    mocks.fetch.mockResolvedValueOnce(credentials()).mockResolvedValueOnce(grant());
    mocks.write.mockImplementationOnce(() => {
      throw new Error('private vault');
    });
    await expect(invoke('rd-poll')).rejects.toThrow('request failed');
    expect((await invoke('status')).filter((c: any) => c.type === 'real-debrid')).toHaveLength(0);
    runtime.clearPlayback();
    expect(await invoke('rd-poll')).toEqual({ state: 'expired' });
  });
  it('fences cancellation during credential response body consumption', async () => {
    const { invoke } = await started();
    const body = deferred<Uint8Array>();
    mocks.fetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          async start(controller) {
            controller.enqueue(await body.promise);
            controller.close();
          },
        }),
      ),
    );
    const polling = invoke('rd-poll');
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    await invoke('rd-cancel');
    body.resolve(Buffer.from(JSON.stringify({ client_id: 'private', client_secret: 'secret' })));
    await expect(polling).rejects.toThrow('cancelled');
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('keeps an existing account on cancellation and atomically replaces its credentials on reconnect', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    mocks.stored.push({
      id,
      type: 'real-debrid',
      name: 'Real-Debrid',
      favorites: [],
      resume: { item: 42 },
      credentials: {
        client_id: 'old-c',
        client_secret: 'old-s',
        access_token: 'old-access',
        refresh_token: 'old-refresh',
        expiresAt: Date.now() + 600000,
      },
    });
    const { invoke } = await started();
    await invoke('rd-cancel');
    expect(
      (await invoke('status')).filter((item: any) => item.type === 'real-debrid'),
    ).toHaveLength(1);
    expect(mocks.write).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValueOnce(device());
    await invoke('rd-start');
    vi.advanceTimersByTime(5000);
    mocks.fetch.mockResolvedValueOnce(credentials()).mockResolvedValueOnce(grant());
    expect(await invoke('rd-poll')).toEqual({ state: 'connected' });
    const stored = JSON.parse(mocks.encrypted.mock.calls[0][0]).filter(
      (item: any) => item.type === 'real-debrid',
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id,
      resume: { item: 42 },
      credentials: { access_token: 'access-secret' },
    });
  });
});

describe('private account and server vault boundaries', () => {
  it('uses stable hashed v2 vaults, isolates equal user IDs on different servers and leaves v1 untouched', async () => {
    const { invoke, setIdentity, setScope } = await setup();
    mocks.vaults = new Map();
    mocks.write.mockImplementation((path: string, bytes: Buffer) =>
      mocks.vaults!.set(path.replace(/\.tmp$/, ''), JSON.parse(bytes.toString())),
    );
    setIdentity('server-a:user-1');
    setScope('epoch');
    mocks.fetch.mockResolvedValueOnce(new Response(playlist));
    const first = await invoke('playlist', { name: 'Private A', url: 'https://example.com/list' });
    const pathA = mocks.write.mock.calls[0][0];
    setIdentity('server-b:user-1');
    expect(await invoke('status')).toEqual([]);
    mocks.fetch.mockResolvedValueOnce(new Response(replacement));
    await invoke('playlist', { name: 'Private B', url: 'https://example.com/list' });
    const pathB = mocks.write.mock.calls[1][0];
    expect(pathA).not.toBe(pathB);
    expect(pathA).toMatch(/personal-providers-v2-[a-f0-9]{64}\.bin.tmp$/);
    expect(pathA).not.toContain('server-a');
    setIdentity('server-a:user-1');
    setScope('epoch-new');
    expect(await invoke('status')).toEqual([{ ...first, status: 'error', channelCount: 0 }]);
    expect(mocks.readPaths.every((path) => !path.includes('personal-providers-v1'))).toBe(true);
  });
  it('shows no private records and performs no network or vault access while signed out', async () => {
    const { invoke, setIdentity } = await setup();
    setIdentity(null);
    expect(await invoke('status')).toEqual([]);
    await expect(
      invoke('playlist', { name: 'Denied', url: 'https://example.com/list' }),
    ).rejects.toThrow('signed-in');
    await expect(invoke('rd-start')).rejects.toThrow('signed-in');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.readPaths).toEqual([]);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('fences URL/Xtream adds across account changes and leaves maps untouched on persistence failure', async () => {
    for (const type of ['playlist', 'xtream']) {
      mocks.fetch.mockReset();
      const { invoke, setIdentity } = await setup();
      const request = deferred<Response>();
      mocks.fetch.mockReturnValueOnce(request.promise);
      const input =
        type === 'playlist'
          ? { name: 'New', url: 'https://example.com/list' }
          : { name: 'New', serverUrl: 'https://example.com', username: 'user', password: 'secret' };
      const adding = invoke(type, input);
      setIdentity('other-server:same-user');
      request.resolve(
        type === 'playlist'
          ? new Response(playlist)
          : new Response(JSON.stringify([{ stream_id: 1, name: 'Channel' }])),
      );
      await expect(adding).rejects.toThrow('account changed');
      expect((await invoke('status')).some((item: any) => item.name === 'New')).toBe(false);
      mocks.fetch.mockResolvedValueOnce(
        type === 'playlist'
          ? new Response(playlist)
          : new Response(JSON.stringify([{ stream_id: 1, name: 'Channel' }])),
      );
      mocks.write.mockImplementationOnce(() => {
        throw new Error('private vault failure');
      });
      await expect(invoke(type, input)).rejects.toThrow('request failed');
      expect((await invoke('status')).some((item: any) => item.name === 'New')).toBe(false);
    }
  });
  it('rejects outstanding channel reads on epoch ABA and does not repopulate a disconnected cache', async () => {
    const { invoke, setScope } = await setup();
    mocks.fetch.mockResolvedValueOnce(new Response(playlist));
    const added = await invoke('playlist', { name: 'Remote', url: 'https://example.com/list' });
    const request = deferred<Response>();
    mocks.fetch.mockReturnValueOnce(request.promise);
    const reading = invoke('channels', added.id);
    setScope('epoch-2:user-a');
    await invoke('status');
    setScope('epoch-3:user-a');
    request.resolve(new Response(replacement));
    await expect(reading).rejects.toThrow('account changed');
    mocks.fetch.mockResolvedValueOnce(new Response(playlist));
    const next = await invoke('playlist', { name: 'Remote', url: 'https://example.com/list' });
    const late = deferred<Response>();
    mocks.fetch.mockReturnValueOnce(late.promise);
    const stale = invoke('channels', next.id);
    await invoke('disconnect', next.id);
    late.resolve(new Response(replacement));
    await expect(stale).rejects.toThrow('connection changed');
    await expect(invoke('play', next.id, 'arbitrary')).rejects.toThrow('not found');
  });
  it('revokes capabilities at protocol entry without any subsequent IPC and fences streamed chunks', async () => {
    const { invoke, setIdentity } = await setup();
    const [channel] = await invoke('channels', playlistId);
    const playback = await invoke('play', playlistId, channel.id);
    setIdentity('other-server:same-user');
    expect((await mocks.protocol!(new Request(playback.url))).status).toBe(410);
    expect(mocks.fetch).not.toHaveBeenCalled();
    setIdentity('stable-server:user-a');
    const [current] = await invoke('channels', playlistId);
    const active = await invoke('play', playlistId, current.id);
    const chunk = deferred<Uint8Array>();
    mocks.fetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          async pull(controller) {
            controller.enqueue(await chunk.promise);
          },
        }),
        { headers: { 'content-type': 'video/mp2t' } },
      ),
    );
    const response = await mocks.protocol!(new Request(active.url));
    const reading = response.body!.getReader().read();
    setIdentity(null);
    chunk.resolve(new Uint8Array([1]));
    await expect(reading).rejects.toThrow('expired');
  });
  it('fences XMLTV and Real-Debrid library receipts on scope change and preserves library on unrelated disconnect', async () => {
    mocks.stored[0].playlistText = playlist.replace('#EXTINF:-1,', '#EXTINF:-1 tvg-id="one",');
    mocks.stored.push({
      id: '33333333-3333-4333-8333-333333333333',
      type: 'real-debrid',
      name: 'Real-Debrid',
      favorites: [],
      credentials: {
        client_id: 'c',
        client_secret: 's',
        access_token: 'access',
        refresh_token: 'refresh',
        expiresAt: Date.now() + 600000,
      },
    });
    const { invoke, setScope } = await setup();
    const [channel] = await invoke('channels', playlistId);
    const epg = deferred<Response>();
    mocks.fetch.mockReturnValueOnce(epg.promise);
    const reading = invoke('epg', playlistId, channel.id);
    setScope('epoch-2');
    epg.resolve(new Response('<tv/>'));
    await expect(reading).rejects.toThrow('account changed');
    mocks.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 'item',
            filename: 'Personal video',
            download: 'https://example.com/personal.mp4',
            filesize: 1,
          },
        ]),
      ),
    );
    await invoke('rd-library');
    await invoke('disconnect', playlistId);
    expect(await invoke('rd-play', 'item')).toMatchObject({ name: 'Personal video' });
    const library = deferred<Response>();
    mocks.fetch.mockReturnValueOnce(library.promise);
    const loading = invoke('rd-library');
    await Promise.resolve();
    setScope('epoch-3');
    library.resolve(new Response('[]'));
    await expect(loading).rejects.toThrow('account changed');
    await expect(invoke('rd-play', 'item')).rejects.toThrow('expired');
  });
  it('discards token refresh receipts after account change or provider disconnect', async () => {
    mocks.stored.push({
      id: '33333333-3333-4333-8333-333333333333',
      type: 'real-debrid',
      name: 'Real-Debrid',
      favorites: [],
      credentials: {
        client_id: 'c',
        client_secret: 's',
        access_token: 'old',
        refresh_token: 'refresh',
        expiresAt: 0,
      },
    });
    for (const action of ['scope', 'disconnect']) {
      mocks.fetch.mockReset();
      const { invoke, setScope } = await setup();
      const refreshing = deferred<Response>();
      mocks.fetch.mockReturnValueOnce(refreshing.promise);
      const loading = invoke('rd-library');
      if (action === 'scope') setScope('new-epoch');
      else {
        mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
        await invoke('disconnect', '33333333-3333-4333-8333-333333333333');
      }
      refreshing.resolve(grant());
      await expect(loading).rejects.toThrow(
        action === 'scope' ? 'account changed' : 'connection changed',
      );
      expect(mocks.encrypted.mock.calls.some(([value]) => value.includes('access-secret'))).toBe(
        false,
      );
    }
  });
});
