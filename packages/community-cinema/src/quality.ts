// Quality badges parsed from channel names. Ported from Kanal's
// `lib/data/text/quality.dart`; its tests are the specification.
import { codePointAt, foldCodePoint, FOLD_DROP } from './fold';
import {
  qualityPairOf,
  qualityWordOf,
  resolutionBadges,
  RES_NONE,
  startsQualityPair,
  type QualityWord,
} from './quality-tokens';

export type QualityParse = { displayName: string; badges: string[] };

type Word = {
  start: number;
  end: number;
  /** Lowercase folded ASCII form, or null when it cannot be a token. */
  folded: string | null;
  removed: boolean;
  /** Removed as a resolution token: a `+` right after it goes too (`HD+`). */
  resolution: boolean;
  /** First half of a two-word token: the gap after it belongs to the token. */
  joinsNext: boolean;
};

/**
 * Extracts quality tokens from a channel name:
 * `Show TV FHD` → `{ displayName: 'Show TV', badges: ['FHD'] }`.
 *
 * Badges are ordered: one resolution (the highest), `HDR`, `H265`, frame
 * rate. Words that only contain a token (`HDTV`, `4Kids`) stay. Separators
 * and brackets left behind are cleaned up. A name made only of tokens is
 * returned unchanged without badges, so the name is never empty.
 */
export function parseQuality(rawName: string): QualityParse {
  const words = scanWords(rawName);
  let resolution = RES_NONE;
  let hdr = false;
  let h265 = false;
  let fps = 0;
  let removed = 0;
  const apply = (q: QualityWord) => {
    if (q.resolution > resolution) resolution = q.resolution;
    hdr ||= q.hdr;
    h265 ||= q.h265;
    if (q.fps > fps) fps = q.fps;
  };

  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    const f = w.folded;
    if (f === null) continue;
    if (k + 1 < words.length && startsQualityPair(f)) {
      const next = words[k + 1];
      const pair = next.folded === null ? null : qualityPairOf(f, next.folded);
      if (pair && isTightGap(rawName, w.end, next.start)) {
        w.removed = true;
        w.joinsNext = true;
        next.removed = true;
        next.resolution = pair.resolution !== RES_NONE;
        apply(pair);
        removed += 2;
        k++;
        continue;
      }
    }
    const q = qualityWordOf(f);
    if (q) {
      w.removed = true;
      w.resolution = q.resolution !== RES_NONE;
      apply(q);
      removed++;
    }
  }

  if (removed === 0 || removed === words.length) return { displayName: tidy(rawName), badges: [] };
  const badges: string[] = [];
  if (resolution !== RES_NONE) badges.push(resolutionBadges[resolution]);
  if (hdr) badges.push('HDR');
  if (h265) badges.push('H265');
  if (fps > 0) badges.push(`${fps}FPS`);
  return { displayName: rebuild(rawName, words), badges };
}

/** Runs of letters and digits; dots separate words, so `H.265` is `H` + `265`. */
function scanWords(s: string): Word[] {
  const words: Word[] = [];
  let i = 0;
  while (i < s.length) {
    const [startCp, startWidth] = codePointAt(s, i);
    if (typeof foldCodePoint(startCp) !== 'string') {
      i += startWidth;
      continue;
    }
    const start = i;
    let folded = '';
    let candidate = true;
    while (i < s.length) {
      const [cp, width] = codePointAt(s, i);
      const fold = foldCodePoint(cp);
      if (typeof fold === 'string') {
        folded += fold;
        if (!/^[a-z0-9]+$/.test(fold)) candidate = false;
      } else if (fold !== FOLD_DROP) break;
      i += width;
    }
    words.push({
      start,
      end: i,
      folded: candidate && folded.length <= 12 ? folded : null,
      removed: false,
      resolution: false,
      joinsNext: false,
    });
  }
  return words;
}

/** The gap inside a two-word token: at most two of space `.` `-` `_`. */
function isTightGap(s: string, from: number, to: number) {
  if (to - from > 2) return false;
  for (let i = from; i < to; i++) if (!' .-_ '.includes(s[i])) return false;
  return true;
}

function rebuild(raw: string, words: Word[]) {
  let out = '';
  let gap = '';
  let gapHadRemoval = false;
  let seenKept = false;
  let pos = 0;
  let previous: Word | null = null;

  const addGap = (from: number, to: number) => {
    if (previous?.joinsNext) return;
    let start = from;
    if (previous?.removed && previous.resolution && start < to && raw[start] === '+') start++;
    gap += raw.slice(start, to);
  };

  for (const w of words) {
    addGap(pos, w.start);
    if (w.removed) gapHadRemoval = true;
    else {
      out += !gapHadRemoval ? gap : seenKept ? cleanMiddle(gap) : cleanEdge(gap, true);
      out += raw.slice(w.start, w.end);
      seenKept = true;
      gap = '';
      gapHadRemoval = false;
    }
    pos = w.end;
    previous = w;
  }
  addGap(pos, raw.length);
  out += gapHadRemoval ? cleanEdge(gap, false) : gap;
  return tidy(out);
}

