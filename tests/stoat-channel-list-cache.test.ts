import { afterEach, expect, it, vi } from 'vitest';
import { StoatClient } from '@rooms/stoat';
afterEach(() => vi.unstubAllGlobals());

const text = (id: string) => ({
  _id: id,
  channel_type: 'TextChannel',
  server: 'space',
  name: id,
});
function upstream(serverChannels: string[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = new URL(url).pathname.replace(/^\/api/, '').replace(/^\/0\.8/, '');
      calls.push(`${init.method ?? 'GET'} ${path}`);
      if (path === '/servers/space/channels' && init.method === 'POST')
        return Response.json(text('created'));
      if (path === '/servers/space')
        return Response.json({ _id: 'space', channels: serverChannels });
      const channel = /^\/channels\/([^/]+)$/.exec(path)?.[1];
      if (channel && (init.method ?? 'GET') === 'GET') return Response.json(text(channel));
      if (channel && init.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ type: 'NotFound' }, { status: 404 });
    }),
  );
  return calls;
}
function connected(client: StoatClient, channels: string[]) {
  const internal = client as any;
  internal.status = 'connected';
  internal.servers.set('space', { _id: 'space', name: 'Space', owner: 'self', channels });
  return internal;
}

it('lists channels from the live gateway state without spending the 5/10 s server bucket', async () => {
  // Upstream allows five server-bucket calls per ten seconds. Every post-create refresh used to
  // re-read the server, so a channel save waited ~10-20 s for the window to reset.
  const calls = upstream(['general', 'voice']);
  const client = new StoatClient('http://localhost', 'fixture');
  connected(client, ['general', 'voice']);
  const listed = await client.listChannels('space');
  expect(listed.map((channel) => channel.id)).toEqual(['general', 'voice']);
  expect(calls.filter((call) => call.startsWith('GET /servers/'))).toEqual([]);
});

it('includes a created channel and drops a deleted one before the gateway echoes it', async () => {
  const calls = upstream(['general']);
  const client = new StoatClient('http://localhost', 'fixture');
  const internal = connected(client, ['general']);
  await client.createChannel('space', 'created', 'text');
  expect((await client.listChannels('space')).map((channel) => channel.id)).toEqual([
    'general',
    'created',
  ]);
  await client.deleteChannel('created');
  expect((await client.listChannels('space')).map((channel) => channel.id)).toEqual(['general']);
  expect(internal.servers.get('space').channels).toEqual(['general']);
  expect(calls.filter((call) => call.startsWith('GET /servers/'))).toEqual([]);
});

it('reads the server from upstream while the gateway is not connected', async () => {
  const calls = upstream(['general', 'fresh']);
  const client = new StoatClient('http://localhost', 'fixture');
  const internal = connected(client, ['general']);
  internal.status = 'reconnecting';
  const listed = await client.listChannels('space');
  expect(listed.map((channel) => channel.id)).toEqual(['general', 'fresh']);
  expect(calls).toContain('GET /servers/space');
});
