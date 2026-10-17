import { describe, expect, it } from 'vitest';
import {
  classifyM3u,
  detectXtreamExport,
  parseM3u,
  parseSeriesMarker,
} from '../packages/community-cinema/src/m3u';
import {
  parseXmltv,
  xmltvTimeToEpochMs,
  type XmltvEvent,
} from '../packages/community-cinema/src/xmltv';
import {
  asId,
  asInt,
  asNumber,
  asString,
  liveExtension,
  xtreamAccount,
  xtreamUrls,
} from '../packages/community-cinema/src/xtream';

describe('M3U', () => {
  it('classifies entries like Kanal', () => {
    expect(classifyM3u('http://h/movie/u/p/1.mkv', -1)).toBe('movie');
    expect(classifyM3u('http://h/series/u/p/1.mp4', -1)).toBe('episode');
    expect(classifyM3u('http://h/vod/film.MP4?x=1', 5400)).toBe('movie');
    expect(classifyM3u('http://h/vod/film.mp4', -1)).toBe('live');
    expect(classifyM3u('http://h/live/u/p/1.ts', -1)).toBe('live');
  });

  it('reads season markers', () => {
    expect(parseSeriesMarker('Sıcak Kafa S01 E02')).toMatchObject({
      seriesName: 'Sıcak Kafa',
      season: 1,
      episode: 2,
    });
    expect(parseSeriesMarker('Show - S01E02 - Pilot')).toMatchObject({
      seriesName: 'Show',
      episodeTitle: 'Pilot',
    });
    expect(parseSeriesMarker('Dizi 2x05')).toMatchObject({ season: 2, episode: 5 });
    expect(parseSeriesMarker('Film 1920x1080')).toBeNull();
  });

  it('parses attributes, headers and episodes', () => {
    const { header, entries } = parseM3u(
      [
        '#EXTM3U url-tvg="http://epg.example/guide.xml.gz" catchup-days="3"',
        '#EXTINF:-1 tvg-id="TRT1.tr" tvg-logo="http://img/trt.png" tvg-chno="1" group-title="TR | Ulusal" catchup="default",TRT 1 HD',
        '#EXTVLCOPT:http-user-agent=Custom/1.0',
        'http://h/live/u/p/1001.ts',
        '#EXTINF:5400,Kış Uykusu (2014)',
        '#EXTGRP:Filmler',
        'http://h/vod/kis.mkv',
        '#EXTINF:-1 group-title="Dizi",Sıcak Kafa S01 E02',
        'http://h/series/u/p/77002.mp4',
        '#EXTINF:-1,Bad',
        'file:///etc/passwd',
      ].join('\n'),
      'http://h/playlist.m3u',
    );
    expect(header.tvgUrls).toEqual(['http://epg.example/guide.xml.gz']);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      kind: 'live',
      name: 'TRT 1 HD',
      tvgId: 'TRT1.tr',
      group: 'TR | Ulusal',
      number: 1,
      catchupDays: 3,
      userAgent: 'Custom/1.0',
    });
    expect(entries[1]).toMatchObject({ kind: 'movie', group: 'Filmler', userAgent: null });
    expect(entries[2]).toMatchObject({
      kind: 'episode',
      seriesName: 'Sıcak Kafa',
      season: 1,
      episode: 2,
    });
    expect(() => parseM3u('not a playlist', 'http://h/')).toThrow('M3U_INVALID');
  });

  it('detects Xtream exports', () => {
    expect(
      detectXtreamExport('http://h.example:8080/get.php?username=a&password=b&type=m3u_plus'),
    ).toEqual({
      server: 'http://h.example:8080',
      username: 'a',
      password: 'b',
    });
    expect(detectXtreamExport('http://h.example/list.m3u')).toBeNull();
  });
});

