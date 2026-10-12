import {useCommunity} from './community';
import { useDmCall } from './dm-call';
import { uiError } from './i18n';
import { create } from 'zustand';
import { useSyncExternalStore } from 'react';
import { type MediaSnapshot } from '@rooms/media';
import { mediaProvider, mediaBridge } from './runtime-sources';
import { useRooms } from './store';
export const useVoiceContext=create<{channelId:string|null;roomName:string|null;error:string|null;busy:boolean}>(()=>({channelId:null,roomName:null,error:null,busy:false}));
const bridge=mediaBridge;
const errorText=uiError;
export function useRealtime():MediaSnapshot&{channelId:string|null;roomName:string|null;busy:boolean}{const snapshot=useSyncExternalStore(listener=>mediaProvider().subscribeState(listener),()=>mediaProvider().snapshot(),()=>mediaProvider().snapshot());const context=useVoiceContext();return {...snapshot,...context,status:context.busy?'connecting':snapshot.status,error:context.error??(snapshot.error?uiError(snapshot.error):null)};}
let transitionEpoch=0,sequence:Promise<unknown>=Promise.resolve(),activeChannel:string|null=null;
let pendingTarget:string|null=null,pendingPromise:Promise<void>|null=null;
let desiredMuted=true,microphoneScope='';
const sessionScope=()=>`${useCommunity.getState().serverUrl}:${useCommunity.getState().user?.id??''}`;
function serialize(work:()=>Promise<void>){const next=sequence.catch(()=>{}).then(work);sequence=next.catch(()=>{});return next;}
async function disconnectActive(){const id=activeChannel;activeChannel=null;await mediaProvider().disconnect();if(id&&window.rooms)await bridge().leave(id).catch(()=>{});}
export function joinVoice(channelId:string,roomName:string):Promise<void>{
 const dm=useDmCall.getState();if(dm.busy||dm.call?.state==='ringing'||dm.call?.state==='accepted')return Promise.reject(new Error('Önce özel görüşmeyi bitir.'));
 const context=useVoiceContext.getState(),snapshot=mediaProvider().snapshot();
 if(context.busy&&pendingTarget===channelId&&pendingPromise)return pendingPromise;
 if(!context.busy&&context.channelId===channelId&&snapshot.status==='connected')return Promise.resolve();
 if(snapshot.status==='connected'&&!context.busy){activeChannel??=context.channelId;desiredMuted=snapshot.muted;}
 const epoch=++transitionEpoch,scope=sessionScope();if(microphoneScope!==scope){desiredMuted=true;microphoneScope=scope;}pendingTarget=channelId;
 const current=()=>epoch===transitionEpoch&&scope===sessionScope();
 useVoiceContext.setState({channelId,roomName,busy:true,error:null});
 const next=serialize(async()=>{
  if(!current())return;
  try{
   // Validate target membership before dropping the previous connection.
   const grant=await bridge().grant(channelId);
   if(!current()){if(window.rooms)await bridge().leave(channelId).catch(()=>{});return;}
   await disconnectActive();if(!current())return;
   const dm=useDmCall.getState();if(dm.busy||dm.call?.state==='ringing'||dm.call?.state==='accepted')throw new Error('Önce özel görüşmeyi bitir.');
   activeChannel=channelId;
   await mediaProvider().connectRoom(grant.roomName,grant.token,grant.serverUrl);
   if(!current()){await disconnectActive();return;}
   await mediaProvider().setNoiseSuppression(useRooms.getState().preferences.noiseSuppression);
   if(!current()){await disconnectActive();return;}
   await mediaProvider().deviceSelection(useRooms.getState().preferences.inputId,useRooms.getState().preferences.outputId);
   if(!current()){await disconnectActive();return;}
   if(!desiredMuted)await mediaProvider().mute(false);
   if(!current()){await disconnectActive();return;}
  }catch(error){if(current()){await disconnectActive().catch(()=>{});useVoiceContext.setState({error:errorText(error)});throw error;}}
  finally{if(current()){pendingTarget=null;pendingPromise=null;useVoiceContext.setState({busy:false});}}
 });pendingPromise=next;return next;
}
export function leaveVoice(preserveBusy=false):Promise<void>{
 const context=useVoiceContext.getState();if(!activeChannel&&mediaProvider().snapshot().status==='connected')activeChannel=context.channelId;
 const epoch=++transitionEpoch;pendingTarget=null;pendingPromise=null;
 useVoiceContext.setState({channelId:null,roomName:null,error:null,busy:preserveBusy});
 return serialize(async()=>{await disconnectActive();if(epoch===transitionEpoch)useVoiceContext.setState({busy:false});});
}
async function run(operation:()=>Promise<void>){useVoiceContext.setState({error:null});try{await operation();}catch(error){useVoiceContext.setState({error:errorText(error)});throw error;}}
export async function toggleMic(){await run(async()=>{const muted=!mediaProvider().snapshot().muted;await mediaProvider().mute(muted);desiredMuted=muted;if(mediaProvider().snapshot().inputDeviceFallback)useRooms.getState().setPreference('inputId','');});}
export async function toggleDeafen(){await run(()=>mediaProvider().deafen(!mediaProvider().snapshot().deafened));}
export async function toggleCamera(){await run(()=>mediaProvider().publishCamera(!mediaProvider().snapshot().camera));}
export async function startScreen(sourceId?:string,options:import('@rooms/media').ScreenShareOptions={}){const channelId=useVoiceContext.getState().channelId;if(!channelId)throw new Error('Join a voice room before sharing.');await run(async()=>{await bridge().presenter(channelId,'acquire');try{if(sourceId)await bridge().selectCaptureSource(sourceId,{audio:options.audio??false});await mediaProvider().publishScreen(options);}catch(error){await bridge().clearCaptureSource();await bridge().presenter(channelId,'release').catch(()=>{});throw error;}});}
export async function stopScreen(){const channelId=useVoiceContext.getState().channelId;await run(async()=>{await mediaProvider().stopScreen();if(channelId)await bridge().presenter(channelId,'release');});}
export const setParticipantVolume=(id:string,volume:number)=>mediaProvider().setParticipantVolume(id,volume);
export const startRoomAudio=()=>run(()=>mediaProvider().startAudio());
export const attachMediaTrack=(id:string,element:HTMLMediaElement)=>mediaProvider().attachTrack(id,element);

export const setNoiseSuppression=(value:boolean)=>run(()=>mediaProvider().setNoiseSuppression(value));
export const playSoundboard=(buffer:AudioBuffer,volume:number)=>run(()=>mediaProvider().playSoundboard(buffer,volume));
export const stopSoundboard=()=>mediaProvider().stopSoundboard();
