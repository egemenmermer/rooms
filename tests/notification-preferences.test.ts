import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({handlers:new Map<string,Function>(),saved:'{}',fail:false,shown:[] as Record<string,unknown>[],focused:false}));
vi.mock('electron',()=>({app:{getPath:()=>'/fixture'},ipcMain:{handle:(name:string,handler:Function)=>mock.handlers.set(name,handler)},Notification:class{static isSupported(){return true;}constructor(options:Record<string,unknown>){mock.shown.push(options);}on(){}show(){}}}));
vi.mock('node:fs',()=>({readFileSync:()=>mock.saved,writeFileSync:(_path:string,value:string)=>{if(mock.fail)throw new Error('disk failure');mock.saved=value;},renameSync:vi.fn(),rmSync:vi.fn()}));
import {setupNotifications} from '../apps/desktop/electron/notifications';
import type {BrowserWindow,IpcMainInvokeEvent} from 'electron';
const event={} as IpcMainInvokeEvent;
const invoke=(name:string,value?:unknown)=>mock.handlers.get('rooms:notification-'+name)!(event,value);
function setup(){return setupNotifications(()=>({isFocused:()=>mock.focused}) as BrowserWindow,e=>{if(e!==event)throw new Error('untrusted');});}
beforeEach(()=>{mock.handlers.clear();mock.saved='{}';mock.fail=false;mock.shown=[];mock.focused=false;});
describe('native notification preferences',()=>{
 it('starts opt-out and silent and preserves content-free notification text',()=>{
  const service=setup();service.message();expect(mock.shown).toHaveLength(0);
  invoke('opt-in',true);service.message();expect(mock.shown).toEqual([{title:'ROOMS',body:'Topluluğunda yeni bir mesaj var.',silent:true}]);
 });
 it('enables system sound only by explicit preference and restores it',()=>{
  setup();invoke('sound',true);invoke('opt-in',true);const service=setup();service.message();
  expect(invoke('status')).toEqual({enabled:true,sound:true,supported:true});expect(mock.shown[0].silent).toBe(false);
 });
 it('does not opt in when changing sound and keeps focus/rate suppression',()=>{
  const service=setup();invoke('sound',true);service.message();expect(mock.shown).toHaveLength(0);
  invoke('opt-in',true);mock.focused=true;service.message();expect(mock.shown).toHaveLength(0);
  mock.focused=false;service.message();service.message();expect(mock.shown).toHaveLength(1);
 });
 it('keeps previous preferences on persistence failure',()=>{
  setup();mock.fail=true;expect(()=>invoke('sound',true)).toThrow('disk failure');expect(invoke('status').sound).toBe(false);
 });
 it('rejects untrusted senders and non-boolean values',()=>{
  setup();expect(()=>mock.handlers.get('rooms:notification-sound')!({},true)).toThrow('untrusted');
  for(const value of ['true',1,null,{}])expect(()=>invoke('sound',value)).toThrow('Invalid notification preference');
 });
});
