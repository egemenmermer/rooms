// The quality-token vocabulary shared by normalize.ts (drops the tokens) and
// quality.ts (turns them into badges). Ported from Kanal's
// `lib/data/text/src/quality_tokens.dart`. Words arrive folded (fold.ts), so
// `Hd`, `ʜᴅ` and `ᴴᴰ` are all `hd` here.

export const RES_NONE = 0;
export const RES_SD = 1;
export const RES_HD = 2;
export const RES_FHD = 3;
export const RES_4K = 4;
export const RES_8K = 5;

export const resolutionBadges = ['', 'SD', 'HD', 'FHD', '4K', '8K'] as const;

export type QualityWord = {
  readonly resolution: number;
  readonly hdr: boolean;
  readonly h265: boolean;
  readonly fps: number;
};

const word = (value: Partial<QualityWord>): QualityWord => ({
  resolution: RES_NONE,
  hdr: false,
  h265: false,
  fps: 0,
  ...value,
});

const sd = word({ resolution: RES_SD });
const hd = word({ resolution: RES_HD });
const fhd = word({ resolution: RES_FHD });
const uhd = word({ resolution: RES_4K });
const uhd8k = word({ resolution: RES_8K });
const hdr = word({ hdr: true });
const h265 = word({ h265: true });

/**
 * The quality meaning of one folded word, or null. Whole words only: `hdtv`,
 * `shd`, `hdfilm` and `4kids` are not tokens.
 */
export function qualityWordOf(w: string): QualityWord | null {
  switch (w) {
    case 'sd':
      return sd;
    case 'hd':
      return hd;
    case 'fhd':
    case 'fullhd':
      return fhd;
    case 'uhd':
    case 'ultrahd':
    case '4k':
      return uhd;
    case '8k':
      return uhd8k;
    case 'hdr':
    case 'hdr10':
      return hdr;
    case 'h265':
    case 'hevc':
    case 'x265':
      return h265;
  }
  return numericWord(w);
}

/** `full`+`hd` → FHD, `ultra`+`hd` → 4K, `h`+`265` → H265, `50`+`fps` → 50FPS. */
export function qualityPairOf(first: string, second: string): QualityWord | null {
  switch (second) {
    case 'hd':
      if (first === 'full') return fhd;
      if (first === 'ultra') return uhd;
      return null;
    case '265':
      return first === 'h' ? h265 : null;
    case 'fps': {
      const n = smallNumber(first);
      return n === null ? null : word({ fps: n });
    }
  }
  return null;
}

/** Whether `w` can start a two-word token (see {@link qualityPairOf}). */
export const startsQualityPair = (w: string) =>
  w === 'full' || w === 'ultra' || w === 'h' || smallNumber(w) !== null;

const resolutionByLines = new Map([
  [480, RES_SD],
  [576, RES_SD],
  [720, RES_HD],
  [1080, RES_FHD],
  [2160, RES_4K],
  [4320, RES_8K],
]);

/** `1080p`, `720i`, `1080p50`, `2160p60`, `50fps`. */
function numericWord(w: string): QualityWord | null {
  if (w.length < 4 || w.length > 9) return null;
  const digits = /^\d+/.exec(w)?.[0];
  if (!digits) return null;
  const number = Number(digits);
  const rest = w.slice(digits.length);
  if (rest === 'fps')
    return digits.length >= 2 && digits.length <= 3 && number >= 10 ? word({ fps: number }) : null;
  if (digits.length < 3 || digits.length > 4 || !rest) return null;
  if (rest[0] !== 'p' && rest[0] !== 'i') return null;
  const resolution = resolutionByLines.get(number);
  if (resolution === undefined) return null;
  const fpsText = rest.slice(1);
  if (!fpsText) return word({ resolution });
  const fps = smallNumber(fpsText);
  return fps === null ? null : word({ resolution, fps });
}

/** A 2–3 digit number (10–999), as used before `fps`. */
function smallNumber(w: string) {
  if (!/^\d{2,3}$/.test(w)) return null;
  const n = Number(w);
  return n >= 10 ? n : null;
}
