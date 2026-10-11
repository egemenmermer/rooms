import { expect, it } from 'vitest';
import { ConversationCache, reconcileMessages } from '../apps/desktop/src/conversation-cache';
import type { CommunityMessage } from '../apps/desktop/src/community';
const message=(id:string,content=id):CommunityMessage=>({id,channelId:'channel',author:{id:'user',username:'User',displayName:'User',avatar:null},content,timestamp:'2026-10-11T12:00:00Z',editedTimestamp:null});
it('keeps messages received or edited during a fetch and does not resurrect a deletion',()=>{
 const original=message('old'),deleted=message('deleted'),edited=message('old','edited'),arrived=message('arrived');
 expect(reconcileMessages([original,deleted],[original,deleted],[edited,arrived])).toEqual([edited,arrived]);
});
it('preserves pending sends when a history response arrives',()=>{
 const pending={...message('pending-local'),delivery:'pending' as const};
 expect(reconcileMessages([message('server')],[],[pending])).toContain(pending);
});
it('bounds memory and evicts the least recently visited channel',()=>{
 const cache=new ConversationCache();
 for(let i=0;i<20;i++)cache.put(String(i),{messages:[],hasOlder:true,fetchedAt:1});
 cache.get('0');cache.put('20',{messages:Array.from({length:300},(_,i)=>message(String(i))),hasOlder:true,fetchedAt:2});
 expect(cache.get('1')).toBeUndefined();expect(cache.get('0')).toBeDefined();expect(cache.get('20')?.messages).toHaveLength(200);
 cache.clear();expect(cache.get('0')).toBeUndefined();
});

it('retains paginated history preceding the refreshed latest page',()=>{
 const older={...message('older'),timestamp:'2026-10-10T12:00:00Z'},latest=message('latest');
 expect(reconcileMessages([latest],[older,latest],[older,latest])).toEqual([older,latest]);
});
