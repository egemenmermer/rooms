import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {postActivityCommand} from '../apps/desktop/electron/activity-http';
const envelope=()=>({protocolVersion:1,commandId:randomUUID(),expectedRevision:1,command:{type:'playback',playing:true,positionSec:12,rate:1}});
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
describe('native Activity command conflict recovery',()=>{
 it('refreshes rejected revision while preserving command identity and payload',async()=>{
  const input=envelope(),calls:{method:string;body:unknown}[]=[];
  const fetcher=vi.fn(async(_url:unknown,options?:RequestInit)=>{calls.push({method:options?.method??'GET',body:options?.body?JSON.parse(options.body as string):null});return calls.length===1?json({error:'REVISION_CONFLICT'},409):calls.length===2?json({protocolVersion:1,room:{roomId:'room',revision:4}}):json({protocolVersion:1,room:{roomId:'room',revision:5}});});
  const result=await postActivityCommand('https://example.test/activity','room','owned-test-token',input,fetcher as typeof fetch);
  expect(result.room.revision).toBe(5);expect(calls.map(c=>c.method)).toEqual(['POST','GET','POST']);expect(calls[2].body).toEqual({...input,expectedRevision:4});
 });
 it('never retries ambiguous network failure or unrelated conflict',async()=>{
  const network=vi.fn().mockRejectedValue(new Error('connection lost'));
  await expect(postActivityCommand('https://example.test/activity','room','owned-test-token',envelope(),network)).rejects.toThrow('connection lost');expect(network).toHaveBeenCalledTimes(1);
  const turn=vi.fn().mockResolvedValue(json({error:'NOT_YOUR_TURN'},409));
  await expect(postActivityCommand('https://example.test/activity','room','owned-test-token',envelope(),turn)).rejects.toMatchObject({code:'NOT_YOUR_TURN',status:409});expect(turn).toHaveBeenCalledTimes(1);
 });
 it('rejects foreign room snapshots and malformed IPC envelopes',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(json({error:'REVISION_CONFLICT'},409)).mockResolvedValueOnce(json({protocolVersion:1,room:{roomId:'other',revision:4}}));
  await expect(postActivityCommand('https://example.test/activity','room','owned-test-token',envelope(),fetcher)).rejects.toMatchObject({code:'INVALID_ACTIVITY_RESPONSE',status:502});expect(fetcher).toHaveBeenCalledTimes(2);
  const invalid=vi.fn();await expect(postActivityCommand('https://example.test/activity','room','owned-test-token',{...envelope(),extra:true},invalid)).rejects.toThrow();expect(invalid).not.toHaveBeenCalled();
 });
 it('bounds repeated precondition conflicts to three writes',async()=>{
  let posts=0;const fetcher=vi.fn(async(_url:unknown,options?:RequestInit)=>options?.method==='POST'?(posts++,json({error:'REVISION_CONFLICT'},409)):json({protocolVersion:1,room:{roomId:'room',revision:posts+1}}));
  await expect(postActivityCommand('https://example.test/activity','room','owned-test-token',envelope(),fetcher as typeof fetch)).rejects.toMatchObject({code:'REVISION_CONFLICT',status:409});expect(posts).toBe(3);expect(fetcher).toHaveBeenCalledTimes(5);
 });
});
