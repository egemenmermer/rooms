import {app,ipcMain,Notification,type BrowserWindow,type IpcMainInvokeEvent} from 'electron';
import {readFileSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {SOCIAL_ID_PATTERN} from '@rooms/social';
import type {ChannelNotificationScope,ChannelNotificationInput} from '@rooms/contracts';
/** Opt-in, content-free notifications; never disclose messages or account/provider details. */
export function setupNotifications(getWindow:()=>BrowserWindow|null,assertSender:(event:IpcMainInvokeEvent)=>void,getScope:()=>ChannelNotificationScope|null=()=>null){
 const file=join(app.getPath('userData'),'notifications.json');let enabled=false;let sound=false;let pauseDuringVoice=false;let voiceActiveUntil=0;let lastShown=0;let mutedKeys=new Set<string>();
 const channelKey=(scope:ChannelNotificationScope,channelId:string)=>createHash('sha256').update(JSON.stringify([scope.serverUrl,scope.userId,channelId])).digest('hex');
 try{const saved=JSON.parse(readFileSync(file,'utf8'));enabled=saved.enabled===true;sound=saved.sound===true;pauseDuringVoice=saved.pauseDuringVoice===true;if(Array.isArray(saved.mutedChannels))mutedKeys=new Set(saved.mutedChannels.filter((key:unknown)=>typeof key==='string'&&/^[a-f0-9]{64}$/.test(key)).slice(0,5000));}catch{/* New profiles start opt-out. */}
 const status=()=>({enabled,sound,pauseDuringVoice,supported:Notification.isSupported()});
 ipcMain.handle('rooms:notification-status',event=>{assertSender(event);return status();});
 const save=(next:{enabled:boolean;sound:boolean;pauseDuringVoice:boolean})=>{const temporary=file+'.tmp';try{writeFileSync(temporary,JSON.stringify({...next,mutedChannels:[...mutedKeys]}),{mode:0o600});renameSync(temporary,file);}finally{rmSync(temporary,{force:true});}enabled=next.enabled;sound=next.sound;pauseDuringVoice=next.pauseDuringVoice;return status();};
 ipcMain.handle('rooms:notification-opt-in',(event,value)=>{assertSender(event);if(typeof value!=='boolean')throw new Error('Invalid notification preference.');return save({enabled:value,sound,pauseDuringVoice});});
 ipcMain.handle('rooms:notification-sound',(event,value)=>{assertSender(event);if(typeof value!=='boolean')throw new Error('Invalid notification preference.');return save({enabled,sound:value,pauseDuringVoice});});
 ipcMain.handle('rooms:notification-pause-voice',(event,value)=>{assertSender(event);if(typeof value!=='boolean')throw new Error('Invalid notification preference.');return save({enabled,sound,pauseDuringVoice:value});});
 const checkedChannel=(event:IpcMainInvokeEvent,input:unknown):ChannelNotificationInput=>{
  assertSender(event);const window=getWindow();if(!app.isPackaged&&window&&new URL(window.webContents.getURL()||'about:blank').searchParams.has('fixture'))throw new Error('Native channel preferences are disabled in development fixtures.');
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid channel notification preference.');
  const value=input as ChannelNotificationInput,scope=getScope();
  if(Object.keys(value).some(key=>!['serverUrl','userId','channelId','muted'].includes(key))||typeof value.channelId!=='string'||!SOCIAL_ID_PATTERN.test(value.channelId)||!scope||value.serverUrl!==scope.serverUrl||value.userId!==scope.userId)throw new Error('The account changed. Reopen channel notifications.');
  return value;
 };
 ipcMain.handle('rooms:notification-channel-status',(event,input)=>{const value=checkedChannel(event,input);return{muted:mutedKeys.has(channelKey(value,value.channelId))};});
 ipcMain.handle('rooms:notification-channel-mute',(event,input)=>{
  const value=checkedChannel(event,input);if(typeof value.muted!=='boolean')throw new Error('Invalid channel notification preference.');
  const key=channelKey(value,value.channelId),previous=mutedKeys,candidate=new Set(previous);
  if(value.muted){if(!candidate.has(key)&&candidate.size>=5000)throw new Error('The channel preference limit has been reached.');candidate.add(key);}else candidate.delete(key);
  mutedKeys=candidate;try{save({enabled,sound,pauseDuringVoice});}catch(error){mutedKeys=previous;throw error;}return{muted:value.muted};
 });
 // A short renderer lease expires after crash/suspension and is never persisted.
 ipcMain.handle('rooms:notification-voice-active',(event,value)=>{assertSender(event);if(typeof value!=='boolean')throw new Error('Invalid voice notification state.');voiceActiveUntil=value?Date.now()+30000:0;});
 return {message:(scope?:ChannelNotificationScope,channelId?:string)=>{if(scope&&channelId&&mutedKeys.has(channelKey(scope,channelId)))return;const window=getWindow();if(!enabled||pauseDuringVoice&&voiceActiveUntil>Date.now()||!Notification.isSupported()||window?.isFocused()||Date.now()-lastShown<5000)return;lastShown=Date.now();const notification=new Notification({title:'ROOMS',body:'Topluluğunda yeni bir mesaj var.',silent:!sound});notification.on('click',()=>{const current=getWindow();current?.show();current?.focus();});notification.show();}};
}
