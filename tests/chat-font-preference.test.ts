// @vitest-environment jsdom
import {afterEach,describe,expect,it} from 'vitest';
import {normalizeChatFontSize,useRooms} from '../apps/desktop/src/store';
const original=useRooms.getState().preferences;
afterEach(()=>{useRooms.setState({preferences:original});localStorage.clear();});
describe('chat font preference',()=>{
 it('bounds non-finite, fractional and out-of-range persisted values',()=>{
  expect([undefined,'18',NaN,Infinity].map(normalizeChatFontSize)).toEqual([15,15,15,15]);
  expect([10,14,16.7,40].map(normalizeChatFontSize)).toEqual([14,14,17,18]);
 });
 it('persists and restores the selected size without changing compact density',async()=>{
  useRooms.getState().setPreference('compact',true);
  useRooms.getState().setPreference('chatFontSize',18);
  const saved=localStorage.getItem('rooms-local-v1')!;
  useRooms.getState().setPreference('chatFontSize',14);
  localStorage.setItem('rooms-local-v1',saved);
  await useRooms.persist.rehydrate();
  expect(useRooms.getState().preferences.chatFontSize).toBe(18);
  expect(useRooms.getState().preferences.compact).toBe(true);
 });
 it('migrates a previous preference snapshot to the reference default',async()=>{
  localStorage.setItem('rooms-local-v1',JSON.stringify({version:1,state:{preferences:{compact:true}}}));
  await useRooms.persist.rehydrate();
  expect(useRooms.getState().preferences.chatFontSize).toBe(15);
 });
 it('sanitizes same-version stored corruption and runtime writes',async()=>{
  localStorage.setItem('rooms-local-v1',JSON.stringify({version:1,state:{preferences:{chatFontSize:1000}}}));
  await useRooms.persist.rehydrate();
  expect(useRooms.getState().preferences.chatFontSize).toBe(18);
  useRooms.getState().setPreference('chatFontSize',NaN);
  expect(useRooms.getState().preferences.chatFontSize).toBe(15);
 });
});
