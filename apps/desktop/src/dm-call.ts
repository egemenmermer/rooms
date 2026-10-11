import { create } from 'zustand';
import type { DmCallSession } from '../../../packages/shared-contracts/src/dm-call';
import { useCommunity } from './community';
import { mediaProvider } from './runtime-sources';
import { useVoiceContext } from './realtime';
import { useRooms } from './store';

interface DmCallState {call:DmCallSession|null;busy:boolean;error:string|null;connected:boolean}
export const useDmCall=create<DmCallState>(()=>({call:null,busy:false,error:null,connected:false}));
const fixture=()=>import.meta.env.DEV&&new URLSearchParams(location.search).has('fixture');
const bridge=()=>{if(fixture())throw new Error('Örnek görünümde gerçek arama başlatılamaz.');if(!window.rooms?.dmCalls)throw new Error('Özel arama için masaüstü uygulamasını aç.');return window.rooms.dmCalls;};
let identity='',epoch=0,consent:{callId:string;camera:boolean}|null=null;
let connecting:Promise<void>|null=null;
let stopped=new Set<string>();
const account=()=>{const state=useCommunity.getState();return state.user?`${state.serverUrl}:${state.user.id}`:'';};
const active=(call:DmCallSession|null)=>!!call&&call.state!=='ended';
export function dmCallUnavailable(){
  if(fixture())return 'Örnek görünümde gerçek arama başlatılamaz.';
  if(!useCommunity.getState().user)return 'Önce giriş yap.';
  if(useDmCall.getState().busy||connecting)return 'Arama işlemi sürüyor.';
  if(active(useDmCall.getState().call))return 'Önce mevcut özel görüşmeyi bitir.';
  if(useVoiceContext.getState().busy||useVoiceContext.getState().channelId||mediaProvider().snapshot().roomId)return 'Önce bağlı olduğun ses odasından ayrıl.';
  return null;
}
const failure=(error:unknown)=>error instanceof Error&&error.message&&!/token|jwt|https?:|wss?:/i.test(error.message)?error.message:'Arama bağlantısı kurulamadı. Yeniden dene.';
export async function startDmCall(dmId:string,mode:'audio'|'video'){
  const reason=dmCallUnavailable();if(reason)throw new Error(reason);
  identity=account();const generation=++epoch;useDmCall.setState({busy:true,error:null});
  try{const call=await bridge().start(dmId,mode);if(generation!==epoch||identity!==account()){await bridge().respond(call.id,'end').catch(()=>{});return;}
    consent={callId:call.id,camera:mode==='video'};useDmCall.setState({call,connected:false});
  }catch(error){if(generation===epoch)useDmCall.setState({error:failure(error)});throw error;}
  finally{if(generation===epoch)useDmCall.setState({busy:false});}
}
export async function acceptDmCall(camera=false){
  const call=useDmCall.getState().call;if(!call||call.state!=='ringing'||call.calleeId!==useCommunity.getState().user?.id)return;
  if(useDmCall.getState().busy||connecting)return;
  if(useVoiceContext.getState().busy||useVoiceContext.getState().channelId||mediaProvider().snapshot().roomId)throw new Error('Kabul etmeden önce bağlı olduğun ses odasından ayrıl.');
  const generation=epoch;identity=account();useDmCall.setState({busy:true,error:null});
  try{const next=await bridge().respond(call.id,'accept');if(generation!==epoch||identity!==account())return;consent={callId:next.id,camera};useDmCall.setState({call:next});await connectAccepted();}
  catch(error){useDmCall.setState({error:failure(error)});throw error;}
  finally{if(generation===epoch)useDmCall.setState({busy:false});}
}
export async function joinAcceptedDmCall(camera=false){
  const call=useDmCall.getState().call;if(!call||call.state!=='accepted'||connecting||useDmCall.getState().busy)return;
  if(useVoiceContext.getState().busy||useVoiceContext.getState().channelId||mediaProvider().snapshot().roomId)throw new Error('Önce bağlı olduğun ses odasından ayrıl.');
  consent={callId:call.id,camera};identity=account();await connectAccepted();
}
async function connectAccepted(){
  const state=useDmCall.getState(),call=state.call;
  if(!call||call.state!=='accepted'||consent?.callId!==call.id||state.connected||connecting)return;
  const generation=epoch,wantsCamera=consent.camera;
  const valid=()=>generation===epoch&&identity===account()&&useDmCall.getState().call?.id===call.id&&useDmCall.getState().call?.state==='accepted';
  useDmCall.setState({busy:true});
  const work=(async()=>{
    if(useVoiceContext.getState().busy||useVoiceContext.getState().channelId||mediaProvider().snapshot().roomId)throw new Error('Önce bağlı olduğun ses odasından ayrıl.');
    const grant=await bridge().grant(call.id);if(!valid())return;
    await mediaProvider().connectRoom(grant.roomName,grant.token,grant.serverUrl);
    if(!valid()){await mediaProvider().disconnect();return;}
    useDmCall.setState({connected:true});
    await mediaProvider().setNoiseSuppression(useRooms.getState().preferences.noiseSuppression);
    if(!valid())return;
    await mediaProvider().deviceSelection(useRooms.getState().preferences.inputId,useRooms.getState().preferences.outputId);
    if(!valid())return;
    // Start/accept is explicit microphone consent. Camera consent is local and separate for each participant.
    try{await mediaProvider().publishMic(useRooms.getState().preferences.inputId||undefined);}catch{if(valid())useDmCall.setState({error:'Mikrofon açılamadı. Görüşme bağlı; mikrofon iznini kontrol et.'});}
    if(!valid())return;
    if(wantsCamera)try{await mediaProvider().publishCamera(true);}catch{if(valid())useDmCall.setState({error:'Kamera açılamadı. Sesli görüşme devam ediyor.'});}
  })();
  connecting=work;
  try{await work;}catch(error){if(valid()){await bridge().respond(call.id,'end').catch(()=>{});await mediaProvider().disconnect();consent=null;stopped.add(call.id);useDmCall.setState({call:null,connected:false,error:failure(error)});}}
  finally{if(connecting===work)connecting=null;if(generation===epoch)useDmCall.setState({busy:false});}
}
export async function endDmCall(action:'reject'|'end'='end'){
  const {call,connected}=useDmCall.getState();++epoch;consent=null;
  if(call)stopped.add(call.id);
  useDmCall.setState({call:null,busy:true,connected:false,error:null});
  const signal=call?bridge().respond(call.id,action).catch(()=>{}):Promise.resolve();
  try{if(connected||connecting)await mediaProvider().disconnect();await connecting?.catch(()=>{});await signal;}
  finally{useDmCall.setState({busy:false});}
}
export async function refreshDmCall(){
  if(fixture())return;
  if(account()!==identity){await resetDmCalls();identity=account();}
  if(!identity||!window.rooms?.dmCalls)return;
  const generation=epoch,currentAccount=identity;
  try{
    const {call}=await bridge().poll();if(generation!==epoch||currentAccount!==account())return;
    if(call?.state==='ended'||!call){const previous=useDmCall.getState().call;if(previous&&(!call||previous.id===call.id)){const message=call?.reason==='rejected'?'Arama reddedildi.':call?.reason==='missed'?'Arama yanıtlanmadı.':call?.reason==='access-lost'?'Özel görüşme erişimi sona erdi.':call?.reason==='disconnected'?'Karşı tarafın arama bağlantısı kesildi.':'Görüşme sona erdi.';await endDmCall();useDmCall.setState({error:message});}return;}
    if(stopped.has(call.id))return;
    const previous=useDmCall.getState().call;if(previous&&previous.id!==call.id)await endDmCall();
    useDmCall.setState({call});await connectAccepted();
  }catch(error){if(generation===epoch)useDmCall.setState({error:failure(error)});}
}
export async function resetDmCalls(){const previous=identity;identity='';await endDmCall();stopped=new Set();if(previous!==account())useDmCall.setState({error:null});}
export function dismissDmCallError(){useDmCall.setState({error:null});}
