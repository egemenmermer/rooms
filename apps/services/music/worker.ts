import {randomUUID} from 'node:crypto';
import {rm} from 'node:fs/promises';
import type {MusicCommand,MusicSnapshot} from '../../../packages/shared-contracts/src/music';
import {musicIdentity} from '../../../packages/shared-contracts/src/music';
import {fetchMusicFile,type MusicFile} from './audio-file';
import {youtubeSource,youtubeReferences,fetchYouTubeMusic,matchingYouTubeReference,type MusicReference} from './youtube-source';
import {parseSongLink} from '../../../packages/shared-contracts/src/song-links';
import {songMetadata} from './song-metadata';
import type {MusicPublisher} from './publisher';
export interface MusicLease {leaseId:string;url:string;token:string}
type Entry=MusicReference&{id:string;file?:MusicFile};
interface Session {channelId:string;leaseId:string;publisher:MusicPublisher;connected:boolean;status:MusicSnapshot['status'];queue:Entry[];index:number;error:string|null;serial:Promise<unknown>;generation:number;heartbeat?:ReturnType<typeof setInterval>;pausedAt:number|null}
export class MusicWorker{
 private sessions=new Map<string,Session>();private bytes=0;private pending=0;
 constructor(private options:{publisher():MusicPublisher;lease(channelId:string,leaseId:string):Promise<MusicLease>;fetchFile?:typeof fetchMusicFile;youtubeReferences?:typeof youtubeReferences;youtubeFile?:typeof fetchYouTubeMusic;songMetadata?:typeof songMetadata;matchingYouTubeReference?:typeof matchingYouTubeReference;now?:()=>number}){}
 private now(){return this.options.now?.()??Date.now();}
 snapshot(channelId:string):MusicSnapshot{const s=this.sessions.get(channelId);return{channelId,identity:musicIdentity(channelId),status:s?.status??'disconnected',queue:s?.queue.map(({id,title,durationSec,requestedProvider})=>({id,title:requestedProvider?`${title.slice(0,140)} · YouTube`:title,durationSec}))??[],currentId:s?.queue[s.index]?.id??null,positionSec:s?Math.min(7200,s.publisher.position()):0,error:s?.error??null};}
 private async destroy(s:Session){if(this.sessions.get(s.channelId)!==s)return;this.sessions.delete(s.channelId);s.generation++;clearInterval(s.heartbeat);await s.publisher.close().catch(()=>{});await Promise.all(s.queue.map(async file=>{if(file.file){this.bytes-=file.file.bytes;await rm(file.file.directory,{recursive:true,force:true});}}));}
 async close(){await Promise.all([...this.sessions.values()].map(s=>this.destroy(s)));}
 private async ensure(channelId:string,lease:MusicLease){let s=this.sessions.get(channelId);if(s&&s.leaseId!==lease.leaseId){await this.destroy(s);s=undefined;}if(!s){if(this.sessions.size>=2)throw new Error('MUSIC_ROOM_LIMIT');s={channelId,leaseId:lease.leaseId,publisher:this.options.publisher(),connected:false,status:'connecting',queue:[],index:-1,error:null,serial:Promise.resolve(),generation:0,pausedAt:null};this.sessions.set(channelId,s);}
 if(!s.connected){try{await s.publisher.connect(lease.url,lease.token);s.connected=true;s.status='paused';s.pausedAt=this.now();}catch{await this.destroy(s);throw new Error('MUSIC_TRANSPORT_UNAVAILABLE');}
 const selected=s;let checking=false;s.heartbeat=setInterval(()=>{if(checking)return;checking=true;void (async()=>{try{await this.options.lease(channelId,selected.leaseId);if(selected.pausedAt&&this.now()-selected.pausedAt>180000)await this.destroy(selected);}catch{await this.destroy(selected);}finally{checking=false;}})();},10000);s.heartbeat.unref();}
 return s;
 }
 private async play(s:Session,position=0){const item=s.queue[s.index];if(!item)return;const generation=s.generation;s.publisher.pause();s.status='connecting';s.error=null;
 try{if(youtubeSource(item.source)&&s.publisher.playYouTube){
 await s.publisher.playYouTube(item.source,Math.max(0,position),()=>{if(this.sessions.get(s.channelId)!==s||generation!==s.generation)return;void this.serial(s,async()=>{if(s.queue[s.index]?.id!==item.id)return;if(s.index+1<s.queue.length){s.index++;await this.play(s);}else{s.status='paused';s.pausedAt=this.now();}}).catch(()=>{});},()=>{if(this.sessions.get(s.channelId)===s){s.status='error';s.error='MUSIC_DECODE_FAILED';}});
 if(this.sessions.get(s.channelId)===s&&generation===s.generation){s.status='playing';s.pausedAt=null;}return;
 }
 if(!item.file){
 // Release inactive cached files before a long set download; keep other rooms' playing files.
 for(const candidate of this.sessions.values())for(const old of candidate.queue){if(old.file&&old!==candidate.queue[candidate.index]&&this.bytes>180*1024*1024){this.bytes-=old.file.bytes;await rm(old.file.directory,{recursive:true,force:true});delete old.file;}}
 const file=await (youtubeSource(item.source)?this.options.youtubeFile??fetchYouTubeMusic:this.options.fetchFile??fetchMusicFile)(item.source);
 if(this.sessions.get(s.channelId)!==s||generation!==s.generation){await rm(file.directory,{recursive:true,force:true});return;}
 for(const candidate of this.sessions.values())for(const old of candidate.queue){if(old.file&&old!==item&&old!==candidate.queue[candidate.index]&&this.bytes+file.bytes>320*1024*1024){this.bytes-=old.file.bytes;await rm(old.file.directory,{recursive:true,force:true});delete old.file;}}
 if(this.bytes+file.bytes>384*1024*1024){await rm(file.directory,{recursive:true,force:true});throw new Error('MUSIC_CACHE_LIMIT');}this.bytes+=file.bytes;item.file=file;item.title=file.title;item.durationSec=file.durationSec;}
 s.status='playing';s.pausedAt=null;await s.publisher.play(item.file.path,Math.max(0,Math.min(position,Math.max(0,item.durationSec-0.01))),()=>{if(this.sessions.get(s.channelId)!==s||generation!==s.generation)return;void this.serial(s,async()=>{if(s.queue[s.index]?.id!==item.id)return;if(s.index+1<s.queue.length){s.index++;await this.play(s);}else{s.status='paused';s.pausedAt=this.now();}}).catch(()=>{});},()=>{if(this.sessions.get(s.channelId)===s){s.status='error';s.error='MUSIC_DECODE_FAILED';}});
 }catch(error){if(this.sessions.get(s.channelId)===s){s.status='error';s.error=error instanceof Error&&/^MUSIC_[A-Z_]+$/.test(error.message)?error.message:'MUSIC_SOURCE_FAILED';}throw error;}
 }
 private async serial<T>(s:Session,work:()=>Promise<T>):Promise<T>{const pending=s.serial.catch(()=>{}).then(work);s.serial=pending;return pending;}
 async command(channelId:string,lease:MusicLease,command:MusicCommand):Promise<MusicSnapshot>{
 if(command.type==='stop'){const selected=this.sessions.get(channelId);if(selected)await this.destroy(selected);return this.snapshot(channelId);}
 const s=await this.ensure(channelId,lease);
 return this.serial(s,async()=>{if(this.sessions.get(channelId)!==s)throw new Error('MUSIC_LEASE_EXPIRED');await this.options.lease(channelId,s.leaseId);
 switch(command.type){
 case 'add':{if(s.queue.length>=100||this.pending>=1)throw new Error('MUSIC_QUEUE_FULL');this.pending++;try{
 let references:MusicReference[];if(youtubeSource(command.url))references=await (this.options.youtubeReferences??youtubeReferences)(command.url);else if(parseSongLink(command.url)){const song=await (this.options.songMetadata??songMetadata)(command.url);references=[await (this.options.matchingYouTubeReference??matchingYouTubeReference)(song)];}else{const url=new URL(command.url);if(url.protocol!=='https:'||url.username||url.password)throw new Error('MUSIC_SOURCE_FAILED');references=[{source:command.url,title:'Music',durationSec:0}];}
 if(s.queue.length+references.length>100)throw new Error('MUSIC_QUEUE_FULL');if(this.sessions.get(channelId)!==s)throw new Error('MUSIC_LEASE_EXPIRED');s.queue.push(...references.map(ref=>({...ref,id:randomUUID()})));if(s.index===-1){s.index=0;await this.play(s);}else if(s.status==='error')await this.play(s);
 }finally{this.pending--;}break;}
 case 'play':if(s.index===-1&&s.queue.length)s.index=0;if(s.queue[s.index])await this.play(s,Math.min(s.publisher.position(),s.queue[s.index]!.durationSec-0.01));break;
 case 'pause':s.publisher.pause();s.status='paused';s.pausedAt=this.now();break;
 case 'next':if(s.index+1<s.queue.length){s.index++;await this.play(s);}else{s.publisher.pause();s.status='paused';s.pausedAt=this.now();}break;
 case 'previous':if(s.index>0)s.index--;await this.play(s);break;
 case 'remove':{const index=s.queue.findIndex(q=>q.id===command.id);if(index===s.index)throw new Error('MUSIC_CURRENT_ITEM');if(index>=0){const [file]=s.queue.splice(index,1);if(index<s.index)s.index--;if(file!.file){this.bytes-=file!.file.bytes;await rm(file!.file.directory,{recursive:true,force:true});}}break;}
 }
 return this.snapshot(channelId);
 });
 }
}
