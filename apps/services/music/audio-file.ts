import {privateFetch} from '../../../packages/personal-media/src/network';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
export interface MusicFile {directory:string;path:string;bytes:number;title:string;durationSec:number}
export async function fetchMusicFile(raw:string):Promise<MusicFile>{
 const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw new Error('Use a public HTTPS MP3 file without credentials.');
 if(/(^|\.)(youtube\.com|youtu\.be|spotify\.com|googlevideo\.com)$/.test(url.hostname))throw new Error('This link is not a direct authorized MP3 source.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);let directory:string|undefined;
 try{
 const response=await privateFetch(url.href,{signal:controller.signal});if(!response.ok||!response.body)throw new Error('The audio file could not be reached.');
 const type=response.headers.get('content-type')?.split(';')[0].trim();if(type&&!['audio/mpeg','audio/mp3','application/octet-stream'].includes(type)){await response.body.cancel();throw new Error('Use a direct MP3 file.');}
 if(Number(response.headers.get('content-length'))>40*1024*1024){await response.body.cancel();throw new Error('The audio file exceeds 40 MiB.');}
 const chunks:Uint8Array[]=[];let size=0;const reader=response.body.getReader();try{for(;;){const value=await reader.read();if(value.done)break;size+=value.value.byteLength;if(size>40*1024*1024)throw new Error('The audio file exceeds 40 MiB.');chunks.push(value.value);}}finally{await reader.cancel();}
 if(!size)throw new Error('The audio file is empty.');
 directory=await mkdtemp(join(tmpdir(),'rooms-music-'));const path=join(directory,'source.mp3');await writeFile(path,Buffer.concat(chunks),{mode:0o600});
 const durationSec=await new Promise<number>((resolve,reject)=>{const child=spawn('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-format_whitelist','mp3','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path],{stdio:['ignore','pipe','ignore']});let text='';const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Audio inspection timed out.'));},10000);child.stdout.on('data',v=>{if(text.length<1000)text+=v.toString();});child.on('error',()=>{clearTimeout(timeout);reject(new Error('Audio decoder is unavailable.'));});child.on('close',code=>{clearTimeout(timeout);const duration=Number(text.trim());if(code===0&&Number.isFinite(duration)&&duration>0&&duration<=1800)resolve(duration);else reject(new Error('Use a valid MP3 shorter than 30 minutes.'));});});
 let title='Music';try{title=decodeURIComponent(url.pathname.split('/').at(-1)??'Music').replace(/\.mp3$/i,'').replace(/[\x00-\x1f]/g,'').slice(0,160)||'Music';}catch{/* URL does not become visible metadata. */}
 return {directory,path,bytes:size,title,durationSec};
 }catch(error){if(directory)await rm(directory,{recursive:true,force:true});throw error;}finally{clearTimeout(timer);}
}
