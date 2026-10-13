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
it('reselecting the current community preserves the selected conversation during metadata refresh',async()=>{
 let finish!:(channels:any[])=>void;
 const channels=vi.fn(()=>new Promise<any[]>(resolve=>{finish=resolve;}));
 window.rooms={social:{spaces:async()=>[{id:'space',name:'ROOMS'}],dms:async()=>[],readStates:async()=>[],channels}} as unknown as DesktopBridge;
 const {useCommunity}=await import('../apps/desktop/src/community');
 useCommunity.setState({user:author,serverUrl:'https://example.test',activeSpaceId:'space',activeChannelId:'second',channels:[{id:'first',type:0},{id:'second',type:0}] as any,messages:[message('kept','second')],loadingMessages:false});
 const switching=useCommunity.getState().openSpace('space');await vi.waitFor(()=>expect(channels).toHaveBeenCalledTimes(1));
 expect(useCommunity.getState().messages[0].id).toBe('kept');expect(useCommunity.getState().loadingMessages).toBe(false);
 finish([{id:'first',type:0},{id:'second',type:0}]);await switching;
 expect(useCommunity.getState().activeChannelId).toBe('second');expect(useCommunity.getState().messages[0].id).toBe('kept');
});
it('does not turn an in-flight empty history into a loaded empty cache',async()=>{
 let finish!:(items:ReturnType<typeof message>[])=>void;
 window.rooms={social:{messages:()=>new Promise(resolve=>{finish=resolve;})}} as unknown as DesktopBridge;
 const {useCommunity}=await import('../apps/desktop/src/community');useCommunity.setState({user:author,serverUrl:'https://example.test'});
 const first=useCommunity.getState().openChannel('channel');const second=useCommunity.getState().openChannel('channel');
 expect(useCommunity.getState().loadingMessages).toBe(true);
 finish([message('loaded')]);await Promise.all([first,second]);
 expect(useCommunity.getState().messages[0].id).toBe('loaded');
});
it('keeps a populated active conversation visible when its hot cache was not initialized',async()=>{
 let finish!:(items:ReturnType<typeof message>[])=>void;
 window.rooms={social:{messages:()=>new Promise(resolve=>{finish=resolve;})}} as unknown as DesktopBridge;
 const {useCommunity}=await import('../apps/desktop/src/community');
 useCommunity.setState({user:author,serverUrl:'https://example.test',activeChannelId:'channel',messages:[message('kept')],loadingMessages:false});
 const request=useCommunity.getState().openChannel('channel',true);
 expect(useCommunity.getState().messages.map(m=>m.id)).toEqual(['kept']);expect(useCommunity.getState().loadingMessages).toBe(false);
 finish([message('kept')]);await request;
});
