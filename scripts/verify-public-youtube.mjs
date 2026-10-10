/** Exercises the official deployed IFrame player, never a downloaded/scraped video. */
import {_electron as electron} from '@playwright/test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const dir=await mkdtemp(join(tmpdir(),'rooms-youtube-'));
const url=`https://62.238.119.134/rooms-activities/player/youtube?videoId=M7lc1UVf-VE&nonce=${randomUUID()}`;
await writeFile(join(dir,'main.cjs'),`const{app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:960,height:640,webPreferences:{nodeIntegration:false,contextIsolation:true}});w.loadURL(${JSON.stringify(url)});});`);
let app;const result={at:new Date().toISOString(),origin:'https://62.238.119.134',officialDocumentationSample:true,playerReady:false,actualPlayback:false,sharedSyncVerified:false};
try{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({args:[join(dir,'main.cjs')],env});const page=await app.firstWindow();
 result.failedRequests=[];page.on('requestfailed',request=>{if(result.failedRequests.length<8)result.failedRequests.push({host:new URL(request.url()).hostname,error:request.failure()?.errorText});});
 await page.addInitScript(()=>{window.roomsPlayerEvents=[];addEventListener('message',event=>{if(event.data?.type==='rooms-youtube')window.roomsPlayerEvents.push({event:event.data.event,data:event.data.data});});});await page.reload();
 await page.waitForFunction(()=>window.roomsPlayerEvents?.some(event=>event.event==='ready'),null,{timeout:30000});result.playerReady=true;
 const frame=page.frames().find(f=>f.url().startsWith('https://www.youtube.com/embed/'));
 if(!frame)throw new Error('Official YouTube frame missing');
 result.stage='official-control-click';result.controlNames=await frame.getByRole('button').evaluateAll(elements=>elements.map(e=>e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent?.trim()).filter(Boolean).slice(0,12));await frame.getByRole('button',{name:/^Play/}).first().click({timeout:15000});
 result.stage='playback-progress';await page.evaluate(()=>player.playVideo());
 await page.waitForFunction(()=>player.getPlayerState()===1&&player.getCurrentTime()>2,null,{timeout:25000});result.actualPlayback=true;
 await page.evaluate(()=>player.pauseVideo());await page.waitForFunction(()=>player.getPlayerState()===2);
 await page.evaluate(()=>player.seekTo(12,true));await page.waitForFunction(()=>player.getCurrentTime()>10);
 result.pauseAndSeek=true;
}catch(error){result.reason=error.name==='TimeoutError'?'Official player did not reach ready/playback in this environment':error.message.slice(0,160);if(app){const page=await app.firstWindow();await page.screenshot({path:'.local/production/youtube-debug.png'});result.state=await page.evaluate(()=>typeof player!=='undefined'?{state:player.getPlayerState(),position:player.getCurrentTime()}:null).catch(()=>null);result.errorEvents=await page.evaluate(()=>window.roomsPlayerEvents?.filter(x=>x.event==='error'||x.event==='autoplay-blocked')??[]).catch(()=>[]);const frame=page.frames().find(f=>f.url().startsWith('https://www.youtube.com/embed/'));result.playerErrorText=frame?await frame.locator('.ytp-error-content-wrap').innerText({timeout:1000}).catch(()=> ''):'';}}
finally{await writeFile('infra/production/YOUTUBE_RESULTS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(app)await app.close();await rm(dir,{recursive:true,force:true});}
