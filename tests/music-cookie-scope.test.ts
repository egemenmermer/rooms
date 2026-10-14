import { afterEach, expect, it } from 'vitest';
import { youtubeSessionArgs } from '../apps/services/music/youtube-source';
const previous = process.env.ROOMS_YOUTUBE_COOKIE_FILE;
afterEach(() => {
  if (previous === undefined) delete process.env.ROOMS_YOUTUBE_COOKIE_FILE;
  else process.env.ROOMS_YOUTUBE_COOKIE_FILE = previous;
});
it('uses anonymous access until an owner-approved server session is configured', () => {
  delete process.env.ROOMS_YOUTUBE_COOKIE_FILE;
  expect(youtubeSessionArgs()).toEqual([]);
});
it('refuses arbitrary paths and browser profiles as credential sources', () => {
  process.env.ROOMS_YOUTUBE_COOKIE_FILE = '/Users/owner/Brave/Cookies';
  expect(() => youtubeSessionArgs()).toThrow('MUSIC_YOUTUBE_ACCESS_REQUIRED');
});
