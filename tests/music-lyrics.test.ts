import { it, expect, vi } from 'vitest';
import { loadMusicLyrics, parseSyncedLyrics } from '../apps/desktop/electron/music-lyrics';
it('parses repeated timestamps and sorts lines, bounded without markup', () => {
  expect(parseSyncedLyrics('[00:02.50][00:04.100]Test\n[00:01]Start')).toEqual([
    { time: 1, text: 'Start' },
    { time: 2.5, text: 'Test' },
    { time: 4.1, text: 'Test' },
  ]);
  expect(parseSyncedLyrics('[01:99]Invalid')).toEqual([]);
});
it('requires unambiguous artist/title and near-exact duration, returning only synchronized lines', async () => {
  const row = {
    artistName: 'Test Artist',
    trackName: 'Test Song',
    duration: 123,
    syncedLyrics: '[00:01]Fixture line',
    plainLyrics: 'unused',
  };
  const request = vi.fn(async () => new Response(JSON.stringify(row)));
  expect(
    await loadMusicLyrics('Test Artist - Test Song (Official Video) · YouTube', 123, request),
  ).toEqual({ status: 'found', provider: 'LRCLIB', lines: [{ time: 1, text: 'Fixture line' }] });
  expect(request).toHaveBeenCalledWith(
    expect.stringMatching(/^https:\/\/lrclib.net\/api\/get\?/),
    expect.objectContaining({ allowedHosts: ['lrclib.net'], allowedProtocols: ['https:'] }),
  );
  for (const rows of [[{ ...row, duration: 130 }], [{ ...row, artistName: 'Different Artist' }]])
    expect(
      await loadMusicLyrics(
        'Test Artist - Test Song',
        123,
        async () => new Response(JSON.stringify(rows[0])),
      ),
    ).toEqual({ status: 'unavailable' });
});
it('handles instrumental, malformed and missing results without revealing diagnostics', async () => {
  expect(
    await loadMusicLyrics(
      'A - B',
      30,
      async () =>
        new Response(
          JSON.stringify({ artistName: 'A', trackName: 'B', duration: 30, instrumental: true }),
        ),
    ),
  ).toEqual({ status: 'instrumental' });
  expect(
    await loadMusicLyrics('A - B', 30, async () => new Response('private error', { status: 500 })),
  ).toEqual({ status: 'unavailable' });
  expect(await loadMusicLyrics('A - B', 30, async () => new Response('invalid'))).toEqual({
    status: 'unavailable',
  });
});

it('rejects ambiguous search results when the title cannot be split into artist and song', async () => {
  const row = { artistName: 'A', trackName: 'B', duration: 30, syncedLyrics: '[00:01]Test' };
  expect(
    await loadMusicLyrics('A B', 30, async () => new Response(JSON.stringify([row, row]))),
  ).toEqual({ status: 'unavailable' });
});
