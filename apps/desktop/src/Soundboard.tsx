import type {SoundboardCatalog} from '../../../packages/shared-contracts/src/soundboard';
import {encodeSoundboard,soundboardBytes} from './soundboard-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Modal } from '@rooms/design';
import { PartyPopper, Plus, Play, Square, Trash2 } from 'lucide-react';
import { useCommunity } from './community';
import { useRealtime, playSoundboard, stopSoundboard } from './realtime';
import { uiError } from './i18n';

type Clip={id:string;name:string;buffer:AudioBuffer};
const useClips=create<{owner:string;clips:Clip[];volume:number}>(()=>({owner:'',clips:[],volume:.5}));
let sessionGeneration=0;
const sessionKey=()=>{const state=useCommunity.getState();return state.user?`${state.serverUrl}:${state.user.id}`:'';};
/** Observe authentication even while the call controls are unmounted. */
function syncSession(){const owner=sessionKey();if(useClips.getState().owner!==owner){++sessionGeneration;stopSoundboard();let volume=.5;try{const saved=Number(localStorage.getItem(`rooms-soundboard-level-v1:${owner}`));if(localStorage.getItem(`rooms-soundboard-level-v1:${owner}`)!==null&&Number.isFinite(saved)&&saved>=0&&saved<=1)volume=saved;}catch{/* Keep playback available without storage. */}useClips.setState({owner,clips:[],volume});}}
syncSession();
useCommunity.subscribe(syncSession);

