/** Two actual packaged clients; uniquely owned public channel, no social fixtures. */
import {_electron as electron} from '@playwright/test';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const config=JSON.parse(await readFile('.local/production/test-accounts.json','utf8'));
const suffix=Date.now().toString(36),name=`qa-real-ui-${suffix}`,clients=[],profiles=[],pages=[];
let channelId;const result={at:new Date().toISOString(),packaged:true,platform:process.platform,arch:process.arch,actualPublicAuthorization:true,actualDesktopClients:2,rendererErrors:0,cases:[]};
const api=async(path,method='GET',body)=>{const r=await fetch(config.base+'/api'+path,{method,headers:{'x-session-token':config.owner.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});assert(r.ok,`Owned ${method}: ${r.status}`);return r.status===204?null:r.json();};
try{
 const ch=await api(`/servers/${config.spaceId}/channels`,'POST',{type:'Text',name,description:'Owned production acceptance of real community UI.'});channelId=ch._id;assert(channelId);
 for(const role of ['owner','guest']){
  const env={...process.env,ROOMS_PROFILE:`no-demo-${role}-${suffix}`};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:resolve('release/mac-arm64/ROOMS.app/Contents/MacOS/ROOMS'),args:[],env});clients.push(app);profiles.push(await app.evaluate(({app})=>app.getPath('userData')));result.appVersion=await app.evaluate(({app})=>app.getVersion());const page=await app.firstWindow();pages.push(page);page.on('pageerror',()=>result.rendererErrors++);
  await page.waitForSelector('.social-connection form');await page.locator('.social-connection input[type=url]').fill(config.base);await page.locator('.social-connection input[type=email]').fill(config[role].email);await page.locator('.social-connection input[type=password]').fill(config[role].password);await page.locator('.social-connection button[type=submit]').click();await page.waitForFunction(()=>!!document.querySelector('.space-orb'));
  assert.equal((await page.evaluate(()=>window.rooms.social.session())).user.id,config[role].userId);
  await page.evaluate(()=>location.hash='/chat');await page.waitForSelector('.chat-transcript');await page.locator('.channels').getByRole('button',{name,exact:true}).click();await page.waitForTimeout(400);
  assert(!/Maya|Oliver|Sofia|Noah|demo/i.test(await page.locator('.main-view').innerText()));
 }
 result.cases.push('two-native-real-sign-in-and-community-navigation');
 const [owner,guest]=pages,text=`Owned actual message ${suffix}`;
 await owner.locator('.chat-page textarea').fill(text);await owner.locator('.chat-page textarea').press('Enter');await guest.getByText(text,{exact:true}).waitFor();
 const row=owner.locator('article.message').filter({hasText:text});await row.hover();await row.getByRole('button',{name:'Mesajını düzenle',exact:true}).click();await owner.locator('.edit-textarea').fill(text+' edited');await owner.getByRole('button',{name:'Değişiklikleri kaydet',exact:true}).click();await guest.getByText(text+' edited',{exact:true}).waitFor();
 const edited=owner.locator('article.message').filter({hasText:text+' edited'});await edited.hover();await edited.getByRole('button',{name:'Mesajını sil',exact:true}).click();await owner.getByRole('dialog').locator('button.danger').click();await guest.getByText(text+' edited',{exact:true}).waitFor({state:'detached'});
 result.cases.push('native-real-send-edit-delete-delivered');
 await owner.evaluate(()=>location.hash='/home');await owner.waitForSelector('.hero');assert.equal(await owner.locator('.space-orb').count(),(await owner.evaluate(()=>window.rooms.social.spaces())).length);await owner.screenshot({path:'docs/screenshots/production/no-demo-real-home.png'});
 await owner.evaluate(()=>location.hash='/cinema');await owner.waitForSelector('.cinema-empty');assert.equal(await owner.locator('video').count(),0);result.cases.push('authenticated-cinema-has-no-sample-media');
 await owner.evaluate(()=>location.hash='/polls');await owner.waitForSelector('.together-page');assert(await owner.evaluate(()=>location.hash.includes('/together')));result.cases.push('legacy-poll-navigation-opens-shared-activity');
 await owner.evaluate(()=>location.hash='/settings?tab=connections');await owner.waitForSelector('.signed-in-profile');await owner.getByRole('button',{name:'Çıkış yap',exact:true}).click();await owner.waitForSelector('.social-connection form');await owner.evaluate(()=>location.hash='/home');await owner.waitForSelector('.social-connection form');assert.equal(await owner.locator('.space-orb').count(),0);assert.equal(await owner.locator('.friends-panel').count(),0);assert.equal((await owner.evaluate(()=>window.rooms.social.session())).user,null);result.cases.push('logout-clears-real-ui-without-demo-fallback');
 assert.equal(result.rendererErrors,0);result.status='PASS';
}catch(e){result.status='FAIL';result.failure=e.message.slice(0,250);}
finally{
 for(const page of pages)await page.evaluate(()=>window.rooms.social.logout()).catch(()=>{});
 for(const app of clients)await app.close().catch(()=>{});for(const p of profiles)await rm(p,{recursive:true,force:true});
 if(channelId){try{const owned=await api(`/channels/${channelId}`);assert.equal(owned.name,name);assert.equal(owned.server,config.spaceId);await api(`/channels/${channelId}`,'DELETE');result.ownedChannelRemoved=true;}catch{result.ownedChannelRemoved=false;result.status='FAIL';}}
 await writeFile('infra/production/NATIVE_NO_DEMO_RESULTS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}if(result.status!=='PASS')process.exitCode=1;
