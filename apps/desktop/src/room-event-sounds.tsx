import {useEffect,useRef} from 'react';
import {useCommunity} from './community';
import {mediaProvider} from './runtime-sources';
import {useVoiceContext} from './realtime';
import {useRooms} from './store';
import type {MediaSnapshot} from '@rooms/media';
export type RoomCue='enter'|'leave';
type CueState={scope:string;channel:string|null;status:MediaSnapshot['status'];participants:Pick<MediaSnapshot['participants'][number],'id'|'local'>[]};
const human=(id:string)=>!id.startsWith('rooms-music-');
/** Initial roster and reconnect snapshots are baselines, never a burst of join cues. */
export class RoomCueTracker {
 private previous:CueState|null=null;
 private established=false;
 update(next:CueState):RoomCue[]{
  const before=this.previous;this.previous=next;
  if(!before||before.scope!==next.scope){this.established=false;if(next.status==='connected'&&next.channel){this.established=true;return ['enter'];}return [];}
  if(!next.channel){const left=!!before.channel&&this.established;this.established=false;return left?['leave']:[];}
  if(before.channel!==next.channel){this.established=false;if(next.status==='connected'){this.established=true;return ['enter'];}return [];}
  if(next.status!=='connected')return [];
  if(!this.established){this.established=true;return ['enter'];}
  if(before.status!=='connected')return [];
  const old=new Set(before.participants.filter(p=>!p.local&&human(p.id)).map(p=>p.id));
  const now=new Set(next.participants.filter(p=>!p.local&&human(p.id)).map(p=>p.id));
  return [...(Array.from(now).some(id=>!old.has(id))?['enter' as const]:[]),...(Array.from(old).some(id=>!now.has(id))?['leave' as const]:[])];
 }
}
const sources=new Map<RoomCue,string>();
/** Original low-amplitude two-note PCM cues, no external asset or network. */
export function roomCueSource(kind:RoomCue):string {
 const cached=sources.get(kind);if(cached)return cached;
 const rate=24000,count=Math.round(rate*.24),buffer=new ArrayBuffer(44+count*2),view=new DataView(buffer);
 const text=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
 text(0,'RIFF');view.setUint32(4,36+count*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,count*2,true);
 for(let i=0;i<count;i++){const t=i/rate,note=t<.12?0:1,f=kind==='enter'?[540,760][note]:[620,410][note],phase=(t% .12)/.12,envelope=Math.sin(Math.PI*phase)**2;view.setInt16(44+i*2,Math.round(Math.sin(2*Math.PI*f*t)*envelope*.13*32767),true);}
 const result=URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}));sources.set(kind,result);return result;
}
export function RoomEventSounds(){
 const tracker=useRef(new RoomCueTracker());
 useEffect(()=>{
  const provider=mediaProvider();let active=true;const players=new Set<HTMLAudioElement>();
  const stop=()=>{for(const p of players)p.pause();players.clear();};
  const read=()=>{
   const c=useCommunity.getState(),voice=useVoiceContext.getState(),snapshot=provider.snapshot(),prefs=useRooms.getState().preferences;
   const cues=tracker.current.update({scope:JSON.stringify([c.serverUrl,c.user?.id??'']),channel:snapshot.roomId,status:voice.busy||snapshot.status==='connected'&&!snapshot.participants.some(p=>p.local)?'connecting':snapshot.status,participants:snapshot.participants});
   if(!prefs.roomEventSounds||snapshot.deafened||!c.user){stop();return;}
   for(const cue of cues){
    const player=new Audio(roomCueSource(cue));players.add(player);player.volume=.55;player.onended=()=>players.delete(player);
    void (async()=>{try{if(prefs.outputId&&'setSinkId' in player)await (player as HTMLAudioElement&{setSinkId(id:string):Promise<void>}).setSinkId(prefs.outputId);if(active&&useRooms.getState().preferences.roomEventSounds&&!provider.snapshot().deafened)await player.play();}catch{/* Local cues must never fail the room operation. */}finally{if(player.paused)players.delete(player);}})();
   }
  };
  let account=JSON.stringify([useCommunity.getState().serverUrl,useCommunity.getState().user?.id]);
  let queued=false;const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;if(active)read();});};
  const subscriptions=[provider.subscribeState(schedule),useVoiceContext.subscribe(schedule),useCommunity.subscribe(()=>{const next=JSON.stringify([useCommunity.getState().serverUrl,useCommunity.getState().user?.id]);if(next!==account){account=next;stop();}schedule();}),useRooms.subscribe(schedule)];read();
  return()=>{active=false;stop();for(const unsub of subscriptions)unsub();};
 },[]);
 return null;
}