describe('XMLTV', () => {
  it('reads XMLTV times as UTC', () => {
    expect(xmltvTimeToEpochMs('20261017210000 +0300')).toBe(Date.UTC(2026, 9, 17, 18));
    expect(xmltvTimeToEpochMs('20261017210000')).toBe(Date.UTC(2026, 9, 17, 21));
    expect(xmltvTimeToEpochMs('202610172100 +03:00')).toBe(Date.UTC(2026, 9, 17, 18));
    expect(xmltvTimeToEpochMs('20261017210000 TRT')).toBe(Date.UTC(2026, 9, 17, 18));
    expect(xmltvTimeToEpochMs('20261017240000')).toBe(Date.UTC(2026, 9, 18, 0));
    expect(xmltvTimeToEpochMs('2026101721')).toBe(Date.UTC(2026, 9, 17, 21));
    for (const bad of ['', 'abc', '20261317000000', '20261017256000', '202610172'])
      expect(xmltvTimeToEpochMs(bad), bad).toBeNull();
  });

  const parse = async (chunks: string[]) => {
    const events: XmltvEvent[] = [];
    for await (const event of parseXmltv(
      (async function* () {
        yield* chunks;
      })(),
    ))
      events.push(event);
    return events;
  };

  it('streams channels and programmes across chunk boundaries', async () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE tv SYSTEM "xmltv.dtd"><tv>
      <channel id="a.tr"><display-name lang="tr">A &amp; B</display-name><display-name>AB</display-name><icon src="https://img/a.png"/></channel>
      <programme start="20261017180000 +0000" stop="20261017190000 +0000" channel="a.tr"><title>Haber</title><desc><![CDATA[Gündem <özet>]]></desc><category>News</category></programme>
      <programme start="20261017190000 +0000" channel="a.tr"><title>Film &#304;zle</title></programme>
      <programme start="bad" channel="a.tr"><title>Skip</title></programme>
    </tv>`;
    const chunks = xml.match(/[\s\S]{1,37}/g)!;
    const events = await parse(chunks);
    expect(events[0]).toEqual({
      type: 'channel',
      id: 'a.tr',
      displayNames: ['A & B', 'AB'],
      icon: 'https://img/a.png',
    });
    expect(events.slice(1)).toMatchObject([
      {
        channelId: 'a.tr',
        title: 'Haber',
        description: 'Gündem <özet>',
        category: 'News',
        stop: Date.UTC(2026, 9, 17, 19),
      },
      { title: 'Film İzle' },
    ]);
    expect(events).toHaveLength(3);
  });

  it('refuses documents that declare entities', async () => {
    await expect(
      parse(['<?xml version="1.0"?><!DOCTYPE tv [<!ENTITY a "aaaa">]><tv></tv>']),
    ).rejects.toThrow('XMLTV_UNSAFE');
  });
});

describe('Xtream JSON', () => {
  it('normalizes PHP values', () => {
    expect([asInt('1'), asInt(1.9), asInt(''), asInt(null), asInt(true)]).toEqual([
      1,
      1,
      null,
      null,
      1,
    ]);
    expect([asNumber('7,5'), asNumber('8.1'), asNumber('x')]).toEqual([7.5, 8.1, null]);
    expect([asString(' a '), asString('null'), asString(false), asString(3)]).toEqual([
      'a',
      null,
      null,
      '3',
    ]);
    expect([asId(1001), asId('1001.0'), asId(' 7 ')]).toEqual(['1001', '1001', '7']);
  });

  it('reads the account and server clock offset', () => {
    const now = Date.UTC(2026, 9, 17, 18);
    expect(
      xtreamAccount({
        user_info: {
          auth: '1',
          status: 'Active',
          exp_date: String(now / 1000 + 3600),
          max_connections: '2',
          active_cons: 0,
        },
        server_info: { timestamp_now: now / 1000, time_now: '2026-10-17 21:00:00' },
      }),
    ).toEqual({
      active: true,
      status: 'Active',
      expiresAt: now + 3_600_000,
      maxConnections: 2,
      activeConnections: 0,
      serverOffsetMinutes: 180,
      outputFormats: [],
    });
    const hlsOnly = xtreamAccount({
      user_info: { auth: 1, allowed_output_formats: ['m3u8', 'rtmp'] },
    });
    expect(hlsOnly.outputFormats).toEqual(['m3u8', 'rtmp']);
    expect(liveExtension(hlsOnly)).toBe('m3u8');
    expect(
      liveExtension(xtreamAccount({ user_info: { allowed_output_formats: ['m3u8', 'ts'] } })),
    ).toBe('ts');
    expect(liveExtension(null)).toBe('ts');
    expect(xtreamAccount({ user_info: { auth: 1, status: 'Expired' } }).active).toBe(false);
  });

  it('builds stream URLs with encoded credentials', () => {
    const urls = xtreamUrls('http://h:8080/', 'a b', 'p/w');
    expect(urls.live('1001')).toBe('http://h:8080/live/a%20b/p%2Fw/1001.ts');
    expect(urls.movie('3001', 'mkv')).toBe('http://h:8080/movie/a%20b/p%2Fw/3001.mkv');
    expect(new URL(urls.api({ action: 'get_live_streams' })).searchParams.get('password')).toBe(
      'p/w',
    );
  });
});
