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
