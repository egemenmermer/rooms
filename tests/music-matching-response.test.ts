import { expect, it } from 'vitest';
import { matchingResponse } from '../apps/services/music/matching-response';
import type { MusicSnapshot } from '../packages/shared-contracts/src/music';
const snapshot: MusicSnapshot = {
  channelId: 'room',
  identity: 'bot',
  status: 'playing',
  queue: [],
  currentId: null,
  positionSec: 42,
  error: null,
};
const failure = () =>
  Object.assign(Error('MUSIC_MIRROR_NOT_FOUND'), {
    song: { title: 'Song', artists: ['Artist'] },
    candidates: [{ id: 'abcdefghijk', title: 'Artist Song live', durationSec: 120 }],
  });
it('offers choices only to opted-in callers and preserves the active shared snapshot', () => {
  expect(matchingResponse(failure(), snapshot, false)).toBeNull();
  const result = matchingResponse(failure(), snapshot, true)!;
  expect(result.status).toBe('playing');
  expect(result.positionSec).toBe(42);
  expect(result.matchCandidates?.candidates[0].id).toBe('abcdefghijk');
  expect(snapshot).not.toHaveProperty('matchCandidates');
});
it('does not describe access or search-service failures as a missing musical match', () => {
  expect(matchingResponse(Error('MUSIC_YOUTUBE_ACCESS_REQUIRED'), snapshot, true)).toBeNull();
  expect(matchingResponse(Error('MUSIC_SEARCH_UNAVAILABLE'), snapshot, true)).toBeNull();
});
