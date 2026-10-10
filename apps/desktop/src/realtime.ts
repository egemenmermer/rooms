import { uiError } from './i18n';
import { create } from 'zustand';
import { useSyncExternalStore } from 'react';
import { liveKitMediaProvider, type MediaSnapshot } from '@rooms/media';
import { useRooms } from './store';
export const useVoiceContext=create<{channelId:string|null;roomName:string|null;error:string|null;busy:boolean}>(()=>({channelId:null,roomName:null,error:null,busy:false}));
const bridge=()=>{if(!window.rooms?.media)throw new Error('Open the Electron desktop app to use voice and screen sharing.');return window.rooms.media;};
const errorText=uiError;
export function useRealtime():MediaSnapshot&{channelId:string|null;roomName:string|null;busy:boolean}{const snapshot=useSyncExternalStore(liveKitMediaProvider.subscribeState,liveKitMediaProvider.snapshot,liveKitMediaProvider.snapshot);const context=useVoiceContext();return {...snapshot,...context,error:context.error??(snapshot.error?uiError(snapshot.error):null)};}
export async function joinVoice(channelId:string,roomName:string){
  if(useVoiceContext.getState().busy)return;await leaveVoice();useVoiceContext.setState({busy:true,error:null,channelId,roomName});
  try{const grant=await bridge().grant(channelId);await liveKitMediaProvider.connectRoom(grant.roomName,grant.token,grant.serverUrl);await liveKitMediaProvider.deviceSelection(useRooms.getState().preferences.inputId,useRooms.getState().preferences.outputId);}
  catch(error){useVoiceContext.setState({error:errorText(error)});throw error;}
  finally{useVoiceContext.setState({busy:false});}
}
export async function leaveVoice(){const context=useVoiceContext.getState();await liveKitMediaProvider.disconnect();if(context.channelId&&window.rooms)await bridge().leave(context.channelId).catch(()=>{});useVoiceContext.setState({channelId:null,roomName:null,error:null,busy:false});}
async function run(operation:()=>Promise<void>){useVoiceContext.setState({error:null});try{await operation();}catch(error){useVoiceContext.setState({error:errorText(error)});throw error;}}
export async function toggleMic(){await run(()=>liveKitMediaProvider.mute(!liveKitMediaProvider.snapshot().muted));}
export async function toggleDeafen(){await run(()=>liveKitMediaProvider.deafen(!liveKitMediaProvider.snapshot().deafened));}
export async function toggleCamera(){await run(()=>liveKitMediaProvider.publishCamera(!liveKitMediaProvider.snapshot().camera));}
export async function startScreen(sourceId?:string){const channelId=useVoiceContext.getState().channelId;if(!channelId)throw new Error('Join a voice room before sharing.');await run(async()=>{await bridge().presenter(channelId,'acquire');try{if(sourceId)await bridge().selectCaptureSource(sourceId);await liveKitMediaProvider.publishScreen();}catch(error){await bridge().clearCaptureSource();await bridge().presenter(channelId,'release').catch(()=>{});throw error;}});}
export async function stopScreen(){const channelId=useVoiceContext.getState().channelId;await run(async()=>{await liveKitMediaProvider.stopScreen();if(channelId)await bridge().presenter(channelId,'release');});}
export const setParticipantVolume=(id:string,volume:number)=>liveKitMediaProvider.setParticipantVolume(id,volume);
export const startRoomAudio=()=>run(()=>liveKitMediaProvider.startAudio());
export const attachMediaTrack=(id:string,element:HTMLMediaElement)=>liveKitMediaProvider.attachTrack(id,element);
