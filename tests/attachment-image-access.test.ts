import { afterEach, it, expect, vi } from 'vitest';
import { StoatClient } from '../packages/stoat-adapter/src';
const message = {
  _id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  channel: 'channel',
  author: 'owner',
  user: { _id: 'owner', username: 'owner' },
  content: '',
  attachments: [{ _id: 'file', filename: 'photo.png', size: 12, content_type: 'image/png' }],
};
afterEach(() => vi.restoreAllMocks());
function network(revoke = false, mime = 'image/png') {
  let reads = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
    const url = String(input);
    if (url === 'https://rooms.example/api')
      return new Response(
        JSON.stringify({
          features: { autumn: { enabled: true, url: 'https://rooms.example/autumn' } },
        }),
      );
    if (url.includes('/messages/01ARZ3NDEKTSV4RRFFQ69G5FAV')) {
      reads++;
      return reads === 2 && revoke
        ? new Response('{}', { status: 403 })
        : new Response(JSON.stringify(message));
    }
    if (url.includes('/autumn/attachments/file/photo.png')) {
      expect(options?.headers).toBeUndefined();
      return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]), {
        headers: { 'content-type': mime },
      });
    }
    throw new Error('Unexpected fixture URL ' + url);
  });
}
it('reauthorizes the exact message before returning raster data and sends no session token to file downloads', async () => {
  const fetcher = network();
  const client = new StoatClient('https://rooms.example/api', 'fixture-session');
  expect(await client.attachmentImage('channel', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'file')).toMatch(
    /^data:image\/png;base64,/,
  );
  expect(
    fetcher.mock.calls.filter(([url]) =>
      String(url).includes('/messages/01ARZ3NDEKTSV4RRFFQ69G5FAV'),
    ),
  ).toHaveLength(2);
});
it('downloads exact attachment bytes only while current message access remains valid', async () => {
  network();
  const client = new StoatClient('https://rooms.example/api', 'fixture-session');
  const file = await client.attachmentFile('channel', message._id, 'file');
  expect(file.name).toBe('photo.png');
  expect(file.bytes.length).toBe(12);
});
it('rejects revoked file access and missing attachments rather than exposing a download URL', async () => {
  network(true);
  const client = new StoatClient('https://rooms.example/api', 'fixture-session');
  await expect(client.attachmentFile('channel', message._id, 'file')).rejects.toMatchObject({
    status: 403,
  });
  const fresh = new StoatClient('https://rooms.example/api', 'fixture-session');
  await expect(fresh.attachmentFile('channel', message._id, 'missing')).rejects.toMatchObject({
    status: 404,
  });
});
it('rejects an access revocation during the image download', async () => {
  network(true);
  const client = new StoatClient('https://rooms.example/api', 'fixture-session');
  await expect(
    client.attachmentImage('channel', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'file'),
  ).rejects.toMatchObject({ status: 403 });
});
it('refuses a different attachment identity or executable image type', async () => {
  network(false, 'image/svg+xml');
  const client = new StoatClient('https://rooms.example/api', 'fixture-session');
  expect(
    await client.attachmentImage('channel', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'other-file'),
  ).toBeNull();
  expect(await client.attachmentImage('channel', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'file')).toBeNull();
});
it('serves photos of already loaded messages without re-reading each message while connected', async () => {
  const fetcher = network();
  const client = new StoatClient('https://rooms.example/api', 'fixture-session');
  const internal = client as any;
  internal.status = 'connected';
  internal.messages.set(message._id, message);
  expect(await client.attachmentImage('channel', message._id, 'file')).toMatch(/^data:image\/png/);
  expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/messages/'))).toHaveLength(0);
  // An invalidated channel, or a reconnect that may have missed deletes, asks upstream again.
  internal.invalidChannels.add('channel');
  await expect(client.attachmentImage('channel', message._id, 'file')).rejects.toMatchObject({
    status: 409,
  });
  expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/messages/'))).toHaveLength(1);
  internal.invalidChannels.delete('channel');
  await internal.processPacket({ type: 'Ready', users: [], servers: [], channels: [] });
  expect(internal.messages.has(message._id)).toBe(false);
});
