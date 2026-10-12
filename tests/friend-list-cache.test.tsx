// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { DesktopBridge } from '@rooms/contracts';
import { queryClient } from '../apps/desktop/src/query-client';
import { useCommunity } from '../apps/desktop/src/community';
import { useFriendList } from '../apps/desktop/src/FriendsPage';
const self={id:'self',username:'self',displayName:'Self',avatar:null};
const friend={user:{id:'friend',username:'friend',displayName:'Friend',avatar:null,discriminator:'1234'},relationship:'incoming',status:'online'};
beforeEach(()=>{queryClient.clear();useCommunity.setState({user:self,serverUrl:'https://test.example',status:'connected'});});
afterEach(()=>{cleanup();queryClient.clear();delete window.rooms;});
it('shares concurrent reads and returns cached friends without another navigation loading screen',async()=>{
 const friends=vi.fn(async()=>[friend]);window.rooms={social:{friends}} as unknown as DesktopBridge;
 const one=renderHook(()=>useFriendList()),two=renderHook(()=>useFriendList());
 await waitFor(()=>expect(one.result.current.friends).toHaveLength(1));expect(friends).toHaveBeenCalledTimes(1);
 one.unmount();two.unmount();const returning=renderHook(()=>useFriendList());
 expect(returning.result.current.friends).toHaveLength(1);expect(returning.result.current.loading).toBe(false);expect(friends).toHaveBeenCalledTimes(1);
});
it('refreshes incoming requests on a gateway relationship event',async()=>{
 const friends=vi.fn().mockResolvedValueOnce([]).mockResolvedValue([friend]);window.rooms={social:{friends}} as unknown as DesktopBridge;
 const hook=renderHook(()=>useFriendList());await waitFor(()=>expect(hook.result.current.loading).toBe(false));
 act(()=>window.dispatchEvent(new Event('rooms:friends-changed')));
 await waitFor(()=>expect(hook.result.current.friends).toHaveLength(1));
});
it('does not put a delayed response into another account view',async()=>{
 let finish!:(value:any[])=>void;window.rooms={social:{friends:()=>new Promise(resolve=>{finish=resolve;})}} as unknown as DesktopBridge;
 const hook=renderHook(()=>useFriendList());await waitFor(()=>expect(finish).toBeTypeOf('function'));
 act(()=>useCommunity.setState({user:null}));await act(async()=>finish([friend]));
 expect(hook.result.current.friends).toEqual([]);
});
