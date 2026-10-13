import {expect,it} from 'vitest';
import {createAccessServer} from '../apps/services/access/server';
const config={stoatUrl:'http://127.0.0.1:1',livekitUrl:'http://127.0.0.1:1',publicLivekitUrl:'ws://127.0.0.1:1',apiKey:'test',apiSecret:'test-secret-key-at-least-32-characters'};
it('allows the private group polling budget and still enforces a bounded ingress limit',async()=>{
 const server=await createAccessServer(config);try{for(let i=0;i<600;i++)expect((await server.inject('/health')).statusCode).toBe(200);const blocked=await server.inject('/health');expect(blocked.statusCode).toBe(429);expect(blocked.json().error).toBe('RATE_LIMITED');expect(blocked.headers['retry-after']).toBeDefined();}finally{await server.close();}
});
it('background reads no longer exhaust the old60 limit before a voice grant, and authorization stays required',async()=>{
 const server=await createAccessServer(config);try{for(let i=0;i<120;i++)expect((await server.inject({method:'POST',url:'/v1/media/screen/state',payload:{channelId:'room'}})).statusCode).toBe(401);expect((await server.inject({method:'POST',url:'/v1/media/grant',payload:{channelId:'room'}})).statusCode).toBe(401);}finally{await server.close();}
});
it('keeps registration and invitation budgets separate from the raised media budget',async()=>{
 const server=await createAccessServer(config);try{for(let i=0;i<5;i++)expect((await server.inject({method:'POST',url:'/v1/auth/register',payload:{}})).statusCode).toBe(400);expect((await server.inject({method:'POST',url:'/v1/auth/register',payload:{}})).statusCode).toBe(429);for(let i=0;i<60;i++)expect((await server.inject('/v1/auth/invites/!')).statusCode).toBe(400);expect((await server.inject('/v1/auth/invites/!')).statusCode).toBe(429);for(let i=0;i<60;i++)expect((await server.inject({method:'POST',url:'/v1/auth/invites/!/join'})).statusCode).toBe(400);expect((await server.inject({method:'POST',url:'/v1/auth/invites/!/join'})).statusCode).toBe(429);expect((await server.inject('/health')).statusCode).toBe(200);}finally{await server.close();}
});
