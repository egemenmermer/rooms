// The cases come from Kanal's Dart tests (normalize, quality, flags, EPG
// matcher, URL masking), extracted to JSON so both ports share one spec.
import { describe, expect, it } from 'vitest';
import cases from './fixtures/community-cinema-text-cases.json';
import {
  compareNames,
  EpgMatcher,
  flagEmoji,
  flagged,
  maskServer,
  maskText,
  maskUrl,
  normalizeChannelName,
  normalizeForSearch,
  parseCategoryFlag,
  parseQuality,
  searchTerms,
  sortByName,
  stripCountryPrefix,
} from '../packages/community-cinema/src';

describe('normalizeForSearch', () => {
  for (const [group, list] of Object.entries(cases.normalize)) {
    const normalize = group === 'normalizeChannelName' ? normalizeChannelName : normalizeForSearch;
    for (const [input, expected] of list)
      it(`${group}: ${JSON.stringify(input)} → ${expected}`, () =>
        expect(normalize(input)).toBe(expected));
  }

  it('folds decomposed (NFD) Turkish letters the same way', () =>
    expect(normalizeForSearch('Şov İzmir ğ')).toBe('sov izmir g'));

  it('folds fullwidth, mathematical and other-script digits', () => {
    expect(normalizeForSearch('ＴＲＴ １')).toBe('trt 1');
    expect(normalizeForSearch('𝐓𝐑𝐓 𝟏')).toBe('trt 1');
    expect(normalizeForSearch('قناة ٣')).toBe('قناة 3');
  });

  it('keeps words that only contain a quality token', () => {
    expect(normalizeForSearch('HDTV')).toBe('hdtv');
    expect(normalizeForSearch('Hdfilm SHD 4Kids')).toBe('hdfilm shd 4kids');
    expect(normalizeForSearch('Full Moon')).toBe('full moon');
    expect(normalizeForSearch('H 264')).toBe('h 264');
    expect(normalizeForSearch('Kanal 50')).toBe('kanal 50');
  });

  it('gives an empty string for blank and punctuation-only input', () => {
    for (const input of ['', '   ', '!!! --- ***', 'HD'])
      expect(normalizeForSearch(input)).toBe('');
  });

  it('is idempotent', () => {
    for (const input of [
      'Sıcak Kafa',
      'ŞOW TV FHD',
      "Grey's Anatomy",
      'S.W.A.T.',
      'Россия 24',
      'Movie H.265 50 fps',
      '𝐓𝐑𝐓',
    ]) {
      const once = normalizeForSearch(input);
      expect(normalizeForSearch(once), input).toBe(once);
    }
  });

  it('builds at most 16 search terms', () => {
    expect(searchTerms('Sıcak Kafa')).toEqual(['sicak', 'kafa']);
    expect(searchTerms(Array.from({ length: 40 }, (_, i) => `w${i}`).join(' '))).toHaveLength(16);
    expect(searchTerms('"" * - :')).toEqual([]);
  });

  it('normalizes 100k names quickly', () => {
    const started = performance.now();
    let total = 0;
    for (let i = 0; i < 100_000; i++)
      total += normalizeForSearch(`TR: Şov Kanalı ${i} HD | Çocuk & Ailə ★ Grey's`).length;
    expect(total).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});

describe('parseQuality', () => {
  for (const [raw, displayName, badges] of cases.quality as [string, string, string[]][])
    it(`${JSON.stringify(raw)} → ${JSON.stringify(displayName)} ${badges.join(',')}`, () =>
      expect(parseQuality(raw)).toEqual({ displayName, badges }));
});

describe('country flags', () => {
  for (const [name, flag, label] of cases.flags as [string, string | null, string][])
    it(`${JSON.stringify(name)} → ${flag} ${JSON.stringify(label)}`, () =>
      expect(parseCategoryFlag(name)).toEqual({ flag, label }));

  it('builds the pill label', () => {
    expect(flagged('TR | Ulusal')).toBe('🇹🇷 Ulusal');
    expect(flagged('|TR| Haber')).toBe('🇹🇷 Haber');
    expect(flagged('Türkiye')).toBe('🇹🇷 Türkiye');
    expect(flagged('Spor')).toBe('Spor');
    expect(flagged('AR | MBC')).toBe('AR | MBC');
    expect(flagged('🇹🇷')).toBe('🇹🇷');
    expect(flagEmoji('gb')).toBe('🇬🇧');
    expect(flagEmoji('T1')).toBeNull();
  });

  for (const [input, expected] of cases.strip)
    it(`strips ${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () =>
      expect(stripCountryPrefix(input)).toBe(expected));
});

describe('EpgMatcher', () => {
  const matcher = new EpgMatcher([
    { id: 'ShowTV.tr', displayNames: ['Show TV', 'SHOW'] },
    { id: 'TRT1.tr', displayNames: ['TRT 1', 'TRT1 HD'] },
    { id: 'trthaber.tr', displayNames: ['TRT Haber'] },
    { id: 'KanalD.tr', displayNames: ['Kanal D'] },
    { id: 'KanalD.backup', displayNames: ['KANAL D HD'] },
    { id: 'Atv.tr', displayNames: ['atv', 'A TV'] },
    { id: '', displayNames: ['Ignored without id'] },
    { id: 'Fox.tr', displayNames: [] },
  ]);

  it('matches in order: custom, exact id, case-insensitive id, name, none', () => {
    expect(
      matcher.matchDetailed({ customEpgId: 'TRT1.tr', tvgId: 'ShowTV.tr', name: 'Show TV' }),
    ).toEqual({ epgId: 'TRT1.tr', method: 'custom' });
    expect(matcher.matchDetailed({ customEpgId: ' trt1.TR ', name: 'x' })).toEqual({
      epgId: 'TRT1.tr',
      method: 'custom',
    });
    expect(matcher.matchDetailed({ customEpgId: 'Gone.tr', name: 'Show TV' })).toEqual({
      epgId: 'Gone.tr',
      method: 'custom',
    });
    expect(matcher.matchDetailed({ customEpgId: '  ', tvgId: 'ShowTV.tr', name: 'x' })).toEqual({
      epgId: 'ShowTV.tr',
      method: 'exactId',
    });
    expect(matcher.matchDetailed({ tvgId: 'TRT1.tr', name: 'Show TV' })).toEqual({
      epgId: 'TRT1.tr',
      method: 'exactId',
    });
    expect(matcher.matchDetailed({ tvgId: 'showtv.TR', name: 'TRT 1' })).toEqual({
      epgId: 'ShowTV.tr',
      method: 'caseInsensitiveId',
    });
    expect(matcher.matchDetailed({ tvgId: 'unknown.id', name: '|TR| TRT 1 FHD' })).toEqual({
      epgId: 'TRT1.tr',
      method: 'normalizedName',
    });
    expect(matcher.match({ tvgId: 'unknown.id', name: 'Kanal 7' })).toBeNull();
  });

  for (const [name, id] of cases.epgNames)
    it(`matches ${JSON.stringify(name)} → ${id} by name`, () =>
      expect(matcher.matchDetailed({ name })).toEqual({ epgId: id, method: 'normalizedName' }));

  it('never matches names that normalize to nothing, and ignores channels without id', () => {
    for (const name of ['HD', '★ ★', '', 'Ignored without id'])
      expect(matcher.match({ name })).toBeNull();
    expect(matcher.match({ tvgId: 'Fox.tr', name: 'Fox' })).toBe('Fox.tr');
    expect(matcher.channelCount).toBe(7);
  });

  it('builds once and matches 50k channels quickly', () => {
    const big = new EpgMatcher(
      Array.from({ length: 20_000 }, (_, i) => ({
        id: `ch${i}.tr`,
        displayNames: [`Kanal ${i}`, `K${i} HD`],
      })),
    );
    let matched = 0;
    for (let i = 0; i < 50_000; i++)
      if (big.match({ tvgId: i % 2 === 0 ? `CH${i}.TR` : null, name: `TR: Kanal ${i} FHD` }))
        matched++;
    expect(matched).toBe(20_000);
  });
});

describe('URL masking', () => {
  for (const [input, expected] of cases.mask)
    it(`masks ${input}`, () => expect(maskUrl(input)).toBe(expected));

  it('never leaks a secret or username', () => {
    const secret = 'S3cr3tP4ss';
    const user = 'loginname';
    for (const url of [
      `http://h.com:80/live/${user}/${secret}/1.ts`,
      `http://h.com:80/movie/${user}/${secret}/1.mkv`,
      `http://h.com:80/series/${user}/${secret}/1.mp4`,
      `http://h.com:80/timeshift/${user}/${secret}/60/2026-01-01:00-00/1.ts`,
      `http://h.com:80/${user}/${secret}/1`,
      `http://h.com/get.php?username=${user}&password=${secret}`,
      `http://h.com/xmltv.php?password=${secret}&username=${user}`,
      `http://${user}:${secret}@h.com/x`,
      `http://h.com/x?token=${secret}&user=${user}`,
    ]) {
      expect(maskUrl(url)).not.toContain(secret);
      expect(maskUrl(url)).not.toContain(user);
    }
    expect(maskUrl('')).toBe('');
  });

  it('masks servers and free text', () => {
    expect(maskServer('https://domain.com:8080')).toBe('https://dom***:8080');
    expect(maskServer(' http://domain.com:80/ ')).toBe('http://dom***:80/');
    expect(maskServer('http://domain.com:8080/?username=a&password=b')).toBe('http://dom***:8080/');
    expect(maskServer('http://a:b@domain.com:1')).toBe('http://***@dom***:1');
    const masked = maskText(
      'GET http://domain.com:8080/live/kanal/test123/1.ts failed; retry with password=hunter2 and token=abc',
    );
    expect(masked).toContain('http://dom***:8080/live/ka***/***/1.ts');
    expect(masked).not.toContain('test123');
    expect(masked).not.toContain('hunter2');
    expect(masked).toContain('token=***');
    expect(maskText('Connection refused')).toBe('Connection refused');
  });
});

describe('name ordering', () => {
  it('uses the Turkish alphabet and numeric digit runs', () => {
    expect(sortByName(['TRT 10', 'Çocuk', 'TRT 2', 'Cine', 'İz', 'Işık'], (s) => s)).toEqual([
      'Cine',
      'Çocuk',
      'Işık',
      'İz',
      'TRT 2',
      'TRT 10',
    ]);
    expect(compareNames('a', 'a')).toBe(0);
  });
});
