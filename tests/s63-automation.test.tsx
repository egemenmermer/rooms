// @vitest-environment jsdom
import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import AgentAutomation,{AgentAutomationSurface,type AgentAutomationProps} from '../apps/desktop/src/AgentAutomation';
import {getS63Fixture,S63_VARIANTS} from '../apps/desktop/src/dev/S63AutomationEntry';
import {useCommunity} from '../apps/desktop/src/community';
import {useVoiceContext} from '../apps/desktop/src/realtime';
import type {AgentAuthoritySnapshot,AgentBridge,AgentStatus} from '../packages/agent-contracts/src';

const mount=(element:React.ReactNode)=>render(<MemoryRouter>{element}</MemoryRouter>);
const production=(mode=false):AgentAutomationProps=>{const props=getS63Fixture(mode?'enabled':'default');return {...props,fixture:false,fixtureView:undefined,onChange:vi.fn(async()=>{})};};
const originalCommunity=useCommunity.getState(),originalRealtime=useVoiceContext.getState();
afterEach(()=>{cleanup();useCommunity.setState(originalCommunity,true);useVoiceContext.setState(originalRealtime,true);delete window.rooms;vi.restoreAllMocks();});

describe('S63 native approval mode surface',()=>{
 it('requires a review before enabling and cancellation performs no mutation',()=>{
  const props=production();mount(<AgentAutomationSurface {...props}/>);
  expect(props.onChange).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:/^YOLO/}));
  const dialog=screen.getByRole('dialog');expect(dialog.textContent).toContain('Sunucu genelindeki');expect(dialog.textContent).toContain('Bekleyen onaylı işler');
  expect(props.onChange).not.toHaveBeenCalled();fireEvent.click(within(dialog).getByRole('button',{name:'Vazgeç'}));expect(screen.queryByRole('dialog')).toBeNull();expect(props.onChange).not.toHaveBeenCalled();
 });
 it('sends the reviewed grant once and keeps the pending modal visible',async()=>{
  const props=production();let resolve!:()=>void;props.onChange=vi.fn(()=>new Promise<void>(r=>{resolve=r;}));mount(<AgentAutomationSurface {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:/^YOLO/}));const button=within(screen.getByRole('dialog')).getByRole('button',{name:'Sunucu genelinde YOLO’yu aç'});
  fireEvent.click(button);fireEvent.click(button);expect(props.onChange).toHaveBeenCalledTimes(1);expect(props.onChange).toHaveBeenCalledWith(true,props.authority);
  expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByRole('button',{name:'Değiştiriliyor…'}).hasAttribute('disabled')).toBe(true);
  await act(async()=>resolve());await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(screen.getByText('YOLO açıldı.')).toBeTruthy();
 });
 it('does not change the selected mode when mutation fails and retains the reviewed modal',async()=>{
  const props=production();props.onChange=vi.fn(async()=>{throw new Error('Mode change rejected');});mount(<AgentAutomationSurface {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:/^YOLO/}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Sunucu genelinde YOLO’yu aç'}));
  await waitFor(()=>expect(within(screen.getByRole('dialog')).getByRole('alert')).toBeTruthy());expect(screen.getByRole('button',{name:/^Normal/}).getAttribute('aria-pressed')).toBe('true');expect(screen.queryByText('YOLO açıldı.')).toBeNull();
 });
 it('returns to Normal through an explicit command without a second enable confirmation',async()=>{
  const props=production(true);mount(<AgentAutomationSurface {...props}/>);fireEvent.click(screen.getByRole('button',{name:/^Normal/}));
  await waitFor(()=>expect(props.onChange).toHaveBeenCalledWith(false,props.authority));expect(screen.queryByRole('dialog')).toBeNull();
 });
 it('keeps the real enabled value for a read-only user and disables both mode actions',()=>{
  const props=production(true);props.authority={...props.authority!,canManage:false};props.status={...props.status!,canManage:false};mount(<AgentAutomationSurface {...props}/>);
  const normal=screen.getByRole('button',{name:/^Normal/}),yolo=screen.getByRole('button',{name:/^YOLO/});expect(normal.hasAttribute('disabled')).toBe(true);expect(yolo.hasAttribute('disabled')).toBe(true);expect(yolo.getAttribute('aria-pressed')).toBe('true');fireEvent.click(yolo);expect(props.onChange).not.toHaveBeenCalled();
 });
 it.each(['identity','room','mode'])('does not expose a mismatched %s grant',kind=>{
  const props=production();props.authority={...props.authority!,...(kind==='identity'?{userId:'another-owner'}:kind==='room'?{roomId:'another-room'}:{yolo:true})};mount(<AgentAutomationSurface {...props}/>);
  expect(screen.queryByText('film-night-notes')).toBeNull();expect(screen.queryByRole('button',{name:/^YOLO/})).toBeNull();expect(props.onChange).not.toHaveBeenCalled();
 });
 it('clears private scopes, history and confirmation immediately on invalidation and drops a late receipt',async()=>{
  const props=production();let resolve!:()=>void;props.onChange=vi.fn(()=>new Promise<void>(r=>{resolve=r;}));mount(<AgentAutomationSurface {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:/^YOLO/}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Sunucu genelinde YOLO’yu aç'}));
  act(()=>window.dispatchEvent(new Event('rooms:channel-access-invalidated')));expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByText('film-night-notes')).toBeNull();expect(screen.queryByText('Deniz normal modu seçti')).toBeNull();
  await act(async()=>resolve());expect(screen.queryByText('YOLO açıldı.')).toBeNull();
 });
 it('closes confirmation when a refreshed grant changes its visible resource scope',()=>{
  const props=production();const rendered=mount(<AgentAutomationSurface {...props}/>);fireEvent.click(screen.getByRole('button',{name:/^YOLO/}));
  const authority={...props.authority!,scopes:[{kind:'github' as const,read:true,write:false,resources:['different-resource']}]};rendered.rerender(<MemoryRouter><AgentAutomationSurface {...props} authority={authority}/></MemoryRouter>);
  expect(screen.queryByRole('dialog')).toBeNull();expect(props.onChange).not.toHaveBeenCalled();expect(screen.getByText('İzinler veya mod değişti. Kapsamı yeniden incele.')).toBeTruthy();
 });
 it('does not display another owner audit or invent previous mode transitions',()=>{
  const props=production();props.audit={...props.audit!,limited:true,entries:[...props.audit!.entries,{at:'2026-10-08T18:00:00Z',userId:'other',action:'yolo-enabled',roomId:null,taskId:null},{at:'2026-10-08T18:00:00Z',userId:props.userId,action:'task-created',roomId:props.roomId,taskId:null}]};props.names.other='PRIVATE OTHER ACTOR';mount(<AgentAutomationSurface {...props}/>);
  expect(screen.queryByText(/PRIVATE OTHER ACTOR/)).toBeNull();expect(screen.queryByText(/Normal → YOLO|YOLO → Normal/)).toBeNull();expect(screen.getByText(/Kendi sunucu modu işlemlerin/).textContent).toContain('Son kayıtlar');
 });
 it('does not equate hidden resource names with absence of granted capability',()=>{
  const props=production();props.authority={...props.authority!,scopes:[{kind:'github',read:true,write:true,resources:[]}]};mount(<AgentAutomationSurface {...props}/>);expect(screen.getByText('Kaynak ayrıntıları bu erişimde sunulmuyor')).toBeTruthy();expect(screen.getByText('Okuma · Değişiklik')).toBeTruthy();
 });
 it.each(S63_VARIANTS)('renders the exact opt-in %s state without native mutation',variant=>{
  const props=getS63Fixture(variant);props.onChange=vi.fn(async()=>{});mount(<AgentAutomationSurface {...props}/>);expect(screen.getByText('DEMO · Yerel örnek. Sunucuya gönderilmez.')).toBeTruthy();
  if(variant==='confirm'){fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Sunucu genelinde YOLO’yu aç'}));expect(screen.queryByRole('dialog')).toBeNull();expect(screen.getByRole('button',{name:/^YOLO/}).getAttribute('aria-pressed')).toBe('true');}
  expect(props.onChange).not.toHaveBeenCalled();
 });
});

