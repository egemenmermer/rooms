// Streaming XMLTV parsing. Follows Kanal's `lib/data/sources/xmltv/`: never
// builds a DOM, reads `<channel>` and `<programme>` elements one at a time and
// converts times to UTC epoch milliseconds. DOCTYPE and entity declarations
// are rejected.

export type XmltvChannel = {
  type: 'channel';
  id: string;
  displayNames: string[];
  icon: string | null;
};

export type XmltvProgramme = {
  type: 'programme';
  channelId: string;
  start: number;
  stop: number;
  title: string;
  subTitle: string | null;
  description: string | null;
  category: string | null;
  episodeNum: string | null;
  icon: string | null;
};

export type XmltvEvent = XmltvChannel | XmltvProgramme;

const zones: Record<string, number> = {
  Z: 0,
  UT: 0,
  UTC: 0,
  GMT: 0,
  WET: 0,
  WEST: 60,
  BST: 60,
  CET: 60,
  MET: 60,
  CEST: 120,
  MEST: 120,
  EET: 120,
  EEST: 180,
  TRT: 180,
  MSK: 180,
  EST: -300,
  EDT: -240,
  MST: -420,
  MDT: -360,
  PST: -480,
  PDT: -420,
};

/**
 * `YYYYMMDDhhmmss ±hhmm` (any leading part of the date; offsets `+0300`,
 * `+03:00`, `+03`; zone names; no offset = UTC) → UTC epoch ms, or null.
 */
export function xmltvTimeToEpochMs(value: string): number | null {
  const m =
    /^\s*(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:\.\d+)?\s*(?:([+-])(\d{1,2})(?::?(\d{2}))?|([A-Za-z]{1,5})(?:([+-])(\d{1,2})(?::?(\d{2}))?)?)?\s*$/.exec(
      value,
    );
  if (!m) return null;
  const [year, month = 1, day = 1, hour = 0, minute = 0, second = 0] = [
    m[1],
    m[2],
    m[3],
    m[4],
    m[5],
    m[6],
  ].map((part, index) => (part === undefined ? [0, 1, 1, 0, 0, 0][index] : Number(part)));
  if (month < 1 || month > 12 || day < 1 || day > 31 || minute > 59 || second > 60) return null;
  if (hour > 24 || (hour === 24 && (minute !== 0 || second !== 0))) return null;
  let offset = 0;
  const signed = (sign: string, h: string, mm: string | undefined) => {
    const hours = Number(h);
    const minutes = Number(mm ?? 0);
    if (hours > 23 || minutes > 59) return null;
    return (sign === '-' ? -1 : 1) * (hours * 60 + minutes);
  };
  if (m[7]) {
    const parsed = signed(m[7], m[8], m[9]);
    if (parsed === null) return null;
    offset = parsed;
  } else if (m[10]) {
    offset = zones[m[10].toUpperCase()] ?? 0;
    if (m[11]) {
      const parsed = signed(m[11], m[12], m[13]);
      if (parsed === null) return null;
      offset += parsed;
    }
  }
  return Date.UTC(year, month - 1, day, hour, minute, second) - offset * 60_000;
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, data: string) => data)
    .replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-z]+);/g, (whole, name: string) => {
      if (name[0] !== '#') return entities[name] ?? whole;
      const cp = name[1] === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .trim();
}

function attributesOf(tag: string) {
  const out = new Map<string, string>();
  for (const m of tag.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g))
    out.set(m[1], decode(m[3] ?? m[4] ?? ''));
  return out;
}

/** Text of every direct `<name>` child, in order. */
function children(body: string, name: string) {
  const out: string[] = [];
  const pattern = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g');
  for (const m of body.matchAll(pattern)) {
    const text = decode(m[1].replace(/<[^>]+>/g, ''));
    if (text) out.push(text);
  }
  return out;
}

function iconOf(body: string) {
  const tag = /<icon\s[^>]*>/.exec(body)?.[0];
  const src = tag ? attributesOf(tag).get('src') : undefined;
  return src && /^https?:\/\//i.test(src) ? src : null;
}

