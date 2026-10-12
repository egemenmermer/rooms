import {expect,it} from 'vitest';
import {activityOperationalReporter,type ActivityOperationalEvent} from '../apps/services/activities/operational-events';
import {ActivityStorageError} from '../apps/services/activities/storage-codec';
import {MemoryActivityRepository} from '../apps/services/activities/repository';
import {createActivityServer} from '../apps/services/activities/server';
it('reports only fixed categories and bounds repeated failures without content',()=>{
 const events:ActivityOperationalEvent[]=[];let now=1000;const report=activityOperationalReporter(event=>events.push(event),()=>now);
 report(new Error('JWT secret private message https://private/path'),'request');report(new Error('another private error'),'request');report(new ActivityStorageError('unsupported-version'),'sweep');now+=60000;report(new Error('secret'),'request');
 expect(events).toHaveLength(3);expect(events[1].category).toBe('storage-incompatible');expect(JSON.stringify(events)).not.toMatch(/JWT|secret|private|https/);
});
it('health probes persistence and exposes safe503 on failure without reading private rows',async()=>{
 const repository=new MemoryActivityRepository(),events:ActivityOperationalEvent[]=[];const probed=Object.assign(repository,{probe:async()=>{throw new Error('DB password secret');}});
 const app=await createActivityServer({repository:probed,onOperationalEvent:event=>events.push(event)});
 try{const result=await app.inject('/health');expect(result.statusCode).toBe(503);expect(result.json()).toMatchObject({ready:false,persistence:'unavailable'});expect(events[0].operation).toBe('health');expect(JSON.stringify([result.json(),events])).not.toContain('secret');}finally{await app.close();}
});
it('keeps the safe client response while recording incompatible storage separately',async()=>{
 const repository=Object.assign(new MemoryActivityRepository(),{load:async()=>{throw new ActivityStorageError('unsupported-version');}}),events:ActivityOperationalEvent[]=[];
 const app=await createActivityServer({repository,onOperationalEvent:event=>events.push(event),authorize:async()=>({userId:'qa',displayName:'QA',canCreate:true,canControl:true})});
 try{const result=await app.inject({url:'/v1/rooms/qa-room/activity',headers:{authorization:'Bearer fixture-only'}});expect(result.statusCode).toBe(503);expect(result.json()).toEqual({error:'ACTIVITY_SERVICE_UNAVAILABLE'});expect(events[0].category).toBe('storage-incompatible');}finally{await app.close();}
});
