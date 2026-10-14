/** Accept only the exact opaque local-media capability shape issued by the chooser. */
export function localMediaId(value: unknown): string {
  if (typeof value !== 'string' || value.length > 256) throw new Error('Invalid media selection.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid media selection.');
  }
  if (
    value !== `rooms-media://${url.hostname}/video` ||
    url.protocol !== 'rooms-media:' ||
    url.pathname !== '/video' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(url.hostname)
  ) {
    throw new Error('Invalid media selection.');
  }
  return url.hostname;
}
