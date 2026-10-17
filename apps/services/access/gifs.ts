import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { StoatError } from '@rooms/stoat';

const KLIPY_API = 'https://api.klipy.com/api/v1';
/** Only media from KLIPY's own CDN is passed to clients, which show it from there. */
export const GIF_MEDIA_HOST = 'static.klipy.com';
export interface GifMedia {
  url: string;
  width: number;
  height: number;
}
export interface GifItem {
  id: string;
  title: string;
  preview: GifMedia;
  gif: GifMedia;
}
const media = z
  .object({
    url: z.string().max(2048),
    width: z.number().int().positive().max(4096),
    height: z.number().int().positive().max(4096),
  })
  .passthrough();
const item = z
  .object({
    id: z.union([z.number(), z.string().max(64)]),
    title: z.string().max(300).optional(),
    file: z
      .object({
        sm: z.object({ gif: media.optional(), webp: media.optional() }).passthrough(),
        md: z.object({ gif: media }).passthrough(),
      })
      .passthrough(),
  })
  .passthrough();
const page = z
  .object({
    result: z.literal(true),
    data: z
      .object({ data: z.array(z.unknown()).max(50), has_next: z.boolean().optional() })
      .passthrough(),
  })
  .passthrough();
const query = z
  .object({
    q: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(20).default(1),
  })
  .strict();

function mediaOf(value: z.infer<typeof media> | undefined): GifMedia | null {
  if (!value) return null;
  try {
    const url = new URL(value.url);
    if (url.protocol !== 'https:' || url.hostname !== GIF_MEDIA_HOST || url.username) return null;
    return { url: url.href, width: value.width, height: value.height };
  } catch {
    return null;
  }
}
/** KLIPY items reduced to what the picker shows and sends; anything off-CDN is dropped. */
export function parseGifPage(body: unknown): { items: GifItem[]; more: boolean } {
  const value = page.parse(body);
  const items = value.data.data.flatMap((raw) => {
    const parsed = item.safeParse(raw);
    if (!parsed.success) return [];
    const { file } = parsed.data;
    const preview = mediaOf(file.sm.webp ?? file.sm.gif),
      gif = mediaOf(file.md.gif);
    return preview && gif
      ? [
          {
            id: String(parsed.data.id),
            title: (parsed.data.title ?? '').slice(0, 120),
            preview,
            gif,
          },
        ]
      : [];
  });
  return { items, more: value.data.has_next === true };
}

/**
 * GIF search through KLIPY. The provider key stays on the server; clients only send the query
 * with their session, and each person is a stable hashed customer id, never their account id.
 */
export function registerGifs(
  server: FastifyInstance,
  options: {
    key?: string;
    user(authorization: string | undefined): Promise<string>;
    request?: typeof fetch;
  },
) {
  const request = options.request ?? fetch;
  const cache = new Map<string, { until: number; value: ReturnType<typeof parseGifPage> }>();
  server.get(
    '/v1/gifs',
    {
      config: {
        rateLimit: {
          max: 90,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) =>
            'gifs:' +
            createHash('sha256')
              .update(req.headers.authorization ?? req.ip)
              .digest('hex'),
        },
      },
    },
    async (req) => {
      const { q, page: number } = query.parse(req.query);
      const userId = await options.user(req.headers.authorization);
      if (!options.key) throw new StoatError(503, 'GIFS_NOT_CONFIGURED');
      const cacheKey = `${(q ?? '').toLocaleLowerCase('tr')}|${number}`;
      const hit = cache.get(cacheKey);
      if (hit && hit.until > Date.now()) return hit.value;
      const url = new URL(
        `${KLIPY_API}/${encodeURIComponent(options.key)}/gifs/${q ? 'search' : 'trending'}`,
      );
      url.searchParams.set('page', String(number));
      url.searchParams.set('per_page', '24');
      if (q) url.searchParams.set('q', q);
      url.searchParams.set(
        'customer_id',
        createHash('sha256').update(`rooms-gifs:${userId}`).digest('hex').slice(0, 32),
      );
      url.searchParams.set('locale', 'tr');
      url.searchParams.set('content_filter', 'medium');
      url.searchParams.set('format_filter', 'gif,webp');
      let response: Response;
      try {
        response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
      } catch {
        throw new StoatError(502, 'GIFS_UNAVAILABLE');
      }
      if (!response.ok) throw new StoatError(502, 'GIFS_UNAVAILABLE');
      let value: ReturnType<typeof parseGifPage>;
      try {
        value = parseGifPage(await response.json());
      } catch {
        throw new StoatError(502, 'GIFS_UNAVAILABLE');
      }
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, { until: Date.now() + 5 * 60_000, value });
      return value;
    },
  );
}
