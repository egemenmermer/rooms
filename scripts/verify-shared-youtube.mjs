import {_electron as electron} from '@playwright/test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const config=JSON.parse(await readFile('.local/production/test-accounts.json','utf8'));
const clients=[],profiles=[],errors=[],launches=[];
const suffix=Date.now().toString(36),content=`Owned native production check ${suffix}`;
let delivered;
const result={at:new Date().toISOString(),actualDesktopClients:2,officialPlayers:true,sharedPlayback:false,pauseDelivered:false,rendererErrors:0};
try{
 for(const role of ['owner','guest']){
  const profile=await mkdtemp(join(tmpdir(),'rooms-production-ui-'));profiles.push(profile);
  const env={...process.env,ROOMS_PROFILE:`production-${role}-${suffix}`};delete env.ELECTRON_RUN_AS_NODE;
  const launch={args:['.',`--user-data-dir=${profile}`],env};launches.push(launch);
  const app=await electron.launch(launch);clients.push(app);profiles.push(await app.evaluate(({app})=>app.getPath('userData')));
  const page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',()=>errors.push('renderer-error'));
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
 for(const page of [owner,guest]){await page.evaluate(()=>location.hash='/youtube');await page.waitForSelector('.youtube-page');}
 await owner.locator('.shared-queue input').first().fill('M7lc1UVf-VE');
 await owner.getByRole('button',{name:'Ortak sıraya ekle',exact:true}).click();
 await owner.locator('.shared-queue-item').last().locator('button').first().click();
 const getPlayer=page=>page.frames().find(f=>f.url().includes('/rooms-activities/player/youtube'));
 for(const page of [owner,guest]){
  await page.waitForFunction(()=>document.querySelector('.youtube-stage iframe'));
  await page.waitForTimeout(4000);
  const official=page.frames().find(f=>f.url().startsWith('https://www.youtube.com/embed/'));
  assert(official,'Official embedded player must exist');
  const play=official.getByRole('button',{name:/^Play/}).first();
  if(await play.isVisible())await play.click();
 }
 const everyonePlay=owner.getByRole('button',{name:'Herkes için oynat',exact:true});
 if(await everyonePlay.isVisible())await everyonePlay.click();
 await owner.getByRole('button',{name:'Herkes için duraklat',exact:true}).waitFor({timeout:30000});
 for(const page of [owner,guest])await getPlayer(page).waitForFunction(()=>player.getPlayerState()===1&&player.getCurrentTime()>1,null,{timeout:30000});
 result.sharedPlayback=true;
 await owner.getByRole('button',{name:'Herkes için duraklat',exact:true}).click();
 for(const page of [owner,guest])await getPlayer(page).waitForFunction(()=>player.getPlayerState()===2,null,{timeout:30000});
 result.pauseDelivered=true;result.rendererErrors=errors.length;assert.equal(errors.length,0);
}catch(error){result.failure=error.message.slice(0,240);}
finally{
 await writeFile('infra/production/YOUTUBE_SHARED_RESULTS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 for(const app of clients){await (await app.firstWindow().catch(()=>null))?.evaluate(()=>window.rooms.social.logout()).catch(()=>{});await app.close().catch(()=>{});}
 for(const profile of profiles)await rm(profile,{recursive:true,force:true});
}

if(result.failure)process.exitCode=1;
