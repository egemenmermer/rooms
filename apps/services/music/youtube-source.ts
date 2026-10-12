import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,stat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {existsSync,statSync} from 'node:fs';
import {parseDJLink} from '../../../packages/shared-contracts/src/music-links';
import type {MusicFile} from './audio-file';
export interface MusicReference{source:string;title:string;durationSec:number}
export const youtubeSource=(raw:string)=>parseDJLink(raw);
export function canonicalYouTube(raw:string){const link=youtubeSource(raw);if(!link)throw new Error('MUSIC_SOURCE_FAILED');return link.kind==='video'?`https://www.youtube.com/watch?v=${link.id}`:`https://www.youtube.com/playlist?list=${link.id}`;}
/** Fixed YouTube extractor; optional owner-approved server-only bot session, never personal browser extraction. */
export function youtubeSessionArgs():string[]{
 const path=process.env.ROOMS_YOUTUBE_COOKIE_FILE;if(!path)return[];
 if(path!=='/run/rooms/youtube-cookies.txt'||!existsSync(path))throw new Error('MUSIC_YOUTUBE_ACCESS_REQUIRED');
 const info=statSync(path);if(!info.isFile()||info.size>1024*1024||(info.mode&0o077)!==0)throw new Error('MUSIC_YOUTUBE_ACCESS_REQUIRED');
 return['--cookies',path];
}
async function run(args:string[],timeoutMs:number,directory?:string):Promise<string>{
 const session=youtubeSessionArgs();let cookieDirectory:string|undefined;
 if(session.length){cookieDirectory=await mkdtemp(join(tmpdir(),'rooms-youtube-session-'));const {copyFile,chmod}=await import('node:fs/promises');const copy=join(cookieDirectory,'cookies.txt');await copyFile(session[1]!,copy);await chmod(copy,0o600);session[1]=copy;}
 try{return await new Promise<string>((resolve,reject)=>{
 const child=spawn('yt-dlp',['--ignore-config','--no-cache-dir','--no-progress','--no-warnings','--socket-timeout','10','--retries','1','--extractor-retries','1','--js-runtimes','node',...session,...args],{stdio:['ignore','pipe','pipe']});let output='',errors='',done=false,checking=false;
 const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timeout);clearInterval(sizeTimer);if(error){child.kill('SIGKILL');reject(error);}else resolve(output);};
 const timeout=setTimeout(()=>finish(new Error('MUSIC_SOURCE_TIMEOUT')),timeoutMs);
 const sizeTimer=setInterval(()=>{if(!directory||checking)return;checking=true;void (async()=>{try{let bytes=0;for(const file of await readdir(directory))bytes+=(await stat(join(directory,file))).size;if(bytes>400*1024*1024)finish(new Error('MUSIC_SOURCE_TOO_LARGE'));}catch{/* A cancelled directory may already have been removed. */}finally{checking=false;}})();},500);
 child.stdout.on('data',value=>{output+=value.toString();if(output.length>1024*1024)finish(new Error('MUSIC_SOURCE_TOO_LARGE'));});child.stderr.on('data',value=>{if(errors.length<16000)errors+=value.toString();});
 child.on('error',()=>finish(new Error('MUSIC_YOUTUBE_UNAVAILABLE')));child.on('close',code=>{if(code!==0)finish(new Error(/sign in|not a bot|cookies|HTTP Error 403|HTTP Error 429/i.test(errors)?'MUSIC_YOUTUBE_ACCESS_REQUIRED':'MUSIC_YOUTUBE_UNAVAILABLE'));else finish();});
 });}finally{if(cookieDirectory)await rm(cookieDirectory,{recursive:true,force:true});}}
