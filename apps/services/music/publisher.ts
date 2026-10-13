import {spawn} from 'node:child_process';
import {AudioFrame,AudioSource,LocalAudioTrack,Room,TrackPublishOptions,TrackSource} from '@livekit/rtc-node';
import {openYouTubeAudio} from './youtube-source';
export interface MusicPublisher {connect(url:string,token:string):Promise<void>;play(path:string,position:number,onEnded:()=>void,onError:()=>void):Promise<void>;playYouTube?(source:string,position:number,onEnded:()=>void,onError:()=>void):Promise<void>;pause():void;position():number;close():Promise<void>}
/** Server PCM publishing; ffmpeg receives a local MP3 only and cannot fetch network resources. */
export class LiveMusicPublisher implements MusicPublisher{
 private streamClose:(()=>Promise<void>)|null=null;private room=new Room();private source=new AudioSource(48000,2,200);private track=LocalAudioTrack.createAudioTrack('DJ Recep',this.source);private decoder:ReturnType<typeof spawn>|null=null;private generation=0;private offset=0;private frames=0;private playing=false;
 async connect(url:string,token:string){await this.room.connect(url,token,{autoSubscribe:false,dynacast:false});const options=new TrackPublishOptions({audioEncoding:{maxBitrate:128000n},dtx:false,red:true});options.source=TrackSource.SOURCE_MICROPHONE;await this.room.localParticipant!.publishTrack(this.track,options);}
 position(){return Math.max(0,this.offset+this.frames/48000-(this.playing?this.source.queuedDuration:0));}
 pause(){this.offset=this.position();this.frames=0;this.playing=false;this.generation++;this.decoder?.kill('SIGKILL');this.decoder=null;void this.streamClose?.();this.streamClose=null;this.source.clearQueue();}
 async play(path:string,position:number,onEnded:()=>void,onError:()=>void){
 this.pause();this.offset=position;this.frames=0;this.playing=true;const generation=this.generation;
 const child=spawn('ffmpeg',['-v','error','-nostdin','-protocol_whitelist','file,pipe','-format_whitelist','mp3','-ss',String(position),'-i',path,'-map','0:a:0','-vn','-ac','2','-ar','48000','-f','s16le','pipe:1'],{stdio:['ignore','pipe','ignore']});this.decoder=child;
 const done=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});void done.catch(()=>{});
 void (async()=>{let pending=Buffer.alloc(0);try{for await(const chunk of child.stdout!){if(generation!==this.generation)return;pending=Buffer.concat([pending,chunk]);while(pending.length>=1920){const bytes=pending.subarray(0,1920);pending=pending.subarray(1920);const samples=new Int16Array(960);for(let i=0;i<960;i++)samples[i]=bytes.readInt16LE(i*2);await this.source.captureFrame(new AudioFrame(samples,48000,2,480));this.frames+=480;if(generation!==this.generation)return;}}
 if(await done!==0)throw new Error('Decode failed');await this.source.waitForPlayout();if(generation===this.generation){this.offset=this.position();this.playing=false;this.frames=0;onEnded();}
 }catch{if(generation===this.generation){this.pause();onError();}}})();
 }
 async playYouTube(url:string,position:number,onEnded:()=>void,onError:()=>void){
 this.pause();this.offset=position;this.frames=0;this.playing=true;const generation=this.generation;
 const input=await openYouTubeAudio(url);if(generation!==this.generation){await input.close();return;}this.streamClose=input.close;
 const child=spawn('ffmpeg',['-v','error','-nostdin','-protocol_whitelist','file,pipe','-format_whitelist','matroska,webm','-ss',String(position),'-i','pipe:0','-map','0:a:0','-vn','-ac','2','-ar','48000','-f','s16le','pipe:1'],{stdio:['pipe','pipe','ignore']});this.decoder=child;child.stdin.on('error',()=>{});input.stream.pipe(child.stdin);
 const done=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});void done.catch(()=>{});void input.done.catch(()=>child.kill('SIGKILL'));
 let started=false;let resolveReady!:()=>void,rejectReady!:(error:Error)=>void;const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 const startup=setTimeout(()=>{if(!started){this.pause();rejectReady(new Error('MUSIC_SOURCE_TIMEOUT'));}},60000);
 void(async()=>{let pending=Buffer.alloc(0);try{for await(const chunk of child.stdout){if(generation!==this.generation)throw new Error('Cancelled');pending=Buffer.concat([pending,chunk]);while(pending.length>=1920){const bytes=pending.subarray(0,1920);pending=pending.subarray(1920);const samples=new Int16Array(960);for(let i=0;i<960;i++)samples[i]=bytes.readInt16LE(i*2);await this.source.captureFrame(new AudioFrame(samples,48000,2,480));this.frames+=480;if(!started){started=true;clearTimeout(startup);resolveReady();}if(generation!==this.generation)throw new Error('Cancelled');}}
 if(await done!==0)throw new Error('Decode failed');await input.done;if(!started)throw new Error('Empty audio');await this.source.waitForPlayout();if(generation===this.generation){this.offset=this.position();this.playing=false;this.frames=0;onEnded();}
 }catch(error){if(!started){clearTimeout(startup);rejectReady(error instanceof Error?error:new Error('MUSIC_SOURCE_FAILED'));}if(generation===this.generation){this.pause();onError();}}finally{await input.close();}})();
 await ready;
 }
 async close(){this.pause();await this.room.disconnect();await this.track.close();await this.source.close();}
}
