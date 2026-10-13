// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import type {DesktopBridge} from '@rooms/contracts';
import {CommunityChat} from '../apps/desktop/src/RealSocial';
import {useCommunity} from '../apps/desktop/src/community';
vi.mock('../apps/desktop/src/VoiceAvatar',()=>({VoiceAvatar:()=>null}));
vi.mock('../apps/desktop/src/realtime',()=>({stopSoundboard:vi.fn(),useRealtime:()=>({channelId:null,participants:[],status:'not-configured'})}));
vi.mock('../apps/desktop/src/activity',()=>({useActivityRoom:()=>({status:'not-configured',room:null})}));
const user={id:'alice',username:'alice',displayName:'Alice',avatar:null};
const message=(id:string,content=id)=>({id,channelId:'channel',author:user,content,timestamp:'2026-10-12T12:00:00Z',editedTimestamp:null,reactions:{'1f44d':['alice']}});
beforeEach(()=>{useCommunity.setState({user,serverUrl:'https://example.test',status:'connected',activeChannelId:'channel',channels:[],messages:[message('old')],typing:{},unread:{},loadingMessages:false,hasOlder:false});});
afterEach(()=>{cleanup();delete window.rooms;});
it('does not replace the next account conversation with a delayed reaction history',async()=>{
 let finish!:(items:ReturnType<typeof message>[])=>void;
 const messages=vi.fn(()=>new Promise<ReturnType<typeof message>[]>(resolve=>{finish=resolve;}));
 window.rooms={social:{react:async()=>{},messages}} as unknown as DesktopBridge;
 render(<MemoryRouter><CommunityChat notify={vi.fn()}/></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:'1f44d reaksiyonu · 1'}));await waitFor(()=>expect(messages).toHaveBeenCalledTimes(1));
 await act(async()=>{useCommunity.setState({user:{...user,id:'bob'},messages:[message('new','Next account conversation')]});finish([message('old','OLD ACCOUNT RESPONSE')]);});
 expect(screen.queryByText('OLD ACCOUNT RESPONSE')).toBeNull();expect(screen.getByText('Next account conversation')).toBeTruthy();
});
it('keeps gateway messages received during reaction refresh',async()=>{
 let finish!:(items:ReturnType<typeof message>[])=>void;
 const messages=vi.fn(()=>new Promise<ReturnType<typeof message>[]>(resolve=>{finish=resolve;}));
 window.rooms={social:{react:async()=>{},messages}} as unknown as DesktopBridge;
 render(<MemoryRouter><CommunityChat notify={vi.fn()}/></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:'1f44d reaksiyonu · 1'}));await waitFor(()=>expect(messages).toHaveBeenCalledTimes(1));
 await act(async()=>{useCommunity.setState({messages:[message('old'),message('arrived','New gateway message')]});finish([message('old')]);});
 expect(screen.getByText('New gateway message')).toBeTruthy();
});
