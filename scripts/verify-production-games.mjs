/** Full hands through public production APIs, real permissions and real wall clock. */
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const c=JSON.parse(await readFile('.local/production/test-accounts.json','utf8'));
await build({entryPoints:['packages/games/src/batak.ts'],outfile:'.local/production/batak-public-rules.mjs',bundle:true,platform:'node',format:'esm'});
const {legalBatakCards}=await import(pathToFileURL(resolve('.local/production/batak-public-rules.mjs')));
const endpoint=c.base+'/rooms-activities/v1/rooms/'+c.voiceId+'/activity';
const delay=ms=>new Promise(r=>setTimeout(r,ms));let lastRequest=0;
async function request(role,body){await delay(Math.max(0,600-(Date.now()-lastRequest)));lastRequest=Date.now();const r=await fetch(endpoint+(body?'/commands':''),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+c[role].token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});return{status:r.status,data:await r.json()};}
async function read(role='owner'){const r=await request(role);assert.equal(r.status,200);return r.data;}
async function send(role,command){const commandId=randomUUID();for(let attempt=0;attempt<5;attempt++){const s=await read(role);const r=await request(role,{protocolVersion:1,commandId,expectedRevision:s.room.revision,command});if(r.status===409&&r.data.error==='REVISION_CONFLICT')continue;assert.equal(r.status,200,r.data.error);return r.data;}throw Error('Concurrent revision did not converge');}
const results=[];
for(const spec of [{game:'holdem'},{game:'blackjack'},...['ihaleli','esli','koz-maca','gommeli'].map(variant=>({game:'batak',variant})),{game:'101'}]){
 const result={game:spec.game,...(spec.variant?{variant:spec.variant}:{})};
 try{
  const previous=await read();if(previous.room.primary)await send('owner',{type:'end'});
  await send('owner',{type:'join'});await send('guest',{type:'join'});
  await send('owner',{type:'game.create',...spec});await send('guest',{type:'game.sit',seat:1});
  const capacity=spec.game==='batak'&&spec.variant==='gommeli'?3:spec.game==='batak'||spec.game==='101'?4:2;
  for(let seat=2;seat<capacity;seat++)await send('owner',{type:'game.bot.add',seat});
  await send('owner',{type:'game.action',action:'start'});
  const ownerView=(await read()).room.game,guestView=(await read('guest')).room.game;
  if(spec.game==='holdem'){
   assert.equal(ownerView.view.seats.find(s=>s.userId===c.guest.userId).cards.length,0);
   assert.equal(guestView.view.seats.find(s=>s.userId===c.owner.userId).cards.length,0);
  }else if(spec.game!=='blackjack'){
   const key=spec.game==='101'?'tiles':'cards';assert.equal(ownerView.view.hands.find(s=>s.seat===1)[key].length,0);assert.equal(guestView.view.hands.find(s=>s.seat===0)[key].length,0);
  }
  result.hiddenHands=spec.game==='blackjack'?'public table hands by rules':true;
  const deadline=Date.now()+300000;let done=false;
  while(Date.now()<deadline){
   const state=(await read()).room.game;if(state.status==='finished'){assert.equal(state.history.length,1);result.completeHand=true;result.historyRecorded=true;done=true;break;}
   const seat=state.seats.find(s=>s.seat===state.turn);if(!seat||seat.bot){await delay(600);continue;}
   const role=seat.userId===c.owner.userId?'owner':'guest',game=(await read(role)).room.game;
   if(game.turn!==seat.seat)continue;
   const view=game.view;let command={type:'game.action',action:'check'};
   if(spec.game==='holdem')command.action=view.legalActions.includes('check')?'check':'call';
   else if(spec.game==='blackjack')command.action='stand';
   else if(spec.game==='batak'){
    const hand=view.hands.find(s=>s.seat===seat.seat).cards;
    if(view.stage==='bidding')command.action='pass';
    else if(view.stage==='trump'){command.action='trump';command.trump='spades';}
    else if(view.stage==='bury'){command.action='bury';command.tileIds=hand.slice(0,4).map(x=>x.id);}
    else{command.action='play';command.cardId=legalBatakCards(hand,view.trick,view.trump)[0].id;}
   }else{
    command.action=view.stage==='draw'?'draw':'discard';if(command.action==='discard')command.cardId=view.hands.find(s=>s.seat===seat.seat).tiles[0].id;
   }
   await send(role,command);
  }
  assert(done,'Full hand did not complete within real five-minute limit');result.status='PASS';
 }catch(error){result.status='FAIL';result.reason=error.message.slice(0,180);}
 results.push(result);await writeFile('infra/production/GAMES_RESULTS.json',JSON.stringify({at:new Date().toISOString(),kind:'actual-public-permissions-real-clock-full-hands',results,disconnectGraceAndReturnVerified:false},null,2)+'\n');console.log(JSON.stringify(result));
}
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
