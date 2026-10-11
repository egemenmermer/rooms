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
export function useRealtime():MediaSnapshot&{channelId:string|null;roomName:string|null;busy:boolean}{const snapshot=useSyncExternalStore(listener=>mediaProvider().subscribeState(listener),()=>mediaProvider().snapshot(),()=>mediaProvider().snapshot());const context=useVoiceContext();return {...snapshot,...context,error:context.error??(snapshot.error?uiError(snapshot.error):null)};}
export async function joinVoice(channelId:string,roomName:string){
  const dm=useDmCall.getState();if(dm.busy||dm.call?.state==='ringing'||dm.call?.state==='accepted')throw new Error('Önce özel görüşmeyi bitir.');
  if(useVoiceContext.getState().busy)return;useVoiceContext.setState({busy:true,error:null});
  try { await leaveVoice(true); } catch(error) { useVoiceContext.setState({busy:false,error:errorText(error)});throw error; }
  const afterLeave=useDmCall.getState();if(afterLeave.busy||afterLeave.call?.state==='ringing'||afterLeave.call?.state==='accepted'){useVoiceContext.setState({busy:false});throw new Error('Önce özel görüşmeyi bitir.');}
  useVoiceContext.setState({busy:true,error:null,channelId,roomName});
  try{const grant=await bridge().grant(channelId);await mediaProvider().connectRoom(grant.roomName,grant.token,grant.serverUrl);await mediaProvider().setNoiseSuppression(useRooms.getState().preferences.noiseSuppression);await mediaProvider().deviceSelection(useRooms.getState().preferences.inputId,useRooms.getState().preferences.outputId);}
  catch(error){useVoiceContext.setState({error:errorText(error)});throw error;}
  finally{useVoiceContext.setState({busy:false});}
}
export async function leaveVoice(preserveBusy=false){const context=useVoiceContext.getState();await mediaProvider().disconnect();if(context.channelId&&window.rooms)await bridge().leave(context.channelId).catch(()=>{});useVoiceContext.setState({channelId:null,roomName:null,error:null,busy:preserveBusy});}
async function run(operation:()=>Promise<void>){useVoiceContext.setState({error:null});try{await operation();}catch(error){useVoiceContext.setState({error:errorText(error)});throw error;}}
export async function toggleMic(){await run(()=>mediaProvider().mute(!mediaProvider().snapshot().muted));}
export async function toggleDeafen(){await run(()=>mediaProvider().deafen(!mediaProvider().snapshot().deafened));}
export async function toggleCamera(){await run(()=>mediaProvider().publishCamera(!mediaProvider().snapshot().camera));}
export async function startScreen(sourceId?:string){const channelId=useVoiceContext.getState().channelId;if(!channelId)throw new Error('Join a voice room before sharing.');await run(async()=>{await bridge().presenter(channelId,'acquire');try{if(sourceId)await bridge().selectCaptureSource(sourceId);await mediaProvider().publishScreen();}catch(error){await bridge().clearCaptureSource();await bridge().presenter(channelId,'release').catch(()=>{});throw error;}});}
export async function stopScreen(){const channelId=useVoiceContext.getState().channelId;await run(async()=>{await mediaProvider().stopScreen();if(channelId)await bridge().presenter(channelId,'release');});}
export const setParticipantVolume=(id:string,volume:number)=>mediaProvider().setParticipantVolume(id,volume);
export const startRoomAudio=()=>run(()=>mediaProvider().startAudio());
export const attachMediaTrack=(id:string,element:HTMLMediaElement)=>mediaProvider().attachTrack(id,element);

export const setNoiseSuppression=(value:boolean)=>run(()=>mediaProvider().setNoiseSuppression(value));
export const playSoundboard=(buffer:AudioBuffer,volume:number)=>run(()=>mediaProvider().playSoundboard(buffer,volume));
export const stopSoundboard=()=>mediaProvider().stopSoundboard();
