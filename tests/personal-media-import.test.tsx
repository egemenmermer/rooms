// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {PersonalMedia,personalMediaEntry} from '../apps/desktop/src/PersonalMedia';
import {useCommunity} from '../apps/desktop/src/community';
import type {ProviderBridge,ProviderConnection,PersonalPlaylistSelection} from '../apps/desktop/electron/provider-contracts';
const original=useCommunity.getState();
const selection:PersonalPlaylistSelection={token:'ebec8431-5c02-42df-a153-36506b9fe499',fileName:'personal.m3u',channelCount:2};
const connection:ProviderConnection={id:'f747aa5e-567b-4722-8b99-6712a59b96cc',type:'playlist',name:'Own list',status:'connected',channelCount:2};
beforeEach(()=>useCommunity.setState({user:{id:'owner',username:'owner',displayName:'Owner',avatar:null},serverUrl:'https://social.example.test',status:'connected'}));
afterEach(()=>{cleanup();useCommunity.setState(original,true);delete window.rooms;vi.restoreAllMocks();});
function mount(overrides:Partial<ProviderBridge>={},initialDialog:'playlist'|'rd'|null='playlist'){
 let saved=false;const bridge={status:vi.fn(async()=>saved?[connection]:[]),pickPlaylist:vi.fn(async()=>selection),playlistFile:vi.fn(async()=>{saved=true;return connection;}),connectPlaylist:vi.fn(async()=>connection),connectXtream:vi.fn(async()=>({...connection,type:'xtream' as const})),channels:vi.fn(async()=>[]),...overrides} as unknown as ProviderBridge;
 window.rooms={providers:bridge} as unknown as NonNullable<Window['rooms']>;const notify=vi.fn();const rendered=render(<MemoryRouter><PersonalMedia notify={notify} initialDialog={initialDialog}/></MemoryRouter>);return {bridge,notify,...rendered};
}
const name=()=>fireEvent.change(screen.getByLabelText('Bağlantı adı'),{target:{value:'Own list'}});
describe('personal M3U native-file submission',()=>{
 it('opens the native chooser only after explicit action and submits a token without any file path or raw URL',async()=>{
  const {bridge}=mount();name();expect(bridge.pickPlaylist).not.toHaveBeenCalled();expect(bridge.playlistFile).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Dosya seç'}));await screen.findByText('personal.m3u · 2 kanal');expect(bridge.playlistFile).not.toHaveBeenCalled();
  const submit=screen.getByRole('button',{name:'Doğrula ve ekle'});expect(submit.hasAttribute('disabled')).toBe(false);fireEvent.click(submit);await waitFor(()=>expect(bridge.playlistFile).toHaveBeenCalledWith({name:'Own list',token:selection.token}));expect(bridge.connectPlaylist).not.toHaveBeenCalled();await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 });
 it('native cancellation leaves connection creation disabled until a URL or file is supplied',async()=>{
  const {bridge}=mount({pickPlaylist:vi.fn(async()=>null)});name();fireEvent.click(screen.getByRole('button',{name:'Dosya seç'}));await waitFor(()=>expect(bridge.pickPlaylist).toHaveBeenCalledTimes(1));expect(screen.queryByText('personal.m3u · 2 kanal')).toBeNull();expect(screen.getByRole('button',{name:'Doğrula ve ekle'}).hasAttribute('disabled')).toBe(true);expect(bridge.playlistFile).not.toHaveBeenCalled();
 });
 it('does not restore a late selection after the dialog closes',async()=>{
  let resolve!:(value:PersonalPlaylistSelection)=>void;const {bridge}=mount({pickPlaylist:vi.fn(()=>new Promise<PersonalPlaylistSelection|null>(r=>{resolve=r;}))});fireEvent.click(screen.getByRole('button',{name:'Dosya seç'}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Pencereyi kapat'}));await act(async()=>resolve(selection));expect(screen.queryByText('personal.m3u · 2 kanal')).toBeNull();expect(bridge.playlistFile).not.toHaveBeenCalled();
 });
 it('replaces a selected file with URL input and invokes the existing network-list method',async()=>{
  const {bridge}=mount();name();fireEvent.click(screen.getByRole('button',{name:'Dosya seç'}));await screen.findByText('personal.m3u · 2 kanal');fireEvent.change(screen.getByLabelText('Liste bağlantısı'),{target:{value:'https://provider.example.test/own.m3u'}});expect(screen.queryByText('personal.m3u · 2 kanal')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Doğrula ve ekle'}));await waitFor(()=>expect(bridge.connectPlaylist).toHaveBeenCalledWith({name:'Own list',url:'https://provider.example.test/own.m3u'}));expect(bridge.playlistFile).not.toHaveBeenCalled();
 });
 it('serializes submission and preserves failure without claiming saved success',async()=>{
  let reject!:(reason:Error)=>void;const {bridge,notify}=mount({playlistFile:vi.fn(()=>new Promise<ProviderConnection>((_,r)=>{reject=r;}))});name();fireEvent.click(screen.getByRole('button',{name:'Dosya seç'}));await screen.findByText('personal.m3u · 2 kanal');const submit=screen.getByRole('button',{name:'Doğrula ve ekle'});fireEvent.click(submit);fireEvent.click(submit);expect(bridge.playlistFile).toHaveBeenCalledTimes(1);await act(async()=>reject(new Error('Personal selection expired.')));expect(screen.getByRole('alert').textContent).toContain('Personal selection expired.');expect(screen.getByRole('dialog')).toBeTruthy();expect(notify).not.toHaveBeenCalled();
 });
 it('clears pending metadata when the social account changes',async()=>{
  let resolve!:(value:PersonalPlaylistSelection)=>void;const {bridge}=mount({pickPlaylist:vi.fn(()=>new Promise<PersonalPlaylistSelection|null>(r=>{resolve=r;}))});fireEvent.click(screen.getByRole('button',{name:'Dosya seç'}));await act(async()=>useCommunity.setState({user:{id:'other',username:'other',displayName:'Other',avatar:null}}));await act(async()=>resolve(selection));expect(screen.queryByText('personal.m3u · 2 kanal')).toBeNull();expect((screen.getByLabelText('Bağlantı adı') as HTMLInputElement).value).toBe('');expect(bridge.playlistFile).not.toHaveBeenCalled();
 });
 it('does not surface success from a former-account submission receipt',async()=>{
  let resolve!:(value:ProviderConnection)=>void;const {notify}=mount({playlistFile:vi.fn(()=>new Promise<ProviderConnection>(r=>{resolve=r;}))});name();fireEvent.click(screen.getByRole('button',{name:'Dosya seç'}));await screen.findByText('personal.m3u · 2 kanal');fireEvent.click(screen.getByRole('button',{name:'Doğrula ve ekle'}));await act(async()=>useCommunity.setState({user:null}));await act(async()=>resolve(connection));expect(notify).not.toHaveBeenCalled();expect(screen.queryByText('personal.m3u · 2 kanal')).toBeNull();
 });
});
describe('personal provider editing and cancellation',()=>{
 const openEdit=async()=>{fireEvent.click(await screen.findByRole('button',{name:/Own list Bağlı/}));fireEvent.click(await screen.findByRole('button',{name:'Bağlantıyı düzenle'}));};
 it('edits metadata without reading or resubmitting stored credentials',async()=>{
  const {bridge,notify}=mount({status:vi.fn(async()=>[connection]),updatePlaylist:vi.fn(async()=>({...connection,name:'Updated list'}))},null);await openEdit();expect((screen.getByLabelText('Liste bağlantısı') as HTMLInputElement).value).toBe('');fireEvent.change(screen.getByLabelText('Bağlantı adı'),{target:{value:'Updated list'}});fireEvent.click(screen.getByRole('button',{name:'Değişiklikleri kaydet'}));await waitFor(()=>expect(bridge.updatePlaylist).toHaveBeenCalledWith({id:connection.id,name:'Updated list'}));expect(bridge.connectPlaylist).not.toHaveBeenCalled();await waitFor(()=>expect(notify).toHaveBeenCalledWith('Bağlantı güncellendi.'));
 });
 it('keeps the editing dialog and old connection when validation fails',async()=>{
  const {bridge,notify}=mount({status:vi.fn(async()=>[connection]),updatePlaylist:vi.fn(async()=>{throw new Error('Replacement source unavailable.');})},null);await openEdit();fireEvent.change(screen.getByLabelText('Liste bağlantısı'),{target:{value:'https://provider.example.test/new.m3u'}});fireEvent.click(screen.getByRole('button',{name:'Değişiklikleri kaydet'}));await screen.findByText('Replacement source unavailable.');expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByLabelText('Bağlantı adı')).toHaveProperty('value','Own list');expect(notify).not.toHaveBeenCalled();expect(bridge.connectPlaylist).not.toHaveBeenCalled();
 });
 const rdGrant={userCode:'OWN-CODE',verificationUrl:'https://real-debrid.com/device',expiresAt:new Date(Date.now()+600000).toISOString(),interval:5};
 it('waits for the native cancellation receipt before claiming polling stopped',async()=>{
  let resolve!:()=>void;const {bridge}=mount({rdStart:vi.fn(async()=>rdGrant),rdPoll:vi.fn(async()=>({state:'pending' as const})),rdCancel:vi.fn(()=>new Promise<void>(r=>{resolve=r;}))},'rd');fireEvent.click(screen.getByRole('button',{name:'Bağlantıyı başlat'}));await screen.findByText('OWN-CODE');fireEvent.click(screen.getByRole('button',{name:'Onay kontrolünü durdur'}));expect(bridge.rdCancel).toHaveBeenCalledOnce();expect(screen.queryByText('Onay kontrolü durduruldu')).toBeNull();await act(async()=>resolve());expect(screen.queryByText('OWN-CODE')).toBeNull();expect(screen.getByRole('button',{name:'Tekrar başlat'})).toBeTruthy();
 });
 it('closing a pending RD start fences native approval and ignores its late grant',async()=>{
  let resolve!:(grant:typeof rdGrant)=>void;const {bridge}=mount({rdStart:vi.fn(()=>new Promise<typeof rdGrant>(r=>{resolve=r;})),rdCancel:vi.fn(async()=>{})},'rd');fireEvent.click(screen.getByRole('button',{name:'Bağlantıyı başlat'}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Pencereyi kapat'}));expect(bridge.rdCancel).toHaveBeenCalledOnce();await act(async()=>resolve(rdGrant));expect(screen.queryByText('OWN-CODE')).toBeNull();expect(screen.queryByRole('dialog')).toBeNull();
 });
});
describe('private media route boundary',()=>{
 it('resolves a direct edit after loading even when StrictMode replays mount cleanup',async()=>{
  const bridge={status:vi.fn(async()=>[connection]),channels:vi.fn(async()=>[])} as unknown as ProviderBridge;window.rooms={providers:bridge} as unknown as NonNullable<Window['rooms']>;
  render(<React.StrictMode><MemoryRouter initialEntries={[`/media?edit=${connection.id}`]}><PersonalMedia notify={vi.fn()}/></MemoryRouter></React.StrictMode>);
  await screen.findByRole('dialog',{name:'IPTV bağlantısını düzenle'});expect(screen.getByLabelText('Bağlantı adı')).toHaveProperty('value','Own list');expect(screen.getByLabelText('Liste bağlantısı')).toHaveProperty('value','');
 });
 it('accepts only opaque connection identities and named views/dialogs',()=>{
  expect(personalMediaEntry(`?view=channels&connection=${connection.id}&edit=${connection.id}&dialog=iptv`)).toMatchObject({initialView:'channels',initialDialog:'playlist',initialConnectionId:connection.id,initialEditId:connection.id});
  expect(personalMediaEntry('?view=https://secret.example/&connection=file:///private/list&edit=password&remove=token&dialog=unknown')).toEqual({initialView:'home',initialDialog:null,initialConnectionId:null,initialEditId:null,initialRemoveId:null});
 });
 it('direct channel entry resolves only an owned connection',async()=>{
  const bridge={status:vi.fn(async()=>[connection]),channels:vi.fn(async()=>[])} as unknown as ProviderBridge;window.rooms={providers:bridge} as unknown as NonNullable<Window['rooms']>;
  render(<MemoryRouter initialEntries={[`/media?view=channels&connection=${connection.id}`]}><PersonalMedia notify={vi.fn()}/></MemoryRouter>);await waitFor(()=>expect(bridge.channels).toHaveBeenCalledWith(connection.id));
 });
 it('does not fall back to another provider for a missing connection identity',async()=>{
  const bridge={status:vi.fn(async()=>[connection]),channels:vi.fn(async()=>[])} as unknown as ProviderBridge;window.rooms={providers:bridge} as unknown as NonNullable<Window['rooms']>;
  render(<MemoryRouter initialEntries={['/media?view=channels&connection=00000000-0000-4000-8000-000000000099']}><PersonalMedia notify={vi.fn()}/></MemoryRouter>);await screen.findByText('Bağlı kaynak bulunamadı');expect(bridge.channels).not.toHaveBeenCalled();
 });
});

describe('RD native receipt and status readback',()=>{
 const grant={userCode:'OWN-READBACK',verificationUrl:'https://real-debrid.com/device',expiresAt:new Date(Date.now()+600000).toISOString(),interval:5};
 const rd:ProviderConnection={id:'00000000-0000-4000-8000-000000000037',type:'real-debrid',name:'Own RD',status:'connected',channelCount:0};
 afterEach(()=>vi.useRealTimers());
 it('shows connected controls only after a confirmed native receipt and owned status readback',async()=>{
  let connected=false;
  const {bridge,notify}=mount({status:vi.fn(async()=>connected?[rd]:[]),rdStart:vi.fn(async()=>grant),rdPoll:vi.fn(async()=>{connected=true;return {state:'connected' as const};}),rdCancel:vi.fn(async()=>{})},'rd');
  await waitFor(()=>expect(bridge.status).toHaveBeenCalledOnce());vi.useFakeTimers();
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Bağlantıyı başlat'})));
  expect(screen.getByText('OWN-READBACK')).toBeTruthy();
  await act(async()=>vi.advanceTimersByTimeAsync(5000));
  expect(screen.getByRole('button',{name:'Kütüphanemi aç'})).toBeTruthy();expect(screen.getByRole('button',{name:'Bağlantıyı kaldır'})).toBeTruthy();expect(notify).toHaveBeenCalledWith('Kişisel Real-Debrid hesabın bağlandı.');
 });
 it('keeps a failed readback as an explicit error instead of claiming a usable connection',async()=>{
  let receipt=false;
  const {bridge,notify}=mount({status:vi.fn(async()=>{if(receipt)throw new Error('Status unavailable.');return[];}),rdStart:vi.fn(async()=>grant),rdPoll:vi.fn(async()=>{receipt=true;return{state:'connected' as const};}),rdCancel:vi.fn(async()=>{})},'rd');
  await waitFor(()=>expect(bridge.status).toHaveBeenCalledOnce());vi.useFakeTimers();
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Bağlantıyı başlat'})));
  await act(async()=>vi.advanceTimersByTimeAsync(5000));
  expect(screen.getByRole('alert').textContent).toContain('Bağlantı sonucu okunamadı.');expect(screen.queryByRole('button',{name:'Kütüphanemi aç'})).toBeNull();expect(notify).not.toHaveBeenCalled();
 });
 it('connected removal opens confirmation and never disconnects before its action',async()=>{
  let removed=false;
  const {bridge}=mount({status:vi.fn(async()=>removed?[]:[rd]),rdCancel:vi.fn(async()=>{}),disconnect:vi.fn(async()=>{removed=true;})},'rd');
  const remove=await screen.findByRole('button',{name:'Bağlantıyı kaldır'});fireEvent.click(remove);
  const confirmation=await screen.findByRole('dialog',{name:'Own RD bağlantısını kaldır?'});expect(bridge.disconnect).not.toHaveBeenCalled();
  fireEvent.click(within(confirmation).getByRole('button',{name:'Bağlantıyı kaldır'}));await waitFor(()=>expect(bridge.disconnect).toHaveBeenCalledWith(rd.id));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 });
});
