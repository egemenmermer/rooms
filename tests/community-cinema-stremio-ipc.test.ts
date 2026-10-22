import { describe, expect, it } from 'vitest';
import { setupCommunityCinema } from '../apps/desktop/electron/community-cinema';

const ADDON = 'https://torrentio.example/realdebrid=SECRETKEY/stream/movie/tt1160419.json';
const CACHED = 'https://torrentio.example/resolve/realdebrid/SECRETKEY/aaa/1/Dune.mkv';
const UNCACHED = 'https://torrentio.example/resolve/realdebrid/SECRETKEY/bbb/1/Dune.mkv';
const LAN = 'https://192.168.1.10/stream.mkv';

function setup() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const requests: { url: string; init?: RequestInit }[] = [];
  const opened: string[] = [];
  const fetchMock = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes('/stremio/assist?'))
      return Response.json([{ addon: 'Torrentio', url: ADDON }]);
    if (url === ADDON)
      return Response.json({
        streams: [
          { name: '[RD+] Torrentio\n4k', title: 'Dune.2160p.mkv\n💾 40 GB', url: CACHED },
          { name: '[RD download] Torrentio\n1080p', title: 'Dune.1080p.mkv', url: UNCACHED },
          { name: 'LAN', title: 'x', url: LAN },
          { name: 'P2P', title: 'y', infoHash: 'abc' },
        ],
      });
    if (url === CACHED)
      return new Response(null, {
        status: 302,
        headers: { location: 'https://dl.debrid.example/d/XYZ/Dune.mkv' },
      });
    if (url === 'https://dl.debrid.example/d/XYZ/Dune.mkv')
      return new Response('video', { status: 200 });
    if (url === UNCACHED)
      return new Response(null, {
        status: 302,
        headers: { location: 'https://torrentio.example/videos/downloading_v2.mp4' },
      });
    if (url === 'https://torrentio.example/videos/downloading_v2.mp4')
      return new Response('clip', { status: 200 });
    if (url.endsWith('/stremio/pick-direct'))
      return Response.json({ ref: 'x-AAAAAAAAAAAAAAAAAAAAAA', title: 'Dune', art: null });
    return Response.json({ error: 'CINEMA_UNAVAILABLE' }, { status: 500 });
  }) as typeof fetch;
  const account = { client: {} as never, token: 'token-a', origin: 'https://rooms.example' };
  setupCommunityCinema({
    handle: (name, handler) => handlers.set(name, handler),
    account: () => account,
    isCurrent: () => true,
    openExternal: async (url) => {
      opened.push(url);
    },
    fetch: fetchMock,
  });
  const invoke = (name: string, ...args: unknown[]) => handlers.get(name)!(...args);
  return { invoke, requests, opened };
}

describe('Stremio add-ons asked from the linker’s computer', () => {
  it('lists refused add-ons here and keeps their links out of the renderer', async () => {
    const s = setup();
    const streams = (await s.invoke(
      'rooms:cinema-stremio-assist',
      'hall',
      'movie',
      'tt1160419',
      'tt1160419',
    )) as { id: string; cached: boolean | null; resolution: string | null }[];
    expect(JSON.stringify(streams)).not.toContain('SECRETKEY');
    // The LAN link and the torrent-only stream are left out.
    expect(streams.map((stream) => [stream.cached, stream.resolution])).toEqual([
      [true, '4K'],
      [false, '1080p'],
    ]);
    const picked = await s.invoke('rooms:cinema-stremio-pick-local', 'hall', streams[0]!.id);
    expect(picked).toMatchObject({ ref: expect.stringMatching(/^x-/) });
    const direct = s.requests.find((request) => request.url.endsWith('/stremio/pick-direct'));
    expect(JSON.parse(String(direct?.init?.body))).toEqual({
      url: 'https://dl.debrid.example/d/XYZ/Dune.mkv',
      type: 'movie',
      metaId: 'tt1160419',
      videoId: 'tt1160419',
    });
    // An uncached stream ends on the add-on's own "downloading" clip: say so, send nothing.
    await expect(
      s.invoke('rooms:cinema-stremio-pick-local', 'hall', streams[1]!.id),
    ).rejects.toThrow('CINEMA_STREMIO_NOT_CACHED');
    await expect(
      s.invoke('rooms:cinema-stremio-pick-local', 'other', streams[0]!.id),
    ).rejects.toThrow();
  });

  it('opens only Stremio’s own link page', async () => {
    const s = setup();
    await expect(s.invoke('rooms:cinema-stremio-link', 'community1')).rejects.toThrow();
    expect(s.opened).toEqual([]);
  });
});
