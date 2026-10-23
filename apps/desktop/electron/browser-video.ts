/**
 * Videos whose owner disabled embedding still play on youtube.com. The cinema opens them in the
 * viewer's own browser and shares that window; these helpers read public page facts and find the
 * window by its title. Nothing here downloads or re-streams the video itself.
 */
export interface WatchPageFacts {
  status: string | null;
  embeddable: boolean | null;
  title: string;
  author: string;
  durationSec: number | null;
}

const entities: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&lt;': '<',
  '&gt;': '>',
};
const decode = (value: string) =>
  value.replace(/&(amp|quot|#39|#x27|lt|gt);/g, (m) => entities[m]!);
function jsonString(raw: string | undefined) {
  if (raw === undefined) return '';
  try {
    return String(JSON.parse(`"${raw}"`));
  } catch {
    return '';
  }
}

export function parseWatchPage(html: string): WatchPageFacts {
  const meta = /<meta name="title" content="([^"]*)"/.exec(html)?.[1];
  const title = (
    meta !== undefined ? decode(meta) : jsonString(/"title":"((?:[^"\\]|\\.)*)"/.exec(html)?.[1])
  )
    .trim()
    .slice(0, 240);
  const author = jsonString(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/.exec(html)?.[1])
    .trim()
    .slice(0, 120);
  const length = Number(/"lengthSeconds":"(\d{1,6})"/.exec(html)?.[1]);
  const embed = /"playableInEmbed":(true|false)/.exec(html)?.[1];
  return {
    status: /"playabilityStatus":\{"status":"([A-Z_]{1,40})"/.exec(html)?.[1] ?? null,
    embeddable: embed === undefined ? null : embed === 'true',
    title,
    author,
    durationSec: Number.isFinite(length) && length > 0 && length <= 86400 ? length : null,
  };
}

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('tr') // i18n-ignore: Turkish case folding of page titles
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The browser window now showing this video, matched by page title; null when not open yet. */
export function findBrowserWindow<T extends { id: string; name: string }>(
  sources: T[],
  title: string,
): T | null {
  const expected = normalize(title).slice(0, 48);
  if (expected.length < 4) return null;
  const matches = sources.filter(
    (source) => source.id.startsWith('window:') && normalize(source.name).includes(expected),
  );
  return matches.find((source) => /youtube/i.test(source.name)) ?? matches[0] ?? null;
}
