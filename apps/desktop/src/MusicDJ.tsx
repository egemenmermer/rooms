import {useCallback,useEffect,useRef,useState} from 'react';
import {Music2,X,Plus,Play,Pause,SkipBack,SkipForward,Repeat,Shuffle,Volume2,Trash2,ChevronDown,ChevronUp} from 'lucide-react';
import {create} from 'zustand';
import {useCommunity} from './community';
import {useRealtime} from './realtime';
import {useActivityRoom} from './activity';
import {activityBridge} from './runtime-sources';
import {parseDJLink} from './dj-links';
import {uiError} from './i18n';
import type {ActivityCommand} from '@rooms/activity-protocol';
import './music-dj.css';
const useDJ=create<{open:boolean;show():void;hide():void}>(set=>({open:false,show:()=>set({open:true}),hide:()=>set({open:false})}));
export const openMusicDJ=()=>useDJ.getState().show();
export function MusicDJEntry(){useEffect(openMusicDJ,[]);return <div className="dj-entry"><Music2 size={28}/><h2>DJ Recep</h2><button className="button primary" onClick={openMusicDJ}>DJ panelini aç</button></div>;}
type Player={url:string;nonce:string};
const clock=(v:number)=>`${Math.floor(v/60)}:${String(Math.floor(v%60)).padStart(2,'0')}`;
/** One visible official player above shared queue controls. Account/room changes destroy its scope. */
export function MusicDJ(){
 const community=useCommunity(),voice=useRealtime(),dj=useDJ();
 const roomId=voice.channelId??community.activeChannelId;
 if(!community.user||!roomId)return null;
 return <>{!dj.open&&<button className="dj-launch" onClick={dj.show} title="DJ Recep"><Music2 size={20}/><span>DJ</span></button>}{dj.open&&<DJPanel key={`${community.serverUrl}:${community.user.id}:${roomId}`} roomId={roomId} onClose={dj.hide}/>}</>;
}
function DJPanel({roomId,onClose}:{roomId:string;onClose():void}){
 const a=useActivityRoom(roomId),userId=useCommunity(s=>s.user?.id),roomName=useRealtime().roomName;
 const [placement,setPlacement]=useState<{x:number;y:number}|null>(null),[input,setInput]=useState(''),[error,setError]=useState(''),[adding,setAdding]=useState(false),[expanded,setExpanded]=useState(true),[volume,setVolume]=useState(65),[repeat,setRepeat]=useState(false),[shuffle,setShuffle]=useState(false),[player,setPlayer]=useState<Player|null>(null),[resolver,setResolver]=useState<Player|null>(null),[ready,setReady]=useState(false),[position,setPosition]=useState(0),[duration,setDuration]=useState(0),[title,setTitle]=useState(''),[author,setAuthor]=useState(''),[blocked,setBlocked]=useState(false);
 const drag=useRef<{x:number;y:number;left:number;top:number}|null>(null),panel=useRef<HTMLElement>(null),frame=useRef<HTMLIFrameElement>(null),preview=useRef<HTMLIFrameElement>(null),latest=useRef(a),suppress=useRef(0),ended=useRef(''),alive=useRef(true),importing=useRef(false);
 latest.current=a;
 const active=a.room?.queue.find(q=>q.id===a.room?.timeline.itemId),videoId=active?.media.kind==='youtube'?active.media.videoId:null;
 const self=a.room?.participants.find(p=>p.userId===userId),canControl=a.status==='connected'&&self?.canControl!==false&&a.room?.primary?.activity==='youtube';
 const canAdd=a.status==='connected'&&self?.canControl!==false&&(!a.room?.primary||a.room.primary.activity==='youtube');
 const reason=a.status!=='connected'?'Etkinlik bağlantısı bekleniyor.':a.room?.primary?.activity&&a.room.primary.activity!=='youtube'?'Önce devam eden ana etkinliği bitir.':'Bu odada kontrol yetkin yok.';
 useEffect(()=>{alive.current=true;panel.current?.focus();const resize=()=>{const rect=panel.current?.getBoundingClientRect();if(rect)setPlacement(value=>value?{x:Math.max(8,Math.min(innerWidth-rect.width-8,value.x)),y:Math.max(40,Math.min(innerHeight-rect.height-8,value.y))}:null);};window.addEventListener('resize',resize);return()=>{alive.current=false;window.removeEventListener('resize',resize);};},[]);
 const send=useCallback(async(command:ActivityCommand)=>{try{await a.send(command);}catch(e){if(alive.current)setError(uiError(e));}},[a.send]);
 const command=useCallback((action:string,extra:Record<string,number>={})=>{if(player)frame.current?.contentWindow?.postMessage({type:'rooms-youtube-command',nonce:player.nonce,action,...extra},new URL(player.url).origin);},[player]);
 useEffect(()=>{let stale=false;setPlayer(null);setReady(false);setPosition(0);setDuration(0);setTitle('');setAuthor('');setBlocked(false);ended.current='';if(videoId)void activityBridge().youtubePlayer(videoId).then(p=>{if(!stale)setPlayer(p);}).catch(e=>{if(!stale)setError(uiError(e));});return()=>{stale=true;};},[videoId]);
 useEffect(()=>{if(!player)return;const timer=setTimeout(()=>{if(!ready)setError('YouTube oynatıcısı açılamadı. Paneli kapatıp yeniden aç.');},25000);return()=>clearTimeout(timer);},[player,ready]);
 const synchronize=useCallback(()=>{const state=latest.current;if(!ready||!state.room)return;const t=state.room.timeline;const expected=t.positionSec+(t.playing?Math.max(0,Date.now()+state.serverOffsetMs-t.effectiveServerTimeMs)/1000*t.rate:0);suppress.current=Date.now()+1800;command('seek',{positionSec:expected});command(t.playing?'play':'pause');},[ready,command]);
 useEffect(synchronize,[a.room?.timeline.epoch,a.room?.timeline.effectiveServerTimeMs,synchronize]);
 useEffect(()=>{if(!ready)return;command('volume',{volume});const id=setInterval(()=>command('position'),1000);return()=>clearInterval(id);},[ready,volume,command]);
 const select=useCallback(async(id:string)=>{await a.send({type:'queue.select',itemId:id});await a.send({type:'playback',playing:true,positionSec:0,rate:1});},[a.send]);
 const step=useCallback(async(direction:number)=>{const state=latest.current.room;if(!state)return;const queue=state.queue.filter(q=>q.media.kind==='youtube'),index=queue.findIndex(q=>q.id===state.timeline.itemId);let next:typeof queue[number]|undefined=queue[index+direction];if(direction>0&&shuffle&&queue.length>1){const rest=queue.filter(q=>q.id!==state.timeline.itemId);next=rest[Math.floor(Math.random()*rest.length)];}if(!next&&repeat)next=direction>0?queue[0]:queue.at(-1);if(next)await select(next.id);else if(direction>0)await a.send({type:'playback',playing:false,positionSec:duration,rate:1});},[shuffle,repeat,select,a.send,duration]);
 const addVideos=useCallback(async(ids:string[])=>{
 const snapshot=latest.current.room;if(!snapshot)throw new Error('Oda yüklenmedi.');if(snapshot.primary&&snapshot.primary.activity!=='youtube')throw new Error('Önce devam eden ana etkinliği bitir.');
 if(ids.length+(snapshot.queue.length??0)>100)throw new Error('Kuyruk en fazla 100 video alır. Daha kısa bir playlist seç.');
 if(!snapshot.primary)await a.send({type:'start',activity:'youtube',title:'DJ Recep'});
 let first:string|null=null,added=0;
 try{for(const id of ids){if(!alive.current)return;const itemId=crypto.randomUUID();await a.send({type:'queue.add',itemId,media:{kind:'youtube',videoId:id,title:`YouTube · ${id}`}});first??=itemId;added++;}
 if(first&&!snapshot.timeline.itemId)await select(first);
 }catch(e){throw new Error(`${added?`${added} video eklendi. `:''}${uiError(e)}`);}
 },[a.send,select]);
 useEffect(()=>{if(!player&&!resolver)return;const listen=(event:MessageEvent)=>{
 const isResolver=!!resolver&&event.source===preview.current?.contentWindow&&event.origin===new URL(resolver.url).origin&&event.data?.nonce===resolver.nonce;
 const isPlayer=!!player&&event.source===frame.current?.contentWindow&&event.origin===new URL(player.url).origin&&event.data?.nonce===player.nonce;
 if(event.data?.type!=='rooms-youtube'||(!isResolver&&!isPlayer))return;
 const {event:kind,data}=event.data;
 if(isResolver){if(kind==='playlist'&&!importing.current){const ids=data?.ids;if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{11}$/.test(id)))return;importing.current=true;void addVideos(ids).then(()=>{if(alive.current)setInput('');}).catch(e=>{if(alive.current)setError(uiError(e));}).finally(()=>{if(alive.current){setResolver(null);setAdding(false);}});}else if(kind==='error'||kind==='playlist-error'){setError('Playlist açılamadı. Herkese açık bir YouTube playlisti seç.');setResolver(null);setAdding(false);}return;}
 if(kind==='ready'){setReady(true);setError('');}
 if(kind==='autoplay-blocked')setBlocked(true);
 if(kind==='error'){setError(`YouTube bu videoyu oynatamadı (${data?.code??'—'}).`);setReady(false);}
 if(kind==='position'&&Number.isFinite(data?.positionSec)){setPosition(Math.max(0,data.positionSec));if(Number.isFinite(data.durationSec)&&data.durationSec>0)setDuration(Math.min(86400,data.durationSec));if(typeof data.title==='string')setTitle(data.title);if(typeof data.author==='string')setAuthor(data.author);}
 if(kind==='state'&&[1,2].includes(data?.state)&&Number.isFinite(data?.positionSec)&&Date.now()>suppress.current&&latest.current.room?.primary?.activity==='youtube'&&latest.current.room.participants.find(p=>p.userId===userId)?.canControl!==false){const playing=data.state===1;if(playing!==latest.current.room.timeline.playing)void send({type:'playback',playing,positionSec:Math.max(0,Math.min(86400,data.positionSec)),rate:1});}
 if(kind==='state'&&data?.state===0&&latest.current.room?.timeline.playing&&latest.current.room?.primary?.hostUserId===userId&&Date.now()>suppress.current){const stamp=`${latest.current.room.timeline.itemId}:${latest.current.room.timeline.epoch}`;if(ended.current!==stamp){ended.current=stamp;void step(1).catch(e=>setError(uiError(e)));}}
 };window.addEventListener('message',listen);return()=>window.removeEventListener('message',listen);},[player,resolver,addVideos,step,userId,send]);
 useEffect(()=>{if(!resolver)return;const timer=setTimeout(()=>{if(!importing.current){setError('Playlist yüklenemedi. Bağlantını kontrol edip yeniden dene.');setResolver(null);setAdding(false);}},25000);return()=>clearTimeout(timer);},[resolver]);
 const add=async()=>{const link=parseDJLink(input);if(!link){setError('YouTube video veya playlist bağlantısı gir.');return;}setError('');setAdding(true);try{if(link.kind==='playlist'){importing.current=false;const value=await activityBridge().youtubePlaylist(link.id);if(alive.current)setResolver(value);}else{await addVideos([link.id]);if(alive.current){setInput('');setAdding(false);}}}catch(e){if(alive.current){setError(uiError(e));setAdding(false);}}};
 const queue=a.room?.queue.filter(q=>q.media.kind==='youtube')??[],currentIndex=queue.findIndex(q=>q.id===active?.id);
 return <section ref={panel} className="music-dj" style={placement?{left:placement.x,top:placement.y,right:'auto'}:undefined} role="dialog" tabIndex={-1} aria-label="DJ Recep" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}><header onPointerDown={e=>{if((e.target as HTMLElement).closest('button'))return;const rect=panel.current!.getBoundingClientRect();drag.current={x:e.clientX,y:e.clientY,left:rect.left,top:rect.top};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const start=drag.current;if(!start)return;const rect=panel.current!.getBoundingClientRect();setPlacement({x:Math.max(8,Math.min(innerWidth-rect.width-8,start.left+e.clientX-start.x)),y:Math.max(40,Math.min(innerHeight-rect.height-8,start.top+e.clientY-start.y))});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}><span><Music2 size={15}/>DJ Recep<small>{roomName??'Ortak kuyruk'}</small></span><button aria-label="DJ panelini kapat" onClick={onClose}><X size={18}/></button></header>
 <div className="dj-character"><video src="./dj/recep-dj.webm" poster="./dj/recep-dj.png" autoPlay muted loop playsInline aria-label="Recep DJ animasyonu"/></div>
 <div className="dj-content"><div className={`dj-player ${player?'':'empty'}`}>{player?<iframe ref={frame} src={player.url} title="YouTube oynatıcısı" allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin"/>:<div><Music2 size={30}/><span>Bir parça ekle</span></div>}</div>
 <div className="dj-controls"><div className="dj-track"><strong>{title||active?.media.title||'Kuyruk boş'}</strong><small>{author||'YouTube'}</small></div><div className="dj-progress"><span>{clock(position)}</span><input aria-label="Parça konumu" type="range" min={0} max={duration||1} step={1} value={Math.min(position,duration||1)} disabled={!canControl||!ready||!duration} onChange={e=>void send({type:'playback',playing:a.room?.timeline.playing??false,positionSec:Number(e.target.value),rate:1})}/><span>{clock(duration)}</span></div>
 <div className="dj-transport"><button aria-label="Karışık çal" aria-pressed={shuffle} disabled={a.room?.primary?.hostUserId!==userId} title={a.room?.primary?.hostUserId!==userId?'Sıralama oturumu başlatan kişinin kontrolünde.':undefined} onClick={()=>setShuffle(!shuffle)}><Shuffle size={17}/></button><button aria-label="Önceki parça" disabled={!canControl||a.busy||adding||currentIndex<=0&&!repeat} onClick={()=>void step(-1).catch(e=>setError(uiError(e)))}><SkipBack size={20}/></button><button className="dj-play" aria-label={a.room?.timeline.playing?'Duraklat':'Oynat'} disabled={!canControl||!videoId||!ready||a.busy} onClick={()=>{setBlocked(false);void send({type:'playback',playing:!a.room?.timeline.playing,positionSec:position,rate:1});}}>{a.room?.timeline.playing?<Pause size={25}/>:<Play size={25}/>}</button><button aria-label="Sonraki parça" disabled={!canControl||a.busy||adding||currentIndex>=queue.length-1&&!repeat} onClick={()=>void step(1).catch(e=>setError(uiError(e)))}><SkipForward size={20}/></button><button aria-label="Kuyruğu tekrarla" aria-pressed={repeat} disabled={a.room?.primary?.hostUserId!==userId} title={a.room?.primary?.hostUserId!==userId?'Tekrar oturumu başlatan kişinin kontrolünde.':undefined} onClick={()=>setRepeat(!repeat)}><Repeat size={17}/></button></div>
 <label className="dj-volume"><Volume2 size={16}/><input aria-label="Kişisel müzik sesi" type="range" min={0} max={100} value={volume} onChange={e=>setVolume(Number(e.target.value))}/><small>{volume}%</small></label></div>
 {blocked&&<button className="dj-notice" onClick={()=>{setBlocked(false);synchronize();}}>YouTube oynatıcısında oynat düğmesine bas</button>}
 <form className="dj-add" onSubmit={e=>{e.preventDefault();void add();}}><input aria-label="DJ video veya playlist bağlantısı" placeholder="YouTube / playlist bağlantısı" maxLength={2048} value={input} onChange={e=>setInput(e.target.value)} required/><button type="submit" aria-label="Kuyruğa ekle" disabled={!canAdd||adding||!parseDJLink(input)} title={!canAdd?reason:undefined}>{adding?'…':<Plus size={18}/>}</button></form>
 {resolver&&<div className="dj-import"><span>Playlist getiriliyor…</span><iframe ref={preview} src={resolver.url} title="YouTube playlist önizlemesi" allow="encrypted-media" referrerPolicy="strict-origin-when-cross-origin"/></div>}
 <div className="dj-queue-title"><strong>Sıradakiler <small>{queue.length}</small></strong><button aria-label={expanded?'Kuyruğu daralt':'Kuyruğu genişlet'} onClick={()=>setExpanded(!expanded)}>{expanded?<ChevronDown size={17}/>:<ChevronUp size={17}/>}</button></div>
 {expanded&&<ol className="dj-queue">{queue.map((item,index)=><li key={item.id} className={item.id===active?.id?'current':''}><button disabled={!canControl||a.busy||adding||item.id===active?.id} onClick={()=>void select(item.id).catch(e=>setError(uiError(e)))}><span>{item.id===active?.id?<Music2 size={14}/>:index+1}</span><span className="dj-cover"><Music2 size={18}/></span><strong>{item.id===active?.id&&title?title:item.media.title}</strong></button><button aria-label={`${item.media.title} sıradan kaldır`} disabled={!canControl||a.busy||adding||item.id===active?.id} onClick={()=>void send({type:'queue.remove',itemId:item.id})}><Trash2 size={14}/></button></li>)}{!queue.length&&<li className="dj-empty">Kuyruk boş.</li>}</ol>}
 {(error||a.error)&&<p className="dj-error" role="alert">{error||a.error}</p>}
 </div></section>;
}
