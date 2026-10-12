// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import {ArtifactPreview} from '../apps/desktop/src/ArtifactPreview';
import {useCommunity} from '../apps/desktop/src/community';
const taskId='d13b029f-684f-4376-b39d-0a8abf1a44bd',artifactId='68d27f86-ed85-4429-9eac-1ffef0ec90b1';
const metadata={id:artifactId,name:'notes.txt',mime:'text/plain',size:80};
const preview=vi.fn();
beforeEach(()=>{vi.clearAllMocks();history.replaceState(null,'','/');useCommunity.setState({user:{id:'owner',username:'owner',displayName:'Owner',avatar:null},status:'connected',serverUrl:'https://social.example'});window.rooms={agent:{previewArtifact:preview,downloadArtifact:vi.fn(async()=>false)}} as unknown as NonNullable<Window['rooms']>;});
afterEach(()=>cleanup());
function mount(){return render(<ArtifactPreview taskId={taskId} artifactId={artifactId} onClose={vi.fn()} notify={vi.fn()}/>);}
describe('passive artifact preview lifecycle',()=>{
 it('renders authored markup as literal text without executable elements or remote resources',async()=>{
  const text='<img src="https://remote.example/image" onerror="alert(1)"><script>bad()</script>';
  preview.mockResolvedValue({state:'text',taskId,artifact:metadata,text,encoding:'utf-8',sourcesAvailable:false});
  const {container}=mount();await screen.findByText(text);expect(container.querySelector('.artifact-preview-document')?.textContent).toBe(text);expect(container.querySelector('img,script,iframe')).toBeNull();
 });
 it('rejects old-account completion after identity changes',async()=>{
  let resolve!:(value:unknown)=>void;preview.mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValue({state:'unavailable',taskId,artifact:null,reason:'artifact-unavailable',sourcesAvailable:false});
  mount();act(()=>useCommunity.setState({user:{id:'other',username:'other',displayName:'Other',avatar:null}}));
  await act(async()=>resolve({state:'text',taskId,artifact:metadata,text:'former account document',encoding:'utf-8',sourcesAvailable:false}));
  await screen.findByText('Önizleme açılamadı');expect(screen.queryByText('former account document')).toBeNull();
 });
 it('clears a pending response on permission invalidation and requires explicit retry',async()=>{
  let resolve!:(value:unknown)=>void;preview.mockImplementation(()=>new Promise(r=>resolve=r));mount();
  act(()=>window.dispatchEvent(new Event('rooms:channel-access-invalidated')));
  await act(async()=>resolve({state:'text',taskId,artifact:metadata,text:'revoked document',encoding:'utf-8',sourcesAvailable:false}));
  expect(screen.queryByText('revoked document')).toBeNull();expect(screen.getByText('Dosya erişimi yeniden doğrulanmalı.')).toBeTruthy();expect(preview).toHaveBeenCalledTimes(1);
 });
 it('never calls native artifact APIs from an explicit development fixture',async()=>{
  history.replaceState(null,'','/?fixture=S57');mount();await waitFor(()=>expect(screen.getByText('Yerel örnekte dosya erişimi kapalı.')).toBeTruthy());expect(preview).not.toHaveBeenCalled();
 });
});
