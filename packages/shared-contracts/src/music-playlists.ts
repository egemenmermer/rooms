import { z } from 'zod';
import { parseDJLink } from './music-links';
import { parseSongLink } from './song-links';
export const isPlaylistLink = (url: string) =>
  parseDJLink(url)?.kind === 'playlist' || parseSongLink(url)?.kind === 'playlist';
const youtubePlaylistTrackSchema = z
  .object({
    videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
    title: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[^\x00-\x1f]+$/),
    durationSec: z.number().finite().min(0).max(7200),
  })
  .strict();
export const spotifyPlaylistTrackSchema = youtubePlaylistTrackSchema
  .omit({ videoId: true })
  .extend({
    spotifyTrackId: z.string().regex(/^[A-Za-z0-9]{22}$/),
    artists: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(160)
          .regex(/^[^\x00-\x1f]+$/),
      )
      .min(1)
      .max(8),
  })
  .strict();
export const playlistTrackSchema = z.union([
  youtubePlaylistTrackSchema,
  spotifyPlaylistTrackSchema,
]);
export type SpotifyPlaylistTrack = z.infer<typeof spotifyPlaylistTrackSchema>;
export const playlistSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    name: z.string().trim().min(1).max(80),
    tracks: z.array(playlistTrackSchema).max(100),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const playlistCatalogSchema = z.array(playlistSchema).max(50);
export const playlistChangeSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('save'),
      id: z.string().uuid().optional(),
      revision: z.number().int().positive().optional(),
      name: z.string().trim().min(1).max(80),
      tracks: z.array(playlistTrackSchema).max(100),
    })
    .strict()
    .refine((v) => !!v.id === !!v.revision),
  z
    .object({
      op: z.literal('saveQueue'),
      name: z.string().trim().min(1).max(80),
      sessionId: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('import'),
      name: z.string().trim().min(1).max(80),
      url: z.string().max(2048).refine(isPlaylistLink),
    })
    .strict(),
  z
    .object({
      op: z.literal('remove'),
      id: z.string().uuid(),
      revision: z.number().int().positive(),
    })
    .strict(),
]);
export type SharedPlaylist = z.infer<typeof playlistSchema>;
export type PlaylistTrack = z.infer<typeof playlistTrackSchema>;
export type PlaylistChange = z.infer<typeof playlistChangeSchema>;
