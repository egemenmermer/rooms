import {spawn} from 'node:child_process';
import {privateFetch,limitedText} from '../../../packages/personal-media/src/network';
import {parseDJLink} from '../../../packages/shared-contracts/src/music-links';
export function usesYouTubeBridge(){return process.env.ROOMS_YOUTUBE_ENGINE==='lavalink';}
export async function bridgeVideoReference(raw:string){
 const link=parseDJLink(raw);if(link?.kind!=='video')throw new Error('MUSIC_SOURCE_FAILED');
 const source=`https://www.youtube.com/watch?v=${link.id}`;
 const child=spawn('java',['-Xmx256m','-Dlava.native.connector.path=/service/libconnector.so','-jar','/service/youtube-bridge.jar',link.id,'metadata'],{stdio:['ignore','pipe','ignore']});
 const text=await new Promise<string>((resolve,reject)=>{let output='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('MUSIC_SOURCE_TIMEOUT'));},45000);child.stdout.on('data',data=>{output+=data.toString();if(output.length>16384){child.kill('SIGKILL');reject(new Error('MUSIC_SOURCE_TOO_LARGE'));}});child.once('error',()=>{clearTimeout(timer);reject(new Error('MUSIC_YOUTUBE_UNAVAILABLE'));});child.once('close',code=>{clearTimeout(timer);if(code===0)resolve(output);else reject(new Error('MUSIC_YOUTUBE_UNAVAILABLE'));});});
 const value=JSON.parse(text);if(!Number.isFinite(value.durationSec)||value.durationSec<=0||value.durationSec>7200)throw new Error('MUSIC_YOUTUBE_UNAVAILABLE');
 if(typeof value.title!=='string'||!value.title.trim()){
  const response=await privateFetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(source)}`,{signal:AbortSignal.timeout(15000)});
  value.title=JSON.parse(await limitedText(response,16384)).title;
 }
 if(typeof value.title!=='string'||!value.title.trim())throw new Error('MUSIC_YOUTUBE_UNAVAILABLE');
 return{source,title:value.title.replace(/[\x00-\x1f]/g,'').slice(0,160),durationSec:value.durationSec};
}
export async function openBridgeAudio(raw:string,position:number){
 const link=parseDJLink(raw);if(link?.kind!=='video'||!Number.isFinite(position)||position<0||position>7200)throw new Error('MUSIC_SOURCE_FAILED');
 const child=spawn('java',['-Xmx256m','-Dlava.native.connector.path=/service/libconnector.so','-jar','/service/youtube-bridge.jar',link.id,String(position)],{stdio:['ignore','pipe','pipe']});
 let failure='MUSIC_YOUTUBE_UNAVAILABLE',bytes=0;const timer=setTimeout(()=>child.kill('SIGKILL'),(7200+120)*1000);
 child.stderr.on('data',data=>{const code=data.toString().trim();if(/^MUSIC_[A-Z_]+$/.test(code))failure=code;});
 child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>7200*48000*2*2)child.kill('SIGKILL');});
 const done=new Promise<void>((resolve,reject)=>{child.once('error',()=>reject(new Error('MUSIC_YOUTUBE_UNAVAILABLE')));child.once('close',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error(failure));});});void done.catch(()=>{});
 return{stream:child.stdout,done,format:'s16le' as const,close:async()=>{child.kill('SIGKILL');await done.catch(()=>{});clearTimeout(timer);}};
}
