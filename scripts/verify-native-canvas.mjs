/** Actual packaged pointer/control/layout acceptance on owned public room data. */
import {_electron as electron} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const packaged=true;
const expectedVersion=JSON.parse(await readFile('package.json','utf8')).version;
const config=JSON.parse(await readFile('.local/production/test-accounts.json','utf8'));
const suffix=Date.now().toString(36),name=`qa-canvas-${suffix}`,clients=[],profiles=[],pages=[];
let channelId;
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
 result.sourceVersion=expectedVersion;result.buildKind=packaged?'packaged':'development';if(packaged){result.appVersion=expectedVersion;result.scope='Two actual packaged clients on one Mac against public Activity; real pointer strokes, color, eraser, undo and actual native window resizing. No network, voice, physical friends or full-evening claim.';}result.actualDesktopClients=2;assert.equal((await state()).room.primary,null);
 const [owner,guest]=pages;
 const write=async(page,text)=>{await page.getByRole('button',{name:'Metin ekle',exact:true}).click();await page.getByRole('textbox',{name:'Beyaz tahta notu'}).fill(text);await page.getByRole('button',{name:'Not ekle',exact:true}).click();await page.locator('.board-canvas text').getByText(text,{exact:true}).waitFor();};
 const foreign=`Owned guest protected ${suffix}`;await write(guest,foreign);await owner.locator('.board-canvas text').getByText(foreign,{exact:true}).waitFor();
 await owner.getByRole('button',{name:'Kalem',exact:true}).click();await owner.getByRole('button',{name:'Çizim rengi #65BC94',exact:true}).click();assert.equal(await owner.getByRole('button',{name:'Çizim rengi #65BC94',exact:true}).getAttribute('aria-pressed'),'true');
 const canvas=owner.locator('.board-canvas');await canvas.scrollIntoViewIfNeeded();const rect=await canvas.boundingBox();assert(rect);const x=rect.x+rect.width*.3,y=rect.y+rect.height*.45;
 await owner.mouse.move(x,y);await owner.mouse.down();await owner.mouse.move(x+rect.width*.2,y+rect.height*.1,{steps:12});await owner.mouse.up();await guest.locator('.board-canvas polyline').waitFor();
 const stroke=(await state()).room.whiteboard.find(e=>e.kind==='stroke');assert(stroke);assert.equal(stroke.color,'#65BC94');assert(stroke.points.length>=3&&stroke.points.length<=500);assert(stroke.points.every(([x,y])=>x>=0&&x<=1000&&y>=0&&y<=620));assert.equal(await guest.locator('.board-canvas polyline').getAttribute('stroke'),'#65BC94');result.cases.push('real-pointer-stroke-color-delivered-with-bounded-coordinates');
 await owner.getByRole('button',{name:'Öğe sil',exact:true}).click();await owner.locator('.board-canvas text').getByText(foreign,{exact:true}).click();assert.equal(await owner.getByRole('button',{name:`${foreign} öğesini sil`,exact:true}).isDisabled(),true);assert((await state()).room.whiteboard.some(e=>e.text===foreign));result.cases.push('foreign-note-protected-from-pointer-eraser');
 // Select an actual painted segment, not the polyline bounding box center.
 const boardRect=await canvas.boundingBox();assert(boardRect);const middle=stroke.points[Math.floor(stroke.points.length/2)];await owner.mouse.click(boardRect.x+middle[0]/1000*boardRect.width,boardRect.y+middle[1]/620*boardRect.height);await guest.locator('.board-canvas polyline').waitFor({state:'detached'});assert(await guest.locator('.board-canvas text').getByText(foreign,{exact:true}).isVisible());result.cases.push('own-painted-stroke-erased-and-foreign-note-preserved');
 await owner.getByRole('button',{name:'Geri al',exact:true}).click();await guest.locator('.board-canvas polyline').waitFor();assert.equal(await guest.locator('.board-canvas polyline').getAttribute('stroke'),'#65BC94');result.cases.push('erased-stroke-undo-delivered');
 await owner.getByRole('button',{name:'Metin ekle',exact:true}).click();await owner.getByRole('textbox',{name:'Beyaz tahta notu'}).fill('Owned narrow-window draft');
 result.layouts=[];
 for(const width of [1280,900]){
  const bounds=await clients[0].evaluate(({BrowserWindow},width)=>{const win=BrowserWindow.getAllWindows()[0];win.setBounds({width,height:800});return win.getContentBounds();},width);assert.equal(bounds.width,width);
  await owner.locator('.whiteboard-toolbar').scrollIntoViewIfNeeded();
  const layout=await owner.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};const selectors=['.whiteboard-toolbar','.board-colors','.whiteboard-toolbar .segmented','.board-actions','.board-note-form input'];return{windowWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,items:Object.fromEntries(selectors.map(selector=>[selector,rect(document.querySelector(selector))])),buttons:[...document.querySelectorAll('.board-actions button')].map(rect)};});
  assert(layout.documentWidth<=layout.windowWidth);for(const box of Object.values(layout.items))assert(box.x>=0&&box.right<=layout.windowWidth&&box.width>0,'control must fit within actual native viewport');for(const box of layout.buttons)assert(box.right<=layout.windowWidth);
  const groups=['.board-colors','.whiteboard-toolbar .segmented','.board-actions'].map(k=>layout.items[k]);for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){const a=groups[i],b=groups[j];assert(!(a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y),'toolbar groups must not overlap');}
  result.layouts.push({requestedWidth:width,bounds,...layout});await owner.screenshot({path:`docs/screenshots/production/whiteboard-native-${width}.png`});
 }
 result.cases.push('1280-and-900-native-window-controls-fit-without-overlap');assert.equal(await owner.getByRole('textbox',{name:'Beyaz tahta notu'}).inputValue(),'Owned narrow-window draft');result.cases.push('window-resizing-preserves-note-draft');assert.equal(result.rendererErrors,0);result.status='PASS';
}catch(error){result.status='FAIL';result.failure=error.message.slice(0,350);if(pages[0])await pages[0].screenshot({path:'.local/production/native-canvas-failure.png'}).catch(()=>{});}
finally{
 for(let i=0;i<clients.length;i++){if(pages[i])await pages[i].evaluate(()=>window.rooms.social.logout()).catch(()=>{});await clients[i].close().catch(()=>{});}
 for(const profile of new Set(profiles))await rm(profile,{recursive:true,force:true});
 if(channelId){try{const channel=await api(`/channels/${channelId}`);assert.equal(channel.name,name);assert.equal(channel.server,config.spaceId);await api(`/channels/${channelId}`,'DELETE');result.ownedChannelRemoved=true;}catch{result.status='FAIL';result.ownedChannelRemoved=false;}}
await writeFile('infra/production/NATIVE_CANVAS_RESULTS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}if(result.status!=='PASS')process.exitCode=1;