/** New uploads belong to the community; older local buffers require explicit publication. */
export function SoundboardButton({showTrigger=true}:{showTrigger?:boolean}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const {clips,volume}=useClips(),r=useRealtime(),picker=useRef<HTMLInputElement>(null);
  const channelId=r.channelId,account=useCommunity(state=>JSON.stringify([state.serverUrl,state.user?.id??null])),scope=`${account}:${channelId}`,current=useRef(scope);current.current=scope;
  const [catalog,setCatalog]=useState<SoundboardCatalog|null>(null);
  const refresh=useCallback(async()=>{if(!channelId||!window.rooms?.soundboard)return;const captured=scope;try{const value=await window.rooms.soundboard.list(channelId);if(current.current===captured){setCatalog(value);setError('');}}catch(e){if(current.current===captured)setError(uiError(e));}},[channelId,scope]);
  useEffect(()=>{setCatalog(null);setBusy(false);setError('');if(!open)return;let stopped=false,timer:ReturnType<typeof setTimeout>;const poll=async()=>{await refresh();if(!stopped)timer=setTimeout(()=>void poll(),5000);};void poll();return()=>{stopped=true;clearTimeout(timer);};},[open,refresh]);
  const close=useCallback(()=>setOpen(false),[]);
  const shared=window.rooms?.soundboard;
  const upload=async(name:string,buffer:AudioBuffer)=>{if(!shared||!channelId)throw Error('Topluluk sesleri için sunucuyla bağlantı kur.');await shared.upload(channelId,{name,audio:encodeSoundboard(buffer)});await refresh();};
  const playShared=async(id:string)=>{if(!shared||!channelId)return;const captured=scope;setBusy(true);setError('');let context:AudioContext|null=null;try{const audio=await shared.read(channelId,id);context=new AudioContext({sampleRate:48000});const buffer=await context.decodeAudioData(soundboardBytes(audio));if(current.current===captured)await playSoundboard(buffer,volume);}catch(e){if(current.current===captured)setError(uiError(e));}finally{await context?.close();if(current.current===captured)setBusy(false);}};
  useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('rooms:open-soundboard',show);return()=>window.removeEventListener('rooms:open-soundboard',show);},[]);
  async function add(file:File){const generation=sessionGeneration,captured=scope;setBusy(true);setError('');let context:AudioContext|null=null;try{
    if(file.size>2_000_000||!file.size)throw new Error('En fazla 2 MB bir ses dosyası seç.');
    context=new AudioContext({sampleRate:48000});const buffer=await context.decodeAudioData(await file.arrayBuffer());
    if(buffer.duration>8||buffer.duration<=0||buffer.numberOfChannels>2)throw new Error('En fazla 8 saniyelik mono veya stereo bir ses seç.');
    if(generation!==sessionGeneration||!sessionKey()||current.current!==captured)return;
    await upload(file.name.replace(/\.[^.]+$/,'').slice(0,40),buffer);
  }catch(e){if(current.current===captured)setError(e instanceof Error?e.message:'Ses dosyası okunamadı.');}finally{await context?.close();if(current.current===captured)setBusy(false);}}
  const reason=r.status!=='connected'?'Ses odasına katıl.':r.deafened?'Sağırlaştırmayı kapat.':r.muted?'Mikrofonu aç.':'';
  return <>{showTrigger&&<button className="icon-button" aria-label="Soundboard" title="Soundboard" onClick={()=>setOpen(true)}><PartyPopper size={18}/></button>}{open&&<Modal title="Soundboard" onClose={close}><div data-soundboard>
    <input ref={picker} type="file" accept="audio/*" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void add(file);}}/>
    <div className="button-row"><button className="button secondary" disabled={busy||!channelId||!shared||!catalog?.canUpload||catalog.clips.length>=32} onClick={()=>picker.current?.click()}><Plus size={16}/>{busy?'Ekleniyor…':'Ses ekle'}</button><button className="button secondary" onClick={stopSoundboard}><Square size={14}/>Durdur</button></div>
    <p className="muted">{reason||'Ses açık mikrofonundan odaya gönderilir.'}</p>
    <div className="soundboard-grid">{catalog?.clips.map(clip=><div key={clip.id}><button className="soundboard-play" disabled={!!reason||busy} title={reason||clip.name} onClick={()=>void playShared(clip.id)}><Play size={18}/><strong>{clip.name}</strong><small>{clip.durationSec.toFixed(1)} sn</small></button>{(catalog.canManage||clip.ownerId===useCommunity.getState().user?.id)&&<button aria-label={`${clip.name} topluluk sesini kaldır`} disabled={busy} onClick={()=>{const captured=scope;setBusy(true);void shared!.remove(channelId!,clip.id).then(()=>current.current===captured?refresh():undefined).catch(e=>{if(current.current===captured)setError(uiError(e));}).finally(()=>{if(current.current===captured)setBusy(false);});}}><Trash2 size={14}/></button>}</div>)}</div>
    {clips.length>0&&<p className="muted">Bu cihazdaki eski sesler</p>}
    <div className="soundboard-grid">{clips.map(clip=><div key={clip.id}><button className="soundboard-play" disabled={!!reason||busy} title={reason||clip.name} onClick={()=>{void playSoundboard(clip.buffer,volume).catch(e=>setError(uiError(e)));}}><Play size={18}/><strong>{clip.name}</strong><small>{clip.buffer.duration.toFixed(1)} sn</small></button><button disabled={busy||!catalog?.canUpload} onClick={()=>{const captured=scope;setBusy(true);void upload(clip.name,clip.buffer).catch(e=>{if(current.current===captured)setError(uiError(e));}).finally(()=>{if(current.current===captured)setBusy(false);});}}>Topluluğa ekle</button><button aria-label={`${clip.name} sesini kaldır`} onClick={()=>{stopSoundboard();useClips.setState(state=>({clips:state.clips.filter(item=>item.id!==clip.id)}));}}><Trash2 size={14}/></button></div>)}</div>
    {!catalog?.clips.length&&!clips.length&&<p className="muted">Topluluk sesi yok. En fazla 8 sn · 2 MB</p>}
    <label className="field-label">SES · {Math.round(volume*100)}%<input type="range" aria-label="Soundboard sesi" min={0} max={1} step={.05} value={volume} onChange={e=>{stopSoundboard();const level=Number(e.target.value);useClips.setState({volume:level});try{localStorage.setItem(`rooms-soundboard-level-v1:${sessionKey()}`,String(level));}catch{/* Playback setting still applies for this session. */}}}/></label>
    <p className="muted">Yüklenen sesler toplulukta saklanır.</p>{error&&<div className="error-pane" role="alert">{error}</div>}
  </div></Modal>}</>;
}
