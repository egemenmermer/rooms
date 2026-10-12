// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import type {DesktopBridge} from '@rooms/contracts';
import {MusicDJ,MusicDJEntry,openMusicDJ,openRoomActivity} from '../apps/desktop/src/MusicDJ';
import {useCommunity} from '../apps/desktop/src/community';
import {queryClient} from '../apps/desktop/src/query-client';
const empty={channelId:'room',identity:'rooms-music-room',status:'disconnected',queue:[],currentId:null,positionSec:0,error:null};
vi.mock('../apps/desktop/src/realtime',()=>({useRealtime:()=>({channelId:'room',roomName:'Friends',status:'connected'})}));
vi.mock('../apps/desktop/src/activity',()=>({useActivityRoom:()=>({room:{primary:null},send:vi.fn()})}));
beforeEach(()=>{queryClient.clear();useCommunity.setState({user:{id:'self',username:'Self',displayName:'Self',avatar:null},serverUrl:'https://rooms.test'});openMusicDJ();});
afterEach(()=>{cleanup();queryClient.clear();delete window.rooms;});
it('sends a room bot MP3 command without creating an iframe or local audio player',async()=>{
 const command=vi.fn(async()=>({...empty,status:'playing',currentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',queue:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:'Song',durationSec:60}]}));window.rooms={music:{snapshot:async()=>empty,command}} as unknown as DesktopBridge;
 const view=render(<MusicDJ/>);await waitFor(()=>expect(screen.queryByText('Yükleniyor…')).toBeNull());fireEvent.change(screen.getByLabelText('YouTube veya ses bağlantısı'),{target:{value:'https://audio.test/song.mp3'}});fireEvent.click(screen.getByRole('button',{name:'Kuyruğa ekle'}));
 await waitFor(()=>expect(command).toHaveBeenCalledWith('room',{type:'add',url:'https://audio.test/song.mp3'}));await screen.findByRole('button',{name:'Duraklat'});expect(view.container.querySelector('iframe,audio')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'DJ panelini kapat'}));expect(command).toHaveBeenCalledTimes(1);
});
it('opens DJ without changing the current conversation and restores legacy route links',async()=>{
 window.rooms={music:{snapshot:async()=>empty}} as unknown as DesktopBridge;const navigate=vi.fn();openRoomActivity('/youtube',navigate);expect(navigate).not.toHaveBeenCalled();
 render(<MemoryRouter initialEntries={['/youtube']}><Routes><Route path="/youtube" element={<MusicDJEntry returnTo="/chat"/>}/><Route path="/chat" element={<p>Current conversation</p>}/></Routes><MusicDJ/></MemoryRouter>);
 await screen.findByText('Current conversation');expect(screen.getByRole('dialog',{name:'DJ Recep'})).toBeTruthy();expect(screen.queryByText('DJ panelini aç')).toBeNull();
});
