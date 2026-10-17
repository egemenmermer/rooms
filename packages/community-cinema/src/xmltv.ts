// Streaming XMLTV parsing. Follows Kanal's `lib/data/sources/xmltv/`: never
// builds a DOM, reads `<channel>` and `<programme>` elements one at a time and
// converts times to UTC epoch milliseconds. Only the five XML entities and
// character references are decoded; a document declaring its own entities is
// rejected. The usual `<!DOCTYPE tv SYSTEM "xmltv.dtd">` line is fine.

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

// Guide data comes from the provider, so every helper below runs in linear time: plain
// indexOf scans and bounded regexes, never a lazy match that can rescan to the end.

function decode(text: string) {
  return text
    .replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-z]{2,8});/g, (whole, name: string) => {
      if (name[0] !== '#') return entities[name] ?? whole;
      const cp = name[1] === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .trim();
}

/** Attributes of one start tag (at most {@link MAX_TAG} characters). */
function attributesOf(tag: string) {
  const out = new Map<string, string>();
  for (const m of tag.matchAll(/([A-Za-z_:][\w:.-]{0,63})\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
    out.set(m[1], decode(m[2] ?? m[3] ?? ''));
  return out;
}

const isSpaceCode = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;

/** Text of an element body: markup removed, CDATA kept literally, entities decoded. */
function textContent(raw: string) {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const lt = raw.indexOf('<', i);
    if (lt < 0) {
      out += raw.slice(i);
      break;
    }
    out += raw.slice(i, lt);
    if (raw.startsWith('<![CDATA[', lt)) {
      const end = raw.indexOf(']]>', lt + 9);
      const data = raw.slice(lt + 9, end < 0 ? raw.length : end);
      out += data.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      i = end < 0 ? raw.length : end + 3;
      continue;
    }
    const gt = raw.indexOf('>', lt + 1);
    if (gt < 0) break;
    i = gt + 1;
  }
  return decode(out);
}

/** Text of the first `limit` `<name>` children, in order. */
function children(body: string, name: string, limit = 8) {
  const out: string[] = [];
  const open = `<${name}`;
  const close = `</${name}>`;
  let from = 0;
  while (out.length < limit) {
    const start = body.indexOf(open, from);
    if (start < 0) break;
    const next = body.charCodeAt(start + open.length);
    // `<title` must not match `<titles>`.
    if (next !== 0x3e && next !== 0x2f && !isSpaceCode(next)) {
      from = start + open.length;
      continue;
    }
    const tagEnd = body.indexOf('>', start);
    if (tagEnd < 0) break;
    if (body.charCodeAt(tagEnd - 1) === 0x2f) {
      from = tagEnd + 1;
      continue;
    }
    const end = body.indexOf(close, tagEnd + 1);
    if (end < 0) break;
    const text = textContent(body.slice(tagEnd + 1, end));
    if (text) out.push(text);
    from = end + close.length;
  }
  return out;
}

function iconOf(body: string) {
  let from = 0;
  for (;;) {
    const start = body.indexOf('<icon', from);
    if (start < 0) return null;
    if (!isSpaceCode(body.charCodeAt(start + 5))) {
      from = start + 5;
      continue;
    }
    const end = body.indexOf('>', start);
    if (end < 0 || end - start > MAX_TAG) return null;
    const src = attributesOf(body.slice(start, end + 1)).get('src');
    return src && /^https?:\/\//i.test(src) ? src : null;
  }
}

/** Longest start tag read; real ones are well under 300 characters. */
const MAX_TAG = 4096;

/** Hard limit for one element; real programmes are a few kilobytes. */
const MAX_ELEMENT = 256 * 1024;

/**
 * Parses XMLTV text chunks as they arrive. Chunks are decoded strings (the
 * caller handles gzip and UTF-8). Yields channels and programmes; skips
 * malformed elements. Throws `XMLTV_UNSAFE` for entity declarations.
 */
export async function* parseXmltv(chunks: AsyncIterable<string>): AsyncGenerator<XmltvEvent> {
  let buffer = '';
  let prologue = '';
  for await (const chunk of chunks) {
    if (prologue.length < 4096) {
      prologue += chunk.slice(0, 4096 - prologue.length);
      if (/<!ENTITY/i.test(prologue)) throw new Error('XMLTV_UNSAFE');
    }
    buffer += chunk;
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
        // Wait for the rest of the tag, unless it is already longer than any real one.
        cursor = buffer.length - at > MAX_TAG ? at + name.length + 1 : at;
        if (cursor === at) break;
        continue;
      }
      if (openEnd - at > MAX_TAG) {
        cursor = at + name.length + 1;
        continue;
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
        end = close + name.length + 3;
        // An element larger than any real one is skipped whole.
        if (close - openEnd > MAX_ELEMENT) {
          cursor = end;
          continue;
        }
        body = buffer.slice(openEnd + 1, close);
      }
      cursor = end;
      const event = name === 'channel' ? channelOf(openTag, body) : programmeOf(openTag, body);
      if (event) yield event;
    }
    buffer = buffer.slice(cursor);
  }
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
