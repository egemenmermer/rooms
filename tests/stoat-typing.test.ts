import {describe,it,expect} from 'vitest';
import {StoatClient} from '@rooms/stoat';
type Internals={status:string;channels:Map<string,unknown>;users:Map<string,unknown>;socket:{readyState:number;send(data:string):void}|null;processPacket(packet:unknown):Promise<void>};
describe('normalized upstream typing events',()=>{
 it('emits known authorized channel/users only, without upstream private fields',async()=>{
  const client=new StoatClient('http://localhost','local-fixture-token');const internals=client as unknown as Internals;
  internals.channels.set('channel',{_id:'channel'});internals.users.set('friend',{_id:'friend',username:'Friend',private_token:'never-expose'});
  const events:unknown[]=[];client.subscribe(event=>events.push(event));
  await internals.processPacket({type:'ChannelStartTyping',id:'channel',user:'friend'});
  await internals.processPacket({type:'ChannelStopTyping',id:'channel',user:'friend'});
  await internals.processPacket({type:'ChannelStartTyping',id:'other',user:'friend'});
  await internals.processPacket({type:'ChannelStartTyping',id:'channel',user:'unknown'});
  await internals.processPacket({type:'ChannelStartTyping',id:'channel',user:'../friend'});
  expect(events).toHaveLength(2);expect(events[0]).toMatchObject({type:'TYPING_UPDATE',data:{channelId:'channel',active:true,user:{id:'friend',username:'Friend'}}});
  expect(events[1]).toMatchObject({data:{active:false}});expect(JSON.stringify(events)).not.toContain('never-expose');
 });
 it('sends only channel metadata while connected and rejects malformed or unknown channels',()=>{
  const client=new StoatClient('http://localhost','local-fixture-token');const internals=client as unknown as Internals;const sent:string[]=[];
  internals.channels.set('channel',{_id:'channel'});internals.socket={readyState:WebSocket.OPEN,send:data=>sent.push(data)};
  expect(client.typing('channel',true)).toBe(false);internals.status='connected';
  expect(client.typing('channel',true)).toBe(true);expect(client.typing('channel',false)).toBe(true);expect(client.typing('other',true)).toBe(false);expect(()=>client.typing('../channel',true)).toThrow();
  expect(sent.map(data=>JSON.parse(data))).toEqual([{type:'BeginTyping',channel:'channel'},{type:'EndTyping',channel:'channel'}]);
 });
});
