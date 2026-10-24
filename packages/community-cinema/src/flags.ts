// Country flags for category names (`TR | Ulusal` → `🇹🇷 Ulusal`) and
// country-prefix stripping for channel names (`TR: Show TV` → `Show TV`).
// Ported from Kanal's `lib/data/text/flags.dart`.
//
// A marker is recognised only at the start of a name: an ISO alpha-2 code, a
// few three-letter codes, or a country name in English, Turkish or the local
// language, optionally wrapped (`|TR|`, `[TR]`), followed by an explicit
// separator, the end of the name or — for capital two-letter codes and
// country names — a plain space. Codes that are everyday words (`AL`, `IN`…)
// need a separator. `AR` means Arabic in IPTV lists, so it gets no flag.
import { codePointAt, foldCodePoint } from './fold';

export type FlagParse = { flag: string | null; label: string };

const codes: Record<string, string> = {
  TR: 'TR',
  IT: 'IT',
  UK: 'GB',
  GB: 'GB',
  DE: 'DE',
  FR: 'FR',
  ES: 'ES',
  NL: 'NL',
  US: 'US',
  PT: 'PT',
  PL: 'PL',
  RU: 'RU',
  AL: 'AL',
  AZ: 'AZ',
  GR: 'GR',
  BG: 'BG',
  RO: 'RO',
  RS: 'RS',
  BA: 'BA',
  HR: 'HR',
  SE: 'SE',
  NO: 'NO',
  DK: 'DK',
  FI: 'FI',
  CH: 'CH',
  AT: 'AT',
  BE: 'BE',
  IE: 'IE',
  IN: 'IN',
  PK: 'PK',
  IR: 'IR',
  IQ: 'IQ',
  SA: 'SA',
  AE: 'AE',
  EG: 'EG',
  MA: 'MA',
  DZ: 'DZ',
  TN: 'TN',
  CA: 'CA',
  MX: 'MX',
  BR: 'BR',
  UA: 'UA',
  CZ: 'CZ',
  SK: 'SK',
  HU: 'HU',
  SI: 'SI',
  MK: 'MK',
  ME: 'ME',
  XK: 'XK',
  CY: 'CY',
  LB: 'LB',
  SY: 'SY',
  JO: 'JO',
  KW: 'KW',
  QA: 'QA',
  BH: 'BH',
  OM: 'OM',
  IL: 'IL',
  KR: 'KR',
  JP: 'JP',
  CN: 'CN',
  AU: 'AU',
  NZ: 'NZ',
  ZA: 'ZA',
  LU: 'LU',
  MT: 'MT',
  IS: 'IS',
  LT: 'LT',
  LV: 'LV',
  EE: 'EE',
  MD: 'MD',
  KZ: 'KZ',
  BD: 'BD',
  LK: 'LK',
  PH: 'PH',
  ID: 'ID',
  TH: 'TH',
  VN: 'VN',
  NG: 'NG',
  CL: 'CL',
  CO: 'CO',
  PE: 'PE',
  // i18n-ignore: ISO country code VE (Venezuela), not the Turkish word
  VE: 'VE',
  LY: 'LY',
  USA: 'US',
  UAE: 'AE',
  KSA: 'SA',
  GBR: 'GB',
  GER: 'DE',
  DEU: 'DE',
  ITA: 'IT',
  TUR: 'TR',
  FRA: 'FR',
  ESP: 'ES',
  NED: 'NL',
  NLD: 'NL',
  POR: 'PT',
  PRT: 'PT',
  POL: 'PL',
  RUS: 'RU',
  ALB: 'AL',
  AZE: 'AZ',
  GRE: 'GR',
  GRC: 'GR',
  BUL: 'BG',
  BGR: 'BG',
  ROU: 'RO',
  ROM: 'RO',
  SRB: 'RS',
  BIH: 'BA',
  CRO: 'HR',
  HRV: 'HR',
  SWE: 'SE',
  NOR: 'NO',
  DEN: 'DK',
  DNK: 'DK',
  FIN: 'FI',
  SUI: 'CH',
  CHE: 'CH',
  AUT: 'AT',
  BEL: 'BE',
  IRL: 'IE',
  IND: 'IN',
  PAK: 'PK',
  IRN: 'IR',
  IRQ: 'IQ',
  EGY: 'EG',
  MAR: 'MA',
  ALG: 'DZ',
  DZA: 'DZ',
  TUN: 'TN',
  CAN: 'CA',
  MEX: 'MX',
  BRA: 'BR',
  ARG: 'AR',
  UKR: 'UA',
  CZE: 'CZ',
  SVK: 'SK',
  HUN: 'HU',
  SVN: 'SI',
  MKD: 'MK',
  MNE: 'ME',
  CYP: 'CY',
  LBN: 'LB',
  SYR: 'SY',
  JOR: 'JO',
  KUW: 'KW',
  KWT: 'KW',
  QAT: 'QA',
  BHR: 'BH',
  OMA: 'OM',
  OMN: 'OM',
  ISR: 'IL',
  KOR: 'KR',
  JPN: 'JP',
  CHN: 'CN',
  AUS: 'AU',
  NZL: 'NZ',
  RSA: 'ZA',
  ZAF: 'ZA',
  LUX: 'LU',
  MLT: 'MT',
  ISL: 'IS',
  LTU: 'LT',
  LVA: 'LV',
  EST: 'EE',
  MDA: 'MD',
  KAZ: 'KZ',
  LBY: 'LY',
  AR: '',
  EN: '',
  ENG: '',
  EXYU: '',
  KU: '',
  KURD: '',
  LAT: '',
  ARAB: '',
  AFR: '',
};

