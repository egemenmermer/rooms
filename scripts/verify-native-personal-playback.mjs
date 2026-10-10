/** Real macOS media picker operated through OS UI; private owned test file, not shipped artwork. */
import {_electron as electron} from '@playwright/test';
import {resolve} from 'node:path';
import {writeFile,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
const env={...process.env,ROOMS_PROFILE:`personal-picker-${Date.now()}`};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:resolve('release/mac-arm64/ROOMS.app/Contents/MacOS/ROOMS'),args:[],env});const profile=await app.evaluate(({app})=>app.getPath('userData'));
const result={at:new Date().toISOString(),platform:process.platform,arch:process.arch,appVersion:await app.evaluate(({app})=>app.getVersion()),packaged:true,scope:'One packaged native client, actual OS file selection of private owned test video; no shared Cinema or real provider claim.',rendererErrors:0};
try{
 const page=await app.firstWindow();page.on('pageerror',()=>result.rendererErrors++);await page.waitForSelector('.hero');await page.evaluate(()=>location.hash='/cinema');await page.waitForSelector('.cinema-empty');assert.equal(await page.locator('video').count(),0);
 await page.getByRole('button',{name:'Dosya seç',exact:true}).click();console.log('Awaiting actual macOS file selection of owned private QA video.');
 await page.waitForSelector('video',{timeout:180000});assert(await page.locator('video').getAttribute('src').then(s=>s.startsWith('rooms-media://')));
 await page.locator('.stage-play').click();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>0);
 await page.getByRole('button',{name:'Videoyu duraklat',exact:true}).click();await page.getByRole('slider',{name:'Oynatma konumu',exact:true}).fill('12');assert(Math.abs(await page.locator('video').evaluate(v=>v.currentTime)-12)<1);
 await page.getByRole('button',{name:'Oynatma ayarları',exact:true}).click();await page.getByRole('combobox',{name:'Oynatma hızı',exact:true}).selectOption('1.5');assert.equal(await page.locator('video').evaluate(v=>v.playbackRate),1.5);await page.keyboard.press('Escape');
 await page.screenshot({path:'docs/screenshots/production/personal-file-playback.png'});
 assert.equal(result.rendererErrors,0);result.checks=['empty until explicit selection','actual macOS file picker selection','native scoped rooms-media URL','actual playback advances','pause and seek to 12 seconds','speed changes to 1.5'];result.status='PASS';
}catch(e){result.status='FAIL';result.failure=e.message.slice(0,250);}
finally{await app.close();await rm(profile,{recursive:true,force:true});await writeFile('infra/production/NATIVE_PERSONAL_PLAYBACK_RESULTS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}if(result.status!=='PASS')process.exitCode=1;