/** Gap before the first or after the last kept word. */
function cleanEdge(gap: string, leading: boolean) {
  let t = innerTrim(removeEmptyBrackets(gap));
  if (leading) {
    let i = 0;
    while (i < t.length && isSpaceOrSep(t.charCodeAt(i))) i++;
    t = t.slice(i);
  } else {
    let e = t.length;
    while (e > 0 && isSpaceOrSep(t.charCodeAt(e - 1))) e--;
    t = t.slice(0, e);
  }
  return t;
}

/** Gap between two kept words that held a removed token: one separator or a space. */
function cleanMiddle(gap: string) {
  const t = removeEmptyBrackets(gap);
  let separator: number | null = null;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (isSpace(c)) continue;
    if (!cleanupSeparators.has(c)) return innerTrim(t);
    separator ??= c;
  }
  if (separator === null) return ' ';
  const spaced = t.length > 0 && (isSpace(t.charCodeAt(0)) || isSpace(t.charCodeAt(t.length - 1)));
  const sep = String.fromCharCode(separator);
  return spaced ? ` ${sep} ` : sep;
}

/** Replaces bracket pairs holding only spaces and separators with a space. */
function removeEmptyBrackets(t: string) {
  let s = t;
  let a = 0;
  while (a < s.length) {
    const close = closingBracket(s.charCodeAt(a));
    if (close !== null) {
      let b = a + 1;
      while (b < s.length && isSpaceOrSep(s.charCodeAt(b))) b++;
      if (b < s.length && s.charCodeAt(b) === close) {
        s = `${s.slice(0, a)} ${s.slice(b + 1)}`;
        a = 0;
        continue;
      }
    }
    a++;
  }
  return s;
}

/** Drops spaces and separators just inside brackets (`( - Yedek` → `(Yedek`). */
function innerTrim(t: string) {
  let s = '';
  for (let i = 0; i < t.length;) {
    const c = t.charCodeAt(i);
    s += t[i];
    i++;
    if (closingBracket(c) !== null) while (i < t.length && isSpaceOrSep(t.charCodeAt(i))) i++;
  }
  let back = '';
  let pendingFrom = -1;
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    if (isSpaceOrSep(c)) {
      if (pendingFrom < 0) pendingFrom = k;
      continue;
    }
    if (pendingFrom >= 0) {
      if (!isClosingBracket(c)) back += s.slice(pendingFrom, k);
      pendingFrom = -1;
    }
    back += s[k];
  }
  if (pendingFrom >= 0) back += s.slice(pendingFrom);
  return back;
}

/** Collapses whitespace, removes spaces just inside brackets, trims. */
function tidy(s: string) {
  let out = '';
  let pendingSpace = false;
  let lastWasOpen = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (isSpace(c)) {
      pendingSpace = out.length > 0;
      continue;
    }
    if (pendingSpace && !lastWasOpen && !isClosingBracket(c)) out += ' ';
    pendingSpace = false;
    out += s[i];
    lastWasOpen = closingBracket(c) !== null;
  }
  return out;
}

const brackets = new Map([
  [0x28, 0x29],
  [0x5b, 0x5d],
  [0x7b, 0x7d],
  [0x3010, 0x3011],
  [0x3014, 0x3015],
  [0xff08, 0xff09],
  [0xff3b, 0xff3d],
]);
const closers = new Set(brackets.values());
const closingBracket = (c: number) => brackets.get(c) ?? null;
const isClosingBracket = (c: number) => closers.has(c);

const isSpace = (c: number) =>
  c === 0x20 ||
  (c >= 0x09 && c <= 0x0d) ||
  c === 0xa0 ||
  (c >= 0x2000 && c <= 0x200b) ||
  c === 0x202f ||
  c === 0x205f ||
  c === 0x3000;

/** Separators that may dangle after a token is removed; `+` and `&` are not. */
const cleanupSeparators = new Set([
  0x7c, 0x2d, 0x5f, 0x2f, 0x5c, 0x3a, 0x2c, 0x3b, 0x7e, 0x2a, 0x3d, 0x23, 0x3c, 0x3e, 0xa6, 0xab,
  0xb7, 0xbb, 0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2016, 0x2022, 0x2039, 0x203a,
  0x2192, 0x21d2, 0x2212, 0x2219, 0x2500, 0x2501, 0x2502, 0x2503, 0x2550, 0x2551, 0x25a0, 0x25a1,
  0x25aa, 0x25ab, 0x25b6, 0x25b8, 0x25ba, 0x25c6, 0x25c7, 0x25cb, 0x25c9, 0x25cf, 0x2605, 0x2606,
  0x2666, 0x2726, 0x2727, 0x272a, 0x2b50,
]);

const isSpaceOrSep = (c: number) => isSpace(c) || cleanupSeparators.has(c);
