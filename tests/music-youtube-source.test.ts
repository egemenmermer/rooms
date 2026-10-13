import {expect,it} from 'vitest';
import {canonicalYouTube,youtubeSource,youtubeFailure} from '../apps/services/music/youtube-source';
it('canonicalizes provider URLs instead of forwarding user-controlled extractor options',()=>{
 expect(canonicalYouTube('https://youtu.be/PgHzDZJwGW8?si=ignored')).toBe('https://www.youtube.com/watch?v=PgHzDZJwGW8');
 expect(canonicalYouTube('https://www.youtube.com/watch?v=PgHzDZJwGW8&list=PLabcdefgh123')).toBe('https://www.youtube.com/playlist?list=PLabcdefgh123');
 for(const url of ['https://youtube.com.evil.test/watch?v=PgHzDZJwGW8','file:///etc/passwd','https://user:password@youtube.com/watch?v=PgHzDZJwGW8'])expect(youtubeSource(url)).toBeNull();
});

it.each(['Sign in to confirm you are not a bot','HTTP Error 403: Forbidden','HTTP Error 429: Too Many Requests','cookies are no longer valid'])('retains provider access rejection without exposing diagnostics: %s',message=>{expect(youtubeFailure(message)).toBe('MUSIC_YOUTUBE_ACCESS_REQUIRED');});
it('keeps non-authentication provider failures separate',()=>{expect(youtubeFailure('Video unavailable')).toBe('MUSIC_YOUTUBE_UNAVAILABLE');});
