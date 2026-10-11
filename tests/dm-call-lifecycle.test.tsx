// @vitest-environment jsdom
import React from 'react';
import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest';
import { create } from 'zustand';
import { act,cleanup,render,screen,fireEvent } from '@testing-library/react';
import { MemoryRouter,Link } from 'react-router-dom';
import { useCommunity } from '../apps/desktop/src/community';
import { useDmCall,startDmCall,acceptDmCall,refreshDmCall,endDmCall,resetDmCalls,dmCallUnavailable,dmCallFailure } from '../apps/desktop/src/dm-call';
import DmCallRuntime from '../apps/desktop/src/DmCallRuntime';
import type { DmCallSession } from '../packages/shared-contracts/src/dm-call';
const mock=vi.hoisted(()=>({connect:vi.fn(async()=>{}),disconnect:vi.fn(async()=>{}),mic:vi.fn(async()=>{}),camera:vi.fn(async()=>{}),snapshot:{roomId:null as string|null,status:'connected',muted:true,camera:false,participants:[],tracks:[],audioBlocked:false}}));
vi.mock('../apps/desktop/src/runtime-sources',()=>({mediaProvider:()=>({connectRoom:mock.connect,disconnect:mock.disconnect,publishMic:mock.mic,publishCamera:mock.camera,snapshot:()=>mock.snapshot,setNoiseSuppression:async()=>{},deviceSelection:async()=>{}})}));
vi.mock('../apps/desktop/src/realtime',()=>({useVoiceContext:create(()=>({channelId:null,busy:false})),useRealtime:()=>mock.snapshot,toggleMic:vi.fn(),toggleCamera:vi.fn(),toggleDeafen:vi.fn(),startRoomAudio:vi.fn(),attachMediaTrack:vi.fn()}));
vi.mock('../apps/desktop/src/VoiceAvatar',()=>({VoiceAvatar:({name}:{name:string})=><span>{name}</span>}));
const caller={id:'123456',username:'alice',displayName:'Alice',avatar:null},callee={id:'654321',username:'bob',displayName:'Bob',avatar:null};
const ringing:DmCallSession={id:'767678ab-e2c0-4824-bd3c-187aa0094088',dmId:'999999',callerId:caller.id,calleeId:callee.id,callerName:'Alice',calleeName:'Bob',mode:'video',state:'ringing',reason:null,createdAt:1000,acceptedAt:null,expiresAt:45000};
const poll=vi.fn(),start=vi.fn(),respond=vi.fn(),grant=vi.fn();
beforeEach(async()=>{
 window.history.replaceState({},'','/');window.rooms={dmCalls:{poll,start,respond,grant}} as unknown as NonNullable<Window['rooms']>;
 respond.mockResolvedValue({...ringing,state:'ended'});await resetDmCalls();vi.clearAllMocks();mock.camera.mockResolvedValue(undefined);mock.snapshot.roomId=null;
 useCommunity.setState({user:caller,serverUrl:'https://local.example',dms:[{id:'999999',spaceId:null,type:1,name:'DM',topic:null,recipients:[caller,callee]}]});
 useDmCall.setState({call:null,busy:false,error:null,connected:false});poll.mockResolvedValue({call:null});start.mockResolvedValue(ringing);respond.mockResolvedValue({...ringing,state:'accepted',acceptedAt:2000});grant.mockResolvedValue({roomName:`rooms-dm-call-${ringing.id}`,token:'local-test-token',serverUrl:'ws://127.0.0.1:9999',expiresAt:'2026-01-01T00:00:00Z'});
});
afterEach(async()=>{cleanup();await resetDmCalls();vi.useRealTimers();});
describe('private call renderer lifetime and device consent',()=>{
 it('backs off idle signaling failures without global notices or disrupting voice; recovers automatically',async()=>{
  vi.useFakeTimers();poll.mockRejectedValueOnce(new Error("Error invoking remote method 'rooms:dm-call-poll': Error: Bu sunucuda özel arama servisi etkin değil."));
  await refreshDmCall();expect(useDmCall.getState().error).toBeNull();expect(dmCallUnavailable()).toBe('Bu sunucuda özel arama servisi etkin değil.');
  await refreshDmCall();expect(poll).toHaveBeenCalledOnce();expect(mock.disconnect).not.toHaveBeenCalled();
  vi.advanceTimersByTime(6000);await refreshDmCall();expect(poll).toHaveBeenCalledTimes(2);expect(useDmCall.getState().signalingError).toBeNull();expect(dmCallUnavailable()).toBeNull();
 });
 it('sanitizes Electron wrappers and clears capability failure when switching accounts',async()=>{
  expect(dmCallFailure(new Error("Error invoking remote method 'rooms:dm-call-start': Error: Arama sona erdi."))).toBe('Arama sona erdi.');
  poll.mockRejectedValueOnce(new Error('Servis kullanılamıyor.'));await refreshDmCall();useCommunity.setState({user:callee});await refreshDmCall();expect(poll).toHaveBeenCalledTimes(2);expect(useDmCall.getState().signalingError).toBeNull();
 });
 it('does not connect incoming invitations and publishes only microphone on explicit voice accept',async()=>{useCommunity.setState({user:callee});poll.mockResolvedValue({call:ringing});await refreshDmCall();expect(mock.connect).not.toHaveBeenCalled();expect(mock.mic).not.toHaveBeenCalled();expect(mock.camera).not.toHaveBeenCalled();await acceptDmCall(false);expect(mock.connect).toHaveBeenCalledOnce();expect(mock.mic).toHaveBeenCalledOnce();expect(mock.camera).not.toHaveBeenCalled();});
 it('outgoing video consent is honored only after acceptance; camera failure preserves connected voice',async()=>{mock.camera.mockRejectedValueOnce(new Error('no device'));await startDmCall('999999','video');expect(mock.connect).not.toHaveBeenCalled();poll.mockResolvedValue({call:{...ringing,state:'accepted',acceptedAt:2000}});await refreshDmCall();expect(mock.connect).toHaveBeenCalledOnce();expect(mock.camera).toHaveBeenCalledWith(true);expect(useDmCall.getState().connected).toBe(true);expect(useDmCall.getState().error).toContain('Sesli görüşme devam');});
 it('rejects a late accepted grant after explicit end without starting a device',async()=>{await startDmCall('999999','audio');let resolve!:(value:unknown)=>void;grant.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));poll.mockResolvedValue({call:{...ringing,state:'accepted'}});const pending=refreshDmCall();await vi.waitFor(()=>expect(grant).toHaveBeenCalledOnce());const end=endDmCall();resolve({roomName:'call',token:'test',serverUrl:'ws://127.0.0.1:9999'});await pending;await end;expect(mock.connect).not.toHaveBeenCalled();expect(mock.mic).not.toHaveBeenCalled();expect(useDmCall.getState().call).toBeNull();});
 it('keeps connected call over routes and clears the last deleted DM',async()=>{await startDmCall('999999','audio');poll.mockResolvedValue({call:{...ringing,state:'accepted'}});await refreshDmCall();const disconnects=mock.disconnect.mock.calls.length;render(<MemoryRouter initialEntries={['/dm-call']}><Link to="/chat">Chat route</Link><DmCallRuntime/></MemoryRouter>);fireEvent.click(screen.getByText('Chat route'));expect(screen.getByText('Görüşmeye dön')).toBeTruthy();expect(mock.disconnect).toHaveBeenCalledTimes(disconnects);await act(async()=>useCommunity.setState({dms:[]}));await vi.waitFor(()=>expect(useDmCall.getState().call).toBeNull());expect(mock.disconnect.mock.calls.length).toBeGreaterThan(disconnects);});
 it('revokes the previous account promptly and never autojoins a recovered accepted call',async()=>{await startDmCall('999999','audio');poll.mockResolvedValue({call:{...ringing,state:'accepted'}});await refreshDmCall();useCommunity.setState({user:callee});poll.mockResolvedValue({call:{...ringing,state:'accepted'}});await refreshDmCall();expect(mock.disconnect).toHaveBeenCalled();expect(mock.connect).toHaveBeenCalledOnce();expect(useDmCall.getState().connected).toBe(false);});
 it('does not poll or start native calls from a fixture window',async()=>{window.history.replaceState({},'','/?fixture=S12');await refreshDmCall();expect(poll).not.toHaveBeenCalled();await expect(startDmCall('999999','audio')).rejects.toThrow('Örnek görünüm');});
 it('revokes media on null server state after a server restart',async()=>{await startDmCall('999999','audio');poll.mockResolvedValueOnce({call:{...ringing,state:'accepted'}});await refreshDmCall();poll.mockResolvedValue({call:null});await refreshDmCall();expect(useDmCall.getState().call).toBeNull();expect(mock.disconnect).toHaveBeenCalled();});
});