const names: Record<string, string> = {
  turkiye: 'TR',
  turkey: 'TR',
  turkei: 'TR',
  turquie: 'TR',
  turchia: 'TR',
  turquia: 'TR',
  italia: 'IT',
  italy: 'IT',
  italya: 'IT',
  italien: 'IT',
  italie: 'IT',
  'united kingdom': 'GB',
  'great britain': 'GB',
  britain: 'GB',
  england: 'GB',
  ingiltere: 'GB',
  'birlesik krallik': 'GB',
  germany: 'DE',
  almanya: 'DE',
  deutschland: 'DE',
  allemagne: 'DE',
  alemania: 'DE',
  germania: 'DE',
  france: 'FR',
  fransa: 'FR',
  frankreich: 'FR',
  francia: 'FR',
  spain: 'ES',
  ispanya: 'ES',
  espana: 'ES',
  spanien: 'ES',
  espagne: 'ES',
  spagna: 'ES',
  netherlands: 'NL',
  'the netherlands': 'NL',
  holland: 'NL',
  hollanda: 'NL',
  nederland: 'NL',
  niederlande: 'NL',
  'united states': 'US',
  'united states of america': 'US',
  america: 'US',
  amerika: 'US',
  abd: 'US',
  'amerika birlesik devletleri': 'US',
  portugal: 'PT',
  portekiz: 'PT',
  poland: 'PL',
  polonya: 'PL',
  polska: 'PL',
  polen: 'PL',
  pologne: 'PL',
  russia: 'RU',
  rusya: 'RU',
  rossiya: 'RU',
  russland: 'RU',
  russie: 'RU',
  albania: 'AL',
  arnavutluk: 'AL',
  shqiperia: 'AL',
  shqiperi: 'AL',
  albanien: 'AL',
  albanie: 'AL',
  azerbaijan: 'AZ',
  azerbaycan: 'AZ',
  azerbaidschan: 'AZ',
  greece: 'GR',
  yunanistan: 'GR',
  ellada: 'GR',
  hellas: 'GR',
  griechenland: 'GR',
  grece: 'GR',
  bulgaria: 'BG',
  bulgaristan: 'BG',
  bulgarien: 'BG',
  balgariya: 'BG',
  romania: 'RO',
  romanya: 'RO',
  rumanien: 'RO',
  roumanie: 'RO',
  serbia: 'RS',
  sirbistan: 'RS',
  srbija: 'RS',
  serbien: 'RS',
  bosnia: 'BA',
  'bosnia herzegovina': 'BA',
  'bosnia and herzegovina': 'BA',
  bosna: 'BA',
  'bosna i hercegovina': 'BA',
  'bosna hersek': 'BA',
  bosnien: 'BA',
  croatia: 'HR',
  hirvatistan: 'HR',
  hrvatska: 'HR',
  kroatien: 'HR',
  sweden: 'SE',
  isvec: 'SE',
  sverige: 'SE',
  schweden: 'SE',
  suede: 'SE',
  norway: 'NO',
  norvec: 'NO',
  norge: 'NO',
  norwegen: 'NO',
  norvege: 'NO',
  denmark: 'DK',
  danimarka: 'DK',
  danmark: 'DK',
  danemark: 'DK',
  finland: 'FI',
  finlandiya: 'FI',
  suomi: 'FI',
  finnland: 'FI',
  finlande: 'FI',
  switzerland: 'CH',
  isvicre: 'CH',
  schweiz: 'CH',
  suisse: 'CH',
  svizzera: 'CH',
  austria: 'AT',
  avusturya: 'AT',
  osterreich: 'AT',
  autriche: 'AT',
  belgium: 'BE',
  belcika: 'BE',
  belgie: 'BE',
  belgique: 'BE',
  belgien: 'BE',
  ireland: 'IE',
  irlanda: 'IE',
  eire: 'IE',
  india: 'IN',
  hindistan: 'IN',
  bharat: 'IN',
  indien: 'IN',
  pakistan: 'PK',
  iran: 'IR',
  iraq: 'IQ',
  irak: 'IQ',
  'saudi arabia': 'SA',
  'suudi arabistan': 'SA',
  saudi: 'SA',
  'united arab emirates': 'AE',
  emirates: 'AE',
  'birlesik arap emirlikleri': 'AE',
  bae: 'AE',
  egypt: 'EG',
  misir: 'EG',
  masr: 'EG',
  egypte: 'EG',
  agypten: 'EG',
  morocco: 'MA',
  fas: 'MA',
  maroc: 'MA',
  marokko: 'MA',
  algeria: 'DZ',
  cezayir: 'DZ',
  algerie: 'DZ',
  algerien: 'DZ',
  tunisia: 'TN',
  tunus: 'TN',
  tunisie: 'TN',
  tunesien: 'TN',
  canada: 'CA',
  kanada: 'CA',
  mexico: 'MX',
  meksika: 'MX',
  mexiko: 'MX',
  mexique: 'MX',
  brazil: 'BR',
  brezilya: 'BR',
  brasil: 'BR',
  bresil: 'BR',
  brasilien: 'BR',
  argentina: 'AR',
  arjantin: 'AR',
  argentinien: 'AR',
  ukraine: 'UA',
  ukrayna: 'UA',
  ukraina: 'UA',
  czechia: 'CZ',
  'czech republic': 'CZ',
  cekya: 'CZ',
  cesko: 'CZ',
  tschechien: 'CZ',
  slovakia: 'SK',
  slovakya: 'SK',
  slovensko: 'SK',
  slowakei: 'SK',
  hungary: 'HU',
  macaristan: 'HU',
  magyarorszag: 'HU',
  ungarn: 'HU',
  slovenia: 'SI',
  slovenya: 'SI',
  slovenija: 'SI',
  slowenien: 'SI',
  'north macedonia': 'MK',
  macedonia: 'MK',
  makedonya: 'MK',
  'kuzey makedonya': 'MK',
  makedonija: 'MK',
  montenegro: 'ME',
  karadag: 'ME',
  'crna gora': 'ME',
  kosovo: 'XK',
  kosova: 'XK',
  cyprus: 'CY',
  kibris: 'CY',
  lebanon: 'LB',
  lubnan: 'LB',
  liban: 'LB',
  syria: 'SY',
  suriye: 'SY',
  jordan: 'JO',
  urdun: 'JO',
  kuwait: 'KW',
  kuveyt: 'KW',
  qatar: 'QA',
  katar: 'QA',
  bahrain: 'BH',
  bahreyn: 'BH',
  oman: 'OM',
  umman: 'OM',
  israel: 'IL',
  israil: 'IL',
  korea: 'KR',
  'south korea': 'KR',
  'guney kore': 'KR',
  japan: 'JP',
  japonya: 'JP',
  china: 'CN',
  cin: 'CN',
  australia: 'AU',
  avustralya: 'AU',
  'new zealand': 'NZ',
  // i18n-ignore: Turkish country name matched against provider group titles
  'yeni zelanda': 'NZ',
  'south africa': 'ZA',
  'guney afrika': 'ZA',
  luxembourg: 'LU',
  luksemburg: 'LU',
  malta: 'MT',
  iceland: 'IS',
  izlanda: 'IS',
  lithuania: 'LT',
  litvanya: 'LT',
  latvia: 'LV',
  letonya: 'LV',
  estonia: 'EE',
  estonya: 'EE',
  moldova: 'MD',
  kazakhstan: 'KZ',
  kazakistan: 'KZ',
  bangladesh: 'BD',
  banglades: 'BD',
  'sri lanka': 'LK',
  philippines: 'PH',
  filipinler: 'PH',
  indonesia: 'ID',
  endonezya: 'ID',
  thailand: 'TH',
  tayland: 'TH',
  vietnam: 'VN',
  nigeria: 'NG',
  nijerya: 'NG',
  chile: 'CL',
  sili: 'CL',
  colombia: 'CO',
  kolombiya: 'CO',
  peru: 'PE',
  // i18n-ignore: ISO country code VE (Venezuela), not the Turkish word
  venezuela: 'VE',
  libya: 'LY',
  arabic: '',
  arab: '',
  latino: '',
  kurdish: '',
  kurdistan: '',
};

