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
  await expect(handlers.get('rooms:hostops-hosts')!({})).rejects.toThrow('BAD_SENDER');
});

it('explains an unconfigured SPA fallback without exposing schema diagnostics', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('<html>ROOMS</html>', { status: 200 })),
  );
  const client = { instanceUrl: 'https://qa.invalid', getToken: () => 'qa-token' };
  const bridge = setupHostOps(
    () => client,
    () => null,
    () => {},
  );
  await expect(handlers.get('rooms:hostops-hosts')!({})).rejects.toThrow('henüz yapılandırılmadı');
  bridge.close();
});
it('notifies an owner-equivalent admin of new server alerts once, and nobody else', async () => {
  const alert = (id: string, message: string) => ({
    id,
    hostId: 'core',
    kind: 'disk',
    message,
    createdAt: 1,
    updatedAt: 1,
    resolvedAt: null,
    delivery: 'pending',
  });
  const host = (id: string, owner: boolean) => ({
    id,
    label: id === 'core' ? 'Tayfa sunucusu' : 'Diğer',
    physicalHostId: 'primary',
    mode: 'shared',
    owner,
    permissions: ['monitor'],
    terminalAvailable: true,
    agentAvailable: false,
    reason: null,
  });
  const acked: string[] = [];
  let pending = [alert('11111111-1111-4111-8111-111111111111', 'Disk %92 dolu')];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, init?: RequestInit) => {
      const path = url.pathname;
      if (path.endsWith('/hosts'))
        return Response.json({ hosts: [host('core', true), host('other', false)] });
      if (path.endsWith('/alerts/ack')) {
        acked.push(...JSON.parse(String(init?.body)).ids);
        pending = [];
        return Response.json({ ok: true });
      }
      if (path.endsWith('/snapshot'))
        return Response.json({
          host: host(path.includes('/core/') ? 'core' : 'other', path.includes('/core/')),
          sample: null,
          stale: false,
          thresholds: { cpuPercent: 85, cpuSeconds: 60, diskFreePercent: 15, backupHours: 24 },
          alerts: path.includes('/core/')
            ? pending
            : [alert('22222222-2222-4222-8222-222222222222', 'x')],
        });
      return new Response('{}', { status: 404 });
    }),
  );
  const shown: string[] = [];
  const client = { instanceUrl: 'https://qa.invalid', getToken: () => 'token' };
  const bridge = setupHostOps(
    () => client,
    () => null,
    () => {},
    (message) => shown.push(message),
  );
  await bridge.checkAlerts();
  await bridge.checkAlerts();
  expect(shown).toEqual(['Tayfa sunucusu: Disk %92 dolu']);
  expect(acked).toEqual(['11111111-1111-4111-8111-111111111111']);
  bridge.dispose();
});
it('never acknowledges a server alert it did not show: a burst is summarised, not dropped', async () => {
  const ids = Array.from({ length: 5 }, (_, i) => `1111111${i}-1111-4111-8111-111111111111`);
  const alerts = ids.map((id, i) => ({
    id,
    hostId: 'core',
    kind: 'disk',
    message: `Uyarı ${i}`,
    createdAt: 1,
    updatedAt: 1,
    resolvedAt: null,
    delivery: 'pending',
  }));
  const host = {
    id: 'core',
    label: 'Tayfa sunucusu',
    physicalHostId: 'primary',
    mode: 'shared',
    owner: true,
    permissions: ['monitor'],
    terminalAvailable: true,
    agentAvailable: false,
    reason: null,
  };
  const acked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, init?: RequestInit) => {
      if (url.pathname.endsWith('/hosts')) return Response.json({ hosts: [host] });
      if (url.pathname.endsWith('/alerts/ack')) {
        acked.push(...JSON.parse(String(init?.body)).ids);
        return Response.json({ ok: true });
      }
      if (url.pathname.endsWith('/snapshot'))
        return Response.json({
          host,
          sample: null,
          stale: false,
          thresholds: { cpuPercent: 85, cpuSeconds: 60, diskFreePercent: 15, backupHours: 24 },
          alerts,
        });
      return new Response('{}', { status: 404 });
    }),
  );
  const shown: string[] = [];
  const bridge = setupHostOps(
    () => ({ instanceUrl: 'https://qa.invalid', getToken: () => 'token' }),
    () => null,
    () => {},
    (message) => shown.push(message),
  );
  await bridge.checkAlerts();
  expect(shown).toHaveLength(4);
  expect(shown.slice(0, 3)).toEqual([
    'Tayfa sunucusu: Uyarı 0',
    'Tayfa sunucusu: Uyarı 1',
    'Tayfa sunucusu: Uyarı 2',
  ]);
  expect(shown[3]).toContain('2 uyarı daha');
  expect(acked).toEqual(ids);
  bridge.dispose();
});