function configureContainer(authority:AgentAuthoritySnapshot,status:AgentStatus,overrides:Partial<AgentBridge>={}){
 useCommunity.setState({user:{id:authority.userId,username:'owner',displayName:'Owner',avatar:null},status:'connected',serverUrl:'https://social.example.test',activeChannelId:authority.roomId,activeSpaceId:null,spaces:[],channels:[]});useVoiceContext.setState({channelId:null});
 const bridge={status:vi.fn(async()=>status),authority:vi.fn(async()=>authority),audit:vi.fn(async()=>({scope:'own' as const,roomId:null,entries:[],limited:false})),yolo:vi.fn(async(value:boolean)=>({...status,yolo:value})),...overrides} as unknown as AgentBridge;
 window.rooms={agent:bridge} as typeof window.rooms;return bridge;
}
describe('S63 actual container preflight',()=>{
 it('reads back the changed server mode and own audit before reporting completion',async()=>{
  const p=production(),authority=p.authority!;let mode=false;
  const bridge=configureContainer(authority,p.status!,{status:vi.fn(async()=>({...p.status!,yolo:mode})),authority:vi.fn(async()=>({...authority,yolo:mode})),yolo:vi.fn(async(value:boolean)=>{mode=value;return {...p.status!,yolo:value};})});mount(<AgentAutomation/>);
  await screen.findByRole('button',{name:/^YOLO/});fireEvent.click(screen.getByRole('button',{name:/^YOLO/}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Sunucu genelinde YOLO’yu aç'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:/^YOLO/}).getAttribute('aria-pressed')).toBe('true'));expect(bridge.yolo).toHaveBeenCalledTimes(1);expect(bridge.audit).toHaveBeenCalledTimes(2);expect(screen.queryByRole('dialog')).toBeNull();
 });
 it('does not report confirmed success when the post-mutation server refresh fails',async()=>{
  const p=production(),authority=p.authority!;let reads=0;
  const bridge=configureContainer(authority,p.status!,{status:vi.fn(async()=>{if(++reads>=3)throw new Error('Refresh unavailable');return p.status!;})});mount(<AgentAutomation/>);
  await screen.findByRole('button',{name:/^YOLO/});fireEvent.click(screen.getByRole('button',{name:/^YOLO/}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Sunucu genelinde YOLO’yu aç'}));
  await screen.findByText('Refresh unavailable');expect(bridge.yolo).toHaveBeenCalledTimes(1);expect(screen.queryByText('YOLO açıldı.')).toBeNull();expect(screen.queryByRole('button',{name:/^YOLO/})).toBeNull();
 });

 it('reauthorizes before mutation and rejects a revoked manager grant',async()=>{
  const p=production(),authority=p.authority!;let reads=0;
  const bridge=configureContainer(authority,p.status!,{authority:vi.fn(async()=>++reads===1?authority:{...authority,canManage:false})});mount(<AgentAutomation/>);
  await screen.findByRole('button',{name:/^YOLO/});fireEvent.click(screen.getByRole('button',{name:/^YOLO/}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Sunucu genelinde YOLO’yu aç'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(screen.getByRole('button',{name:/^YOLO/}).hasAttribute('disabled')).toBe(true);expect(bridge.yolo).not.toHaveBeenCalled();expect(bridge.authority).toHaveBeenCalledTimes(3);
 });
 it('does not submit after the grant changes between review and preflight',async()=>{
  const p=production(),authority=p.authority!;let reads=0;
  const bridge=configureContainer(authority,p.status!,{authority:vi.fn(async()=>++reads===1?authority:{...authority,scopes:[{kind:'github' as const,read:true,write:true,resources:['changed-scope']}]})});mount(<AgentAutomation/>);
  await screen.findByRole('button',{name:/^YOLO/});fireEvent.click(screen.getByRole('button',{name:/^YOLO/}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Sunucu genelinde YOLO’yu aç'}));
  await screen.findByText('changed-scope');expect(bridge.yolo).not.toHaveBeenCalled();expect(screen.queryByText('YOLO açıldı.')).toBeNull();
 });
});
