// Character folding shared by search normalization, quality badges and
// country prefixes. Ported from Kanal's `lib/data/text/src/fold.dart`; the
// Dart table is replaced by NFKD plus a few explicit mappings.

/** The character is removed without breaking the word (apostrophes, marks). */
export const FOLD_DROP = -1;
/** The character separates words (punctuation, symbols, emoji). */
export const FOLD_BOUNDARY = -2;
/** A full stop; callers decide whether it joins an acronym. */
export const FOLD_DOT = -3;

export type Fold = string | typeof FOLD_DROP | typeof FOLD_BOUNDARY | typeof FOLD_DOT;

const apostrophes = new Set([0x27, 0x60, 0xb4, 0x2bb, 0x2bc, 0x2018, 0x2019, 0x201b, 0x2032]);

// Letters NFKD leaves alone, plus small capitals some providers use (`ʜᴅ`).
const explicit = new Map<string, string>([
  ['ı', 'i'],
  ['ß', 'ss'],
  ['ẞ', 'ss'],
  ['æ', 'ae'],
  ['Æ', 'ae'],
  ['œ', 'oe'],
  ['Œ', 'oe'],
  ['ø', 'o'],
  ['Ø', 'o'],
  ['ł', 'l'],
  ['Ł', 'l'],
  ['đ', 'd'],
  ['Đ', 'd'],
  ['ð', 'd'],
  ['Ð', 'd'],
  ['þ', 'th'],
  ['Þ', 'th'],
  ['ə', 'e'],
  ['Ə', 'e'],
  ['ħ', 'h'],
  ['Ħ', 'h'],
  ['ŧ', 't'],
  ['Ŧ', 't'],
  ['ᴀ', 'a'],
  ['ʙ', 'b'],
  ['ᴄ', 'c'],
  ['ᴅ', 'd'],
  ['ᴇ', 'e'],
  ['ꜰ', 'f'],
  ['ɢ', 'g'],
  ['ʜ', 'h'],
  ['ɪ', 'i'],
  ['ᴊ', 'j'],
  ['ᴋ', 'k'],
  ['ʟ', 'l'],
  ['ᴍ', 'm'],
  ['ɴ', 'n'],
  ['ᴏ', 'o'],
  ['ᴘ', 'p'],
  ['ʀ', 'r'],
  ['ꜱ', 's'],
  ['ᴛ', 't'],
  ['ᴜ', 'u'],
  ['ᴠ', 'v'],
  ['ᴡ', 'w'],
  ['ʏ', 'y'],
  ['ᴢ', 'z'],
]);

// First code point of each Unicode decimal digit block NFKD does not fold.
const digitZeros = [
  0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xde6, 0xe50,
  0xed0, 0xf20, 0x1040, 0x1090, 0x17e0, 0x1810, 0x1946, 0x19d0, 0x1a80, 0x1a90, 0x1b50, 0x1bb0,
  0x1c40, 0x1c50, 0xa620, 0xa8d0, 0xa900, 0xa9d0, 0xa9f0, 0xaa50, 0xabf0,
];

const markPattern = /\p{M}/u;
const marksPattern = /\p{M}/gu;
const letterPattern = /\p{L}/u;
const digitPattern = /\p{Nd}/u;
const cache = new Map<number, Fold>();

function asciiDigit(cp: number) {
  for (const zero of digitZeros) if (cp >= zero && cp <= zero + 9) return String(cp - zero);
  return null;
}

function foldUncached(cp: number): Fold {
  const ch = String.fromCodePoint(cp);
  if (markPattern.test(ch)) return FOLD_DROP;
  const mapped = explicit.get(ch);
  if (mapped) return mapped;
  let out = '';
  for (const part of ch.normalize('NFKD').replace(marksPattern, '').toLowerCase()) {
    const special = explicit.get(part);
    if (special) out += special;
    else if (part.charCodeAt(0) < 0x80) {
      if (/[a-z0-9]/.test(part)) out += part;
    } else if (letterPattern.test(part)) out += part;
    else if (digitPattern.test(part)) out += asciiDigit(part.codePointAt(0)!) ?? part;
  }
  return out || FOLD_BOUNDARY;
}

/** Folds one code point to lowercase plain text, or a class marker. */
export function foldCodePoint(cp: number): Fold {
  if (cp === 0x2e) return FOLD_DOT;
  if (apostrophes.has(cp)) return FOLD_DROP;
  if (cp < 0x80) {
    if (cp >= 0x41 && cp <= 0x5a) return String.fromCharCode(cp | 0x20);
    if ((cp >= 0x61 && cp <= 0x7a) || (cp >= 0x30 && cp <= 0x39)) return String.fromCharCode(cp);
    return FOLD_BOUNDARY;
  }
  let fold = cache.get(cp);
  if (fold === undefined) {
    fold = foldUncached(cp);
    if (cache.size < 8192) cache.set(cp, fold);
  }
  return fold;
}

/** The code point at `i` and how many UTF-16 units it uses. */
export function codePointAt(s: string, i: number): [number, number] {
  const cp = s.codePointAt(i)!;
  return [cp, cp > 0xffff ? 2 : 1];
}
