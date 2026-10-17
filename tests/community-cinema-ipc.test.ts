import { beforeEach, describe, expect, it } from 'vitest';

import {
  setupCommunityCinema,
  type CinemaAccount,
} from '../apps/desktop/electron/community-cinema';

const mocks = { protocol: null as null | ((request: Request) => Promise<Response>) };

const TICKET = 'eyJzZXNzaW9uIjoiczEifQ.c2lnbmF0dXJl';

function setup() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const requests: { url: string; init?: RequestInit }[] = [];
  const account: CinemaAccount = {
    client: {} as never,
    token: 'token-a',
    origin: 'https://rooms.example',
  };
  let current = account;
  const fetchMock = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith('/watch'))
      return Response.json({
        session: 's1',
        ticket: TICKET,
        expiresAt: Date.now() + 120_000,
        itemRef: 'l-1001',
        live: true,
        durationSec: null,
        offsetSec: 0,
        epoch: 3,
      });
    if (url.includes('/v1/relay/'))
      return new Response('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\nseg1.m4s\n', {
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      });
    if (url.includes('/art/'))
      return new Response(url.includes('bad') ? '<html>' : 'png', {
        headers: { 'content-type': url.includes('aaaaaaaaaaaaaaaa1') ? 'text/html' : 'image/png' },
      });
    if (url.includes('/v1/communities/denied'))
      return Response.json({ error: 'CINEMA_OWNER_REQUIRED' }, { status: 403 });
    if (url.includes('/v1/communities/broken'))
      return Response.json({ error: 'stack trace http://secret' }, { status: 500 });
    return Response.json({ ok: true });
  }) as typeof fetch;
  const cinema = setupCommunityCinema({
    handle: (name, handler) => handlers.set(name, handler),
    account: () => current,
    isCurrent: (value) => value === current,
    fetch: fetchMock,
  });
  mocks.protocol = cinema.serve;
  return {
    cinema,
    requests,
    invoke: async (name: string, ...args: unknown[]) => handlers.get(name)!(...args),
    switchAccount: () => {
      current = { ...account, token: 'token-b' };
    },
  };
}

describe('community cinema IPC', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it('calls the cinema service with the session token and returns only cinema error codes', async () => {
    await s.invoke('rooms:cinema-status', 'community1');
    expect(s.requests[0].url).toBe('https://rooms.example/rooms-cinema/v1/communities/community1');
    expect((s.requests[0].init?.headers as Record<string, string>).Authorization).toBe('token-a');
    await expect(s.invoke('rooms:cinema-status', 'denied')).rejects.toThrow(
      'CINEMA_OWNER_REQUIRED',
    );
    await expect(s.invoke('rooms:cinema-status', 'broken')).rejects.toThrow(/^CINEMA_UNAVAILABLE$/);
  });

  it('validates every argument before a request leaves', async () => {
    await expect(s.invoke('rooms:cinema-status', '../x')).rejects.toThrow();
    await expect(s.invoke('rooms:cinema-details', 'hall', 'http://x/1.ts')).rejects.toThrow();
    await expect(s.invoke('rooms:cinema-guide', 'hall', ['l-1'], -1, 5)).rejects.toThrow();
    await expect(
      s.invoke('rooms:cinema-items', 'hall', { kind: 'live', url: 'x' }),
    ).rejects.toThrow();
    await expect(
      s.invoke('rooms:cinema-connect', 'community1', {
        kind: 'xtream',
        server: 'https://p',
        username: 'u',
        password: 'p',
        guideUrl: null,
        extra: 1,
      }),
    ).rejects.toThrow();
    expect(s.requests).toHaveLength(0);
    await s.invoke('rooms:cinema-items', 'hall', {
      kind: 'movie',
      categoryId: 'm7',
      sort: 'added',
      offset: 60,
      limit: 30,
    });
    expect(s.requests[0].url).toBe(
      'https://rooms.example/rooms-cinema/v1/halls/hall/items?kind=movie&categoryId=m7&sort=added&offset=60&limit=30',
    );
  });

  it('gives the renderer a rooms-cinema source and keeps the ticket in main', async () => {
    const source = await s.invoke('rooms:cinema-watch', 'hall');
    expect(source).toEqual({
      src: 'rooms-cinema://stream/s1/index.m3u8',
      itemRef: 'l-1001',
      live: true,
      durationSec: null,
      offsetSec: 0,
      epoch: 3,
      originPdtMs: null,
      audioTracks: [],
      audioTrack: null,
    });
    expect(JSON.stringify(source)).not.toContain(TICKET);
    const playlist = await mocks.protocol!(new Request('rooms-cinema://stream/s1/index.m3u8'));
    expect(playlist.status).toBe(200);
    expect(playlist.headers.get('content-type')).toBe('application/vnd.apple.mpegurl');
    expect(s.requests.at(-1)!.url).toBe(
      `https://rooms.example/rooms-cinema/v1/relay/${TICKET}/index.m3u8`,
    );
    expect(
      (await mocks.protocol!(new Request('rooms-cinema://stream/s1/..%2Fsecret'))).status,
    ).toBe(404);
    expect((await mocks.protocol!(new Request('rooms-cinema://stream/s9/index.m3u8'))).status).toBe(
      410,
    );
    s.switchAccount();
    expect((await mocks.protocol!(new Request('rooms-cinema://stream/s1/seg1.m4s'))).status).toBe(
      410,
    );
  });

  it('serves artwork only when the service returns an image', async () => {
    const ok = await mocks.protocol!(new Request('rooms-cinema://art/hall/0123456789abcdef'));
    expect(ok.status).toBe(200);
    expect(s.requests.at(-1)!.url).toBe(
      'https://rooms.example/rooms-cinema/v1/halls/hall/art/0123456789abcdef',
    );
    expect(
      (await mocks.protocol!(new Request('rooms-cinema://art/hall/aaaaaaaaaaaaaaaa1'))).status,
    ).toBe(404);
    expect((await mocks.protocol!(new Request('rooms-cinema://art/hall/not-hex'))).status).toBe(
      404,
    );
  });
});

