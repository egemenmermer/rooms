import { afterEach, expect, it, vi } from 'vitest';
const sdk=vi.hoisted(()=>({listRooms:vi.fn(),listParticipants:vi.fn(),grants:vi.fn()}));
vi.mock('livekit-server-sdk',async()=>({...await vi.importActual<any>('livekit-server-sdk'),RoomServiceClient:class{listRooms=sdk.listRooms;listParticipants=sdk.listParticipants;},AccessToken:class{constructor(){sdk.grants();}}}));
vi.mock('@rooms/stoat',async()=>{const real=await vi.importActual<any>('@rooms/stoat');return {...real,StoatClient:class{
 async getCurrentUser(){return {id:'viewer'};}
 async getChannel(id:string){if(id==='hidden')throw new real.StoatError(403,'DENIED');return {channel_type:'TextChannel',voice:{},server:'space'};}
 async getServer(){return {_id:'space',owner:'owner',default_permissions:String(1n<<20n)};}
 async getMember(){return {_id:{server:'space',user:'viewer'},roles:[]};}
}};});
import { createAccessServer } from '../apps/services/access/server';
import { TrackSource } from 'livekit-server-sdk';
const config={stoatUrl:'http://test.local',livekitUrl:'http://test.local',publicLivekitUrl:'ws://test.local',apiKey:'test',apiSecret:'test-secret-key-at-least-32-characters'};
afterEach(()=>vi.clearAllMocks());
it('shows actual SFU occupants to an authorized viewer without joining or issuing a grant',async()=>{
 sdk.listRooms.mockResolvedValue([{name:'stoat-channel-visible'}]);sdk.listParticipants.mockResolvedValue([{identity:'friend',name:'Friend',tracks:[{source:TrackSource.MICROPHONE,muted:false}],metadata:'private'}]);
 const server=await createAccessServer(config);try{
 const response=await server.inject({method:'POST',url:'/v1/media/directory',headers:{authorization:'viewer'},payload:{channelIds:['visible','empty','hidden']}});
 expect(response.statusCode).toBe(200);expect(response.json()).toEqual({rooms:[{channelId:'visible',participants:[{id:'friend',name:'Friend',muted:false}]},{channelId:'empty',participants:[]}]});
 expect(sdk.listRooms).toHaveBeenCalledWith(['stoat-channel-visible','stoat-channel-empty']);expect(sdk.grants).not.toHaveBeenCalled();expect(response.body).not.toContain('private');
 }finally{await server.close();}
});
it('rejects anonymous, malformed and oversized directory requests',async()=>{
 const server=await createAccessServer(config);try{
 for(const [authorization,channelIds,status] of [[undefined,['visible'],401],['viewer',['../hidden'],400],['viewer',Array(33).fill('visible'),400]] as const){
 const result=await server.inject({method:'POST',url:'/v1/media/directory',headers:authorization?{authorization}:{},payload:{channelIds}});expect(result.statusCode).toBe(status);}
 expect(sdk.listParticipants).not.toHaveBeenCalled();
 }finally{await server.close();}
});
