import {app,ipcMain,Notification,type BrowserWindow,type IpcMainInvokeEvent} from 'electron';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
/** Opt-in, content-free notifications; never disclose messages or account/provider details. */
export function setupNotifications(getWindow:()=>BrowserWindow|null,assertSender:(event:IpcMainInvokeEvent)=>void){
 const file=join(app.getPath('userData'),'notifications.json');let enabled=false;let lastShown=0;
 try{enabled=JSON.parse(readFileSync(file,'utf8')).enabled===true;}catch{/* New profiles start opt-out. */}
 const status=()=>({enabled,supported:Notification.isSupported()});
 ipcMain.handle('rooms:notification-status',event=>{assertSender(event);return status();});
 ipcMain.handle('rooms:notification-opt-in',(event,value)=>{assertSender(event);if(typeof value!=='boolean')throw new Error('Invalid notification preference.');enabled=value;writeFileSync(file,JSON.stringify({enabled}),{mode:0o600});return status();});
 return {message:()=>{const window=getWindow();if(!enabled||!Notification.isSupported()||window?.isFocused()||Date.now()-lastShown<5000)return;lastShown=Date.now();const notification=new Notification({title:'ROOMS',body:'Topluluğunda yeni bir mesaj var.',silent:true});notification.on('click',()=>{const current=getWindow();current?.show();current?.focus();});notification.show();}};
}
