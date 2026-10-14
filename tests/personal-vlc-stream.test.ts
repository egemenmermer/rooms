import { afterEach, describe, expect, it } from 'vitest';
import { createVLCStream } from '../apps/desktop/electron/personal-vlc-stream';
const root = 'rooms-provider://11111111-1111-4111-8111-111111111111/stream';
const child = 'rooms-provider://22222222-2222-4222-8222-222222222222/stream';
const opened: { close(): void }[] = [];
afterEach(() => {
  for (const value of opened.splice(0)) value.close();
});
async function open(fetchSource: (request: Request) => Promise<Response>, check = () => {}) {
  const value = await createVLCStream(root, fetchSource, check);
  opened.push(value);
  return value;
}
describe('private local VLC streaming authority', () => {
  it('streams a supported container without provider addresses or renderer CORS', async () => {
    const stream = await open(
      async () =>
        new Response(new Uint8Array([0x47, 1, 2, 3]), {
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
    );
    const response = await fetch(stream.url);
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0x47, 1, 2, 3]);
  });
  it('rejects non-capability access and browser origins', async () => {
    let requests = 0;
    const stream = await open(async () => {
      requests++;
      return new Response();
    });
    expect((await fetch(stream.url.replace(/\/[a-f0-9]{64}\//, '/wrong/'))).status).toBe(404);
    expect((await fetch(stream.url, { headers: { Origin: 'https://example.com' } })).status).toBe(
      403,
    );
    expect(requests).toBe(0);
  });
  it('rewrites only authorized opaque HLS children into local capabilities', async () => {
    const stream = await open(async (request) =>
      request.url === root
        ? new Response(`#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\n${child}\n`, {
            headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
          })
        : new Response(new Uint8Array([0x47, 5])),
    );
    const response = await fetch(stream.url);
    const text = await response.text();
    expect(text).not.toContain('rooms-provider:');
    const uri = text.split('\n').find((line) => line.startsWith('http:'))!;
    expect(uri.startsWith(new URL(stream.url).origin)).toBe(true);
    expect((await fetch(uri)).status).toBe(200);
  });
  it.each(['https://example.com/private', 'file:///etc/passwd', 'udp://127.0.0.1:1234'])(
    'rejects unresolved HLS source %s',
    async (url) => {
      const stream = await open(
        async () =>
          new Response(`#EXTM3U\n${url}`, {
            headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
          }),
      );
      expect((await fetch(stream.url)).status).toBe(502);
    },
  );
  it('rejects root reference playlists even when provider MIME claims video', async () => {
    const stream = await open(
      async () =>
        new Response('<asx><ref href="file:///etc/passwd"/></asx>', {
          headers: { 'Content-Type': 'video/mp4' },
        }),
    );
    expect((await fetch(stream.url)).status).toBe(502);
  });
  it('revalidates a root on subsequent whole-file reads', async () => {
    let first = true;
    const stream = await open(async () => {
      if (first) {
        first = false;
        return new Response(new Uint8Array([0x47]));
      }
      return new Response('<asx><ref href="https://example.com/hidden"/></asx>');
    });
    expect((await fetch(stream.url)).status).toBe(200);
    expect((await fetch(stream.url)).status).toBe(502);
  });
  it('rejects reference documents in opaque HLS media children', async () => {
    const stream = await open(async (request) =>
      request.url === root
        ? new Response(`#EXTM3U\n#EXTINF:5,\n${child}\n`, {
            headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
          })
        : new Response('<asx><ref href="file:///etc/passwd"/></asx>'),
    );
    const text = await (await fetch(stream.url)).text();
    const uri = text.split('\n').find((line) => line.startsWith('http:'))!;
    expect((await fetch(uri)).status).toBe(502);
  });
  it('fences stale scope before upstream access and while reading', async () => {
    let current = true,
      requests = 0;
    const stream = await open(
      async () => {
        requests++;
        return new Response(new Uint8Array([0x47]));
      },
      () => {
        if (!current) throw new Error('Changed account');
      },
    );
    current = false;
    expect((await fetch(stream.url)).status).toBe(502);
    expect(requests).toBe(0);
  });
  it('forwards only a valid single-byte range', async () => {
    let upstreamRange: string | null = null;
    const stream = await open(async (request) => {
      upstreamRange = request.headers.get('Range');
      return new Response(new Uint8Array([0x47]), { status: 206 });
    });
    expect((await fetch(stream.url, { headers: { Range: 'bytes=1-4,6-9' } })).status).toBe(416);
    expect(upstreamRange).toBeNull();
    expect((await fetch(stream.url, { headers: { Range: 'bytes=0-' } })).status).toBe(206);
    expect(upstreamRange).toBe('bytes=0-');
  });
  it('revokes the listener and capabilities at close', async () => {
    const stream = await open(async () => new Response(new Uint8Array([0x47])));
    stream.close();
    await expect(fetch(stream.url)).rejects.toThrow();
  });
});
