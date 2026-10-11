import { randomUUID } from 'node:crypto';
import { describe,it,expect } from 'vitest';
import { createActivityServer } from '../apps/services/activities/server';
import { MemoryActivityRepository } from '../apps/services/activities/repository';
import { StoatError } from '@rooms/stoat';
import type { ActivityCommand,ActivityResponse } from '../packages/activity-protocol/src/index';
describe('Holdem room-authorized HTTP projection',()=>{
 it('enforces room membership, explicit watching, hidden cards and stable next-hand buy-in across separate clients',async()=>{
  const app=await createActivityServer({repository:new MemoryActivityRepository(),authorize:async(userId,roomId)=>{if(roomId!=='private'||!['owner','guest','viewer'].includes(userId))throw new StoatError(403,'ROOM_ACCESS_DENIED');return{userId,displayName:userId,canControl:userId==='owner',canCreate:userId==='owner'};}});
  const base=await app.listen({host:'127.0.0.1',port:0}),url=base+'/v1/rooms/private/activity';let revision=0;
  const send=async(user:string,command:ActivityCommand)=>{const r=await fetch(url+'/commands',{method:'POST',headers:{authorization:`Bearer ${user}`,'content-type':'application/json'},body:JSON.stringify({protocolVersion:1,commandId:randomUUID(),expectedRevision:revision,command})});const data=await r.json() as ActivityResponse&{error?:string};if(r.ok)revision=data.room.revision;return{status:r.status,data};};
  const read=async(user:string)=>{const r=await fetch(url,{headers:{authorization:`Bearer ${user}`}});return{status:r.status,data:await r.json() as ActivityResponse};};
  try{
   for(const user of ['owner','guest','viewer'])expect((await send(user,{type:'join'})).status).toBe(200);
   expect((await send('owner',{type:'game.create',game:'holdem',holdem:{name:'Private table',capacity:6,smallBlind:20,bigBlind:40,minBuyIn:500,maxBuyIn:2000,initialChips:1000,spectatorsAllowed:true}})).status).toBe(200);
   expect((await send('guest',{type:'game.sit',seat:1,buyIn:500})).status).toBe(200);
   expect((await send('owner',{type:'game.action',action:'start'})).status).toBe(200);
   expect((await read('viewer')).data.room.game!.view.seats).toBeUndefined();
   const watched=await send('viewer',{type:'game.watch',watching:true});expect(watched.status).toBe(200);expect(watched.data.room.game!.view.spectators).toEqual([{userId:'viewer',name:'viewer'}]);expect(watched.data.room.game!.view.ownHand).toBeNull();expect((watched.data.room.game!.view.seats as {cards:unknown[]}[]).every(seat=>seat.cards.length===0)).toBe(true);
   const ownerView=(await read('owner')).data.room.game!.view.seats as {userId:string;cards:unknown[]}[];expect(ownerView.find(seat=>seat.userId==='owner')!.cards).toHaveLength(2);expect(ownerView.find(seat=>seat.userId==='guest')!.cards).toHaveLength(0);
   expect((await read('outsider')).status).toBe(403);expect((await send('outsider',{type:'game.watch',watching:true})).status).toBe(403);
   const joined=await send('viewer',{type:'game.sit',seat:3,buyIn:2000});expect(joined.status).toBe(200);expect(joined.data.room.game!.seats.find(seat=>seat.userId==='viewer')!.pendingNextHand).toBe(true);expect(joined.data.room.game!.view.spectators).toEqual([]);expect(joined.data.room.game!.view.ownHand).toBeNull();expect((joined.data.room.game!.view.seats as {userId:string}[]).some(seat=>seat.userId==='viewer')).toBe(false);
   expect(((await read('owner')).data.room.game!.view.seats as {cards:unknown[]}[])[0].cards).toEqual(ownerView[0].cards);
  }finally{await app.close();}
 });
});
