import {expect,it} from 'vitest';
import {parseDJLink} from '../apps/desktop/src/dj-links';
it('accepts official video links and prioritizes explicit playlists',()=>{
 expect(parseDJLink('https://youtu.be/PgHzDZJwGW8?si=test')).toEqual({kind:'video',id:'PgHzDZJwGW8'});
 expect(parseDJLink('https://music.youtube.com/watch?v=PgHzDZJwGW8&list=PLabcdefgh123')).toEqual({kind:'playlist',id:'PLabcdefgh123'});
 expect(parseDJLink('https://www.youtube.com/playlist?list=PLabcdefgh123')).toEqual({kind:'playlist',id:'PLabcdefgh123'});
 expect(parseDJLink('https://www.youtube.com/shorts/PgHzDZJwGW8')).toEqual({kind:'video',id:'PgHzDZJwGW8'});
});
it('rejects lookalike providers, credentials, non-HTTPS and arbitrary links',()=>{
 for(const url of ['https://youtube.com.evil.test/watch?v=PgHzDZJwGW8','https://owner:secret@youtube.com/watch?v=PgHzDZJwGW8','http://youtu.be/PgHzDZJwGW8','https://127.0.0.1/test','https://open.spotify.com/track/123','https://youtube.com/watch?v=bad'])expect(parseDJLink(url)).toBeNull();
});

it('queues the linked video rather than a generated radio Mix',()=>{expect(parseDJLink('https://www.youtube.com/watch?v=6MAzUT1YhWE&list=RD6MAzUT1YhWE&start_radio=1')).toEqual({kind:'video',id:'6MAzUT1YhWE'});});
