// Conservative cleanup of the decorations IPTV catalogs put around film, series and
// episode names (ported from Kanal's vod_titles.dart). Platform names go only at delimited
// title boundaries, so "Max" inside a real title stays.

const PLATFORMS =
  'Netflix|Exxen|Disney\\s*\\+?|Disney\\s*Plus|Amazon(?:\\s*Prime(?:\\s*Video)?)?|Prime\\s*Video|Blu\\s*TV|HBO(?:\\s*Max)?|Max|Gain|Apple\\s*TV\\s*\\+?|Tabii|TOD|beIN\\s*Connect|Hulu|Paramount\\s*\\+?';
const PREFIX =
  /^\s*(?:\[[^\]]{1,24}\]|\((?:[A-Za-z]{2,3})\)|\|[A-Z]{2}\||(?:[A-Z]{2}|4K|UHD|FHD|HD)\s*[:|\-–]\s)\s*/;
const PLATFORM_START = new RegExp(
  `^(?:\\((?:${PLATFORMS})\\)|(?:${PLATFORMS})\\s*[:|–—-])\\s*`,
  'i',
);
const PLATFORM_END = new RegExp(
  `\\s*(?:\\((?:${PLATFORMS})\\)|\\[(?:${PLATFORMS})\\]|[|–—-]\\s*(?:${PLATFORMS}))\\s*$`,
  'i',
);
const SUFFIX = /\s*(?:\s+(?:4K|8K|UHD|FHD|HD|SD|HEVC|H\.?265|HDR)|[([](?:19|20)\d{2}[)\]])\s*$/i;
const SEPARATORS = /^[\s|:·–—-]+/;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `(Netflix) Squid Game [2021]` → `Squid Game`. */
export function cleanVodTitle(raw: string) {
  let title = raw.trim();
  for (let n = 0; n < 8; n++) {
    const next = title
      .replace(PREFIX, '')
      .replace(PLATFORM_START, '')
      .replace(PLATFORM_END, '')
      .replace(SUFFIX, '')
      .trim();
    if (!next || next === title) break;
    title = next;
  }
  return title;
}

/**
 * The episode's own name: `Squid Game - S01E02 - Hell` → `Hell`. Empty when the provider
 * gave nothing but the series and the code.
 */
export function cleanEpisodeTitle(
  raw: string,
  seriesTitle: string,
  season: number,
  episode: number,
) {
  let title = raw.trim();
  const series = cleanVodTitle(seriesTitle);
  const seriesPrefix = series ? new RegExp(`^${escape(series)}(?=\\s|[|:·–—-]|$)`, 'i') : null;
  const code = new RegExp(`^S0*${season}\\s*E0*${episode}\\b`, 'i');
  const longCode = new RegExp(
    // i18n-ignore: matches Turkish provider episode names ("1. Sezon 2. Bölüm")
    `^0*${season}\\s*\\.\\s*(?:Sezon|Season)\\s*[|:·–—-]?\\s*0*${episode}\\s*\\.\\s*(?:Bölüm|Episode)(?=\\s|[|:·–—-]|$)`,
    'i',
  );
  for (let n = 0; n < 12; n++) {
    let next = cleanVodTitle(title.replace(SEPARATORS, '')).replace(SEPARATORS, '');
    if (seriesPrefix) next = next.replace(seriesPrefix, '');
    next = next.replace(SEPARATORS, '').replace(code, '').replace(longCode, '');
    next = next.replace(SEPARATORS, '').trim();
    if (next === title) break;
    title = next;
  }
  // "Bölüm 3" placeholders say nothing the code does not.
  return /^(?:Bölüm|Episode)\s*\d+$/i.test(title) ? '' : title;
}
