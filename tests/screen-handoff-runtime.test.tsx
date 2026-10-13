// @vitest-environment jsdom
import {act,cleanup,render} from '@testing-library/react';import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({voice:{channelId:'room'},community:{user:{id:'user'},serverUrl:'https://one.test'},status:'connected',read:vi.fn()}));
vi.mock('../apps/desktop/src/realtime',()=>({useVoiceContext:(selector:any)=>selector(f.voice),useRealtime:()=>({status:f.status,sharing:false}),stopScreen:vi.fn()}));
vi.mock('../apps/desktop/src/community',()=>({useCommunity:(selector:any)=>selector(f.community)}));
vi.mock('../apps/desktop/src/runtime-sources',()=>({mediaBridge:()=>({screenState:f.read})}));
import {ScreenHandoffRuntime,useScreenHandoff} from '../apps/desktop/src/screen-handoff';
const state={presenter:null,requests:[],reservation:null};
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();f.status='connected';f.community.serverUrl='https://one.test';f.read.mockResolvedValue(state);useScreenHandoff.getState().setChannel(null);});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('uses a quiet polling budget and backs off after a rejected request',async()=>{f.read.mockRejectedValueOnce(Error('429')).mockResolvedValue(state);render(<ScreenHandoffRuntime/>);await act(async()=>{});expect(f.read).toHaveBeenCalledTimes(1);await act(async()=>vi.advanceTimersByTimeAsync(9999));expect(f.read).toHaveBeenCalledTimes(1);await act(async()=>vi.advanceTimersByTimeAsync(1));expect(f.read).toHaveBeenCalledTimes(2);await act(async()=>vi.advanceTimersByTimeAsync(5000));expect(f.read).toHaveBeenCalledTimes(3);});
it('does not poll a selected room before its voice connection is established',async()=>{f.status='connecting';const ui=render(<ScreenHandoffRuntime/>);await act(async()=>vi.advanceTimersByTimeAsync(20000));expect(f.read).not.toHaveBeenCalled();f.status='connected';ui.rerender(<ScreenHandoffRuntime/>);await act(async()=>{});expect(f.read).toHaveBeenCalledOnce();});
it('fences an old server result and never overlaps pending reads',async()=>{let finish!:(value:any)=>void;f.read.mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));const ui=render(<ScreenHandoffRuntime/>);await act(async()=>vi.advanceTimersByTimeAsync(20000));expect(f.read).toHaveBeenCalledOnce();f.community.serverUrl='https://two.test';ui.rerender(<ScreenHandoffRuntime/>);await act(async()=>{});expect(f.read).toHaveBeenCalledTimes(2);await act(async()=>finish({...state,presenter:{userId:'old-server',leaseId:'old'}}));expect(useScreenHandoff.getState().value).toEqual(state);});
