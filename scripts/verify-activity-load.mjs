/** Six real public HTTP observers on two owned QA identities; no six-person/UI claim. */
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const config=JSON.parse(await readFile('.local/production/test-accounts.json','utf8'));
const seconds=Number(process.env.ROOMS_LOAD_SECONDS??150);
assert(Number.isInteger(seconds)&&seconds>=90&&seconds<=300);
const name=`qa-load-${Date.now().toString(36)}`;
const result={at:new Date().toISOString(),scope:'Six public HTTP long-poll transports, two distinct existing owned QA identities, 3-second observer cadence and one 3-second whiteboard writer. Not six identities, native rendering, voice or full-evening acceptance.',requestedSeconds:seconds,readers:[],writes:0,writeRateLimited:0,conflicts:0,failures:[]};
let channelId,latest,stopAt;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const api=async(path,method='GET',body)=>{
 const r=await fetch(config.base+'/api'+path,{method,headers:{'x-session-token':config.owner.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
 assert(r.ok,`Owned upstream operation failed: ${r.status}`);return r.status===204?null:r.json();
};
const request=async(role,body,revision)=>{
 const url=config.base+`/rooms-activities/v1/rooms/${channelId}/activity`+(body?'/commands':revision===undefined?'':`?afterRevision=${revision}&waitMs=20000`);
 const start=Date.now();const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${config[role].token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(26000)});
 const data=await r.json();if(r.ok&&(!latest||data.room.revision>=latest.room.revision))latest=data;
 return {status:r.status,data,elapsedMs:Date.now()-start};
};
const send=async(role,command)=>{
 const commandId=randomUUID();
 for(let i=0;i<3;i++){
  const r=await request(role,{protocolVersion:1,commandId,expectedRevision:latest.room.revision,command});
  if(r.status===409&&r.data.error==='REVISION_CONFLICT'){result.conflicts++;const state=await request(role);assert.equal(state.status,200);continue;}
  return r;
 }throw Error('Owned command revision did not converge');
};
try{
 const channel=await api(`/servers/${config.spaceId}/channels`,'POST',{type:'Text',name,description:'Owned disposable public Activity transport acceptance.'});channelId=channel._id;assert(channelId);
 const initial=await request('owner');assert.equal(initial.status,200);assert.equal(initial.data.room.primary,null);
 const outsider=await request('outsider');assert.equal(outsider.status,403);assert(!outsider.data.room);result.outsiderDenied=true;
 const anonymous=await fetch(config.base+`/rooms-activities/v1/rooms/${channelId}/activity`,{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(anonymous.status,401);await anonymous.arrayBuffer();result.anonymousDenied=true;
 for(const role of ['owner','guest'])assert.equal((await send(role,{type:'join'})).status,200);
 const start=Date.now();stopAt=start+seconds*1000;
 const observers=Array.from({length:6},(_,index)=>{
  const record={index,role:index%2?'guest':'owner',received:0,rateLimited:0,maxRequestMs:0,lastRevision:0};result.readers.push(record);
  return (async()=>{let revision=latest.room.revision;
   while(Date.now()<stopAt){
    const r=await request(record.role,undefined,revision);record.maxRequestMs=Math.max(record.maxRequestMs,r.elapsedMs);
    if(r.status===200){assert(r.data.room.revision>=revision);revision=r.data.room.revision;record.lastRevision=revision;record.received++;}
    else if(r.status===429)record.rateLimited++;
    else throw Error(`Observer ${index} returned ${r.status}`);
    await sleep(3000);
   }
  })();
 });
 const writer=(async()=>{let tick=0;
  while(Date.now()<stopAt){
   const r=await send('owner',{type:'whiteboard.put',element:{id:'owned-load-note',kind:'text',points:[[100,100]],text:`Owned acceptance tick ${++tick}`,color:'#B8CDFF',width:2}});
   if(r.status===200)result.writes++;else if(r.status===429)result.writeRateLimited++;else throw Error(`Owned writer returned ${r.status}`);
   await sleep(3000);
  }
 })();
 const outcomes=await Promise.allSettled([...observers,writer]);for(const o of outcomes)if(o.status==='rejected')result.failures.push(o.reason.message.slice(0,160));
 result.elapsedSeconds=Math.round((Date.now()-start)/1000);
 result.totalRateLimited=result.writeRateLimited+result.readers.reduce((n,r)=>n+r.rateLimited,0);
 assert.equal(result.failures.length,0);assert.equal(result.totalRateLimited,0,'Normal six-observer cadence must not share an exhausted bucket');assert(result.readers.every(r=>r.received>=20));assert(result.writes>=20);
 result.status='PASS';
}catch(error){result.status='FAIL';result.failure=error.message.slice(0,200);}
finally{
 if(channelId){try{const channel=await api(`/channels/${channelId}`);assert.equal(channel.name,name);assert.equal(channel.server,config.spaceId);await api(`/channels/${channelId}`,'DELETE');result.ownedChannelRemoved=true;}catch{result.ownedChannelRemoved=false;result.status='FAIL';}}
 await writeFile('infra/production/ACTIVITY_LOAD_RESULTS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
if(result.status!=='PASS')process.exitCode=1;
