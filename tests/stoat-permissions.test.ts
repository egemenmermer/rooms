import { describe,it,expect } from 'vitest';
import {stoatChannelPermissions,StoatPermissions as P} from '../apps/services/access/stoat-permissions';
import {ulidTimestamp,validateInstanceUrl} from '@rooms/stoat';
const base={_id:'server',owner:'owner',default_permissions:String(P.VIEW_CHANNEL|P.CONNECT|P.SPEAK|P.VIDEO|P.LISTEN),roles:{}};
const channel={_id:'channel',server:'server',channel_type:'TextChannel',voice:{}};
const member={_id:{server:'server',user:'friend'},roles:[]};
describe('Stoat permission boundaries',()=>{
 it('requires exact server and member identity even for owner',()=>{expect(stoatChannelPermissions(base,{...channel,server:'other'},member,'owner')).toBe(0n);expect(stoatChannelPermissions(base,channel,member,'stranger')).toBe(0n);});
 it('uses ranked Stoat role overrides, with smaller ranks taking precedence',()=>{const s={...base,roles:{low:{rank:10,permissions:{d:String(P.SPEAK)}},high:{rank:1,permissions:{a:String(P.SPEAK)}}}};expect(stoatChannelPermissions(s,channel,{...member,roles:['high','low']},'friend')&P.SPEAK).toBe(P.SPEAK);});
 it('applies channel roles after server roles and removes all on view denial',()=>{const s={...base,roles:{role:{rank:1,permissions:{a:String(P.SPEAK)}}}};expect(stoatChannelPermissions(s,{...channel,role_permissions:{role:{d:String(P.SPEAK)}}},{...member,roles:['role']},'friend')&P.SPEAK).toBe(0n);expect(stoatChannelPermissions(base,{...channel,default_permissions:{d:String(P.VIEW_CHANNEL)}},member,'friend')).toBe(0n);});
 it('fails closed when equal-ranked roles conflict regardless of member role order',()=>{const server={...base,roles:{allow:{rank:1,permissions:{a:String(P.SPEAK)}},deny:{rank:1,permissions:{d:String(P.SPEAK)}}}};for(const roles of [['allow','deny'],['deny','allow']])expect(stoatChannelPermissions(server,channel,{...member,roles},'friend')&P.SPEAK).toBe(0n);});
 it('enforces moderator mute, deafen and timeout',()=>{const muted=stoatChannelPermissions(base,channel,{...member,can_publish:false,can_receive:false},'friend');expect(muted&(P.SPEAK|P.VIDEO|P.LISTEN)).toBe(0n);const timed=stoatChannelPermissions(base,channel,{...member,timeout:new Date(Date.now()+60000).toISOString()},'friend');expect(timed&P.CONNECT).toBe(0n);});
 it('rejects unsafe numerical permission precision',()=>{expect(()=>stoatChannelPermissions({...base,default_permissions:Number.MAX_SAFE_INTEGER+1},channel,member,'friend')).toThrow();});
});
describe('Stoat opaque IDs and origin policy',()=>{
 it('derives message time from real ULID without invented timestamps',()=>{expect(ulidTimestamp('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe('2016-07-30T23:54:10.259Z');expect(()=>ulidTimestamp('12345')).toThrow();});
 it('allows official self-host API prefix and denies credentials, cleartext public origins and arbitrary paths',()=>{expect(validateInstanceUrl('https://rooms.example/api/')).toBe('https://rooms.example/api');expect(validateInstanceUrl('http://127.0.0.1:3021')).toBe('http://127.0.0.1:3021');for(const url of ['http://example.com','https://a:b@example.com/api','https://example.com/private','https://example.com?token=secret'])expect(()=>validateInstanceUrl(url)).toThrow();});
});
