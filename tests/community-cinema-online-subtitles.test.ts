import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { SubtitleSearch } from '../apps/services/cinema/subtitles';
import { zipEntries } from '../apps/services/cinema/zip';
import {
  decodeSubtitle,
  parseAss,
  parseSrt,
  parseVtt,
  subtitleCues,
} from '../packages/community-cinema/src/webvtt';

/** A minimal zip writer for tests: deflated entries, no data descriptors. */
function zip(files: Record<string, string | Buffer>, method: 0 | 8 = 8) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const SRT =
  '1\r\n00:00:01,500 --> 00:00:03,000\r\nMerhaba\r\ndünya\r\n\r\n2\r\n00:01:02,04 --> 00:01:04,000\r\nİkinci\r\n';

describe('subtitle formats', () => {
  it('reads SubRip, with or without numbering, sorted by time', () => {
    expect(parseSrt(SRT)).toEqual([
      { start: 1.5, end: 3, text: 'Merhaba\ndünya' },
      { start: 62.04, end: 64, text: 'İkinci' },
    ]);
    expect(
      parseSrt('00:00:05.000 --> 00:00:06.000\nsonra\n\n00:00:01,000 --> 00:00:02,000\nönce'),
    ).toEqual([
      { start: 1, end: 2, text: 'önce' },
      { start: 5, end: 6, text: 'sonra' },
    ]);
  });

  it('reads ASS dialogue, dropping override tags and keeping commas in the text', () => {
    const ass = [
      '[Script Info]',
      'ScriptType: v4.00+',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Comment: 0,0:00:00.00,0:00:09.00,Default,,0,0,0,,not shown',
      'Dialogue: 0,0:00:02.50,0:00:04.00,Default,,0,0,0,,{\\an8}{\\i1}Evet,{\\i0} tabii\\Nhayır',
    ].join('\n');
    expect(parseAss(ass)).toEqual([{ start: 2.5, end: 4, text: 'Evet, tabii\nhayır' }]);
    expect(subtitleCues(ass)).toHaveLength(1);
    expect(subtitleCues(SRT)).toHaveLength(2);
    expect(subtitleCues('WEBVTT\n\n00:01.000 --> 00:02.000\nvtt\n')).toEqual(
      parseVtt('WEBVTT\n\n00:01.000 --> 00:02.000\nvtt\n'),
    );
  });

  it('decodes UTF-8, and Windows-1254 Turkish when UTF-8 does not fit', () => {
    expect(decodeSubtitle(Buffer.from('şğıİ', 'utf8'))).toBe('şğıİ');
    // "Şimdi değil" in Windows-1254.
    const legacy = Buffer.from([0xde, 0x69, 0x6d, 0x64, 0x69, 0x20, 0x64, 0x65, 0xf0, 0x69, 0x6c]);
    expect(decodeSubtitle(legacy)).toBe('Şimdi değil');
  });
});

describe('zip entries', () => {
  it('reads stored and deflated files and refuses oversized ones', () => {
    const deflated = zipEntries(zip({ 'film.tr.srt': SRT, 'readme.txt': 'x' }), 1024);
    expect(deflated.map((e) => e.name)).toEqual(['film.tr.srt', 'readme.txt']);
    expect(deflated[0]!.read().toString()).toBe(SRT);
    expect(
      zipEntries(zip({ 'a.srt': SRT }, 0), 1024)[0]!
        .read()
        .toString(),
    ).toBe(SRT);
    const bomb = zipEntries(zip({ 'big.srt': Buffer.alloc(100_000, 65) }), 10_000)[0]!;
    expect(() => bomb.read()).toThrow();
    expect(() => zipEntries(Buffer.from('not a zip'), 1024)).toThrow();
  });
});

