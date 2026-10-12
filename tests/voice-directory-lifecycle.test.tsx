// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { DesktopBridge } from '@rooms/contracts';
import { useCommunity } from '../apps/desktop/src/community';
import { useVoiceDirectory } from '../apps/desktop/src/voice-directory';
afterEach(()=>{cleanup();delete window.rooms;});
it('observes another room without requesting media access and rejects an old-account response',async()=>{
 let complete!:(value:any)=>void;
 const directory=vi.fn(()=>new Promise<any>(resolve=>{complete=resolve;}));const grant=vi.fn();
 window.rooms={media:{directory,grant}} as unknown as DesktopBridge;
 useCommunity.setState({serverUrl:'https://example.test',user:{id:'owner',username:'Owner',displayName:'Owner',avatar:null}});
 const hook=renderHook(()=>useVoiceDirectory(['room']));await waitFor(()=>expect(directory).toHaveBeenCalledTimes(1));
 act(()=>{useCommunity.setState({user:null});});
 await act(async()=>complete({rooms:[{channelId:'room',participants:[{id:'friend',name:'Private',muted:false}]}]}));
 expect(hook.result.current.rooms).toEqual([]);expect(grant).not.toHaveBeenCalled();
});
it('purges a revoked room immediately and fences the pending directory response',async()=>{
 let complete!:(value:any)=>void;window.rooms={media:{directory:()=>new Promise(resolve=>{complete=resolve;})}} as unknown as DesktopBridge;
 useCommunity.setState({serverUrl:'https://example.test',user:{id:'owner',username:'Owner',displayName:'Owner',avatar:null}});
 const hook=renderHook(()=>useVoiceDirectory(['room']));
 act(()=>window.dispatchEvent(new CustomEvent('rooms:channel-access-invalidated',{detail:{channelIds:['room']}})));
 await act(async()=>complete({rooms:[{channelId:'room',participants:[{id:'friend',name:'Private',muted:false}]}]}));
 expect(hook.result.current.rooms).toEqual([]);
});