/** Two-letter codes that are also everyday words; they need a separator. */
const wordLikeCodes = new Set([
  'AL',
  'AT',
  'BE',
  'CO',
  'ES',
  'ID',
  'IN',
  'IS',
  'IT',
  'MA',
  'ME',
  'NO',
  'SE',
]);

const multiWordStarts = new Set(
  Object.keys(names)
    .filter((name) => name.includes(' '))
    .map((name) => name.slice(0, name.indexOf(' '))),
);

// | : - . / \ _ * ~ = # , ; > ¦ · » and common dash, bullet, arrow and star glyphs.
const separators = new Set([
  0x7c, 0x3a, 0x2d, 0x2e, 0x2f, 0x5c, 0x5f, 0x2a, 0x7e, 0x3d, 0x23, 0x2c, 0x3b, 0x3e, 0xa6, 0xb7,
  0xbb, 0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2016, 0x2022, 0x2039, 0x203a, 0x2192,
  0x21d2, 0x2212, 0x2219, 0x2500, 0x2501, 0x2502, 0x2503, 0x2550, 0x2551, 0x25a0, 0x25a1, 0x25aa,
  0x25ab, 0x25b6, 0x25b8, 0x25ba, 0x25c6, 0x25c7, 0x25cb, 0x25c9, 0x25cf, 0x2605, 0x2606, 0x2666,
  0x2726, 0x2727, 0x272a, 0x2b50, 0x27a4, 0x279c, 0x27a1,
]);

