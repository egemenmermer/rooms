// @vitest-environment jsdom
import {describe,expect,it,vi} from 'vitest';
import {applyAppearancePreferences} from '../apps/desktop/src/appearance-preferences';
import {useRooms} from '../apps/desktop/src/store';
function setup(overrides={}) {
 const root=document.createElement('html');
 const motion=Object.assign(new EventTarget(),{matches:false});
 const transparency=Object.assign(new EventTarget(),{matches:false});
 const match=vi.fn((query:string)=>query.includes('transparency')?transparency:motion);
 const preferences={...useRooms.getState().preferences,followSystemAccessibility:true,reduceMotion:false,reduceTransparency:false,...overrides};
 const stop=applyAppearancePreferences(preferences,root,match as unknown as typeof window.matchMedia);
 return {root,motion,transparency,preferences,stop};
}
describe('system accessibility preferences',()=>{
 it('reacts to system changes without rewriting saved manual preferences',()=>{
  const {root,motion,transparency,preferences,stop}=setup();
  motion.matches=true;motion.dispatchEvent(new Event('change'));
  transparency.matches=true;transparency.dispatchEvent(new Event('change'));
  expect(root.dataset.motion).toBe('reduce');expect(root.dataset.transparency).toBe('reduce');
  expect(preferences.reduceMotion).toBe(false);expect(preferences.reduceTransparency).toBe(false);
  motion.matches=false;motion.dispatchEvent(new Event('change'));
  expect(root.dataset.motion).toBe('full');stop();
 });
 it('ignores system events when following is disabled but preserves manual reductions',()=>{
  const {root,motion,transparency,stop}=setup({followSystemAccessibility:false,reduceTransparency:true});
  motion.matches=true;motion.dispatchEvent(new Event('change'));
  transparency.matches=false;transparency.dispatchEvent(new Event('change'));
  expect(root.dataset.motion).toBe('full');expect(root.dataset.transparency).toBe('reduce');stop();
 });
 it('keeps an explicit manual reduction when the system does not request it',()=>{
  const {root,stop}=setup({reduceMotion:true});expect(root.dataset.motion).toBe('reduce');stop();
 });
 it('unsubscribes old listeners when preferences or the app lifetime change',()=>{
  const {root,motion,stop}=setup();stop();motion.matches=true;motion.dispatchEvent(new Event('change'));
  expect(root.dataset.motion).toBe('full');
 });
});
