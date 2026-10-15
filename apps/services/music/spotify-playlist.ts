import { privateFetch, limitedText } from '../../../packages/personal-media/src/network';
import { parseSongLink } from '../../../packages/shared-contracts/src/song-links';
import {
  spotifyPlaylistTrackSchema,
  type SpotifyPlaylistTrack,
} from '../../../packages/shared-contracts/src/music-playlists';
const clean = (value: unknown) =>
  typeof value === 'string'
    ? value
        .replace(/[<>\x00-\x1f]/g, '')
        .trim()
        .slice(0, 160)
    : '';
/** Public display metadata only. No Spotify audio, previews, cookies or account credentials. */
export async function spotifyPlaylist(
  raw: string,
  request: typeof privateFetch = privateFetch,
): Promise<{ name: string; tracks: SpotifyPlaylistTrack[] }> {
  const link = parseSongLink(raw);
  if (link?.provider !== 'spotify' || link.kind !== 'playlist')
    throw Error('MUSIC_PLAYLIST_INVALID');
  try {
    const response = await request(`https://open.spotify.com/embed/playlist/${link.id}`, {
      allowedHosts: ['open.spotify.com'],
      allowedProtocols: ['https:'],
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'ROOMS/1.0 Public playlist metadata' },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error('MUSIC_SPOTIFY_PLAYLIST_UNAVAILABLE');
    }
    const html = await limitedText(response, 2 * 1024 * 1024);
    const data = html.match(/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    const entity = data && JSON.parse(data[1]!).props?.pageProps?.state?.data?.entity;
    if (entity?.type !== 'playlist' || entity?.id !== link.id || !Array.isArray(entity.trackList))
      throw Error('MUSIC_SPOTIFY_PLAYLIST_UNAVAILABLE');
    // The public embed can truncate at 100. Never silently import a truncated playlist.
    if (entity.trackList.length >= 100) throw Error('MUSIC_SPOTIFY_PLAYLIST_LIMIT');
    if (!entity.trackList.length) throw Error('MUSIC_SPOTIFY_PLAYLIST_EMPTY');
    const tracks = entity.trackList.map(
      (row: {
        uri?: unknown;
        entityType?: unknown;
        title?: unknown;
        subtitle?: unknown;
        duration?: unknown;
      }) => {
        const id =
          typeof row.uri === 'string' && row.uri.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1];
        if (!id || row.entityType !== 'track') throw Error('MUSIC_SPOTIFY_PLAYLIST_INCOMPLETE');
        const parsed = spotifyPlaylistTrackSchema.safeParse({
          spotifyTrackId: id,
          title: clean(row.title),
          artists: typeof row.subtitle === 'string' ? row.subtitle.split(/,\s*/).map(clean) : [],
          durationSec: typeof row.duration === 'number' ? row.duration / 1000 : -1,
        });
        if (!parsed.success || parsed.data.durationSec <= 0)
          throw Error('MUSIC_SPOTIFY_PLAYLIST_INCOMPLETE');
        return parsed.data;
      },
    );
    return { name: clean(entity.name), tracks };
  } catch (error) {
    if (error instanceof Error && /^MUSIC_SPOTIFY_PLAYLIST_/.test(error.message)) throw error;
    throw Error('MUSIC_SPOTIFY_PLAYLIST_UNAVAILABLE');
  }
}
