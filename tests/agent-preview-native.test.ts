import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const native = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  directory: '',
  save: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => native.directory },
  ipcMain: { handle: (name: string, fn: Function) => native.handlers.set(name, fn) },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (s: Buffer) => s.toString(),
  },
  dialog: { showSaveDialog: native.save },
}));
import { setupAgent } from '../apps/desktop/electron/agent';
let user: string | null,
  fixture = false,
  trusted = true;
const taskId = randomUUID(),
  artifactId = randomUUID();
const preview = () => ({
  state: 'text',
  taskId,
  artifact: { id: artifactId, name: 'report.txt', mime: 'text/plain', size: 4 },
  text: 'Text',
  encoding: 'utf-8',
  sourcesAvailable: false,
});
const invoke = (name: string, ...args: unknown[]) =>
  native.handlers.get('rooms:agent-' + name)!({}, ...args);
beforeEach(async () => {
  native.directory = mkdtempSync(join(tmpdir(), 'rooms-preview-native-'));
  native.handlers.clear();
  native.save.mockReset();
  user = 'member';
  fixture = false;
  trusted = true;
  setupAgent(
    () =>
      ({
        webContents: {
          getURL: () => (fixture ? 'http://localhost/?fixture=s57' : 'http://localhost/'),
        },
      }) as any,
    () => {
      if (!trusted) throw new Error('Untrusted frame');
    },
    () => user,
  );
  await invoke('configure', { url: 'https://agent.example', token: 'local-fixture-token-only' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(native.directory, { recursive: true, force: true });
});
it('validates trusted frame/fixture/input and exact returned artifact scope', async () => {
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(JSON.stringify(url.endsWith('/status') ? { userId: 'member' } : preview())),
  );
  vi.stubGlobal('fetch', fetcher);
  expect(await invoke('artifact-preview', taskId, artifactId)).toMatchObject({ state: 'text' });
  await expect(invoke('artifact-preview', '../bad', artifactId)).rejects.toThrow();
  fixture = true;
  expect(() => invoke('artifact-preview', taskId, artifactId)).toThrow('fixtures');
  fixture = false;
  trusted = false;
  expect(() => invoke('artifact-preview', taskId, artifactId)).toThrow('Untrusted');
  trusted = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith('/status') ? { userId: 'member' } : { ...preview(), taskId: randomUUID() },
          ),
        ),
    ),
  );
  await expect(invoke('artifact-preview', taskId, artifactId)).rejects.toThrow('scope changed');
});
it.each(['account', 'server'] as const)(
  'discards an asynchronous preview after initiating %s changes',
  async (mode) => {
    let release!: () => void, entered!: () => void;
    const waiting = new Promise<void>((r) => {
        release = r;
      }),
      started = new Promise<void>((r) => {
        entered = r;
      });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/status')) return new Response(JSON.stringify({ userId: 'member' }));
        entered();
        await waiting;
        return new Response(JSON.stringify(preview()));
      }),
    );
    const pending = invoke('artifact-preview', taskId, artifactId);
    await started;
    if (mode === 'account') user = 'other';
    else
      await invoke('configure', {
        url: 'https://other.example',
        token: 'another-local-fixture-token',
      });
    release();
    await expect(pending).rejects.toThrow('account changed');
  },
);
it('rejects over-limit native wire responses before parsing or returning content', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          url.endsWith('/status') ? JSON.stringify({ userId: 'member' }) : 'x'.repeat(1_700_001),
        ),
    ),
  );
  await expect(invoke('artifact-preview', taskId, artifactId)).rejects.toThrow('exceeds the limit');
});

it('downloads bytes only after a second actual artifact access check following the save dialog', async () => {
  const path = join(native.directory, 'saved.txt'),
    calls: string[] = [];
  native.save.mockResolvedValue({ canceled: false, filePath: path });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      expect(options.redirect).toBe('error');
      calls.push(url);
      return new Response(
        url.endsWith('/status')
          ? JSON.stringify({ userId: 'member' })
          : url.endsWith('/preview')
            ? JSON.stringify(preview())
            : 'Actual downloaded fixture',
      );
    }),
  );
  expect(await invoke('artifact', taskId, artifactId)).toBe(true);
  expect(readFileSync(path, 'utf8')).toBe('Actual downloaded fixture');
  expect(calls.at(-1)).toContain('/preview');
});
it.each(['body-account', 'dialog-account', 'dialog-server', 'dialog-permission'] as const)(
  'does not write downloaded bytes after %s revocation',
  async (mode) => {
    const path = join(native.directory, 'must-not-exist.txt');
    let release!: () => void, entered!: () => void;
    const waiting = new Promise<void>((r) => {
        release = r;
      }),
      started = new Promise<void>((r) => {
        entered = r;
      });
    native.save.mockImplementation(async () => {
      if (mode !== 'body-account') {
        entered();
        await waiting;
      }
      return { canceled: false, filePath: path };
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/status')) return new Response(JSON.stringify({ userId: 'member' }));
        if (url.endsWith('/preview'))
          return mode === 'dialog-permission'
            ? new Response(JSON.stringify({ error: 'ROOM_ACCESS_DENIED' }), { status: 403 })
            : new Response(JSON.stringify(preview()));
        if (mode === 'body-account') {
          return new Response(
            new ReadableStream({
              async start(controller) {
                controller.enqueue(new TextEncoder().encode('Private fixture'));
                entered();
                await waiting;
                controller.close();
              },
            }),
          );
        }
        return new Response('Private fixture');
      }),
    );
    const pending = invoke('artifact', taskId, artifactId);
    await started;
    if (mode.endsWith('account')) user = null;
    else if (mode === 'dialog-server')
      await invoke('configure', { url: 'https://new.example', token: 'different-fixture-token' });
    release();
    await expect(pending).rejects.toThrow(
      mode === 'dialog-permission' ? 'ROOM_ACCESS_DENIED' : 'account changed',
    );
    expect(existsSync(path)).toBe(false);
    if (mode === 'body-account') expect(native.save).not.toHaveBeenCalled();
  },
);
it('keeps the download cap and rejects bad IDs before network or a save dialog', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          url.endsWith('/status')
            ? JSON.stringify({ userId: 'member' })
            : new Uint8Array(10_000_001),
        ),
    ),
  );
  await expect(invoke('artifact', '../bad', artifactId)).rejects.toThrow();
  await expect(invoke('artifact', taskId, artifactId)).rejects.toThrow('download limit');
  expect(native.save).not.toHaveBeenCalled();
});
