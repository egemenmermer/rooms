// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {useCommunity} from '../apps/desktop/src/community';
import {useChannelAccess} from '../apps/desktop/src/channel-access';
vi.mock('../apps/desktop/src/RealSocial',()=>({CommunityVoice:()=> <div>Voice participant stage</div>,CommunityChat:()=> <div>Actual room chat</div>}));
vi.mock('../apps/desktop/src/realtime',()=>({useRealtime:()=>({status:'connected',channelId:'voice',roomName:'Lounge',tracks:[],busy:false})}));
vi.mock('../apps/desktop/src/CommunitySettings',()=>({ChannelAccessState:()=> <div>Access denied</div>}));
import {RoomConversation} from '../apps/desktop/src/RoomConversation';
const original=useCommunity.getState();
afterEach(()=>{cleanup();useCommunity.setState(original);useChannelAccess.setState({checks:{}});});
function show(path:string){useCommunity.setState({activeChannelId:'voice',channels:[{id:'voice',name:'Lounge',type:2} as any]});return render(<MemoryRouter initialEntries={[path]}><RoomConversation notify={()=>{}} openLauncher={()=>{}} toggleMembers={()=>{}} membersVisible={false} search={()=>{}}/></MemoryRouter>);}
it('opens voice participant view by default and leaves chat an explicit destination',()=>{show('/voice');expect(screen.getByText('Voice participant stage')).toBeTruthy();expect(screen.queryByText('Actual room chat')).toBeNull();});
it('keeps actual room chat reachable without changing the voice view default',()=>{show('/chat');expect(screen.getByText('Actual room chat')).toBeTruthy();});
it('does not expose participant stage after selected-channel access denial',()=>{useChannelAccess.setState({checks:{voice:'denied'}});show('/voice');expect(screen.getByText('Access denied')).toBeTruthy();expect(screen.queryByText('Voice participant stage')).toBeNull();});
