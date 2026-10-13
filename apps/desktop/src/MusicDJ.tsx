import {DJCharacter} from './DJCharacter';
import {useNavigate} from 'react-router-dom';
import {useEffect,useRef,useState} from 'react';
import {Music2,X,Plus,Play,Pause,SkipBack,SkipForward,Trash2,Square,Volume2,VolumeX} from 'lucide-react';
import {create} from 'zustand';
import {useQuery} from '@tanstack/react-query';
import {queryClient} from './query-client';
import {useCommunity} from './community';
import {useRealtime,setParticipantVolume} from './realtime';
import {useActivityRoom} from './activity';
import {uiError} from './i18n';
import type {MusicCommand} from '../../../packages/shared-contracts/src/music';
import './music-dj.css';
const useDJ=create<{open:boolean;show():void;hide():void}>(set=>({open:false,show:()=>set({open:true}),hide:()=>set({open:false})}));
export const openMusicDJ=()=>useDJ.getState().show();
export function openRoomActivity(path:string,navigate:(path:string)=>void){if(path==='/youtube')openMusicDJ();else navigate(path);}
export function MusicDJEntry({returnTo='/home'}:{returnTo?:string}){const navigate=useNavigate();useEffect(()=>{openMusicDJ();navigate(returnTo,{replace:true});},[navigate,returnTo]);return null;}
export function MusicDJ({showTrigger=true}:{showTrigger?:boolean}){
 const community=useCommunity(),voice=useRealtime(),dj=useDJ();
 if(!community.user)return null;
 return <>{showTrigger&&!dj.open&&<button className="dj-launch" onClick={dj.show} title="DJ Recep"><Music2 size={20}/><span>DJ</span></button>}{dj.open&&<DJPanel key={`${community.serverUrl}:${community.user.id}:${voice.channelId??'none'}`} channelId={voice.channelId} onClose={dj.hide}/>}</>;
}
const clock=(v:number)=>`${Math.floor(v/60)}:${String(Math.floor(v%60)).padStart(2,'0')}`;
/** Smooth only between confirmed playing snapshots; stop estimating after a missed poll. */
export function MusicPlaybackClock({position,duration,playing,receivedAt}:{position:number;duration:number;playing:boolean;receivedAt:number}){
 const [anchor]=useState(()=>({time:performance.now(),age:Math.max(0,(Date.now()-receivedAt)/1000)}));
 const [elapsed,setElapsed]=useState(0);
 useEffect(()=>{if(!playing)return;const timer=setInterval(()=>setElapsed((performance.now()-anchor.time)/1000),250);return()=>clearInterval(timer);},[playing,anchor]);
 const estimate=position+(playing?Math.min(6,anchor.age+elapsed):0);
 return <small aria-label="Parça süresi">{clock(Math.max(0,Math.min(duration,estimate)))} / {clock(duration)}</small>;
}
function DJPanel({channelId,onClose}:{channelId:string|null;onClose():void}){
 const community=useCommunity(),voice=useRealtime(),legacy=useActivityRoom(channelId);
 const [input,setInput]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[placement,setPlacement]=useState<{x:number;y:number}|null>(null);
 const panel=useRef<HTMLElement>(null),alive=useRef(false),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
 const key=['room-music',community.serverUrl,community.user?.id,channelId];
 const fixture=import.meta.env.DEV&&new URLSearchParams(location.search).has('fixture');
 const query=useQuery({queryKey:key,enabled:!!channelId&&!fixture&&!!window.rooms?.music&&!busy,staleTime:3000,refetchInterval:busy?false:5000,retry:1,queryFn:async()=>{const server=community.serverUrl,user=community.user?.id;const value=await window.rooms!.music.snapshot(channelId!);if(useCommunity.getState().serverUrl!==server||useCommunity.getState().user?.id!==user)throw new Error('Oturum değişti.');return value;}},queryClient);
 const snapshot=query.data,active=snapshot?.queue.find(item=>item.id===snapshot.currentId),index=snapshot?.queue.findIndex(item=>item.id===snapshot.currentId)??-1;
 const bot=voice.participants.find(p=>p.id===snapshot?.identity);
 const restoreVolume=useRef(1);
 useEffect(()=>{if(bot&&bot.volume>0)restoreVolume.current=bot.volume;},[bot?.id,bot?.volume]);
 const available=!!channelId&&voice.status==='connected'&&!fixture&&!!window.rooms?.music;
 const run=async(command:MusicCommand)=>{if(busy||!available)return;setBusy(true);setError('');try{
  await queryClient.cancelQueries({queryKey:key,exact:true});if(!alive.current)return;
  // Retire only the obsolete DJ-authored YouTube session on an explicit MP3 add action.
  if(command.type==='add'&&legacy.room?.primary?.activity==='youtube'&&legacy.room.primary.title==='DJ Recep')await legacy.send({type:'end'});
  const value=await window.rooms!.music.command(channelId!,command);if(alive.current){queryClient.setQueryData(key,value);if(command.type==='add')setInput('');}
 }catch(e){if(alive.current)setError(uiError(e));}finally{if(alive.current)setBusy(false);}};
 useEffect(()=>{alive.current=true;panel.current?.focus();const resize=()=>{const rect=panel.current?.getBoundingClientRect();if(rect)setPlacement(value=>value?{x:Math.max(8,Math.min(innerWidth-rect.width-8,value.x)),y:Math.max(40,Math.min(innerHeight-rect.height-8,value.y))}:null);};window.addEventListener('resize',resize);return()=>{alive.current=false;window.removeEventListener('resize',resize);};},[]);
 const validLink=()=>{try{const url=new URL(input.trim());return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}};
 return <section ref={panel} className="music-dj" style={placement?{left:placement.x,top:placement.y,right:'auto'}:undefined} role="dialog" tabIndex={-1} aria-label="DJ Recep" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
 <header onPointerDown={e=>{if((e.target as HTMLElement).closest('button'))return;const rect=panel.current!.getBoundingClientRect();drag.current={x:e.clientX,y:e.clientY,left:rect.left,top:rect.top};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const start=drag.current;if(!start)return;const rect=panel.current!.getBoundingClientRect();setPlacement({x:Math.max(8,Math.min(innerWidth-rect.width-8,start.left+e.clientX-start.x)),y:Math.max(40,Math.min(innerHeight-rect.height-8,start.top+e.clientY-start.y))});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}><span><Music2 size={15}/>DJ Recep<small>{voice.roomName??''}</small></span><button aria-label="DJ panelini kapat" onClick={onClose}><X size={18}/></button></header>
 <DJCharacter/>
 <div className="dj-content"><form className="dj-add" onSubmit={e=>{e.preventDefault();void run({type:'add',url:input.trim()});}}><input aria-label="YouTube, Spotify, SoundCloud veya ses bağlantısı" placeholder="YouTube / Spotify / SoundCloud" maxLength={2048} value={input} onChange={e=>setInput(e.target.value)} disabled={!available||busy} required/><button type="submit" aria-label="Kuyruğa ekle" disabled={!available||busy||!validLink()}>{busy?'…':<Plus size={18}/>}</button></form>
 <div className="dj-track"><strong>{active?.title??(query.isLoading?'Yükleniyor…':'Kuyruk boş')}</strong>{active&&<MusicPlaybackClock key={`${snapshot?.currentId}:${query.dataUpdatedAt}:${snapshot?.status}:${!!query.error}`} position={snapshot?.positionSec??0} duration={active.durationSec} playing={snapshot?.status==='playing'&&!query.error&&voice.status==='connected'} receivedAt={query.dataUpdatedAt}/>}</div>
 <div className="dj-transport"><button aria-label="Önceki parça" disabled={!available||busy||index<0} onClick={()=>void run({type:'previous'})}><SkipBack size={21}/></button><button className="dj-play" aria-label={snapshot?.status==='playing'?'Duraklat':'Oynat'} disabled={!available||busy||!active} onClick={()=>void run({type:snapshot?.status==='playing'?'pause':'play'})}>{snapshot?.status==='playing'?<Pause size={24}/>:<Play size={24}/>}</button><button aria-label="Sonraki parça" disabled={!available||busy||index<0||index===(snapshot?.queue.length??0)-1} onClick={()=>void run({type:'next'})}><SkipForward size={21}/></button><button aria-label="Botu odadan çıkar" disabled={!available||busy||!snapshot||snapshot.status==='disconnected'} onClick={()=>void run({type:'stop'})}><Square size={17}/></button></div>
 <div className="dj-volume"><button aria-label={bot?.volume===0?'Botun sesini aç':'Botun sesini kapat'} disabled={!bot} onClick={()=>bot&&setParticipantVolume(bot.id,bot.volume===0?restoreVolume.current:0)}>{bot?.volume===0?<VolumeX size={17}/>:<Volume2 size={17}/>}</button><input type="range" aria-label="Botun ses seviyesi" min={0} max={1} step={.01} value={bot?.volume??1} disabled={!bot} onChange={e=>bot&&setParticipantVolume(bot.id,Number(e.target.value))}/><small>{Math.round((bot?.volume??1)*100)}%</small></div>
 <ol className="dj-queue">{snapshot?.queue.map((item,i)=><li key={item.id} className={item.id===active?.id?'current':''}><span>{i+1}</span><strong>{item.title}</strong><small>{clock(item.durationSec)}</small><button aria-label={`${item.title} sıradan kaldır`} disabled={!available||busy||item.id===active?.id} onClick={()=>void run({type:'remove',id:item.id})}><Trash2 size={14}/></button></li>)}</ol>
 {!channelId&&<p className="dj-error" role="status">Önce ses odasına katıl.</p>}{fixture&&<p className="dj-error" role="status">Yerel görünüm örneği; bot bağlantısı yok.</p>}{(error||query.error||snapshot?.error)&&<p className="dj-error" role="alert">{error||(query.error?uiError(query.error):snapshot?.error?'Parça alınamadı. Başka bir bağlantı dene.':null)}</p>}
 </div></section>;
}
