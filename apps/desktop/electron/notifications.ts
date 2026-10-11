import {app,ipcMain,Notification,type BrowserWindow,type IpcMainInvokeEvent} from 'electron';
import {readFileSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import {join} from 'node:path';
/** Opt-in, content-free notifications; never disclose messages or account/provider details. */
export function setupNotifications(getWindow:()=>BrowserWindow|null,assertSender:(event:IpcMainInvokeEvent)=>void){
 const file=join(app.getPath('userData'),'notifications.json');let enabled=false;let sound=false;let lastShown=0;
 try{const saved=JSON.parse(readFileSync(file,'utf8'));enabled=saved.enabled===true;sound=saved.sound===true;}catch{/* New profiles start opt-out. */}
 const status=()=>({enabled,sound,supported:Notification.isSupported()});
 ipcMain.handle('rooms:notification-status',event=>{assertSender(event);return status();});
 const save=(next:{enabled:boolean;sound:boolean})=>{const temporary=file+'.tmp';try{writeFileSync(temporary,JSON.stringify(next),{mode:0o600});renameSync(temporary,file);}finally{rmSync(temporary,{force:true});}enabled=next.enabled;sound=next.sound;return status();};
 ipcMain.handle('rooms:notification-opt-in',(event,value)=>{assertSender(event);if(typeof value!=='boolean')throw new Error('Invalid notification preference.');return save({enabled:value,sound});});
 ipcMain.handle('rooms:notification-sound',(event,value)=>{assertSender(event);if(typeof value!=='boolean')throw new Error('Invalid notification preference.');return save({enabled,sound:value});});
 return {message:()=>{const window=getWindow();if(!enabled||!Notification.isSupported()||window?.isFocused()||Date.now()-lastShown<5000)return;lastShown=Date.now();const notification=new Notification({title:'ROOMS',body:'Topluluğunda yeni bir mesaj var.',silent:!sound});notification.on('click',()=>{const current=getWindow();current?.show();current?.focus();});notification.show();}};
}
