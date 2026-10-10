/** Actual packaged UI on a uniquely owned disposable Stoat text channel. */
import {_electron as electron} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
const config=JSON.parse(await readFile('.local/production/test-accounts.json','utf8'));
const staging=process.env.ROOMS_QA_GAME_STAGING==='1';
const blackjackAdvanced=process.env.ROOMS_QA_BLACKJACK_ADVANCED==='1';
assert(!(staging&&blackjackAdvanced),'Choose only one optional acceptance mode');
const output=blackjackAdvanced?'infra/production/NATIVE_BLACKJACK_ADVANCED_RESULTS.json':staging?'infra/production/NATIVE_GAME_STAGING_RESULTS.json':'infra/production/NATIVE_GAMES_RESULTS.json';
const suffix=Date.now().toString(36),name=`qa-games-${suffix}`;
const profile=await mkdtemp(join(tmpdir(),'rooms-native-games-'));let app,page,nativeProfile,channelId,ownedPrimary;
const result={at:new Date().toISOString(),platform:process.platform,arch:process.arch,packaged:true,actualPublicAuthorization:true,socialFixtures:false,scope:blackjackAdvanced?'Actual packaged native Blackjack double/split/hit and hand settlement on natural public production deals; not all rules, multi-player or physical friend acceptance.':'Native create/bots/start/action/close controls; not every legal rule or complete hand.',cases:[],rendererErrors:0};
const api=async(path,method='GET',body)=>{const response=await fetch(config.base+'/api'+path,{method,headers:{'x-session-token':config.owner.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});assert(response.ok,`Owned QA ${method} failed: ${response.status}`);return response.status===204?null:response.json();};
let lastReadAt=0;
const snapshot=async()=>{
 // Observation must not flood the shared production rate limiter. No write retry.
 const pause=Math.max(0,1500-(Date.now()-lastReadAt));if(pause)await page.waitForTimeout(pause);
 lastReadAt=Date.now();return page.evaluate(id=>window.rooms.activity.snapshot(id),channelId);
};
const current=async()=>{const state=(await snapshot()).room;assert(state.primary?.startedAt===ownedPrimary,'Do not touch an unrelated Activity');return state.game;};
const close=async()=>{await current();await page.getByRole('button',{name:'Masayı kapat',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Masayı kapat',exact:true}).click();await page.waitForSelector('.game-catalog');assert.equal((await snapshot()).room.primary,null);ownedPrimary=null;};
try{
 await build({entryPoints:['packages/games/src/batak.ts'],outfile:'.local/production/batak-ui-rules.mjs',bundle:true,platform:'node',format:'esm'});const {legalBatakCards}=await import(pathToFileURL(resolve('.local/production/batak-ui-rules.mjs')));
 // Routes/schema are verified against pinned upstream v0.15.5 servers/channel_create.rs and v0/channels.rs.
 const channel=await api(`/servers/${config.spaceId}/channels`,'POST',{type:'Text',name,description:'Owned disposable ROOMS native game acceptance. No fixtures.'});channelId=channel._id;assert(channelId);
 const env={...process.env,ROOMS_PROFILE:`native-games-${suffix}`};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({executablePath:resolve('release/mac-arm64/ROOMS.app/Contents/MacOS/ROOMS'),args:[`--user-data-dir=${profile}`],env});nativeProfile=await app.evaluate(({app})=>app.getPath('userData'));result.appVersion=await app.evaluate(({app})=>app.getVersion());page=await app.firstWindow();page.setDefaultTimeout(25000);page.on('pageerror',()=>result.rendererErrors++);
 await page.waitForSelector('.hero');await page.evaluate(()=>location.hash='/settings?tab=connections');await page.waitForSelector('.social-connection form');
 await page.locator('.social-connection input[type=url]').fill(config.base);await page.locator('.social-connection input[type=email]').fill(config.owner.email);await page.locator('.social-connection input[type=password]').fill(config.owner.password);await page.locator('.social-connection button[type=submit]').click();await page.waitForSelector('.signed-in-profile');await page.evaluate(()=>location.hash='/chat');await page.waitForSelector('.chat-transcript');await page.locator('.channels').getByRole('button',{name,exact:true}).click();await page.waitForSelector('.chat-transcript');
 assert.equal((await snapshot()).room.primary,null,'Owned channel must start without an Activity');await page.evaluate(()=>location.hash='/games');await page.waitForSelector('.game-catalog');
 const cases=[{kind:'holdem'},{kind:'blackjack'},...['ihaleli','esli','koz-maca','gommeli'].map(variant=>({kind:'batak',variant})),...[[false,false],[true,false],[false,true],[true,true]].map(([folding,teams])=>({kind:'101',folding,teams}))];
 const selectedCases=blackjackAdvanced?[{kind:'blackjack'}]:staging?[{kind:'101',folding:false,teams:false},{kind:'101',folding:false,teams:false}]:cases.filter(spec=>!process.env.ROOMS_QA_GAME_FILTER||spec.kind===process.env.ROOMS_QA_GAME_FILTER);
 for(const [caseIndex,spec] of selectedCases.entries()){
  const check={...spec,controls:[]};result.cases.push(check);result.stage=`${spec.kind}:${spec.variant??`${spec.folding??''}:${spec.teams??''}`}`;
  await page.locator(`.game-tile`).filter({has:page.locator(`.game-symbol`)}).filter({hasText:spec.kind==='holdem'?'Texas Hold’em':spec.kind==='blackjack'?'Blackjack':spec.kind==='batak'?'Batak':'101 Okey'}).click();
  if(spec.variant)await page.getByRole('dialog').locator('select').selectOption(spec.variant);
  if(spec.kind==='101'){await page.getByRole('dialog').getByLabel('Katlamalı',{exact:true}).setChecked(spec.folding);await page.getByRole('dialog').getByLabel('Eşli',{exact:true}).setChecked(spec.teams);}
  await page.getByRole('button',{name:'Masayı kur',exact:true}).click();await page.waitForSelector('.game-table');ownedPrimary=(await snapshot()).room.primary.startedAt;let game=await current();assert.equal(game.kind,spec.kind);check.controls.push('native-create');
  const bots=spec.kind==='holdem'?1:spec.kind==='blackjack'?0:spec.variant==='gommeli'?2:3;
  for(let i=0;i<bots;i++){await page.getByRole('button',{name:'Bot ekle',exact:true}).first().click();await page.waitForFunction(n=>document.querySelectorAll('.table-seat .avatar').length>=n,i+2);}
  check.labelledBotCount=bots;
  if(spec.kind==='blackjack'){await page.locator('.table-amount input').fill('40');await page.getByRole('button',{name:'Bahsi belirle',exact:true}).click();check.controls.push('set-virtual-bet');}
  await page.getByRole('button',{name:'Yeni eli başlat',exact:true}).click();await page.waitForSelector('.your-hand .playing-card, .your-hand .okey-tile');check.controls.push('start-hand');game=await current();
  if(spec.kind==='holdem'){
   await page.getByRole('button',{name:'Artır',exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.table-action-bar button')].some(b=>b.textContent==='Artır'&&!b.disabled));await page.locator('.table-amount input').fill('60');await page.getByRole('button',{name:'Artır',exact:true}).click();check.controls.push('raise');await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Pas / bırak'&&!b.disabled));await page.getByRole('button',{name:'Pas / bırak',exact:true}).click();await page.getByRole('button',{name:'Yeni eli başlat',exact:true}).waitFor();check.controls.push('fold-to-result');
   await page.getByRole('button',{name:'Masa geçmişi',exact:true}).click();await page.waitForSelector('.game-history');assert((await current()).history.length>0);check.controls.push('completed-history');
  }else if(spec.kind==='blackjack'){
   if(blackjackAdvanced){
    assert.equal(await page.locator('.your-hand .section-heading .eyebrow').textContent(),'SENİN ELİN');check.privateHandLabelCorrect=true;
    check.rounds=[];const covered=new Set();
    const ownPlayer=g=>{const p=g.view.players.find(p=>p.userId===config.owner.userId);assert(p);return p;};
    const nativeAction=async(label)=>{
     const previous=(await current()).view.revision;await page.getByRole('button',{name:label,exact:true}).click();
     for(let i=0;i<10;i++){const next=await current();if(next.view.revision>previous)return next;}
     throw Error('Native Blackjack command did not advance the owned round');
    };
    // Use natural production deals only. Never inject a shoe or mutate server cards.
    for(let round=0;round<40;round++){
     game=await current();const record={round:round+1,actions:[]};check.rounds.push(record);
     if(game.status==='playing'){
      const legal=game.view.legalActions,initial=structuredClone(ownPlayer(game));
      if(legal.includes('split')&&!covered.has('split')){
       game=await nativeAction('Ayır');const after=ownPlayer(game);
       assert.equal(after.hands.length,2);assert(after.hands.every(h=>h.split&&h.cards.length===2&&h.bet===initial.hands[0].bet));
       assert.equal(await page.locator('.blackjack-hand').count(),2);record.actions.push('split-two-rendered-hands');covered.add('split');
       await page.screenshot({path:'docs/screenshots/production/game-blackjack-split.png'});
      }else if(legal.includes('double')&&!covered.has('double')){
       game=await nativeAction('İkiye katla');const hand=ownPlayer(game).hands[0];assert.equal(hand.bet,initial.hands[0].bet*2);assert.equal(hand.cards.length,3);assert.notEqual(hand.state,'playing');record.actions.push('double-one-card-and-settle');covered.add('double');
      }else if(legal.includes('hit')&&!covered.has('hit')){
       game=await nativeAction('Kart al');assert.equal(ownPlayer(game).hands[0].cards.length,3);
       if(game.status==='playing'){assert(!game.view.legalActions.includes('double'));assert(!game.view.legalActions.includes('split'));assert.equal(await page.getByRole('button',{name:'İkiye katla',exact:true}).isEnabled(),false);assert.equal(await page.getByRole('button',{name:'Ayır',exact:true}).isEnabled(),false);record.postHitDisabled=true;}
       record.actions.push('hit-adds-card');covered.add('hit');
      }
      for(let i=0;game.status==='playing'&&i<4;i++){game=await nativeAction('Dur');record.actions.push('stand-active-hand');}
     }
     assert.equal(game.status,'finished');const player=ownPlayer(game),last=game.history.at(-1);assert(last);const settled=last.result.results.filter(r=>r.userId===config.owner.userId);assert.equal(settled.length,player.hands.length);
     record.settledHands=settled.length;record.status='PASS';console.log(JSON.stringify(record));
     if(covered.size===3){check.controls.push(...covered,'every-played-hand-settled');break;}
     if(round===39)throw Error('Natural deals did not expose every requested Blackjack action within 40 hands');
     await page.waitForTimeout(3000);const completedHands=game.history.length;
     await page.getByRole('button',{name:'Yeni eli başlat',exact:true}).click();
     let started=false;for(let i=0;i<10;i++){const next=await current();if(next.status==='playing'||next.history.length>completedHands){started=true;break;}}
     assert(started,'New native hand must be authoritatively playing or naturally settled before inspection');
    }
    assert(covered.has('double')&&covered.has('split')&&covered.has('hit'));
   }else{
   const stand=page.getByRole('button',{name:'Dur',exact:true});if(await stand.count()&&await stand.isEnabled()){await stand.click();check.controls.push('stand');}else check.naturalBlackjackCompleted=true;
   await page.getByRole('button',{name:'Yeni eli başlat',exact:true}).waitFor();assert((await current()).history.length>0);check.controls.push('completed-result');
   }
  }else if(spec.kind==='batak'){
   const deadline=Date.now()+30000;let played=false;
   while(Date.now()<deadline){game=await current();if(game.turn!==0){await page.waitForTimeout(300);continue;}
    if(game.view.stage==='bidding'){await page.getByRole('button',{name:'İhale ver',exact:true}).click();check.controls.push('bid');await page.waitForTimeout(1000);}
    else if(game.view.stage==='trump'){await page.locator('.suit-choice').last().click();check.controls.push('choose-trump');await page.locator('.suit-choice').first().waitFor({state:'detached'});}
    else if(game.view.stage==='bury'){for(let i=0;i<4;i++)await page.locator('.your-hand .playing-card').nth(i).click();await page.getByRole('button',{name:'Seçili 4 kartı göm',exact:true}).click();check.controls.push('bury-four');await page.getByRole('button',{name:'Seçili 4 kartı göm',exact:true}).waitFor({state:'detached'});}
    else if(game.view.stage==='playing'){const hand=game.view.hands.find(h=>h.seat===0).cards,card=legalBatakCards(hand,game.view.trick,game.view.trump)[0];assert(card);await page.locator('.your-hand .playing-card').nth(hand.findIndex(c=>c.id===card.id)).click();check.controls.push('play-legal-card');played=true;break;}
   }assert(played,'Native Batak action must reach an actual legal card');
  }else{
   if(staging){
    assert.equal(await page.locator('.staged-melds > div').count(),0,'A new table must not retain the previous staged groups');
    assert.equal(await page.locator('.your-hand .okey-tile.selected').count(),0,'A new table must clear tile selection');
    await page.waitForFunction(()=>!!document.querySelector('.your-hand .okey-tile:not(:disabled)'));
    const hand=page.locator('.your-hand .okey-tile');const n=await hand.count();
    await hand.nth(n-2).click();await hand.nth(n-1).click();
    await page.getByRole('button',{name:'Seçimi seri / çift yap',exact:true}).click();
    assert.equal(await page.locator('.staged-melds > div').count(),1);assert.equal(await page.locator('.staged-melds .okey-tile').count(),2);
    await page.getByRole('button',{name:'Hazır grubu kaldır',exact:true}).click();
    assert.equal(await page.locator('.staged-melds > div').count(),0);
    await hand.nth(n-2).click();await hand.nth(n-1).click();await page.getByRole('button',{name:'Seçimi seri / çift yap',exact:true}).click();
    check.controls.push('stage-two-tiles','remove-staged-group','restage-before-table-close','fresh-table-state');
   }
   assert.equal(game.view.rules.folding,spec.folding);assert.equal(game.view.rules.teams,spec.teams);check.rulesMatch=true;
   await page.waitForFunction(()=>!!document.querySelector('.your-hand .okey-tile:not(:disabled)'));if((await current()).view.stage==='draw'){await page.getByRole('button',{name:'Taş çek',exact:true}).click();check.controls.push('initial-draw');await page.waitForFunction(()=>document.querySelectorAll('.your-hand .okey-tile').length===22);}await page.locator('.your-hand .okey-tile').first().click();await page.getByRole('button',{name:'Seçili taşı at',exact:true}).click();check.controls.push('select-discard');const roundTripStarted=Date.now();
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Taş çek'&&!b.disabled));await page.getByRole('button',{name:'Taş çek',exact:true}).click();check.controls.push('draw');check.botRoundTripElapsedMs=Date.now()-roundTripStarted;await page.waitForFunction(()=>document.querySelectorAll('.your-hand .okey-tile').length===22);await page.waitForFunction(()=>!!document.querySelector('.your-hand .okey-tile:not(:disabled)'));await page.locator('.your-hand .okey-tile').first().click();await page.getByRole('button',{name:'Seçili taşı at',exact:true}).click();check.controls.push('discard-after-draw');
  }
  await page.locator('.main-view').evaluate(e=>e.scrollTop=0);await page.screenshot({path:`docs/screenshots/production/game-${blackjackAdvanced?'advanced-':staging?'staging-'+caseIndex+'-':''}${spec.kind}-${spec.variant??`${Number(spec.folding??false)}${Number(spec.teams??false)}`}.png`});await close();if(spec.kind==='101'&&spec.folding&&spec.teams){const stopped=(await snapshot()).room.game;assert.equal(stopped.status,'playing');await page.waitForTimeout(3500);assert.deepEqual((await snapshot()).room.game,stopped);result.closedTableFrozenAcrossSweeps=true;}check.controls.push('confirm-close');check.status='PASS';console.log(JSON.stringify(check));await page.waitForTimeout(5000);
 }
 assert.equal(result.rendererErrors,0);result.status='PASS';
}catch(error){result.status='FAIL';result.failure=error.message.slice(0,350);if(page){result.alerts=await page.locator('[role=alert]').allTextContents().catch(()=>[]);await page.screenshot({path:'.local/production/native-games-failure.png'}).catch(()=>{});}}
finally{
 if(ownedPrimary&&page){try{await close();result.ownedTableClosed=true;}catch{result.ownedTableClosed=false;result.status='FAIL';}}
 if(page)await page.evaluate(()=>window.rooms.social.logout()).catch(()=>{});if(app)await app.close().catch(()=>{});await rm(profile,{recursive:true,force:true});if(nativeProfile)await rm(nativeProfile,{recursive:true,force:true});
 if(channelId){try{const owned=await api(`/channels/${channelId}`);assert.equal(owned.name,name);assert.equal(owned.server,config.spaceId);await api(`/channels/${channelId}`,'DELETE');result.ownedChannelRemoved=true;}catch{result.ownedChannelRemoved=false;result.status='FAIL';}}
 await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}if(result.status!=='PASS')process.exitCode=1;
