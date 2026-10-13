import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {MusicWorker} from '../apps/services/music/worker';
const workers:MusicWorker[]=[];afterEach(async()=>{for(const worker of workers.splice(0))await worker.close();});
async function setup(){const publisher={connect:vi.fn(async()=>{}),play:vi.fn(async()=>{}),pause:vi.fn(),close:vi.fn(async()=>{}),position:()=>0};const lease={leaseId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',url:'ws://127.0.0.1',token:'test-token'};
 const directories:string[]=[];const worker=new MusicWorker({publisher:()=>publisher,lease:async()=>lease,fetchFile:async()=>{const directory=await mkdtemp(join(tmpdir(),'rooms-music-test-'));directories.push(directory);const path=join(directory,'source.mp3');await writeFile(path,'fixture');return{directory,path,bytes:7,title:'Song',durationSec:30};}});workers.push(worker);return{publisher,worker,lease,directories};}
it('publishes separately, shares a source-free snapshot and keeps control independent of the popup',async()=>{
 const {worker,publisher,lease}=await setup();const first=await worker.command('room',lease,{type:'add',url:'https://audio.test/private.mp3?token=private'});
 expect(first.status).toBe('playing');expect(publisher.connect).toHaveBeenCalledTimes(1);expect(publisher.play).toHaveBeenCalledTimes(1);expect(JSON.stringify(first)).not.toContain('private');
 await worker.command('room',lease,{type:'pause'});expect(worker.snapshot('room').status).toBe('paused');await worker.command('room',lease,{type:'play'});expect(publisher.play).toHaveBeenCalledTimes(2);
});
it('next and previous use the server publisher and stop removes cached files',async()=>{
 const {worker,publisher,lease,directories}=await setup();await worker.command('room',lease,{type:'add',url:'https://audio.test/one.mp3'});await worker.command('room',lease,{type:'add',url:'https://audio.test/two.mp3'});
 const ids=worker.snapshot('room').queue.map(q=>q.id);await worker.command('room',lease,{type:'next'});expect(worker.snapshot('room').currentId).toBe(ids[1]);await worker.command('room',lease,{type:'previous'});expect(worker.snapshot('room').currentId).toBe(ids[0]);
 await worker.command('room',lease,{type:'stop'});expect(worker.snapshot('room').status).toBe('disconnected');expect(publisher.close).toHaveBeenCalled();for(const directory of directories)await expect(access(directory)).rejects.toThrow();
});
it('imports YouTube playlist references but downloads only the current audio file',async()=>{
 const {publisher,lease}=await setup();let downloads=0;const files:string[]=[];
 const worker=new MusicWorker({publisher:()=>publisher,lease:async()=>lease,youtubeReferences:async()=>[{source:'https://www.youtube.com/watch?v=PgHzDZJwGW8',title:'One',durationSec:30},{source:'https://www.youtube.com/watch?v=M7lc1UVf-VE',title:'Two',durationSec:40}],youtubeFile:async()=>{downloads++;const directory=await mkdtemp(join(tmpdir(),'rooms-music-yt-test-'));files.push(directory);const path=join(directory,'source.mp3');await writeFile(path,'fixture');return{directory,path,bytes:7,title:'Song',durationSec:30};}});workers.push(worker);
 await worker.command('youtube-room',lease,{type:'add',url:'https://www.youtube.com/playlist?list=PLabcdefgh123'});expect(downloads).toBe(1);expect(worker.snapshot('youtube-room').queue).toHaveLength(2);expect(JSON.stringify(worker.snapshot('youtube-room'))).not.toContain('youtube.com');
 await worker.command('youtube-room',lease,{type:'next'});expect(downloads).toBe(2);await worker.command('youtube-room',lease,{type:'previous'});expect(downloads).toBe(2);
});
it('starts a long YouTube set through the streaming publisher without a full-file download',async()=>{
 const {publisher,lease}=await setup();const stream=vi.fn(async()=>{});const download=vi.fn(async()=>{throw new Error('Full-set download must not occur');});
 const worker=new MusicWorker({publisher:()=>({...publisher,playYouTube:stream}),lease:async()=>lease,youtubeReferences:async()=>[{source:'https://www.youtube.com/watch?v=6MAzUT1YhWE',title:'Live set',durationSec:6128}],youtubeFile:download});workers.push(worker);
 const snapshot=await worker.command('stream-room',lease,{type:'add',url:'https://www.youtube.com/watch?v=6MAzUT1YhWE'});expect(snapshot.status).toBe('playing');expect(snapshot.queue[0]?.durationSec).toBe(6128);expect(stream).toHaveBeenCalledTimes(1);expect(download).not.toHaveBeenCalled();
});
it('resolves song links once, publishes the matched YouTube source and labels the actual source',async()=>{
 const {publisher,lease}=await setup();const playYouTube=vi.fn(async()=>{}),metadata=vi.fn(async()=>({provider:'spotify' as const,title:'Song',artists:['Artist'],durationSec:30})),match=vi.fn(async()=>({source:'https://www.youtube.com/watch?v=PgHzDZJwGW8',title:'Artist - Song',durationSec:30,requestedProvider:'spotify' as const}));
 const worker=new MusicWorker({publisher:()=>({...publisher,playYouTube}),lease:async()=>lease,songMetadata:metadata,matchingYouTubeReference:match});workers.push(worker);
 const result=await worker.command('mirror-room',lease,{type:'add',url:'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'});
 expect(metadata).toHaveBeenCalledTimes(1);expect(match).toHaveBeenCalledTimes(1);expect(playYouTube).toHaveBeenCalledWith('https://www.youtube.com/watch?v=PgHzDZJwGW8',0,expect.any(Function),expect.any(Function));
 expect(result.queue[0]?.title).toBe('Artist - Song · YouTube');expect(JSON.stringify(result)).not.toMatch(/spotify.com|youtube.com|test-token/);
 await worker.command('mirror-room',lease,{type:'pause'});await worker.command('mirror-room',lease,{type:'play'});expect(metadata).toHaveBeenCalledTimes(1);
});
it('does not mutate a queue or publish a song on an uncertain match',async()=>{
 const {publisher,lease}=await setup();const playYouTube=vi.fn(),worker=new MusicWorker({publisher:()=>({...publisher,playYouTube}),lease:async()=>lease,songMetadata:async()=>({provider:'soundcloud',title:'Song',artists:['Artist']}),matchingYouTubeReference:async()=>{throw new Error('MUSIC_MIRROR_NOT_FOUND');}});workers.push(worker);
 await expect(worker.command('mirror-room',lease,{type:'add',url:'https://soundcloud.com/artist/song'})).rejects.toThrow('MUSIC_MIRROR_NOT_FOUND');expect(worker.snapshot('mirror-room').queue).toEqual([]);expect(playYouTube).not.toHaveBeenCalled();
});
it('retains an access rejection received after playback starts',async()=>{
 const {publisher,lease}=await setup();let fail!:(error?:Error)=>void;
 const worker=new MusicWorker({publisher:()=>({...publisher,playYouTube:async(_source,_position,_ended,onError)=>{fail=onError;}}),lease:async()=>lease,youtubeReferences:async()=>[{source:'https://www.youtube.com/watch?v=PgHzDZJwGW8',title:'Source',durationSec:30}]});workers.push(worker);
 await worker.command('denied-room',lease,{type:'add',url:'https://www.youtube.com/watch?v=PgHzDZJwGW8'});
 fail(new Error('MUSIC_YOUTUBE_ACCESS_REQUIRED'));expect(worker.snapshot('denied-room').status).toBe('error');expect(worker.snapshot('denied-room').error).toBe('MUSIC_YOUTUBE_ACCESS_REQUIRED');
});
it('starts the newly requested source after the current source failed instead of retrying the failed item',async()=>{
 const {publisher,lease}=await setup();const rejected='https://www.youtube.com/watch?v=PgHzDZJwGW8',next='https://www.youtube.com/watch?v=dQw4w9WgXcQ';
 const playYouTube=vi.fn(async(source:string)=>{if(source===rejected)throw Error('MUSIC_YOUTUBE_ACCESS_REQUIRED');});
 const worker=new MusicWorker({publisher:()=>({...publisher,playYouTube}),lease:async()=>lease,youtubeReferences:async source=>[{source,title:source===rejected?'Unavailable request':'New request',durationSec:30}]});workers.push(worker);
 await expect(worker.command('recover-room',lease,{type:'add',url:rejected})).rejects.toThrow('MUSIC_YOUTUBE_ACCESS_REQUIRED');
 const value=await worker.command('recover-room',lease,{type:'add',url:next});expect(value.status).toBe('playing');expect(value.queue.find(t=>t.id===value.currentId)?.title).toBe('New request');expect(playYouTube).toHaveBeenLastCalledWith(next,0,expect.any(Function),expect.any(Function));expect(value.queue).toHaveLength(2);
});
it('ignores a retired decoder failure after selecting another track or pausing',async()=>{
 const {publisher,lease}=await setup(),failures:Array<(error?:Error)=>void>=[];
 const worker=new MusicWorker({publisher:()=>({...publisher,playYouTube:async(_source,_position,_ended,onError)=>{failures.push(onError);}}),lease:async()=>lease,youtubeReferences:async source=>[{source,title:'Request',durationSec:30}]});workers.push(worker);
 await worker.command('race-room',lease,{type:'add',url:'https://www.youtube.com/watch?v=PgHzDZJwGW8'});await worker.command('race-room',lease,{type:'add',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'});await worker.command('race-room',lease,{type:'next'});
 failures[0]!(Error('MUSIC_YOUTUBE_ACCESS_REQUIRED'));expect(worker.snapshot('race-room').status).toBe('playing');expect(worker.snapshot('race-room').error).toBeNull();
 await worker.command('race-room',lease,{type:'pause'});failures[1]!(Error('MUSIC_DECODE_FAILED'));expect(worker.snapshot('race-room').status).toBe('paused');expect(worker.snapshot('race-room').error).toBeNull();
});
it('does not overwrite an immediate source failure with a playing result',async()=>{
 const {publisher,lease}=await setup();
 const worker=new MusicWorker({publisher:()=>({...publisher,playYouTube:async(_source,_position,_ended,onError)=>{onError(Error('MUSIC_DECODE_FAILED'));}}),lease:async()=>lease,youtubeReferences:async source=>[{source,title:'Request',durationSec:30}]});workers.push(worker);
 const value=await worker.command('startup-failure-room',lease,{type:'add',url:'https://www.youtube.com/watch?v=PgHzDZJwGW8'});expect(value.status).toBe('error');expect(value.error).toBe('MUSIC_DECODE_FAILED');
});
