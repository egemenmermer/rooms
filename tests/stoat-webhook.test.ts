/** SDK signature verification fixtures; no actual SFU lifecycle claims. */
import {createHash} from 'node:crypto';
import {AccessToken} from 'livekit-server-sdk';
import {describe,it,expect} from 'vitest';
import {createAccessServer} from '../apps/services/access/server';
const config={stoatUrl:'http://127.0.0.1:3999',livekitUrl:'http://127.0.0.1:7999',publicLivekitUrl:'ws://127.0.0.1:7999',apiKey:'fixture',apiSecret:'fixture-secret-at-least-32-characters'};
describe('LiveKit authenticated participant lifecycle',()=>{
 it('rejects unsigned and body-tampered hooks, accepts matching SDK-signed raw bytes',async()=>{const server=await createAccessServer(config);try{const body=JSON.stringify({event:'room_started',room:{name:'stoat-channel-fixture'},id:'fixture-event'});const token=new AccessToken(config.apiKey,config.apiSecret,{ttl:60});token.sha256=createHash('sha256').update(body).digest('base64');const signature=await token.toJwt();const request={method:'POST' as const,url:'/v1/media/webhook',headers:{'content-type':'application/webhook+json'},payload:body};expect((await server.inject(request)).statusCode).toBe(401);expect((await server.inject({...request,headers:{...request.headers,authorization:signature},payload:body+' '})).statusCode).toBe(401);expect((await server.inject({...request,headers:{...request.headers,authorization:signature}})).statusCode).toBe(200);}finally{await server.close();}});
});

import {createServer} from 'node:http';
it('removes an unknown reused-token participant after a valid signed arrival (HTTP SFU fixture)',async()=>{
 const removals:unknown[]=[];const sfu=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;if(req.url?.endsWith('/RemoveParticipant'))removals.push(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end('{}');});
 await new Promise<void>(resolve=>sfu.listen(0,'127.0.0.1',resolve));const port=(sfu.address() as {port:number}).port;
 const server=await createAccessServer({...config,livekitUrl:`http://127.0.0.1:${port}`});
 try{const body=JSON.stringify({event:'participant_joined',room:{name:'stoat-channel-channel'},participant:{identity:'unknown-user'},id:'unknown-arrival'});const token=new AccessToken(config.apiKey,config.apiSecret,{ttl:60});token.sha256=createHash('sha256').update(body).digest('base64');const response=await server.inject({method:'POST',url:'/v1/media/webhook',headers:{'content-type':'application/webhook+json',authorization:await token.toJwt()},payload:body});expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({removed:true});expect(removals).toEqual([{room:'stoat-channel-channel',identity:'unknown-user'}]);}
 finally{await server.close();await new Promise<void>(resolve=>sfu.close(()=>resolve()));}
});
