export type DJLink = { kind: 'video'; id: string } | { kind: 'playlist'; id: string };
/** Accept provider identifiers, never arbitrary URLs or userinfo. A list URL imports the list. */
export function parseDJLink(raw: string): DJLink | null {
  const value = raw.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return { kind: 'video', id: value };
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (
      ![
        'youtube.com',
        'www.youtube.com',
        'm.youtube.com',
        'music.youtube.com',
        'youtu.be',
      ].includes(url.hostname)
    )
      return null;
    const list = url.searchParams.get('list');
    const radioVideo = url.searchParams.get('v');
    if (list?.startsWith('RD') && radioVideo && /^[a-zA-Z0-9_-]{11}$/.test(radioVideo))
      return { kind: 'video', id: radioVideo };
    if (list && /^[a-zA-Z0-9_-]{10,128}$/.test(list)) return { kind: 'playlist', id: list };
    const id =
      url.hostname === 'youtu.be'
        ? url.pathname.slice(1)
        : (url.searchParams.get('v') ??
          (/^\/(shorts|embed|live)\//.test(url.pathname) ? url.pathname.split('/')[2] : null));
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? { kind: 'video', id } : null;
  } catch {
    return null;
  }
}