export async function youtubeReferences(raw:string):Promise<MusicReference[]>{const link=youtubeSource(raw);if(!link)throw new Error('MUSIC_SOURCE_FAILED');const output=await run(['--flat-playlist','--skip-download','--dump-single-json','--playlist-end','100',canonicalYouTube(raw)],25000);let value:any;try{value=JSON.parse(output);}catch{throw new Error('MUSIC_YOUTUBE_UNAVAILABLE');}
 const entries=link.kind==='playlist'?value.entries:[value];if(!Array.isArray(entries)||!entries.length)throw new Error('MUSIC_YOUTUBE_UNAVAILABLE');
 const result:MusicReference[]=[];for(const entry of entries){if(!entry||typeof entry.id!=='string'||!/^[a-zA-Z0-9_-]{11}$/.test(entry.id)||entry.is_live||entry.has_drm||Number(entry.duration)>7200)continue;result.push({source:`https://www.youtube.com/watch?v=${entry.id}`,title:typeof entry.title==='string'?entry.title.replace(/[\x00-\x1f]/g,'').slice(0,160):'YouTube',durationSec:Number.isFinite(entry.duration)&&entry.duration>0?entry.duration:0});}
 if(!result.length)throw new Error('MUSIC_YOUTUBE_UNAVAILABLE');return result;
}
export async function fetchYouTubeMusic(raw:string):Promise<MusicFile>{const directory=await mkdtemp(join(tmpdir(),'rooms-music-'));try{
 await run(['--no-playlist','--match-filters','!is_live & duration <= 7200','--max-filesize','180M','--format','bestaudio[has_drm!=True]','--extract-audio','--audio-format','mp3','--audio-quality','192K','--write-info-json','--output',join(directory,'source.%(ext)s'),canonicalYouTube(raw)],120000,directory);
 const path=join(directory,'source.mp3'),details=JSON.parse(await readFile(join(directory,'source.info.json'),'utf8'));const bytes=(await stat(path)).size,durationSec=Number(details.duration);if(bytes>180*1024*1024||!Number.isFinite(durationSec)||durationSec<=0||durationSec>7200||details.has_drm)throw new Error('MUSIC_SOURCE_TOO_LARGE');
 return{directory,path,bytes,durationSec,title:typeof details.title==='string'?details.title.replace(/[\x00-\x1f]/g,'').slice(0,160):'YouTube'};
 }catch(error){await rm(directory,{recursive:true,force:true});throw error;}}

/** Stream only the selected provider audio; no renderer player or full-set transcoding. */
export async function openYouTubeAudio(raw:string){
 const session=youtubeSessionArgs();let privateDirectory:string|undefined;
 if(session.length){privateDirectory=await mkdtemp(join(tmpdir(),'rooms-youtube-session-'));const {copyFile,chmod}=await import('node:fs/promises');const copy=join(privateDirectory,'cookies.txt');await copyFile(session[1]!,copy);await chmod(copy,0o600);session[1]=copy;}
 const child=spawn('yt-dlp',['--ignore-config','--no-cache-dir','--no-progress','--no-warnings','--socket-timeout','10','--retries','1','--js-runtimes','node',...session,'--no-playlist','--match-filters','!is_live & duration <= 7200','--format','bestaudio[ext=webm][has_drm!=True]','--output','-',canonicalYouTube(raw)],{stdio:['ignore','pipe','pipe']});
 let bytes=0,errors='';const timer=setTimeout(()=>child.kill('SIGKILL'),(7200+120)*1000);
 child.stderr.on('data',data=>{if(errors.length<16000)errors+=data.toString();});
 // Byte limit is enforced while the PCM publisher provides stream backpressure.
 child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>180*1024*1024)child.kill('SIGKILL');});
 const done=new Promise<void>((resolve,reject)=>{child.once('error',()=>reject(new Error('MUSIC_YOUTUBE_UNAVAILABLE')));child.once('close',code=>{if(code===0)resolve();else reject(new Error(/sign in|not a bot/i.test(errors)?'MUSIC_YOUTUBE_ACCESS_REQUIRED':'MUSIC_YOUTUBE_UNAVAILABLE'));});});
 const cleanup=async()=>{clearTimeout(timer);if(privateDirectory)await rm(privateDirectory,{recursive:true,force:true});};
 void done.then(cleanup,cleanup);
 return{stream:child.stdout,done,close:async()=>{child.kill('SIGKILL');await done.catch(()=>{});await cleanup();}};
}
