import {app,ipcMain,autoUpdater as nativeUpdater} from 'electron';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {autoUpdater} from 'electron-updater';
export interface UpdateStatus {enabled:boolean;configured:boolean;state:'unavailable'|'idle'|'checking'|'available'|'downloading'|'verifying'|'ready'|'error';version:string|null;progress:number;reason:string|null}
export function setupUpdates(assertSender:(e:Electron.IpcMainInvokeEvent)=>void){
 const file=join(app.getPath('userData'),'updates.json');let enabled=false;try{enabled=JSON.parse(readFileSync(file,'utf8')).enabled===true;}catch{/* Updates start opt-out. */}
 let feed:string|null=null;let signed=false;
 try{const config=JSON.parse(readFileSync(join(__dirname,'../dist/update-config.json'),'utf8'));const u=new URL(config.feed);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^[A-Z0-9]{10}$/.test(config.teamId)){feed=u.href;if(app.isPackaged&&process.platform==='darwin'){const bundle=join(process.resourcesPath,'../..');const verification=spawnSync('/usr/bin/codesign',['--verify','--deep','--strict',bundle],{encoding:'utf8',timeout:10000});const details=spawnSync('/usr/bin/codesign',['-dv','--verbose=4',bundle],{encoding:'utf8',timeout:10000});signed=verification.status===0&&details.stderr.includes('Authority=Developer ID Application:')&&details.stderr.includes(`TeamIdentifier=${config.teamId}`);}}}catch{/* Only signed, packaged configuration enables updates. */}
 const configured=app.isPackaged&&process.platform==='darwin'&&!!feed&&signed;
 const status:UpdateStatus={enabled,configured,state:configured?'idle':'unavailable',version:null,progress:0,reason:configured?null:'Signed updates require a verified signed release and a configured HTTPS update feed.'};
 autoUpdater.logger=null;autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;autoUpdater.allowDowngrade=false;autoUpdater.allowPrerelease=false;
 if(configured){autoUpdater.setFeedURL({provider:'generic',url:feed!});autoUpdater.on('checking-for-update',()=>{status.state='checking';status.reason=null;});autoUpdater.on('update-available',info=>{status.state='available';status.version=info.version;});autoUpdater.on('update-not-available',()=>{status.state='idle';status.version=null;});autoUpdater.on('download-progress',p=>{status.state='downloading';status.progress=Math.round(p.percent);});autoUpdater.on('update-downloaded',()=>{status.state='verifying';status.progress=100;nativeUpdater.checkForUpdates();});nativeUpdater.on('update-downloaded',()=>{status.state='ready';status.reason=null;});nativeUpdater.on('error',()=>{status.state='error';status.reason='The update signature could not be verified. Your current application remains installed.';});autoUpdater.on('error',()=>{status.state='error';status.reason='The update could not be verified or downloaded. Your current application remains installed.';});}
 const bind=(name:string,fn:(...args:any[])=>unknown)=>ipcMain.handle(`rooms:update-${name}`,(event,...args)=>{assertSender(event);return fn(...args);});
 bind('status',()=>({...status}));bind('opt-in',value=>{if(typeof value!=='boolean')throw new Error('Invalid update preference.');status.enabled=value;writeFileSync(file,JSON.stringify({enabled:value}),{mode:0o600});return{...status};});
 bind('check',async()=>{if(!configured||!status.enabled)throw new Error('Enable verified signed updates after release setup.');await autoUpdater.checkForUpdates();return{...status};});
 bind('download',async()=>{if(!configured||!status.enabled||status.state!=='available')throw new Error('No verified update is available.');status.state='downloading';await autoUpdater.downloadUpdate();return{...status};});
 bind('install',()=>{if(!configured||!status.enabled||status.state!=='ready')throw new Error('A verified update must be downloaded first.');autoUpdater.quitAndInstall(false,true);});
}
