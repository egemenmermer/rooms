// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DesktopBridge } from '@rooms/contracts';
const author={id:'user',username:'user',displayName:'User',avatar:null};
const message=(id:string,channelId='channel')=>({id,channelId,author,content:id,timestamp:'2026-10-11T12:00:00Z',editedTimestamp:null});
beforeEach(()=>vi.resetModules());afterEach(()=>{delete window.rooms;});
it('returns from another channel without clearing messages or refetching fresh data',async()=>{
 const messages=vi.fn(async(id:string)=>[message(id,id)]);
 window.rooms={social:{messages}} as unknown as DesktopBridge;
 const {useCommunity}=await import('../apps/desktop/src/community');
 useCommunity.setState({user:author,serverUrl:'https://example.test',status:'connected'});
 await useCommunity.getState().openChannel('one');await useCommunity.getState().openChannel('two');
 const returning=useCommunity.getState().openChannel('one');
 expect(useCommunity.getState().messages[0]?.id).toBe('one');expect(useCommunity.getState().loadingMessages).toBe(false);
 await returning;expect(messages).toHaveBeenCalledTimes(2);
});
it('deduplicates concurrent reads and keeps the newest selection populated',async()=>{
 let resolve!:(value:ReturnType<typeof message>[])=>void;
 const messages=vi.fn(()=>new Promise<ReturnType<typeof message>[]>(done=>{resolve=done;}));
 window.rooms={social:{messages}} as unknown as DesktopBridge;
 const {useCommunity}=await import('../apps/desktop/src/community');useCommunity.setState({user:author,serverUrl:'https://example.test'});
 const first=useCommunity.getState().openChannel('channel'),second=useCommunity.getState().openChannel('channel');
 resolve([message('received')]);await Promise.all([first,second]);
 expect(messages).toHaveBeenCalledTimes(1);expect(useCommunity.getState().messages.map(m=>m.id)).toEqual(['received']);expect(useCommunity.getState().loadingMessages).toBe(false);
});
