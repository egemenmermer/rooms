// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {useCommunity} from '../apps/desktop/src/community';
const f=vi.hoisted(()=>({status:'not-configured',grant:vi.fn(),leave:vi.fn(),connect:vi.fn(),disconnect:vi.fn(),noise:vi.fn(),devices:vi.fn(),mute:vi.fn()}));
vi.mock('../apps/desktop/src/runtime-sources',()=>({mediaBridge:()=>({grant:f.grant,leave:f.leave}),mediaProvider:()=>({snapshot:()=>({status:f.status,muted:true}),connectRoom:f.connect,disconnect:f.disconnect,setNoiseSuppression:f.noise,deviceSelection:f.devices,mute:f.mute})}));
import {joinVoice,leaveVoice,useVoiceContext} from '../apps/desktop/src/realtime';
const grant={roomName:'Room',token:'local-test-token',serverUrl:'wss://media.test'};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
beforeEach(async()=>{window.rooms={} as any;await leaveVoice();vi.clearAllMocks();f.status='not-configured';f.grant.mockResolvedValue(grant);f.leave.mockResolvedValue(undefined);f.disconnect.mockImplementation(async()=>{f.status='not-configured';});f.connect.mockImplementation(async()=>{f.status='connected';});useCommunity.setState({serverUrl:'https://test',user:{id:'owner',username:'Owner',displayName:'Owner',avatar:null}});});
afterEach(async()=>{await leaveVoice();delete window.rooms;});
it('paints the requested target immediately and latest request wins a delayed grant',async()=>{
 const delayed=deferred<typeof grant>();f.grant.mockReturnValueOnce(delayed.promise);
 const first=joinVoice('one','One');await vi.waitFor(()=>expect(f.grant).toHaveBeenCalledWith('one'));
 const last=joinVoice('two','Two');expect(useVoiceContext.getState()).toMatchObject({channelId:'two',roomName:'Two',busy:true});
 delayed.resolve(grant);await Promise.all([first,last]);expect(f.connect).toHaveBeenCalledTimes(1);expect(f.grant).toHaveBeenLastCalledWith('two');expect(useVoiceContext.getState()).toMatchObject({channelId:'two',busy:false,error:null});
 await joinVoice('two','Two');expect(f.connect).toHaveBeenCalledTimes(1);
});
it('leaving during connect disconnects stale media and never selects devices or enables microphone',async()=>{
 const delayed=deferred<void>();f.connect.mockImplementationOnce(async()=>{await delayed.promise;f.status='connected';});
 const join=joinVoice('one','One');await vi.waitFor(()=>expect(f.connect).toHaveBeenCalled());const leave=leaveVoice();delayed.resolve();await Promise.all([join,leave]);
 expect(f.devices).not.toHaveBeenCalled();expect(f.mute).not.toHaveBeenCalled();expect(f.status).toBe('not-configured');expect(useVoiceContext.getState().channelId).toBeNull();
});
it('old account grant cannot attach media after account rotation',async()=>{
 const delayed=deferred<typeof grant>();f.grant.mockReturnValueOnce(delayed.promise);const join=joinVoice('one','One');await vi.waitFor(()=>expect(f.grant).toHaveBeenCalled());
 useCommunity.setState({user:null});const leave=leaveVoice();delayed.resolve(grant);await Promise.all([join,leave]);expect(f.connect).not.toHaveBeenCalled();
});
it('failed grant has a retryable target and does not claim successful connection',async()=>{
 f.grant.mockRejectedValueOnce(new Error('Membership unavailable'));await expect(joinVoice('one','One')).rejects.toThrow();expect(useVoiceContext.getState()).toMatchObject({channelId:'one',busy:false,error:expect.any(String)});expect(f.status).toBe('not-configured');
 await joinVoice('one','One');expect(f.connect).toHaveBeenCalledTimes(1);
});
it('same pending target is deduplicated',async()=>{
 const delayed=deferred<typeof grant>();f.grant.mockReturnValueOnce(delayed.promise);const a=joinVoice('one','One'),b=joinVoice('one','One');expect(a).toBe(b);delayed.resolve(grant);await a;expect(f.grant).toHaveBeenCalledTimes(1);
});
