import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
export interface BrowserConfig {image:string;profileDirectory:string;allowedHosts:string[];networkName:string;egressVerified:boolean}
/** One dedicated bot context for the serialized service queue. No model home or core mount. */
export class PersistentBotBrowser {
 private child:ChildProcessWithoutNullStreams|null=null;
 private containerName:string|null=null;
 private buffer='';
 private pending=new Map<string,{resolve:(text:string)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 private queue:Promise<unknown>=Promise.resolve();
 constructor(private config:BrowserConfig){}
 private start(){
  if(this.child)return;
  if(process.platform!=='linux'||!this.config.egressVerified||!/^rooms-[a-z0-9-]{1,80}$/.test(this.config.networkName)||!this.config.allowedHosts.length)throw new Error('A verified isolated Linux bot browser is required.');
  mkdirSync(this.config.profileDirectory,{recursive:true,mode:0o700});
  this.containerName=`rooms-bot-browser-${randomUUID()}`;
  const args=['run','--rm','--name',this.containerName,'--init','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=128','--memory=1g','--cpus=1','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=128m','--user','10001:10001','--network',this.config.networkName,'-v',`${this.config.profileDirectory}:/bot-profile:rw`,'-e','HOME=/tmp/home',this.config.image,'node','/opt/rooms-worker/browser.cjs','--daemon'];
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});this.child=child;
  child.stdout.on('data',chunk=>{this.buffer+=chunk.toString();if(this.buffer.length>2_000_000){void this.close();return;}for(;;){const index=this.buffer.indexOf('\n');if(index<0)break;const line=this.buffer.slice(0,index);this.buffer=this.buffer.slice(index+1);let value:{id:string;result?:unknown;error?:string};try{value=JSON.parse(line);}catch{continue;}const pending=this.pending.get(value.id);if(!pending)continue;this.pending.delete(value.id);clearTimeout(pending.timer);if(value.error)pending.reject(new Error('The authorized browser action failed.'));else pending.resolve(JSON.stringify(value.result));}});
  child.stderr.resume();
  const failed=()=>{if(this.child===child)this.child=null;for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('The isolated bot browser disconnected.'));}this.pending.clear();};
  child.on('error',failed);child.on('close',failed);
  child.stdin.write(JSON.stringify({initialize:true,profile:'/bot-profile',allowedHosts:this.config.allowedHosts})+'\n');
 }
 async action(input:{url:string;actions?:{type:'click'|'fill';selector:string;value?:string}[]},signal:AbortSignal){
  const work=this.queue.catch(()=>{}).then(async()=>{
   if(signal.aborted)throw new Error('Task cancelled.');this.start();const id=randomUUID();
   const result=new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Browser action timed out.'));void this.close();},30000);timer.unref();this.pending.set(id,{resolve,reject,timer});});
   const abort=()=>void this.close();signal.addEventListener('abort',abort,{once:true});
   try{this.child!.stdin.write(JSON.stringify({id,...input})+'\n');return await result;}finally{signal.removeEventListener('abort',abort);}
  });this.queue=work;return work;
 }
 async close(){const child=this.child;this.child=null;if(child){child.stdin.end();child.kill('SIGTERM');}const name=this.containerName;this.containerName=null;if(name){const stop=spawn('docker',['rm','-f',name],{stdio:'ignore'});stop.on('error',()=>{});}for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('Bot browser stopped.'));}this.pending.clear();this.buffer='';}
}
