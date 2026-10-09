/** Explicit test-only identities. Not imported by the desktop or production services. */
import {createActivityServer} from '../../apps/services/activities/server';
import {MemoryActivityRepository} from '../../apps/services/activities/repository';
export async function startFixtureActivity(){const server=await createActivityServer({repository:new MemoryActivityRepository(),authorize:async(token,roomId)=>{if(!['qa-alice','qa-bob'].includes(token)||roomId!=='qa-room')throw new Error('QA fixture scope denied');return{userId:token,displayName:`QA fixture · ${token==='qa-alice'?'Alice':'Bob'}`,canCreate:true,canControl:true};}});await server.listen({host:'127.0.0.1',port:0});return server;}
