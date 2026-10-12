// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,useNavigate} from 'react-router-dom';
import {ChannelNotifications} from '../apps/desktop/src/ChannelNotifications';
import {useCommunity} from '../apps/desktop/src/community';
const original=useCommunity.getState();
beforeEach(()=>useCommunity.setState({user:{id:'owner',username:'owner',displayName:'Owner',avatar:null},serverUrl:'https://rooms.example',channels:[{id:'one',name:'One',type:0,spaceId:'space',topic:null},{id:'two',name:'Two',type:0,spaceId:'space',topic:null}],dms:[],activeChannelId:'one'}));
afterEach(()=>{cleanup();useCommunity.setState(original,true);delete window.rooms;});
function mount(status=vi.fn(async()=>({muted:false})),save=vi.fn(async()=>({muted:true}))){
 window.rooms={notifications:{channelStatus:status,setChannelMuted:save}} as unknown as NonNullable<Window['rooms']>;
 function Surface(){const navigate=useNavigate();return <><button onClick={()=>navigate('/settings?channel=two')}>Open Two</button><ChannelNotifications/></>;}
 render(<MemoryRouter initialEntries={['/settings?channel=one']}><Surface/></MemoryRouter>);return{status,save};
}
describe('channel notification settings',()=>{
 it('follows context-menu route selection and saves only the explicit current account/channel',async()=>{
  const {status,save}=mount();await waitFor(()=>expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByText('Open Two'));await waitFor(()=>expect(status).toHaveBeenLastCalledWith({serverUrl:'https://rooms.example',userId:'owner',channelId:'two'}));
  await waitFor(()=>expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(false));fireEvent.click(screen.getByRole('switch'));
  await waitFor(()=>expect(save).toHaveBeenCalledWith({serverUrl:'https://rooms.example',userId:'owner',channelId:'two',muted:true}));
 });
 it('does not display a late account receipt after identity replacement',async()=>{
  let resolve!:(value:{muted:boolean})=>void;const status=vi.fn(()=>new Promise<{muted:boolean}>(r=>{resolve=r;}));mount(status);
  const previous=resolve;act(()=>useCommunity.setState({user:{id:'other',username:'other',displayName:'Other',avatar:null}}));
  await act(async()=>previous({muted:true}));expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(true);
  await act(async()=>resolve({muted:false}));expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(false);
 });
});