describe('SubDL client', () => {
  const rows = [
    {
      release_name: 'Film.2026.1080p.WEB-DL',
      lang: 'turkish',
      language: 'TR',
      // SubDL appends the caller's key to every download URL.
      url: '/subtitle/11-12.zip?api_key=owner-key-1',
      hi: false,
    },
    {
      release_name: 'Film.2026.English',
      language: 'EN',
      url: '/subtitle/21-22.zip?api_key=owner-key-1&x=1',
    },
    { release_name: 'Film.2026.TR.SDH', language: 'TR', url: '/subtitle/31-32.zip', hi: true },
    { release_name: 'http://spam.example', language: 'TR', url: '/subtitle/41-42.zip' },
    { release_name: 'Wrong', language: 'FR', url: '/subtitle/51-52.zip' },
    { release_name: 'Bad url', language: 'TR', url: 'https://elsewhere/x.zip' },
  ];
  const client = (respond: (url: URL) => Response) => {
    const seen: URL[] = [];
    const search = new SubtitleSearch({
      userAgent: 'ROOMS-Cinema/test',
      fetch: async (url) => {
        const parsed = new URL(url);
        seen.push(parsed);
        return respond(parsed);
      },
    });
    return { search, seen };
  };

  it('searches by TMDB id, Turkish first, without leaking a URL-looking release name', async () => {
    const { search, seen } = client(() => Response.json({ status: true, subtitles: rows }));
    const found = await search.search('owner-key-1', {
      kind: 'movie',
      tmdbId: '1340206',
      name: 'Tuner',
      year: 2026,
    });
    expect(found.map((c) => [c.id, c.label])).toEqual([
      ['11-12', 'Türkçe · Film.2026.1080p.WEB-DL'],
      ['41-42', 'Türkçe · SubDL'],
      ['31-32', 'Türkçe · Film.2026.TR.SDH · İşitme engelli'],
      ['21-22', 'İngilizce · Film.2026.English'],
    ]);
    expect(JSON.stringify(found)).not.toContain('owner-key-1');
    expect(seen[0]!.origin + seen[0]!.pathname).toBe('https://api.subdl.com/api/v1/subtitles');
    expect(Object.fromEntries(seen[0]!.searchParams)).toMatchObject({
      api_key: 'owner-key-1',
      tmdb_id: '1340206',
      type: 'movie',
      languages: 'TR,EN',
    });
  });

  it('falls back to name and year, and keeps only the asked episode of a series', async () => {
    const { search, seen } = client(() =>
      Response.json({
        status: true,
        subtitles: [
          { release_name: 'S01E02', language: 'TR', url: '/subtitle/1-2.zip', episode: 2 },
          { release_name: 'S01E03', language: 'TR', url: '/subtitle/1-3.zip', episode: 3 },
          {
            release_name: 'Pack',
            language: 'TR',
            url: '/subtitle/1-9.zip',
            episode_from: 1,
            episode_end: 8,
          },
        ],
      }),
    );
    const found = await search.search('k-12345678', {
      kind: 'tv',
      tmdbId: null,
      name: 'Sıcak Kafa',
      year: 2023,
      season: 1,
      episode: 2,
    });
    expect(found.map((c) => c.id)).toEqual(['1-2', '1-9']);
    expect(Object.fromEntries(seen[0]!.searchParams)).toMatchObject({
      film_name: 'Sıcak Kafa',
      year: '2023',
      type: 'tv',
      season_number: '1',
      episode_number: '2',
    });
  });

  it('tells an invalid key from no results and from an outage', async () => {
    const reply = (body: unknown, status = 200) =>
      client(() => Response.json(body, { status })).search;
    const query = { kind: 'movie' as const, tmdbId: '1', name: 'x', year: null };
    await expect(
      reply({ status: false, error: 'Invalid api_key' }).search('k', query),
    ).rejects.toThrow('CINEMA_SUBTITLE_KEY_INVALID');
    await expect(reply({}, 401).verify('k')).rejects.toThrow('CINEMA_SUBTITLE_KEY_INVALID');
    expect(
      await reply({ status: false, error: "Can't find movie or tv" }).search('k', query),
    ).toEqual([]);
    await expect(reply({ oops: true }, 500).search('k', query)).rejects.toThrow(
      'CINEMA_SUBTITLE_UNAVAILABLE',
    );
    const offline = new SubtitleSearch({
      userAgent: 't',
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await expect(offline.search('k', query)).rejects.toThrow('CINEMA_SUBTITLE_UNAVAILABLE');
  });

  it('turns a downloaded zip into WebVTT, picking the episode from a season pack', async () => {
    const legacy = Buffer.concat([
      Buffer.from('1\r\n00:00:01,000 --> 00:00:02,000\r\n'),
      Buffer.from([0xde, 0x69, 0x6d, 0x64, 0x69]),
    ]);
    const { search, seen } = client((url) =>
      url.pathname.endsWith('11-12.zip')
        ? new Response(zip({ 'notes.nfo': 'x', 'Film.tr.srt': legacy }))
        : new Response(
            zip({
              'Show.S01E01.srt': '1\n00:00:01,000 --> 00:00:02,000\nbir\n',
              'Show.S01E02.srt': '1\n00:00:01,000 --> 00:00:02,000\niki\n',
            }),
          ),
    );
    const film = await search.download('11-12');
    expect(seen[0]!.href).toBe('https://dl.subdl.com/subtitle/11-12.zip');
    expect(parseVtt(film)).toEqual([{ start: 1, end: 2, text: 'Şimdi' }]);
    const episode = await search.download('1-9', { season: 1, episode: 2 });
    expect(parseVtt(episode)[0]!.text).toBe('iki');
    await expect(search.download('../etc')).rejects.toThrow('CINEMA_SUBTITLE_UNAVAILABLE');
  });
});
