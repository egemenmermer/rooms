import {_electron as electron} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const config=JSON.parse(await readFile('.local/production/test-accounts.json','utf8'));
const clients=[],profiles=[],errors=[];
const suffix=Date.now().toString(36),content=`Owned native production check ${suffix}`;
let delivered;
await mkdir('docs/screenshots/production',{recursive:true});
try{
 for(const role of ['owner','guest']){
  const profile=await mkdtemp(join(tmpdir(),'rooms-production-ui-'));profiles.push(profile);
  const env={...process.env,ROOMS_PROFILE:`production-${role}-${suffix}`};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env});clients.push(app);
  const page=await app.firstWindow();page.on('pageerror',()=>errors.push('renderer-error'));
  await page.waitForSelector('.hero');await page.evaluate(()=>location.hash='/settings?tab=connections');
  await page.waitForSelector('.social-connection form');
  await page.locator('.social-connection input[type=url]').fill(config.base);
  await page.locator('.social-connection input[type=email]').fill(config[role].email);
  await page.locator('.social-connection input[type=password]').fill(config[role].password);
  await page.locator('.social-connection button[type=submit]').click();
  await page.waitForSelector('.signed-in-profile',{timeout:30000});
  assert.equal(await page.locator('.social-connection .error-pane').count(),0);
  await page.evaluate(()=>location.hash='/chat');await page.waitForSelector('.chat-transcript');
 }
 const owner=await clients[0].firstWindow(),guest=await clients[1].firstWindow();
 await owner.locator('.chat-page textarea').fill(content);await owner.locator('.chat-page textarea').press('Enter');
 await guest.getByText(content,{exact:true}).waitFor({timeout:20000});
 const messages=await owner.evaluate(channel=>window.rooms.social.messages(channel),config.textId);
 delivered=messages.find(x=>x.content===content);assert(delivered);
 await owner.screenshot({path:'docs/screenshots/production/owner-chat.png'});
 await guest.screenshot({path:'docs/screenshots/production/guest-chat.png'});
 await owner.evaluate(()=>location.hash='/home');await owner.waitForSelector('.hero');
 await owner.screenshot({path:'docs/screenshots/production/home.png'});
 assert.equal(errors.length,0);
 const result={at:new Date().toISOString(),platform:process.platform,arch:process.arch,realPublicStoatLogin:true,actualClients:2,uiMessageSendAndDelivery:true,rendererErrors:errors.length,nativeDevicesVerified:false,sessionRestartVerified:false};
 await writeFile('infra/production/DESKTOP_RESULTS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{
 if(delivered&&clients[0])await (await clients[0].firstWindow()).evaluate(({channel,id})=>window.rooms.social.delete(channel,id),{channel:config.textId,id:delivered.id}).catch(()=>{});
 for(const app of clients)await app.close().catch(()=>{});
 for(const profile of profiles)await rm(profile,{recursive:true,force:true});
}