/** Hard limit for one element; real programmes are a few kilobytes. */
const MAX_ELEMENT = 256 * 1024;

/**
 * Parses XMLTV text chunks as they arrive. Chunks are decoded strings (the
 * caller handles gzip and UTF-8). Yields channels and programmes; skips
 * malformed elements. Throws `XMLTV_UNSAFE` for DOCTYPE or ENTITY.
 */
export async function* parseXmltv(chunks: AsyncIterable<string>): AsyncGenerator<XmltvEvent> {
  let buffer = '';
  let checkedPrologue = false;
  for await (const chunk of chunks) {
    buffer += chunk;
    if (!checkedPrologue && buffer.length > 4096) {
      checkedPrologue = true;
      if (/<!DOCTYPE|<!ENTITY/i.test(buffer.slice(0, 4096))) throw new Error('XMLTV_UNSAFE');
    }
    let cursor = 0;
    const tags = /<(channel|programme)[\s>/]/g;
    for (;;) {
      tags.lastIndex = cursor;
      const found = tags.exec(buffer);
      if (!found) {
        // Keep a tail that might hold the start of the next tag.
        cursor = Math.max(cursor, buffer.length - 16);
        break;
      }
      const at = found.index;
      const name = found[1];
      const openEnd = buffer.indexOf('>', at);
      if (openEnd < 0) {
        cursor = at;
        break;
      }
      const openTag = buffer.slice(at, openEnd + 1);
      let end: number;
      let body = '';
      if (openTag.endsWith('/>')) end = openEnd + 1;
      else {
        const close = buffer.indexOf(`</${name}>`, openEnd);
        if (close < 0) {
          if (buffer.length - at > MAX_ELEMENT) {
            cursor = openEnd + 1;
            continue;
          }
          cursor = at;
          break;
        }
        body = buffer.slice(openEnd + 1, close);
        end = close + name.length + 3;
      }
      cursor = end;
      const event = name === 'channel' ? channelOf(openTag, body) : programmeOf(openTag, body);
      if (event) yield event;
    }
    buffer = buffer.slice(cursor);
  }
  if (!checkedPrologue && /<!DOCTYPE|<!ENTITY/i.test(buffer)) throw new Error('XMLTV_UNSAFE');
}

function channelOf(tag: string, body: string): XmltvChannel | null {
  const id = attributesOf(tag).get('id');
  if (!id) return null;
  return {
    type: 'channel',
    id: id.slice(0, 200),
    displayNames: children(body, 'display-name').slice(0, 8),
    icon: iconOf(body),
  };
}

function programmeOf(tag: string, body: string): XmltvProgramme | null {
  const attrs = attributesOf(tag);
  const channelId = attrs.get('channel');
  const start = xmltvTimeToEpochMs(attrs.get('start') ?? '');
  const stopValue = attrs.get('stop');
  const stop = stopValue ? xmltvTimeToEpochMs(stopValue) : null;
  const title = children(body, 'title')[0];
  if (!channelId || start === null || !title) return null;
  const clip = (value: string | undefined, max: number) => (value ? value.slice(0, max) : null);
  return {
    type: 'programme',
    channelId,
    start,
    stop: stop !== null && stop > start ? stop : start,
    title: title.slice(0, 300),
    subTitle: clip(children(body, 'sub-title')[0], 300),
    description: clip(children(body, 'desc')[0], 2000),
    category: clip(children(body, 'category')[0], 100),
    episodeNum: clip(children(body, 'episode-num')[0], 50),
    icon: iconOf(body),
  };
}

/** Fills missing stop times with the next programme's start on the same channel. */
export function closeOpenProgrammes(programmes: XmltvProgramme[]) {
  programmes.sort((a, b) => a.start - b.start);
  for (let i = 0; i < programmes.length - 1; i++)
    if (programmes[i].stop <= programmes[i].start) programmes[i].stop = programmes[i + 1].start;
  const last = programmes[programmes.length - 1];
  if (last && last.stop <= last.start) last.stop = last.start + 60 * 60_000;
  return programmes;
}
