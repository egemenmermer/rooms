import { z } from 'zod';

export const DEFAULT_DJ_IMAGE = './dj/default-dj.png';
export const DEFAULT_DJ_NAME = 'DJ';
const publicPath = (extensions: string) =>
  z.string().max(240).regex(new RegExp(`^/rooms-branding/[A-Za-z0-9_/-]+\\.(${extensions})$`))
    .refine(path => !path.includes('..') && !path.includes('//'));

export const communityBrandingSchema = z.object({
  version: z.literal(1),
  music: z.object({
    name: z.string().trim().min(1).max(40).refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
    poster: publicPath('png|webp|jpg|jpeg|avif').optional(),
    animation: publicPath('webm|mp4').optional(),
  }).strict(),
}).strict();

export interface CommunityBranding { name: string; poster?: string; animation?: string; }
export const defaultCommunityBranding: CommunityBranding = { name: DEFAULT_DJ_NAME };

export function communityOrigin(serverUrl: string): string | null {
  try {
    const url = new URL(serverUrl);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))) return null;
    return url.origin;
  } catch { return null; }
}

export function resolveCommunityBranding(raw: unknown, origin: string): CommunityBranding {
  const config = communityBrandingSchema.parse(raw);
  return { name: config.music.name,
    poster: config.music.poster ? new URL(config.music.poster, origin).href : undefined,
    animation: config.music.animation ? new URL(config.music.animation, origin).href : undefined };
}

/** Public, bounded, same-community assets. Never send account cookies/tokens. */
export async function fetchBrandingAsset(url: string, signal: AbortSignal, maxBytes: number): Promise<Blob> {
  const response = await window.fetch(url, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal });
  if (!response.ok || !response.body || Number(response.headers.get('content-length') ?? 0) > maxBytes) throw new Error('Branding unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) throw new Error('Branding too large');
      chunks.push(new Uint8Array(next.value));
    }
    return new Blob(chunks, { type: response.headers.get('content-type') ?? '' });
  } finally { await reader.cancel().catch(() => {}); }
}
