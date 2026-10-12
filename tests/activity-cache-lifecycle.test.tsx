// @vitest-environment jsdom
import { act,renderHook,waitFor } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import type { RoomSnapshot } from '@rooms/activity-protocol';
const native=vi.hoisted(()=>({snapshot:vi.fn(),command:vi.fn()}));
vi.mock('../apps/desktop/src/runtime-sources',()=>({activityBridge:()=>native,developmentActivityState:()=>null}));
import { useCommunity } from '../apps/desktop/src/community';
import { useActivityRoom } from '../apps/desktop/src/activity';
afterEach(()=>{act(()=>useCommunity.setState({user:null,serverUrl:''}));native.snapshot.mockReset();native.command.mockReset();});
const room={roomId:'room',revision:1,participants:[],primary:null,queue:[],timeline:{}} as unknown as RoomSnapshot;
it('shares one request across consumers and retains the room when navigating back',async()=>{
 act(()=>useCommunity.setState({user:{id:'user',username:'User',displayName:'User',avatar:null},serverUrl:'https://server'}));
 native.snapshot.mockResolvedValue({room,serverTimeMs:Date.now()});
 const first=renderHook(()=>useActivityRoom('room'));const second=renderHook(()=>useActivityRoom('room'));
 await waitFor(()=>expect(first.result.current.room?.revision).toBe(1));expect(native.snapshot).toHaveBeenCalledTimes(1);
 first.unmount();second.unmount();
 const returning=renderHook(()=>useActivityRoom('room'));expect(returning.result.current.room?.revision).toBe(1);returning.unmount();
});
it('does not publish a delayed previous-account response into the current account',async()=>{
 const replies:Array<(value:unknown)=>void>=[];native.snapshot.mockImplementation(()=>new Promise(done=>replies.push(done)));
 act(()=>useCommunity.setState({user:{id:'old',username:'Old',displayName:'Old',avatar:null},serverUrl:'https://server'}));
 const hook=renderHook(()=>useActivityRoom('room'));
 act(()=>useCommunity.setState({user:{id:'new',username:'New',displayName:'New',avatar:null}}));
 await waitFor(()=>expect(replies).toHaveLength(2));
 await act(async()=>replies[0]({room,serverTimeMs:Date.now()}));
 expect(hook.result.current.room).toBeNull();
 await act(async()=>replies[1]({room:{...room,revision:2},serverTimeMs:Date.now()}));
 expect(hook.result.current.room?.revision).toBe(2);hook.unmount();
});

it('removes cached activity immediately when channel access is invalidated',async()=>{
 act(()=>useCommunity.setState({user:{id:'viewer',username:'Viewer',displayName:'Viewer',avatar:null},serverUrl:'https://server'}));
 native.snapshot.mockResolvedValueOnce({room,serverTimeMs:Date.now()}).mockRejectedValue(new Error('Access denied'));
 const hook=renderHook(()=>useActivityRoom('room'));
 await waitFor(()=>expect(hook.result.current.room).not.toBeNull());
 act(()=>window.dispatchEvent(new CustomEvent('rooms:channel-access-invalidated',{detail:{channelIds:['room']}})));
 expect(hook.result.current.room).toBeNull();
 await waitFor(()=>expect(hook.result.current.status).toBe('error'));
 expect(hook.result.current.room).toBeNull();hook.unmount();
});
