// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ActivityCommand} from '@rooms/activity-protocol';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {MusicDJ,MusicDJEntry,openMusicDJ,openRoomActivity} from '../apps/desktop/src/MusicDJ';
import {useCommunity} from '../apps/desktop/src/community';
const mocks=vi.hoisted(()=>({send:vi.fn(async(_command:ActivityCommand)=>{}),playlist:vi.fn(async()=>({url:'https://rooms.test/player/youtube?playlistId=PLabcdefgh123',nonce:'trusted-nonce'})),room:{roomId:'room',revision:1,participants:[],primary:null,timeline:{itemId:null,playing:false,positionSec:0,epoch:1,effectiveServerTimeMs:0,rate:1},queue:[]}}));
vi.mock('../apps/desktop/src/realtime',()=>({useRealtime:()=>({channelId:'room',roomName:'Friends'})}));
vi.mock('../apps/desktop/src/activity',()=>({useActivityRoom:()=>({room:mocks.room,status:'connected',busy:false,error:null,serverOffsetMs:0,send:mocks.send})}));
vi.mock('../apps/desktop/src/runtime-sources',()=>({activityBridge:()=>({youtubePlaylist:mocks.playlist,youtubePlayer:vi.fn()})}));
beforeEach(()=>{mocks.send.mockClear();mocks.playlist.mockClear();useCommunity.setState({user:{id:'self',username:'Self',displayName:'Self',avatar:null},serverUrl:'https://rooms.test'});openMusicDJ();});
afterEach(cleanup);
it('adds an official video then selects and starts the first empty-queue item',async()=>{
 render(<MusicDJ/>);fireEvent.change(screen.getByLabelText('DJ video veya playlist bağlantısı'),{target:{value:'https://youtu.be/PgHzDZJwGW8'}});fireEvent.click(screen.getByRole('button',{name:'Kuyruğa ekle'}));
 await waitFor(()=>expect(mocks.send).toHaveBeenCalledTimes(4));expect(mocks.send.mock.calls.map(call=>(call as unknown as [{type:string}])[0].type)).toEqual(['start','queue.add','queue.select','playback']);
 expect(mocks.send.mock.calls[1]?.[0]).toMatchObject({media:{kind:'youtube',videoId:'PgHzDZJwGW8'}});
});
it('imports only a playlist response from its actual source, origin and nonce',async()=>{
 render(<MusicDJ/>);fireEvent.change(screen.getByLabelText('DJ video veya playlist bağlantısı'),{target:{value:'https://youtube.com/playlist?list=PLabcdefgh123'}});fireEvent.click(screen.getByRole('button',{name:'Kuyruğa ekle'}));
 const frame=await screen.findByTitle('YouTube playlist önizlemesi') as HTMLIFrameElement;
 fireEvent(window,new MessageEvent('message',{origin:'https://rooms.test',source:frame.contentWindow,data:{type:'rooms-youtube',nonce:'wrong',event:'playlist',data:{ids:['PgHzDZJwGW8']}}}));expect(mocks.send).not.toHaveBeenCalled();
 fireEvent(window,new MessageEvent('message',{origin:'https://rooms.test',source:frame.contentWindow,data:{type:'rooms-youtube',nonce:'trusted-nonce',event:'playlist',data:{ids:['PgHzDZJwGW8','M7lc1UVf-VE']}}}));
 await waitFor(()=>expect(mocks.send).toHaveBeenCalledTimes(5));expect(mocks.send.mock.calls.filter(call=>(call as unknown as [{type:string}])[0].type==='queue.add')).toHaveLength(2);
 await waitFor(()=>expect(screen.queryByTitle('YouTube playlist önizlemesi')).toBeNull());
});

it('opens DJ from activity actions without changing the underlying route',()=>{const navigate=vi.fn();openRoomActivity('/youtube',navigate);expect(navigate).not.toHaveBeenCalled();openRoomActivity('/cinema',navigate);expect(navigate).toHaveBeenCalledWith('/cinema');});
it('legacy DJ route opens only the popup and restores the previous conversation',async()=>{
 render(<MemoryRouter initialEntries={['/youtube']}><Routes><Route path="/youtube" element={<MusicDJEntry returnTo="/chat"/>}/><Route path="/chat" element={<p>Current conversation</p>}/></Routes><MusicDJ/></MemoryRouter>);
 await screen.findByText('Current conversation');expect(screen.getByRole('dialog',{name:'DJ Recep'})).toBeTruthy();expect(screen.queryByText('DJ panelini aç')).toBeNull();
});