type Prefix = { iso: string; end: number; matched: string };
type Word = { start: number; end: number; folded: string; ascii: boolean };

/** Splits a category name into a flag and the remaining label. */
export function parseCategoryFlag(name: string): FlagParse {
  const prefix = readPrefix(name, 0, true, false);
  if (!prefix?.iso) return { flag: null, label: name.trim() };
  const rest = name.slice(prefix.end).trim();
  return { flag: flagEmoji(prefix.iso), label: rest || prefix.matched };
}

/** The flag emoji for a category name, or null. */
export const flagForCategory = (name: string) => parseCategoryFlag(name).flag;

/** The UI label for a category: `TR | Ulusal` → `🇹🇷 Ulusal`. */
export function flagged(name: string) {
  const { flag, label } = parseCategoryFlag(name);
  if (!flag) return label;
  return label ? `${flag} ${label}` : flag;
}

/** `TR` → `🇹🇷` (any case); null unless `iso2` is two ASCII letters. */
export function flagEmoji(iso2: string) {
  if (!/^[A-Za-z]{2}$/.test(iso2)) return null;
  const upper = iso2.toUpperCase();
  return String.fromCodePoint(
    0x1f1e6 + upper.charCodeAt(0) - 0x41,
    0x1f1e6 + upper.charCodeAt(1) - 0x41,
  );
}

/**
 * Removes a leading country marker from a channel name for EPG matching.
 * Country names need an explicit separator here (`Italia 1` is a channel);
 * region codes (`AR`, `EN`, `EXYU`) are removed too. At most two markers go
 * and the name is never emptied.
 */
export function stripCountryPrefix(name: string) {
  let s = name;
  for (let round = 0; round < 2; round++) {
    const prefix = readPrefix(s, 0, false, true);
    if (!prefix || prefix.end >= s.length) break;
    const rest = s.slice(prefix.end);
    if (!rest.trim()) break;
    s = rest;
  }
  return s;
}

