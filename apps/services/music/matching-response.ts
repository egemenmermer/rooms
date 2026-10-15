import {
  musicFailedSongSchema,
  musicSearchResultsSchema,
  musicSnapshotSchema,
  type MusicSnapshot,
} from '../../../packages/shared-contracts/src/music';
/** Opt-in response only: candidate choice never changes the shared queue or current track. */
export function matchingResponse(error: unknown, snapshot: MusicSnapshot, offered: boolean) {
  if (!offered || !(error instanceof Error) || error.message !== 'MUSIC_MIRROR_NOT_FOUND')
    return null;
  const value = error as Error & { song?: unknown; candidates?: unknown };
  const song = musicFailedSongSchema.safeParse(value.song),
    candidates = musicSearchResultsSchema.safeParse(value.candidates);
  if (!song.success || !candidates.success) return null;
  const query = `${song.data.artists.join(' ')} ${song.data.title}`.slice(0, 200);
  return musicSnapshotSchema.parse({
    ...snapshot,
    matchCandidates: { query, candidates: candidates.data },
  });
}
