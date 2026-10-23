// Stremio stream labels, shared by the cinema service and the desktop main process.

/** Torrentio-style labels: `[RD+]` is in the debrid cache, `[RD download]` is not yet. */
export function streamFacts(name: string, title: string) {
  const all = `${name}\n${title}`;
  const cached = /\[[A-Z]{2,3}\+\]/.test(name) ? true : /download\]/i.test(name) ? false : null;
  const resolution = /\b(2160p|4k|uhd)\b/i.test(all)
    ? '4K'
    : /\b1080p\b/i.test(all)
      ? '1080p'
      : /\b720p\b/i.test(all)
        ? '720p'
        : /\b(480p|576p|sd)\b/i.test(all)
          ? 'SD'
          : null;
  const size = /([\d.,]+\s?[GM]B)\b/.exec(all)?.[1] ?? null;
  return { cached, resolution, size };
}

/** A Stremio id or video id (`tt0903747`, `tt0903747:1:2`, `kitsu:1`). */
export const STREMIO_ID = /^[A-Za-z0-9:._%-]{1,160}$/;
