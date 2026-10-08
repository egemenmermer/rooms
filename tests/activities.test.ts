import { describe,it,expect } from 'vitest';
import { castVote,transitionSession } from '../packages/activity-sdk/src/index';
import type { ActivitySession } from '../packages/shared-contracts/src/index';
const poll:ActivitySession={id:'p',roomId:'r',activityId:'poll',hostUserId:'u',controllerUserId:null,revision:1,state:'live',startedAt:'2026-10-08T00:00:00Z',payload:{type:'poll',question:'Tonight?',options:[{id:'film',label:'Cinema'},{id:'talk',label:'Lounge'}],votes:{}}};
describe('versioned local activities',()=>{
  it('replaces a user vote instead of counting the same user twice',()=>{const first=castVote(poll,'u','film');const second=castVote(first,'u','talk');expect(second.payload.type==='poll'&&second.payload.votes).toEqual({u:'talk'});expect(second.revision).toBe(3);});
  it('rejects unknown options and ended activity changes',()=>{expect(()=>castVote(poll,'u','unknown')).toThrow();const ended=transitionSession(poll,'ended');expect(()=>castVote(ended,'u','film')).toThrow();expect(()=>transitionSession(ended,'live')).toThrow();});
});
