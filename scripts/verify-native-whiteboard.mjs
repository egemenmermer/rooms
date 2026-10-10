/** Actual native shared board acceptance. Use the real macOS save sheet; no dialog stubbing. */
import {_electron as electron} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const packaged=process.env.ROOMS_QA_PACKAGED==='1';
const expectedVersion=JSON.parse(await readFile('package.json','utf8')).version;
const config=JSON.parse(await readFile('.local/production/test-accounts.json','utf8'));
const sshOptions=['-i','/Users/egemenmermer/.ssh/id_ed25519','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=.local/ssh/known_hosts'];
const service=action=>{assert(['stop','start'].includes(action));execFileSync('ssh',[...sshOptions,'root@62.238.119.134',`docker ${action} rooms-core-activities-1`],{timeout:30000,stdio:'pipe'});};
const suffix=Date.now().toString(36),name=`qa-board-${suffix}`,clients=[],profiles=[],pages=[];
let channelId,serviceStopped=false;
const result={at:new Date().toISOString(),scope:'Two development Electron clients on one Mac running the current built source against public production Activity service. Real native SVG save sheet; not packaged release acceptance.',cases:[],rendererErrors:0};
const api=async(path,method='GET',body)=>{const r=await fetch(config.base+'/api'+path,{method,headers:{'x-session-token':config.owner.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});assert(r.ok,`Owned upstream ${method} failed ${r.status}`);return r.status===204?null:r.json();};
const state=()=>pages[0].evaluate(id=>window.rooms.activity.snapshot(id),channelId);
try{
 const channel=await api(`/servers/${config.spaceId}/channels`,'POST',{type:'Text',name,description:'Owned disposable two-client whiteboard acceptance.'});channelId=channel._id;assert(channelId);
 for(const role of ['owner','guest']){
  const profile=await mkdtemp(join(tmpdir(),'rooms-activity-recovery-'));profiles.push(profile);const env={...process.env,ROOMS_PROFILE:`recovery-${role}-${suffix}`};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:resolve(packaged?'release/mac-arm64/ROOMS.app/Contents/MacOS/ROOMS':'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[...(packaged?[]:[resolve('.')]),`--user-data-dir=${profile}`],env});clients.push(app);profiles.push(await app.evaluate(({app})=>app.getPath('userData')));assert.equal(await app.evaluate(({app})=>app.getVersion()),expectedVersion);
  const page=await app.firstWindow();pages.push(page);page.setDefaultTimeout(35000);page.on('pageerror',()=>result.rendererErrors++);page.on('crash',()=>result.rendererErrors++);
  await page.waitForSelector('.hero');await page.evaluate(()=>location.hash='/settings?tab=connections');await page.waitForSelector('.social-connection form');
  await page.locator('.social-connection input[type=url]').fill(config.base);await page.locator('.social-connection input[type=email]').fill(config[role].email);await page.locator('.social-connection input[type=password]').fill(config[role].password);await page.locator('.social-connection button[type=submit]').click();await page.waitForSelector('.signed-in-profile');
  await page.evaluate(()=>location.hash='/chat');await page.waitForSelector('.chat-transcript');await page.locator('.channels').getByRole('button',{name,exact:true}).click();
  await page.evaluate(()=>location.hash='/together?tab=board');await page.waitForSelector('.board-canvas');
 }
 result.sourceVersion=expectedVersion;result.buildKind=packaged?'packaged':'development';if(packaged){result.appVersion=expectedVersion;result.scope='Two actual packaged clients on one Mac against the public Activity service, scoped Activity-process recovery and real macOS SVG save sheet. Not physical-device, network, SFU or full-evening acceptance.';}result.actualDesktopClients=2;assert.equal((await state()).room.primary,null);
 const [owner,guest]=pages,firstNote=`Owned board owner ${suffix}`,guestNote=`Owned board guest ${suffix}`;
 const write=async(page,text)=>{await page.getByRole('button',{name:'Metin ekle',exact:true}).click();await page.getByRole('textbox',{name:'Beyaz tahta notu'}).fill(text);await page.getByRole('button',{name:'Not ekle',exact:true}).click();await page.locator('.board-canvas text').getByText(text,{exact:true}).waitFor();};
 await write(owner,firstNote);await guest.locator('.board-canvas text').getByText(firstNote,{exact:true}).waitFor();
 assert(await guest.getByRole('button',{name:'Geri al',exact:true}).isDisabled());result.cases.push('foreign-note-does-not-enter-guest-undo-history');
 await write(guest,guestNote);await owner.locator('.board-canvas text').getByText(guestNote,{exact:true}).waitFor();
 await owner.getByRole('button',{name:'Geri al',exact:true}).click();await guest.locator('.board-canvas text').getByText(firstNote,{exact:true}).waitFor({state:'detached'});assert(await guest.locator('.board-canvas text').getByText(guestNote,{exact:true}).isVisible());result.cases.push('owner-add-undo-preserves-guest-note');
 await guest.getByRole('button',{name:`${guestNote} öğesini sil`,exact:true}).click();await owner.locator('.board-canvas text').getByText(guestNote,{exact:true}).waitFor({state:'detached'});
 await guest.getByRole('button',{name:'Geri al',exact:true}).click();await owner.locator('.board-canvas text').getByText(guestNote,{exact:true}).waitFor();result.cases.push('guest-removal-undo-restores-shared-note');
 await guest.getByRole('button',{name:'Geri al',exact:true}).click();await owner.locator('.board-canvas text').getByText(guestNote,{exact:true}).waitFor({state:'detached'});result.cases.push('undo-sequence-follows-restored-element-id');await write(guest,guestNote);await owner.locator('.board-canvas text').getByText(guestNote,{exact:true}).waitFor();
 await write(owner,firstNote);
 // Observe only an owned Activity-process interruption; social transport stays live.
 await owner.getByRole('textbox',{name:'Beyaz tahta notu'}).fill('Owned unsent draft');serviceStopped=true;service('stop');await owner.waitForSelector('.shared-room-status .unavailable');service('start');serviceStopped=false;await owner.locator('.board-canvas').waitFor({state:'visible'});assert.equal(await owner.getByRole('textbox',{name:'Beyaz tahta notu'}).inputValue(),'Owned unsent draft');assert(await owner.getByRole('button',{name:'Geri al',exact:true}).isEnabled());result.cases.push('activity-recovery-preserves-unsent-note-and-undo-history');
 await owner.bringToFront();await owner.getByRole('button',{name:'Kaydet',exact:true}).click();console.log(JSON.stringify({phase:'cancel-real-save-sheet'}));await owner.getByText('Kaydetme iptal edildi.',{exact:true}).waitFor({timeout:120000});result.cases.push('native-save-cancel');
 const output=resolve('.local/production/whiteboard-export-qa.svg');
 await owner.getByRole('button',{name:'Kaydet',exact:true}).click();console.log(JSON.stringify({phase:'save-real-sheet',ownedOutput:output}));await owner.getByText('Tahta SVG olarak kaydedildi.',{exact:true}).waitFor({timeout:120000});
 const exported=await readFile(output,'utf8');assert(exported.includes(firstNote));assert(exported.includes(guestNote));assert(!exported.includes(config.owner.userId));assert(!exported.includes(config.owner.token));assert(!exported.includes('authorId'));result.cases.push('native-svg-file-contains-shared-artwork-without-identities-or-auth');await rm(output,{force:true});result.ownedExportRemoved=true;
 await owner.screenshot({path:'docs/screenshots/production/whiteboard-undo-export.png'});assert.equal(result.rendererErrors,0);result.status='PASS';
}catch(error){result.status='FAIL';result.failure=error.message.slice(0,350);if(pages[0])await pages[0].screenshot({path:'.local/production/native-whiteboard-failure.png'}).catch(()=>{});}
finally{
 if(serviceStopped){try{service('start');serviceStopped=false;result.serviceRecoveredFinally=true;}catch{result.status='FAIL';result.serviceRecoveredFinally=false;}}
 for(let i=0;i<clients.length;i++){if(pages[i])await pages[i].evaluate(()=>window.rooms.social.logout()).catch(()=>{});await clients[i].close().catch(()=>{});}
 for(const profile of new Set(profiles))await rm(profile,{recursive:true,force:true});
 if(channelId){try{const channel=await api(`/channels/${channelId}`);assert.equal(channel.name,name);assert.equal(channel.server,config.spaceId);await api(`/channels/${channelId}`,'DELETE');result.ownedChannelRemoved=true;}catch{result.status='FAIL';result.ownedChannelRemoved=false;}}
 result.serviceLeftStopped=serviceStopped;await writeFile('infra/production/NATIVE_WHITEBOARD_RESULTS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}if(result.status!=='PASS')process.exitCode=1;
