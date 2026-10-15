import { z } from 'zod';
export const musicLyricsSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unavailable') }).strict(),
  z.object({ status: z.literal('instrumental') }).strict(),
  z
    .object({
      status: z.literal('found'),
      provider: z.literal('LRCLIB'),
      lines: z
        .array(
          z
            .object({ time: z.number().finite().min(0).max(7200), text: z.string().max(1000) })
            .strict(),
        )
        .min(1)
        .max(1000),
    })
    .strict(),
]);
export type MusicLyrics = z.infer<typeof musicLyricsSchema>;
