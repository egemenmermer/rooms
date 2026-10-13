// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import type {DesktopBridge} from '@rooms/contracts';
import type {MediaSnapshot} from '@rooms/media';
import type {MusicSnapshot} from '../packages/shared-contracts/src/music';
import {MusicDJ,MusicDJEntry,openMusicDJ,openRoomActivity} from '../apps/desktop/src/MusicDJ';
import {useCommunity} from '../apps/desktop/src/community';
import {queryClient} from '../apps/desktop/src/query-client';
const empty:MusicSnapshot={channelId:'room',identity:'rooms-music-room',status:'disconnected',queue:[],currentId:null,positionSec:0,error:null};
const media=vi.hoisted(()=>({voice:undefined as unknown as MediaSnapshot&{channelId:string;roomName:string;busy:boolean},volume:vi.fn()}));
vi.mock('../apps/desktop/src/realtime',()=>({useRealtime:()=>media.voice,setParticipantVolume:media.volume}));
vi.mock('../apps/desktop/src/activity',()=>({useActivityRoom:()=>({room:{primary:null},send:vi.fn()})}));
beforeEach(()=>{media.volume.mockReset();media.voice={channelId:'room',roomName:'Friends',busy:false,status:'connected',roomId:'room',error:null,muted:true,deafened:false,camera:false,sharing:false,audioBlocked:false,participants:[],tracks:[],diagnostics:{bitrate:null,packetLoss:null,rtt:null}};queryClient.clear();useCommunity.setState({user:{id:'self',username:'Self',displayName:'Self',avatar:null},serverUrl:'https://rooms.test'});openMusicDJ();});
afterEach(()=>{cleanup();queryClient.clear();delete window.rooms;});
it('sends a room bot MP3 command without creating an iframe or local audio player',async()=>{
 const command=vi.fn(async()=>({...empty,status:'playing',currentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',queue:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:'Song',durationSec:60}]}));window.rooms={music:{snapshot:async()=>empty,command}} as unknown as DesktopBridge;
 const view=render(<MusicDJ/>);await waitFor(()=>expect(screen.queryByText('Yükleniyor…')).toBeNull());fireEvent.change(screen.getByLabelText('YouTube, Spotify, SoundCloud veya ses bağlantısı'),{target:{value:'https://audio.test/song.mp3'}});fireEvent.click(screen.getByRole('button',{name:'Kuyruğa ekle'}));
 await waitFor(()=>expect(command).toHaveBeenCalledWith('room',{type:'add',url:'https://audio.test/song.mp3'}));await screen.findByRole('button',{name:'Duraklat'});expect(view.container.querySelector('iframe,audio')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'DJ panelini kapat'}));expect(command).toHaveBeenCalledTimes(1);
});
it('opens DJ without changing the current conversation and restores legacy route links',async()=>{
 window.rooms={music:{snapshot:async()=>empty}} as unknown as DesktopBridge;const navigate=vi.fn();openRoomActivity('/youtube',navigate);expect(navigate).not.toHaveBeenCalled();
 render(<MemoryRouter initialEntries={['/youtube']}><Routes><Route path="/youtube" element={<MusicDJEntry returnTo="/chat"/>}/><Route path="/chat" element={<p>Current conversation</p>}/></Routes><MusicDJ/></MemoryRouter>);
 await screen.findByText('Current conversation');expect(screen.getByRole('dialog',{name:'DJ Recep'})).toBeTruthy();expect(screen.queryByText('DJ panelini aç')).toBeNull();
});

it('changes only the listener bot gain and keeps controller gain disabled without a bot',async()=>{
 const command=vi.fn();window.rooms={music:{snapshot:async()=>empty,command}} as unknown as DesktopBridge;
 const view=render(<MusicDJ/>);
 const gain=screen.getByRole('slider',{name:'Botun ses seviyesi'});expect((gain as HTMLInputElement).disabled).toBe(true);
 media.voice={...media.voice,participants:[{id:empty.identity,name:'DJ Recep',local:false,muted:false,speaking:true,camera:false,screen:false,volume:.6,quality:'excellent'}]};
 await waitFor(()=>expect(screen.queryByText('Yükleniyor…')).toBeNull());view.rerender(<MusicDJ/>);
 fireEvent.change(gain,{target:{value:'.25'}});expect(media.volume).toHaveBeenLastCalledWith(empty.identity,.25);
 fireEvent.click(screen.getByRole('button',{name:'Botun sesini kapat'}));expect(media.volume).toHaveBeenLastCalledWith(empty.identity,0);
 expect(command).not.toHaveBeenCalled();
});
it.each(['https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT','https://soundcloud.com/forss/flickermood'])('sends a provider reference through the same bot and displays YouTube playback: %s',async url=>{
 const command=vi.fn(async()=>({...empty,status:'playing',currentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',queue:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:'Matched song · YouTube',durationSec:213}]}));window.rooms={music:{snapshot:async()=>empty,command}} as unknown as DesktopBridge;
 const view=render(<MusicDJ/>);fireEvent.change(screen.getByLabelText('YouTube, Spotify, SoundCloud veya ses bağlantısı'),{target:{value:url}});fireEvent.click(screen.getByRole('button',{name:'Kuyruğa ekle'}));
 await waitFor(()=>expect(command).toHaveBeenCalledWith('room',{type:'add',url}));expect(await screen.findAllByText('Matched song · YouTube')).not.toHaveLength(0);expect(view.container.querySelector('iframe,audio')).toBeNull();
});
it('does not let a late pre-command snapshot hide the newly resolved queue item',async()=>{
 let finish!:(value:MusicSnapshot)=>void;const old=new Promise<MusicSnapshot>(resolve=>{finish=resolve;});
 const command=vi.fn(async()=>({...empty,status:'playing',currentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',queue:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:'Matched song · YouTube',durationSec:213}]}));
 window.rooms={music:{snapshot:()=>old,command}} as unknown as DesktopBridge;render(<MusicDJ/>);
 fireEvent.change(screen.getByLabelText('YouTube, Spotify, SoundCloud veya ses bağlantısı'),{target:{value:'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'}});fireEvent.click(screen.getByRole('button',{name:'Kuyruğa ekle'}));
 await screen.findAllByText('Matched song · YouTube');finish(empty);await waitFor(()=>expect(screen.queryByText('Kuyruk boş')).toBeNull());
});
