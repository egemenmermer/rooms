import type { SongMetadata } from './song-metadata';
export interface YouTubeCandidate {
  id: string;
  title: string;
  duration: number;
  uploader?: string;
  channel?: string;
  is_live?: boolean;
  has_drm?: boolean;
}
const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const variants = [
  'remix',
  'cover',
  'live',
  'acoustic',
  'instrumental',
  'karaoke',
  'sped up',
  'slowed',
  'nightcore',
  'remaster',
  'edit',
  'extended',
  'demo',
];
/** Conservative metadata match, not a guarantee of bit-identical recordings. */
export function matchingSong(
  song: SongMetadata,
  candidates: YouTubeCandidate[],
): YouTubeCandidate | null {
  const target = normalize(song.title),
    words = [...new Set(target.split(' ').filter(Boolean))];
  if (!words.length || !song.artists.length) return null;
  const has = (value: string, variant: string) =>
    new RegExp(`(?:^| )${variant === 'remaster' ? 'remaster(?:ed)?' : variant}(?: |$)`).test(value);
  const wanted = variants.filter((v) => has(target, v));
  const good = candidates.filter((c) => {
    if (
      !/^[A-Za-z0-9_-]{11}$/.test(c.id) ||
      typeof c.title !== 'string' ||
      !Number.isFinite(c.duration) ||
      c.duration <= 0 ||
      c.duration > 7200 ||
      c.is_live ||
      c.has_drm
    )
      return false;
    const title = normalize(c.title);
    if (variants.some((v) => has(title, v) !== wanted.includes(v))) return false;
    const tokens = new Set(title.split(' '));
    if (words.filter((w) => tokens.has(w)).length / words.length < 0.9) return false;
    const identity = normalize(`${c.title} ${c.channel ?? ''} ${c.uploader ?? ''}`).replace(
      / /g,
      '',
    );
    if (!song.artists.every((a) => identity.includes(normalize(a).replace(/ /g, '')))) return false;
    if (
      song.durationSec &&
      Math.abs(c.duration - song.durationSec) > Math.max(8, Math.min(15, song.durationSec * 0.06))
    )
      return false;
    return true;
  });
  return (
    good.sort((a, b) =>
      song.durationSec
        ? Math.abs(a.duration - song.durationSec) - Math.abs(b.duration - song.durationSec)
        : 0,
    )[0] ?? null
  );
}