function readPrefix(
  s: string,
  from: number,
  namesWithSpace: boolean,
  regions: boolean,
): Prefix | null {
  const n = s.length;
  let i = skipSpaces(s, from);
  if (i >= n) return null;

  // A name that already starts with a flag keeps it; a repeated marker for
  // the same country right after it is consumed too.
  const emoji = flagEmojiAt(s, i);
  if (emoji) {
    const after = skipSeparators(s, i + 4);
    const again = readPrefix(s, after, namesWithSpace, false);
    return { iso: emoji, end: again && again.iso === emoji ? again.end : after, matched: '' };
  }

  let close: number | null = null;
  const bracket = closingBracket(s.charCodeAt(i));
  if (bracket !== null) {
    close = bracket;
    i = skipSpaces(s, i + 1);
  } else if (separators.has(s.charCodeAt(i))) {
    while (i < n && separators.has(s.charCodeAt(i))) i++;
    i = skipSpaces(s, i);
  }

  const first = readWord(s, i);
  if (!first) return null;
  const words = [first];
  if (multiWordStarts.has(first.folded)) {
    let e = first.end;
    while (
      words.length < 4 &&
      e + 1 < n &&
      (s.charCodeAt(e) === 0x20 || s.charCodeAt(e) === 0x2d) &&
      isLetter(s, e + 1)
    ) {
      const w = readWord(s, e + 1)!;
      words.push(w);
      e = w.end;
    }
  }

  for (let k = words.length; k >= 1; k--) {
    const key = words
      .slice(0, k)
      .map((w) => w.folded)
      .join(' ');
    const iso = names[key];
    if (iso === undefined || (!iso && !regions)) continue;
    const matched = s.slice(words[0].start, words[k - 1].end);
    const result = finish(s, words[k - 1].end, iso, matched, close, namesWithSpace, true);
    if (result) return result;
  }

  const w = words[0];
  const length = w.end - w.start;
  if (!w.ascii || length < 2 || length > 4) return null;
  const raw = s.slice(w.start, w.end);
  const code = raw.toUpperCase();
  const iso = codes[code];
  if (iso === undefined || (!iso && !regions)) return null;
  const upper = raw === code;
  return finish(
    s,
    w.end,
    iso,
    raw,
    close,
    upper && length === 2 && !wordLikeCodes.has(code),
    upper,
  );
}

function finish(
  s: string,
  end: number,
  iso: string,
  matched: string,
  close: number | null,
  allowSpace: boolean,
  allowAlone: boolean,
): Prefix | null {
  const j = skipSpaces(s, end);
  if (close !== null) {
    return j < s.length && s.charCodeAt(j) === close
      ? { iso, end: skipSeparators(s, j + 1), matched }
      : null;
  }
  if (j >= s.length) return allowAlone ? { iso, end: s.length, matched } : null;
  if (separators.has(s.charCodeAt(j))) return { iso, end: skipSeparators(s, j), matched };
  if (j > end && allowSpace) return { iso, end: j, matched };
  return null;
}

/** A run of letters at `i` (digits end it; marks and apostrophes stay inside). */
function readWord(s: string, i: number): Word | null {
  if (i >= s.length || !isLetter(s, i)) return null;
  let folded = '';
  let ascii = true;
  let j = i;
  while (j < s.length) {
    const [cp, width] = codePointAt(s, j);
    const fold = foldCodePoint(cp);
    if (typeof fold === 'string') {
      if (/^[0-9]/.test(fold)) break;
      folded += fold;
    } else if (fold !== -1) break;
    if (!((cp | 0x20) >= 0x61 && (cp | 0x20) <= 0x7a)) ascii = false;
    j += width;
  }
  return { start: i, end: j, folded, ascii };
}

function isLetter(s: string, i: number) {
  const fold = foldCodePoint(codePointAt(s, i)[0]);
  return typeof fold === 'string' && !/^[0-9]/.test(fold);
}

const closingBracket = (c: number) =>
  ({ 0x5b: 0x5d, 0x28: 0x29, 0x7b: 0x7d, 0xab: 0xbb, 0x3c: 0x3e })[c] ?? null;

/** ISO code of a regional-indicator pair at `i`, or null. */
function flagEmojiAt(s: string, i: number) {
  const a = s.codePointAt(i);
  const b = s.codePointAt(i + 2);
  if (a === undefined || b === undefined) return null;
  if (a < 0x1f1e6 || a > 0x1f1ff || b < 0x1f1e6 || b > 0x1f1ff) return null;
  return String.fromCharCode(0x41 + a - 0x1f1e6, 0x41 + b - 0x1f1e6);
}

const isSpace = (c: number) =>
  c === 0x20 ||
  (c >= 0x09 && c <= 0x0d) ||
  c === 0xa0 ||
  (c >= 0x2000 && c <= 0x200d) ||
  c === 0x202f ||
  c === 0x205f ||
  c === 0x3000 ||
  c === 0xfe0f;

function skipSpaces(s: string, i: number) {
  while (i < s.length && isSpace(s.charCodeAt(i))) i++;
  return i;
}

function skipSeparators(s: string, i: number) {
  while (i < s.length && (isSpace(s.charCodeAt(i)) || separators.has(s.charCodeAt(i)))) i++;
  return i;
}
