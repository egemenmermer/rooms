import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {AgentRepository} from '../apps/services/agent/repository';
import {createAgentServer} from '../apps/services/agent/server';
import {createRemoteExecutor,executorCapabilities,type RemoteExecutorConfig} from '../apps/services/agent/worker';

const principal={userId:'initiator',roomIds:['room'],canManage:true};
async function fixture(config:Partial<RemoteExecutorConfig>,notify?:(value:any)=>Promise<void>){
 const directory=mkdtempSync(join(tmpdir(),'rooms-agent-op-'));const repository=new AgentRepository(directory,randomBytes(32));const executor=createRemoteExecutor({image:'test-worker:fixture',modelHomes:join(directory,'models'),allowNetwork:false,...config});
 const service=await createAgentServer({repository,authorize:async token=>{if(token!=='fixture-token')throw Object.assign(new Error('DENIED'),{statusCode:403});return principal;},reauthorize:async()=>principal,executor,deliverNotification:notify});await service.server.listen({host:'127.0.0.1',port:0});
 const request=async(path:string,body?:unknown)=>{const result=await fetch(service.server.listeningOrigin+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer fixture-token','content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:result.status,body:await result.json() as any};};
 const model=(await request('/v1/connections',{provider:'openrouter',label:'Injected provider fixture',model:'fixture-model',apiKey:'fixture-key-not-live'})).body;
 const settle=async()=>{for(let i=0;i<30;i++){await service.tick();if(!repository.data.tasks.some(t=>t.state==='running'||t.state==='queued'))break;await new Promise(resolve=>setTimeout(resolve,5));}};
 return{...service,directory,repository,request,model,settle,close:async()=>{await service.server.close();rmSync(directory,{recursive:true,force:true});}};
}
describe('durable operation approvals and resume over actual agent HTTP',()=>{
 it('pauses at a concrete file operation then resumes the identical stored tool call without another first model request',async()=>{
  let requests=0;
  const f=await fixture({runtime:{providerRequest:async()=>{requests++;return{choices:[{message:requests===1?{role:'assistant',content:null,tool_calls:[{id:'call-write',type:'function',function:{name:'write_file',arguments:JSON.stringify({name:'result.txt',text:'Actual persisted artifact'})}}]}:{role:'assistant',content:'Dosya üretildi.'}}]};}}});
  try{const task=(await f.request('/v1/tasks',{roomId:'room',prompt:'Write fixture file',modelConnectionId:f.model.id})).body;expect(task.state).toBe('awaiting-approval');await f.request(`/v1/tasks/${task.id}/approve`,{});await f.settle();const paused=f.repository.data.tasks[0];expect(paused.state).toBe('awaiting-approval');expect(paused.pendingApproval?.tool).toBe('write_file');expect(requests).toBe(1);expect(f.repository.data.checkpoints[task.id].operations[0].status).toBe('planned');
   await f.request(`/v1/tasks/${task.id}/approve`,{});await f.settle();expect(paused.state).toBe('completed');expect(requests).toBe(2);expect(readFileSync(join(f.directory,'workspaces',task.id,'result.txt'),'utf8')).toBe('Actual persisted artifact');expect(paused.artifacts).toHaveLength(1);expect(f.repository.data.memory).toHaveLength(1);await f.tick();expect(requests).toBe(2);
  }finally{await f.close();}
 });
 it('never repeats a started external effect; explicit verified result reconciliation resumes remaining model work',async()=>{
  let models=0,writes=0;
  const f=await fixture({runtime:{providerRequest:async()=>{models++;return{choices:[{message:models===1?{role:'assistant',content:null,tool_calls:[{id:'call-code',type:'function',function:{name:'run_code',arguments:'{"command":"fixture operation"}'}}]}:{role:'assistant',content:'Doğrulanan işlem tamamlandı.'}}]};},runWorker:async()=>{writes++;throw new Error('Injected acknowledgement loss after external effect');}}});
  try{await f.request('/v1/yolo',{value:true});const task=(await f.request('/v1/tasks',{roomId:'room',prompt:'Bounded test command',modelConnectionId:f.model.id})).body;await f.settle();expect(f.repository.data.tasks[0].state).toBe('interrupted');expect(writes).toBe(1);await f.tick();expect(writes).toBe(1);const op=f.repository.data.checkpoints[task.id].operations[0];expect(op.status).toBe('uncertain');
   expect((await f.request(`/v1/tasks/${task.id}/resolve-operation`,{operationId:op.id,resolution:'record-result',result:'Externally verified fixture result'})).status).toBe(200);await f.settle();expect(f.repository.data.tasks[0].state).toBe('completed');expect(writes).toBe(1);expect(models).toBe(2);
  }finally{await f.close();}
 });
 it('keeps connector/browser/research scopes disabled without exact configuration despite YOLO',()=>{
  const config={image:'fixture',modelHomes:'/tmp/not-used',allowNetwork:true};expect(executorCapabilities(config)).not.toContain('browser');expect(executorCapabilities(config)).not.toContain('research');expect(executorCapabilities(config)).not.toContain('github.write');
  expect(executorCapabilities({...config,networkName:'bridge',egressVerified:true,allowedResearchHosts:['example.org']})).not.toContain('research');expect(executorCapabilities({...config,networkName:'rooms-restricted-egress',egressVerified:true,allowedResearchHosts:['example.org']})).toContain('research');
 });
 it('delivers a mentioned task result via concrete durable outbox and does not blindly retry uncertain delivery',async()=>{
  let deliveries=0;
  const f=await fixture({runtime:{providerRequest:async()=>({choices:[{message:{role:'assistant',content:'Görev sonucu'}}]})}},async()=>{deliveries++;throw new Error('Injected lost reply acknowledgement');});
  try{await f.request('/v1/yolo',{value:true});await f.enqueueMention({userId:'initiator',roomId:'room',prompt:'Mention fixture',modelConnectionId:f.model.id,sourceMessageId:'message-1',channelId:'channel-1',platform:'discord'});await f.settle();expect(f.repository.data.tasks[0].state).toBe('completed');expect(f.repository.data.outbox[0].state).toBe('uncertain');expect(deliveries).toBe(1);await f.tick();expect(deliveries).toBe(1);expect((await f.request('/v1/outbox?roomId=room')).body[0].content).toContain('Görev sonucu');
  }finally{await f.close();}
 });
});