describe('relay ticket renewal', () => {
  const OLD = 'b2xkLXRpY2tldC1zZXNzaW9uLXMx.c2ln';
  const NEW = 'bmV3LXRpY2tldC1zZXNzaW9uLXMx.c2ln';
  function renewing(sessionEnded = false) {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const urls: string[] = [];
    const account: CinemaAccount = { client: {} as never, token: 't', origin: 'https://r.example' };
    const fetchMock = (async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith('/watch'))
        return Response.json({
          session: '0123456789abcdef0123456789abcdef',
          ticket: OLD,
          expiresAt: 0,
          ttlMs: 10_000,
          itemRef: 'l-1001',
          live: true,
          durationSec: null,
          offsetSec: 0,
          epoch: 1,
          originPdtMs: 1_700_000_000_000,
        });
      if (url.includes('/sessions/'))
        return sessionEnded
          ? Response.json({ error: 'CINEMA_SESSION_ENDED' }, { status: 410 })
          : Response.json({ ticket: NEW, expiresAt: 0, ttlMs: 120_000 });
      if (url.includes(`/relay/${OLD}/`)) return new Response(null, { status: 401 });
      if (url.includes(`/relay/${NEW}/`))
        return new Response('#EXTM3U\n', {
          headers: { 'content-type': 'application/vnd.apple.mpegurl' },
        });
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    const cinema = setupCommunityCinema({
      handle: (name, handler) => handlers.set(name, handler),
      account: () => account,
      isCurrent: (value) => value === account,
      fetch: fetchMock,
    });
    return { cinema, urls, watch: async () => handlers.get('rooms:cinema-watch')!('hall') };
  }

  it('renews by the local clock through the session endpoint, never through /watch', async () => {
    const r = renewing();
    expect(await r.watch()).toMatchObject({ originPdtMs: 1_700_000_000_000 });
    const response = await r.cinema.serve(
      new Request('rooms-cinema://stream/0123456789abcdef0123456789abcdef/index.m3u8'),
    );
    expect(response.status).toBe(200);
    expect(r.urls.filter((url) => url.endsWith('/watch'))).toHaveLength(1);
    expect(r.urls).toContain(
      'https://r.example/rooms-cinema/v1/halls/hall/sessions/0123456789abcdef0123456789abcdef/ticket',
    );
  });

  it('answers 410 once the session has ended', async () => {
    const r = renewing(true);
    await r.watch();
    const response = await r.cinema.serve(
      new Request('rooms-cinema://stream/0123456789abcdef0123456789abcdef/index.m3u8'),
    );
    expect(response.status).toBe(410);
  });
});
