/** Real database/service persistence test; identity checks are explicitly QA fixtures. */
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {PostgresActivityRepository} from '../../apps/services/activities/postgres';
import {createActivityServer} from '../../apps/services/activities/server';
export async function verifyPostgresActivity(url:string){
 const authorize=async(token:string)=>{if(!['qa-alice','qa-bob'].includes(token))throw new Error('QA authorization denied');return{userId:token,displayName:'QA fixture',canControl:true,canCreate:true};};
 let pool=new Pool({connectionString:url});let repository=new PostgresActivityRepository(pool);await repository.initialize();let app=await createActivityServer({repository,authorize,clock:()=>100000});let base=await app.listen({host:'127.0.0.1',port:0});const roomId=`qa-${randomUUID()}`;
 const command=async(user:string,revision:number,value:unknown,commandId=randomUUID())=>{const r=await fetch(`${base}/v1/rooms/${roomId}/activity/commands`,{method:'POST',headers:{Authorization:`Bearer ${user}`,'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:1,commandId,expectedRevision:revision,command:value})});assert.equal(r.status,200);return r.json();};
 try{await command('qa-alice',0,{type:'join'});await command('qa-bob',1,{type:'join'});await command('qa-alice',2,{type:'poll.create',pollId:'qa-poll',question:'QA persistence?',options:[{id:'yes',label:'Yes'},{id:'no',label:'No'}]});const id=randomUUID();await command('qa-bob',3,{type:'poll.vote',pollId:'qa-poll',optionId:'yes'},id);await app.close();await pool.end();
 pool=new Pool({connectionString:url});repository=new PostgresActivityRepository(pool);await repository.initialize();app=await createActivityServer({repository,authorize,clock:()=>100000});base=await app.listen({host:'127.0.0.1',port:0});const r=await fetch(`${base}/v1/rooms/${roomId}/activity`,{headers:{Authorization:'Bearer qa-alice'}});assert.equal(r.status,200);const state=await r.json();assert.equal(state.room.polls[0].votes['qa-bob'],'yes');const revision=state.room.revision;const replay=await command('qa-bob',3,{type:'poll.vote',pollId:'qa-poll',optionId:'yes'},id);assert.equal(replay.room.revision,revision);return{result:'PASS',checks:['real loopback PostgreSQL JSONB persistence','two authorized fixture HTTP clients','service and database-pool restart restores poll vote','idempotent command receipt survives restart'],authorization:'QA fixtures, not live Stoat'};
 }finally{await app.close();await pool.end();}
}
