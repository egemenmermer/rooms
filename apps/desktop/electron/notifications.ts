import {app,ipcMain,Notification,type BrowserWindow,type IpcMainInvokeEvent} from 'electron';
import {readFileSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import {join} from 'node:path';
/** Opt-in, content-free notifications; never disclose messages or account/provider details. */
export function setupNotifications(getWindow:()=>BrowserWindow|null,assertSender:(event:IpcMainInvokeEvent)=>void){
 const file=join(app.getPath('userData'),'notifications.json');let enabled=false;let sound=false;let pauseDuringVoice=false;let voiceActiveUntil=0;let lastShown=0;
 try{const saved=JSON.parse(readFileSync(file,'utf8'));enabled=saved.enabled===true;sound=saved.sound===true;pauseDuringVoice=saved.pauseDuringVoice===true;}catch{/* New profiles start opt-out. */}
 const status=()=>({enabled,sound,pauseDuringVoice,supported:Notification.isSupported()});
 ipcMain.handle('rooms:notification-status',event=>{assertSender(event);return status();});
 const save=(next:{enabled:boolean;sound:boolean;pauseDuringVoice:boolean})=>{const temporary=file+'.tmp';try{writeFileSync(temporary,JSON.stringify(next),{mode:0o600});renameSync(temporary,file);}finally{rmSync(temporary,{force:true});}enabled=next.enabled;sound=next.sound;pauseDuringVoice=next.pauseDuringVoice;return status();};
 ipcMain.handle('rooms:notification-opt-in',(event,value)=>{assertSender(event);if(typeof value!=='boolean')throw new Error('Invalid notification preference.');return save({enabled:value,sound,pauseDuringVoice});});
 ipcMain.handle('rooms:notification-sound',(event,value)=>{assertSender(event);if(typeof value!=='boolean')throw new Error('Invalid notification preference.');return save({enabled,sound:value,pauseDuringVoice});});
 ipcMain.handle('rooms:notification-pause-voice',(event,value)=>{assertSender(event);if(typeof value!=='boolean')throw new Error('Invalid notification preference.');return save({enabled,sound,pauseDuringVoice:value});});
 // A short renderer lease expires after crash/suspension and is never persisted.
 ipcMain.handle('rooms:notification-voice-active',(event,value)=>{assertSender(event);if(typeof value!=='boolean')throw new Error('Invalid voice notification state.');voiceActiveUntil=value?Date.now()+30000:0;});
 return {message:()=>{const window=getWindow();if(!enabled||pauseDuringVoice&&voiceActiveUntil>Date.now()||!Notification.isSupported()||window?.isFocused()||Date.now()-lastShown<5000)return;lastShown=Date.now();const notification=new Notification({title:'ROOMS',body:'Topluluğunda yeni bir mesaj var.',silent:!sound});notification.on('click',()=>{const current=getWindow();current?.show();current?.focus();});notification.show();}};
}
