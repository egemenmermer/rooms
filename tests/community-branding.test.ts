import { afterEach, expect, it, vi } from 'vitest';
import {
  communityOrigin,
  resolveCommunityBranding,
  fetchBrandingAsset,
} from '../apps/desktop/src/community-branding';

afterEach(() => vi.unstubAllGlobals());
it('resolves custom visuals only inside the selected community and rejects credential-bearing or executable paths', () => {
  expect(
    resolveCommunityBranding(
      {
        version: 1,
        music: {
          name: 'Our DJ',
          poster: '/rooms-branding/dj.png',
          animation: '/rooms-branding/loop.webm',
        },
      },
      'https://community.example.org',
    ),
  ).toEqual({
    name: 'Our DJ',
    poster: 'https://community.example.org/rooms-branding/dj.png',
    animation: 'https://community.example.org/rooms-branding/loop.webm',
  });
  for (const poster of [
    'https://other.example/dj.png',
    '//other.example/dj.png',
    '/rooms-branding/../secret.png',
    '/rooms-branding/%2e%2e/secret.png',
    '/rooms-branding/dj.png?token=private',
    '/rooms-branding/dj.svg',
  ]) {
    expect(() =>
      resolveCommunityBranding(
        { version: 1, music: { name: 'DJ', poster } },
        'https://community.example.org',
      ),
    ).toThrow();
  }
  expect(() =>
    resolveCommunityBranding(
      { version: 1, music: { name: 'DJ\nInjected' } },
      'https://community.example.org',
    ),
  ).toThrow();
});
it('allows HTTPS and local development origins without accepting a remote insecure origin or embedded credentials', () => {
  expect(communityOrigin('https://community.example.org/api')).toBe(
    'https://community.example.org',
  );
  expect(communityOrigin('http://127.0.0.1:3021')).toBe('http://127.0.0.1:3021');
  for (const url of [
    'http://remote.example',
    'https://user:secret@community.example.org',
    'file:///tmp/community',
    '',
  ])
    expect(communityOrigin(url)).toBeNull();
});
it('never sends credentials, follows redirects or buffers beyond the streaming byte budget', async () => {
  const cancel = vi.fn();
  const fetcher = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(9));
          },
          cancel,
        }),
        { headers: { 'Content-Type': 'image/png' } },
      ),
  );
  vi.stubGlobal('window', { fetch: fetcher });
  await expect(
    fetchBrandingAsset(
      'https://community.example.org/rooms-branding/dj.png',
      new AbortController().signal,
      8,
    ),
  ).rejects.toThrow('too large');
  expect(cancel).toHaveBeenCalled();
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  });
});
