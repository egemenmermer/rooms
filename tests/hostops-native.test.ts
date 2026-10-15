import { afterEach, expect, it, vi } from 'vitest';
const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
);
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, fn: (...args: unknown[]) => unknown) => handlers.set(name, fn),
  },
}));
import { setupHostOps } from '../apps/desktop/electron/hostops';
afterEach(() => {
  handlers.clear();
  vi.unstubAllGlobals();
});
it('fences responses after an account changes while the HTTP body is still streaming', async () => {
  const first = { instanceUrl: 'https://qa.invalid', getToken: () => 'one' },
    second = { instanceUrl: 'https://qa.invalid', getToken: () => 'two' };
  let client = first;
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              stream = c;
            },
          }),
          { status: 200 },
        ),
    ),
  );
  const bridge = setupHostOps(
    () => client,
    () => null,
    () => {},
  );
  const pending = handlers.get('rooms:hostops-hosts')!({});
  await vi.waitFor(() => expect(stream).toBeDefined());
  client = second;
  stream.enqueue(new TextEncoder().encode('{"hosts":[]}'));
  stream.close();
  await expect(pending).rejects.toThrow('Oturum değişti');
  bridge.close();
});
it('rejects untrusted sender and plaintext non-local origins before credentials leave main', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  setupHostOps(
    () => ({ instanceUrl: 'http://qa.invalid', getToken: () => 'secret' }),
    () => null,
    () => {},
  );
  await expect(handlers.get('rooms:hostops-hosts')!({})).rejects.toThrow('güvenli bağlantı');
  expect(fetcher).not.toHaveBeenCalled();
  setupHostOps(
    () => ({ instanceUrl: 'https://qa.invalid', getToken: () => 'secret' }),
    () => null,
    () => {
      throw Error('BAD_SENDER');
    },
  );
  expect(() => handlers.get('rooms:hostops-hosts')!({})).toThrow('BAD_SENDER');
});
