import { useCallback, useRef, useState } from 'react';
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
function syncSession(){const owner=sessionKey();if(useClips.getState().owner!==owner){++sessionGeneration;stopSoundboard();useClips.setState({owner,clips:[],volume:.5});}}
syncSession();
useCommunity.subscribe(syncSession);

/** Files remain in memory on this device; no upload or bundled fixtures. */
export function SoundboardButton(){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const {clips,volume}=useClips(),r=useRealtime(),picker=useRef<HTMLInputElement>(null);
  const close=useCallback(()=>setOpen(false),[]);
  async function add(file:File){const generation=sessionGeneration;setBusy(true);setError('');let context:AudioContext|null=null;try{
    if(file.size>2_000_000||!file.size)throw new Error('En fazla 2 MB bir ses dosyası seç.');
    context=new AudioContext({sampleRate:48000});const buffer=await context.decodeAudioData(await file.arrayBuffer());
    if(buffer.duration>8||buffer.duration<=0||buffer.numberOfChannels>2)throw new Error('En fazla 8 saniyelik mono veya stereo bir ses seç.');
    if(generation!==sessionGeneration||!sessionKey())return;
    if(useClips.getState().clips.length>=8)throw new Error('En fazla 8 ses ekleyebilirsin.');
    useClips.setState(state=>({clips:[...state.clips,{id:crypto.randomUUID(),name:file.name.replace(/\.[^.]+$/,'').slice(0,40),buffer}]}));
  }catch(e){setError(e instanceof Error?e.message:'Ses dosyası okunamadı.');}finally{await context?.close();setBusy(false);}}
  const reason=r.status!=='connected'?'Ses odasına katıl.':r.deafened?'Sağırlaştırmayı kapat.':r.muted?'Mikrofonu aç.':'';
  return <><button className="icon-button" aria-label="Soundboard" title="Soundboard" onClick={()=>setOpen(true)}><PartyPopper size={18}/></button>{open&&<Modal title="Soundboard" onClose={close}><div data-soundboard>
    <input ref={picker} type="file" accept="audio/*" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void add(file);}}/>
    <div className="button-row"><button className="button secondary" disabled={busy||clips.length>=8} onClick={()=>picker.current?.click()}><Plus size={16}/>{busy?'Ekleniyor…':'Ses ekle'}</button><button className="button secondary" onClick={stopSoundboard}><Square size={14}/>Durdur</button></div>
    <p className="muted">{reason||'Ses açık mikrofonundan odaya gönderilir.'}</p>
    <div className="soundboard-grid">{clips.map(clip=><div key={clip.id}><button className="soundboard-play" disabled={!!reason||busy} title={reason||clip.name} onClick={()=>{void playSoundboard(clip.buffer,volume).catch(e=>setError(uiError(e)));}}><Play size={18}/><strong>{clip.name}</strong><small>{clip.buffer.duration.toFixed(1)} sn</small></button><button aria-label={`${clip.name} sesini kaldır`} onClick={()=>{stopSoundboard();useClips.setState(state=>({clips:state.clips.filter(item=>item.id!==clip.id)}));}}><Trash2 size={14}/></button></div>)}</div>
    {!clips.length&&<p className="muted">Ses yok. En fazla 8 sn · 2 MB</p>}
    <label className="field-label">SES · {Math.round(volume*100)}%<input type="range" aria-label="Soundboard sesi" min={0} max={1} step={.05} value={volume} onChange={e=>{stopSoundboard();useClips.setState({volume:Number(e.target.value)});}}/></label>
    <p className="muted">Sesler bu oturumda saklanır.</p>{error&&<div className="error-pane" role="alert">{error}</div>}
  </div></Modal>}</>;
}
