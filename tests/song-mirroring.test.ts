import { expect, it, vi } from 'vitest';
import { parseSongLink } from '../packages/shared-contracts/src/song-links';
import { songMetadata } from '../apps/services/music/song-metadata';
import { matchingSong } from '../apps/services/music/song-match';
import { privateFetch } from '../packages/personal-media/src/network';
const id = '4cOdK2wGLETKBW3PvgPWqT',
  url = `https://open.spotify.com/track/${id}`;
const song = {
  provider: 'spotify' as const,
  title: 'Never Gonna Give You Up',
  artists: ['Rick Astley'],
  durationSec: 213.573,
};
const exact = {
  id: 'dQw4w9WgXcQ',
  title: 'Rick Astley - Never Gonna Give You Up (Official Video)',
  duration: 213,
};
const metadata = () =>
  new Response(
    `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity: { id, type: 'track', name: song.title, artists: [{ name: 'Rick Astley' }], duration: 213573, audioPreview: { url: 'never-read' } } } } } } })}</script>`,
  );
it('canonicalizes public track and share links, recognizes unsupported lists without private URLs', () => {
  expect(parseSongLink(url + '?si=tracking')).toMatchObject({
    kind: 'track',
    provider: 'spotify',
    url,
  });
  expect(parseSongLink(`https://open.spotify.com/intl-tr/track/${id}`)?.url).toBe(url);
  expect(parseSongLink('https://spotify.link/share123')?.kind).toBe('short');
  expect(parseSongLink('https://soundcloud.com/forss/flickermood')).toMatchObject({
    kind: 'track',
    provider: 'soundcloud',
  });
  expect(parseSongLink('https://soundcloud.com/forss/sets/list')?.kind).toBe('unsupported');
  expect(parseSongLink(`https://open.spotify.com/playlist/${id}`)?.kind).toBe('unsupported');
  expect(parseSongLink('https://soundcloud.com/forss/track?secret_token=private')?.kind).toBe(
    'unsupported',
  );
  for (const bad of [
    'http://open.spotify.com/track/' + id,
    'https://user:password@open.spotify.com/track/' + id,
    'https://open.spotify.com.evil.test/track/' + id,
    'https://soundcloud.com:8443/artist/song',
    'file:///etc/passwd',
  ])
    expect(parseSongLink(bad)).toBeNull();
});
it('reads public Spotify title/artist/duration and never returns preview/audio/account data', async () => {
  const request = vi.fn(async () => metadata());
  expect(await songMetadata(url, request)).toEqual(song);
  expect(request).toHaveBeenCalledWith(
    `https://open.spotify.com/embed/track/${id}`,
    expect.objectContaining({
      allowedHosts: ['open.spotify.com', 'spotify.link'],
      allowedProtocols: ['https:'],
    }),
  );
  expect(JSON.stringify(request.mock.calls)).not.toMatch(/Authorization|Cookie/);
});
it('reads SoundCloud public display metadata without API credentials', async () => {
  const request = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          title: 'Flickermood by Forss',
          author_name: 'Forss',
          author_url: 'https://soundcloud.com/forss',
          provider_name: 'SoundCloud',
          html: '<iframe src="never-used"/>',
        }),
      ),
  );
  expect(await songMetadata('https://soundcloud.com/forss/flickermood', request)).toEqual({
    provider: 'soundcloud',
    title: 'Flickermood',
    artists: ['Forss'],
  });
  expect(request).toHaveBeenCalledWith(
    expect.stringContaining('https://soundcloud.com/oembed?'),
    expect.any(Object),
  );
});
it('rejects wrong metadata identity, author or unavailable provider rather than guessing', async () => {
  await expect(
    songMetadata(url, async () => new Response('<html>login required</html>')),
  ).rejects.toThrow('MUSIC_MIRROR_METADATA_UNAVAILABLE');
  await expect(
    songMetadata(
      'https://soundcloud.com/forss/flickermood',
      async () =>
        new Response(
          JSON.stringify({
            title: 'Song',
            author_name: 'Someone',
            author_url: 'https://evil.test/forss',
            provider_name: 'SoundCloud',
          }),
        ),
    ),
  ).rejects.toThrow('MUSIC_MIRROR_METADATA_UNAVAILABLE');
  await expect(songMetadata(`https://open.spotify.com/album/${id}`, vi.fn())).rejects.toThrow(
    'MUSIC_MIRROR_SINGLE_TRACK_ONLY',
  );
});
it('accepts a canonical provider short redirect but rejects redirect identity/provider changes', async () => {
  const response = metadata();
  Object.defineProperty(response, 'url', { value: url });
  const request = vi
    .fn()
    .mockResolvedValueOnce(response)
    .mockImplementation(async () => metadata());
  expect(await songMetadata('https://spotify.link/share123', request)).toEqual(song);
  const wrong = new Response('');
  Object.defineProperty(wrong, 'url', { value: 'https://evil.test/track' });
  await expect(songMetadata('https://spotify.link/share123', async () => wrong)).rejects.toThrow(
    'MUSIC_MIRROR_SINGLE_TRACK_ONLY',
  );
});
it('matches artist/title/duration and excludes remixes, covers, wrong artists and long recordings', () => {
  expect(
    matchingSong(song, [
      { ...exact, title: exact.title + ' Remix' },
      { ...exact, duration: 800 },
      { ...exact, title: 'Other Artist - Never Gonna Give You Up' },
      exact,
    ]),
  ).toEqual(exact);
  for (const title of [
    'Rick Astley - Never Gonna Give You Up (live)',
    'Rick Astley - Never Gonna Give You Up (Cover)',
    'Rick Astley - Never Gonna Give You Up (remastered)',
    'Rick Astley - Never Gonna Give You Up (Slowed)',
  ])
    expect(matchingSong(song, [{ ...exact, title }])).toBeNull();
  expect(
    matchingSong(song, [
      { ...exact, is_live: true },
      { ...exact, has_drm: true },
    ]),
  ).toBeNull();
  expect(
    matchingSong({ ...song, title: 'Delivery' }, [{ ...exact, title: 'Rick Astley - Delivery' }]),
  ).not.toBeNull();
});
it('allows the requested remix variant and refuses an uncertain partial title', () => {
  const remix = { ...exact, title: 'Rick Astley - Never Gonna Give You Up (Remix)' };
  expect(matchingSong({ ...song, title: song.title + ' Remix' }, [exact, remix])).toEqual(remix);
  expect(matchingSong(song, [{ ...exact, title: 'Rick Astley - Never Gonna Give' }])).toBeNull();
});
it('rejects HTTP provider requests before any network lookup', async () => {
  await expect(
    privateFetch('http://open.spotify.com/track/' + id, { allowedProtocols: ['https:'] }),
  ).rejects.toThrow('protocol');
});
it('uses duration only from a matching public SoundCloud track page', async () => {
  const embed = JSON.stringify({
    title: 'Flickermood by Forss',
    author_name: 'Forss',
    author_url: 'https://soundcloud.com/forss',
    provider_name: 'SoundCloud',
  });
  const request = vi.fn(
    async (url: string) =>
      new Response(
        url.includes('/oembed?')
          ? embed
          : '<script>window.__sc_hydration = [{"hydratable":"sound","data":{"title":"Flickermood","duration":300123}}];</script>',
      ),
  );
  expect(await songMetadata('https://soundcloud.com/forss/flickermood', request)).toMatchObject({
    durationSec: 300.123,
  });
});

it('matches Turkish dotless-i credits without accepting a shorter music-video edit', () => {
  const wanted = {
    provider: 'spotify' as const,
    title: 'Vakti Değil',
    artists: ['Anıl K.Y', 'Savai'],
    durationSec: 130.629,
  };
  const topic = {
    id: 'IfJV6YIoBGk',
    title: 'Vakti Değil',
    duration: 131,
    channel: 'Anil K.Y - Topic',
    artists: ['Anıl K.Y', 'Savai'],
  };
  expect(
    matchingSong(wanted, [
      {
        id: 'FDXNmpagxRM',
        title: 'Anıl K.Y. feat. Savai - Vakti Değil (Official Video)',
        duration: 103,
      },
      topic,
    ]),
  ).toEqual(topic);
  expect(matchingSong(wanted, [{ ...topic, artists: [] }])).not.toBeNull();
  expect(
    matchingSong(wanted, [{ ...topic, channel: 'Other Artist - Topic', artists: [] }]),
  ).toBeNull();
  expect(
    matchingSong(wanted, [
      { ...topic, artists: [] },
      { ...topic, id: 'M7lc1UVf-VE', artists: [] },
    ]),
  ).toBeNull();
});
