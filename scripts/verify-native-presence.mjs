/** Actual status changes must arrive in the other native UI before its 30-second REST fallback. */
import {_electron as electron} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const config=JSON.parse(await readFile('.local/production/test-accounts.json','utf8'));
const clients=[],profiles=[],errors=[],suffix=Date.now().toString(36);
const result={at:new Date().toISOString(),platform:process.platform,arch:process.arch,actualClients:2,packaged:false,checks:[]};let original='online';
try{
 for(const role of ['owner','guest']){
  const profile=await mkdtemp(join(tmpdir(),'rooms-presence-'));profiles.push(profile);const env={...process.env,ROOMS_PROFILE:`presence-${role}-${suffix}`};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env});clients.push(app);profiles.push(await app.evaluate(({app})=>app.getPath('userData')));
  const page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',()=>errors.push('renderer-error'));await page.waitForSelector('.hero');await page.evaluate(()=>location.hash='/settings?tab=connections');await page.waitForSelector('.social-connection form');
  await page.locator('.social-connection input[type=url]').fill(config.base);await page.locator('.social-connection input[type=email]').fill(config[role].email);await page.locator('.social-connection input[type=password]').fill(config[role].password);await page.locator('.social-connection button[type=submit]').click();await page.waitForSelector('.signed-in-profile');
  await page.evaluate(()=>location.hash='/chat');await page.waitForSelector('.chat-transcript');
 }

 const owner=await clients[0].firstWindow(),guest=await clients[1].firstWindow();
 const guestUser=(await guest.evaluate(()=>window.rooms.social.session())).user;
 await owner.evaluate(userId=>{window.__qaPresence=[];window.rooms.social.onEvent(event=>{if(event.type==='PRESENCE_UPDATE'&&event.data.userId===userId)window.__qaPresence.push({status:event.data.status,at:Date.now()});});},guestUser.id);
 const before=await owner.evaluate(()=>window.rooms.social.friends());original=before.find(friend=>friend.user.id===guestUser.id)?.status??'online';
 if(original==='unknown')original='online';
 const row=owner.locator('.friends-panel .friend-row').filter({hasText:guestUser.displayName||guestUser.username});await row.waitFor();
 await guest.evaluate(()=>location.hash='/settings?tab=profile');const picker=guest.getByRole('combobox',{name:'Topluluk görünürlüğü',exact:true});await picker.waitFor();
 for(const [status,label] of [['dnd','Rahatsız etmeyin'],['invisible','Çevrimdışı'],['online','Çevrimiçi']]){
  const started=Date.now();await picker.selectOption(status);await row.locator('small').filter({hasText:label}).waitFor({timeout:12000});const elapsedMs=Date.now()-started;assert(elapsedMs<12000);assert(await owner.evaluate(status=>window.__qaPresence.some(event=>event.status===status),status));result.checks.push({status,elapsedMs,gatewayEventReceived:true});
 }
 await owner.screenshot({path:'docs/screenshots/production/native-presence.png'});result.rendererErrors=errors.length;assert.equal(errors.length,0);result.status='PASS';
}catch(error){result.status='FAIL';result.failure=error.message.slice(0,240);}
finally{
 if(clients[1])await (await clients[1].firstWindow()).evaluate(status=>window.rooms.social.presence(status),original).catch(()=>{});
 for(const app of clients){await (await app.firstWindow().catch(()=>null))?.evaluate(()=>window.rooms.social.logout()).catch(()=>{});await app.close().catch(()=>{});}for(const profile of profiles)await rm(profile,{recursive:true,force:true});
 await writeFile('infra/production/NATIVE_PRESENCE_RESULTS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
if(result.status!=='PASS')process.exitCode=1;
