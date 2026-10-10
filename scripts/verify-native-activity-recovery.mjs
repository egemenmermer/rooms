/** Actual Activity-process interruption; isolated owned data, no network/voice claim. */
import {_electron as electron} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const expectedVersion=JSON.parse(await readFile('package.json','utf8')).version;
const config=JSON.parse(await readFile('.local/production/test-accounts.json','utf8'));
const sshOptions=['-i','/Users/egemenmermer/.ssh/id_ed25519','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=.local/ssh/known_hosts'];
const service=action=>{assert(['stop','start'].includes(action));execFileSync('ssh',[...sshOptions,'root@62.238.119.134',`docker ${action} rooms-core-activities-1`],{timeout:30000,stdio:'pipe'});};
const suffix=Date.now().toString(36),name=`qa-recovery-${suffix}`,clients=[],profiles=[],pages=[];
let channelId,serviceStopped=false;
const result={at:new Date().toISOString(),scope:'Two actual packaged clients on one Mac; Activity-process stop/start and PostgreSQL state recovery with social transport remaining live. Not whole-network, voice, SFU, physical devices or full-evening acceptance.',cases:[],rendererErrors:0};
const api=async(path,method='GET',body)=>{const r=await fetch(config.base+'/api'+path,{method,headers:{'x-session-token':config.owner.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});assert(r.ok,`Owned upstream ${method} failed ${r.status}`);return r.status===204?null:r.json();};
const state=()=>pages[0].evaluate(id=>window.rooms.activity.snapshot(id),channelId);
try{
 const channel=await api(`/servers/${config.spaceId}/channels`,'POST',{type:'Text',name,description:'Owned disposable two-client Activity recovery acceptance.'});channelId=channel._id;assert(channelId);
 for(const role of ['owner','guest']){
  const profile=await mkdtemp(join(tmpdir(),'rooms-activity-recovery-'));profiles.push(profile);const env={...process.env,ROOMS_PROFILE:`recovery-${role}-${suffix}`};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:resolve('release/mac-arm64/ROOMS.app/Contents/MacOS/ROOMS'),args:[`--user-data-dir=${profile}`],env});clients.push(app);profiles.push(await app.evaluate(({app})=>app.getPath('userData')));assert.equal(await app.evaluate(({app})=>app.getVersion()),expectedVersion);
  const page=await app.firstWindow();pages.push(page);page.setDefaultTimeout(35000);page.on('pageerror',()=>result.rendererErrors++);page.on('crash',()=>result.rendererErrors++);
  await page.waitForSelector('.hero');await page.evaluate(()=>location.hash='/settings?tab=connections');await page.waitForSelector('.social-connection form');
  await page.locator('.social-connection input[type=url]').fill(config.base);await page.locator('.social-connection input[type=email]').fill(config[role].email);await page.locator('.social-connection input[type=password]').fill(config[role].password);await page.locator('.social-connection button[type=submit]').click();await page.waitForSelector('.signed-in-profile');
  await page.evaluate(()=>location.hash='/chat');await page.waitForSelector('.chat-transcript');await page.locator('.channels').getByRole('button',{name,exact:true}).click();
  await page.evaluate(()=>location.hash='/together?tab=board');await page.waitForSelector('.board-canvas');
 }
 result.appVersion=expectedVersion;result.actualDesktopClients=2;assert.equal((await state()).room.primary,null);
 const [owner,guest]=pages,firstNote=`Owned preserved note ${suffix}`,secondNote=`Owned recovered write ${suffix}`,question=`Owned recovery poll ${suffix}`;
 await owner.getByRole('button',{name:'Metin ekle',exact:true}).click();await owner.getByRole('textbox',{name:'Beyaz tahta notu'}).fill(firstNote);await owner.getByRole('button',{name:'Not ekle',exact:true}).click();await guest.locator('.board-canvas text').getByText(firstNote,{exact:true}).waitFor();result.cases.push('native-note-delivered');
 for(const page of pages){await page.evaluate(()=>location.hash='/together?tab=polls');await page.waitForSelector('.poll-list, .empty-state');}
 await owner.getByRole('button',{name:'Anket oluştur',exact:true}).click();const form=owner.getByRole('dialog').locator('form');await form.locator('input').nth(0).fill(question);await form.locator('input').nth(1).fill('First');await form.locator('input').nth(2).fill('Second');await form.getByRole('button',{name:'Ortak anketi başlat',exact:true}).click();await guest.getByText(question,{exact:true}).waitFor();await guest.locator('.poll-card').filter({hasText:question}).getByRole('button').filter({hasText:'Second'}).click();
 await owner.waitForFunction(()=>document.querySelector('.poll-option.voted')||[...document.querySelectorAll('.poll-card p')].some(p=>p.textContent.startsWith('1')));const before=(await state()).room;assert.equal(before.whiteboard.length,1);assert.equal(before.polls.length,1);assert.equal(Object.keys(before.polls[0].votes).length,1);result.cases.push('native-poll-and-guest-vote-delivered');
 for(const page of pages){await page.evaluate(()=>location.hash='/together?tab=board');await page.waitForSelector('.board-canvas');}
 result.stage='interrupt';serviceStopped=true;const interrupted=Date.now();service('stop');
 for(const page of pages)await page.waitForFunction(()=>document.querySelector('.shared-room-status .unavailable'));
 result.disconnectedObservedMs=Date.now()-interrupted;
 result.outageCopy=[];for(const page of pages){const copy=await page.locator('.empty-description').innerText();result.outageCopy.push(copy);assert(copy.includes('Etkinlik hizmetine ulaşılamıyor. Bağlantı otomatik olarak yeniden denenecek.'));}result.preciseActivityOutageCopy=true;result.cases.push('both-clients-observe-activity-disconnected');await guest.screenshot({path:'docs/screenshots/production/activity-disconnected.png'});
 // Actual social send/delivery while Activities is stopped; no transport stubbing.
 for(const page of pages){await page.evaluate(()=>location.hash='/chat');await page.waitForSelector('.chat-transcript');}
 const message=`Owned social survives Activity stop ${suffix}`;await owner.locator('.chat-page textarea').fill(message);await owner.locator('.chat-page textarea').press('Enter');await guest.getByText(message,{exact:true}).waitFor();result.cases.push('social-send-delivery-while-activity-stopped');
 for(const page of pages){await page.evaluate(()=>location.hash='/together?tab=board');await page.waitForSelector('.shared-room-status .unavailable');}
 result.stage='resume';service('start');serviceStopped=false;const resumed=Date.now();
 for(const page of pages)await page.locator('.board-canvas text').getByText(firstNote,{exact:true}).waitFor();result.recoveredObservedMs=Date.now()-resumed;
 const after=(await state()).room;assert.deepEqual(after.whiteboard,before.whiteboard);assert.deepEqual(after.polls,before.polls);assert.equal(after.primary,null);result.cases.push('automatic-two-client-recovery-and-persisted-board-poll-vote');
 await guest.getByRole('button',{name:'Metin ekle',exact:true}).click();await guest.getByRole('textbox',{name:'Beyaz tahta notu'}).fill(secondNote);await guest.getByRole('button',{name:'Not ekle',exact:true}).click();await owner.locator('.board-canvas text').getByText(secondNote,{exact:true}).waitFor();result.cases.push('post-recovery-native-write-delivered');
 await owner.screenshot({path:'docs/screenshots/production/activity-recovered.png'});assert.equal(result.rendererErrors,0);result.status='PASS';
}catch(error){result.status='FAIL';result.failure=error.message.slice(0,350);if(pages[0])await pages[0].screenshot({path:'.local/production/native-activity-recovery-failure.png'}).catch(()=>{});}
finally{
 if(serviceStopped){try{service('start');serviceStopped=false;result.serviceRecoveredFinally=true;}catch{result.status='FAIL';result.serviceRecoveredFinally=false;}}
 for(let i=0;i<clients.length;i++){if(pages[i])await pages[i].evaluate(()=>window.rooms.social.logout()).catch(()=>{});await clients[i].close().catch(()=>{});}
 for(const profile of new Set(profiles))await rm(profile,{recursive:true,force:true});
 if(channelId){try{const channel=await api(`/channels/${channelId}`);assert.equal(channel.name,name);assert.equal(channel.server,config.spaceId);await api(`/channels/${channelId}`,'DELETE');result.ownedChannelRemoved=true;}catch{result.status='FAIL';result.ownedChannelRemoved=false;}}
 result.serviceLeftStopped=serviceStopped;await writeFile('infra/production/NATIVE_ACTIVITY_RECOVERY_RESULTS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}if(result.status!=='PASS')process.exitCode=1;
