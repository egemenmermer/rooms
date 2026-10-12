import {expect,it} from 'vitest';
import {canonicalYouTube,youtubeSource} from '../apps/services/music/youtube-source';
it('canonicalizes provider URLs instead of forwarding user-controlled extractor options',()=>{
 expect(canonicalYouTube('https://youtu.be/PgHzDZJwGW8?si=ignored')).toBe('https://www.youtube.com/watch?v=PgHzDZJwGW8');
 expect(canonicalYouTube('https://www.youtube.com/watch?v=PgHzDZJwGW8&list=PLabcdefgh123')).toBe('https://www.youtube.com/playlist?list=PLabcdefgh123');
 for(const url of ['https://youtube.com.evil.test/watch?v=PgHzDZJwGW8','file:///etc/passwd','https://user:password@youtube.com/watch?v=PgHzDZJwGW8'])expect(youtubeSource(url)).toBeNull();
});
