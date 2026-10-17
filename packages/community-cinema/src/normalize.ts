// Text normalization for catalog search and EPG channel matching. Ported from
// Kanal's `lib/data/text/normalize.dart`; its tests are the specification.
import { stripCountryPrefix } from './flags';
import { codePointAt, foldCodePoint, FOLD_BOUNDARY, FOLD_DOT, FOLD_DROP, type Fold } from './fold';
import { qualityPairOf, qualityWordOf, startsQualityPair } from './quality-tokens';

type Unit = { fold: Fold };

function units(s: string): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < s.length;) {
    const [cp, width] = codePointAt(s, i);
    out.push({ fold: foldCodePoint(cp) });
    i += width;
  }
  return out;
}

const isSingleAsciiLetter = (fold: Fold | undefined) =>
  typeof fold === 'string' && fold.length === 1 && fold >= 'a' && fold <= 'z';

/** A token that could be a quality token: short, ASCII, plausible first character. */
function qualityCandidate(token: string) {
  return token.length <= 9 && /^[0-9shfux][a-z0-9]*$/.test(token);
}

/**
 * Normalizes text for search; the same function must be applied to indexed
 * text and to queries.
 *
 * - Lowercase, Turkish-aware: `İ`, `I` and `ı` all become `i`.
 * - Diacritics folded (`ş→s ç→c ğ→g ö→o ü→u é→e`, `ß→ss`, `æ→ae`), small
 *   capitals, superscripts, fullwidth and mathematical letters → ASCII.
 * - Quality tokens are dropped as whole words (SD, HD, FHD, UHD, 4K, H.265,
 *   HEVC, HDR, 1080p, 50 fps, Full HD…); `HDTV` and `Hdfilm` stay.
 * - Apostrophes are removed without a break (`Grey's` → `greys`), dots in
 *   single-letter acronyms are joined (`S.W.A.T.` → `swat`).
 * - Other punctuation, symbols and emoji become a space; spaces collapse.
 */
export function normalizeForSearch(s: string): string {
  const list = units(s);
  const kept: string[] = [];
  let current = '';
  let segment = 0;
  let previousStartsPair = false;

  const endToken = () => {
    if (!current) return;
    const token = current;
    current = '';
    if (!qualityCandidate(token)) {
      kept.push(token);
      previousStartsPair = false;
      return;
    }
    if (previousStartsPair && qualityPairOf(kept[kept.length - 1], token)) {
      kept.pop();
      previousStartsPair = false;
      return;
    }
    if (qualityWordOf(token)) {
      previousStartsPair = false;
      return;
    }
    kept.push(token);
    previousStartsPair = startsQualityPair(token);
  };

  for (let k = 0; k < list.length; k++) {
    const fold = list[k].fold;
    if (fold === FOLD_DROP) continue;
    if (fold === FOLD_BOUNDARY) {
      endToken();
      continue;
    }
    if (fold === FOLD_DOT) {
      const next = list[k + 1]?.fold;
      const after = list[k + 2]?.fold;
      const joins =
        current &&
        segment === 1 &&
        isSingleAsciiLetter(current[current.length - 1]) &&
        isSingleAsciiLetter(next) &&
        (after === undefined || after === FOLD_BOUNDARY || after === FOLD_DOT);
      if (joins) segment = 0;
      else endToken();
      continue;
    }
    if (!current) segment = 0;
    current += fold;
    segment += fold.length;
  }
  endToken();
  return kept.join(' ');
}

/**
 * {@link normalizeForSearch} for EPG name matching: a leading country marker
 * is removed first, then every space. `TR: Show TV HD` → `showtv`.
 */
export function normalizeChannelName(s: string) {
  return normalizeForSearch(stripCountryPrefix(s)).replaceAll(' ', '');
}

/** Search terms for a user query: normalized, at most 16, no empty terms. */
export function searchTerms(input: string) {
  return normalizeForSearch(input).split(' ').filter(Boolean).slice(0, 16);
}
