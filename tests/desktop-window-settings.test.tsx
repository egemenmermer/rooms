// @vitest-environment jsdom
import React,{StrictMode} from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {DesktopWindowSettings} from '../apps/desktop/src/DesktopWindowSettings';
import type {DesktopWindowPreferences} from '@rooms/contracts';
const initial={keepOpenOnClose:false,warnOnVoiceClose:true,trayAvailable:true};
afterEach(()=>{cleanup();delete window.rooms;});
function bridge(status=vi.fn(async()=>initial),save=vi.fn(async()=>({...initial,keepOpenOnClose:true}))){window.rooms={desktopWindow:{status,setPreference:save}} as unknown as NonNullable<Window['rooms']>;return{status,save};}
const keep=()=>screen.getByRole('switch',{name:'Pencereyi kapatınca menü çubuğunda açık tut'});
describe('desktop window preferences UI',()=>{
 it('saves an explicit close preference and retains it when a later save fails',async()=>{
  const {save}=bridge();render(<DesktopWindowSettings/>);await waitFor(()=>expect(keep().hasAttribute('disabled')).toBe(false));fireEvent.click(keep());await waitFor(()=>expect(keep().getAttribute('aria-checked')).toBe('true'));expect(save).toHaveBeenCalledWith('keepOpenOnClose',true);
  save.mockRejectedValueOnce(new Error('write failed'));fireEvent.click(keep());await screen.findByRole('alert');expect(keep().getAttribute('aria-checked')).toBe('true');
 });
 it('ignores the stale status from StrictMode effect replay',async()=>{
  const resolvers:Array<(value:DesktopWindowPreferences)=>void>=[];bridge(vi.fn(()=>new Promise<DesktopWindowPreferences>(r=>resolvers.push(r))));render(<StrictMode><DesktopWindowSettings/></StrictMode>);
  expect(resolvers).toHaveLength(2);await act(async()=>resolvers[1]({...initial,keepOpenOnClose:true}));await act(async()=>resolvers[0](initial));expect(keep().getAttribute('aria-checked')).toBe('true');
 });
});
