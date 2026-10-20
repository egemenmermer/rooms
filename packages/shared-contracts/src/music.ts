import { z } from 'zod';
import { playlistTrackSchema } from './music-playlists';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const musicCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('add-list'),
      tracks: z.array(playlistTrackSchema).min(1).max(100),
      playNow: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('add'),
      url: z.string().url().max(2048),
      playNow: z.boolean().optional(),
      offerCandidates: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal('play') }).strict(),
  z.object({ type: z.literal('pause') }).strict(),
  z.object({ type: z.literal('next') }).strict(),
  z.object({ type: z.literal('previous') }).strict(),
  z
    .object({
      type: z.literal('seek'),
      id: z.string().uuid(),
      positionSec: z.number().finite().min(0).max(7200),
    })
    .strict(),
  z.object({ type: z.literal('select'), id: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal('reorder'),
      ids: z
        .array(z.string().uuid())
        .min(1)
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict(),
  z
    .object({
      type: z.literal('restore'),
      sessionId: z.string().uuid(),
      trackId: z.string().uuid().optional(),
    })
    .strict(),
  z.object({ type: z.literal('stop') }).strict(),
  z.object({ type: z.literal('remove'), id: z.string().uuid() }).strict(),
  /** Empties the queue but for the current track. */
  z.object({ type: z.literal('clear') }).strict(),
]);
export type MusicCommand = z.infer<typeof musicCommandSchema>;
export const musicSearchQuerySchema = z
  .string()
  .trim()
  .min(2)
  .max(200)
  .refine((value) => !/[\x00-\x1f\x7f]/.test(value), 'Invalid search text');
export const musicSearchResultsSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
        title: z.string().min(1).max(160),
        durationSec: z.number().finite().min(0).max(7200),
      })
      .strict(),
  )
  .max(5);
export type MusicSearchResult = z.infer<typeof musicSearchResultsSchema>[number];
export const musicSnapshotSchema = z
  .object({
    channelId: id,
    identity: id,
    status: z.enum(['disconnected', 'connecting', 'playing', 'paused', 'error']),
    queue: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            title: z.string().max(160),
            durationSec: z.number().finite().min(0).max(7200),
          })
          .strict(),
      )
      .max(100),
    currentId: z.string().uuid().nullable(),
    positionSec: z.number().finite().min(0).max(7200),
    error: z.string().max(240).nullable(),
    matchCandidates: z
      .object({ query: musicSearchQuerySchema, candidates: musicSearchResultsSchema })
      .strict()
      .optional(),
    /** Set on the add response only, when a Spotify playlist was imported partially. */
    importNotice: z
      .object({
        added: z.number().int().min(1).max(100),
        skipped: z.number().int().min(0).max(100),
        /** Spotify's public embed capped the list at 100 rows. */
        truncated: z.boolean(),
        /** The rest of the list did not fit in the room queue. */
        queueFull: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type MusicSnapshot = z.infer<typeof musicSnapshotSchema>;
export const musicIdentity = (channelId: string) => `rooms-music-${channelId.slice(0, 96)}`;

export const musicHistorySchema = z
  .array(
    z
      .object({
        id: z.string().uuid(),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime().nullable(),
        tracks: z
          .array(
            z
              .object({
                id: z.string().uuid(),
                title: z.string().min(1).max(160),
                durationSec: z.number().finite().min(0).max(7200),
                played: z.boolean(),
              })
              .strict(),
          )
          .max(100),
      })
      .strict(),
  )
  .max(30);
export type MusicHistorySession = z.infer<typeof musicHistorySchema>[number];

export const musicFailedSongSchema = z
  .object({
    title: z.string().min(1).max(160),
    artists: z.array(z.string().min(1).max(160)).min(1).max(8),
  })
  .strict();
