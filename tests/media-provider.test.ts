// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ConnectionState, RoomEvent, Track, type Room } from 'livekit-client';
import { LiveKitMediaProvider } from '../packages/media-providers/src/index';

function fixture() {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const emit = (event: string, ...args: unknown[]) => listeners.get(event)?.forEach(cb => cb(...args));
  const local = { identity: 'alice', name: 'Alice', isMicrophoneEnabled: false, isCameraEnabled: false, isScreenShareEnabled: false, isSpeaking: false, connectionQuality: 'excellent', trackPublications: new Map(), getTrackPublication: vi.fn(), setMicrophoneEnabled: vi.fn(async (enabled: boolean) => { local.isMicrophoneEnabled = enabled; }), setCameraEnabled: vi.fn(), setScreenShareEnabled: vi.fn(async (enabled: boolean) => { local.isScreenShareEnabled = enabled; }) };
  const room = { localParticipant: local, remoteParticipants: new Map(), on: vi.fn((event: string, cb: (...args: unknown[]) => void) => { listeners.set(event, [...(listeners.get(event) ?? []), cb]); }), connect: vi.fn(async () => { emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected); }), disconnect: vi.fn(async () => { emit(RoomEvent.Disconnected); }), removeAllListeners: vi.fn(), switchActiveDevice: vi.fn(async () => true), startAudio: vi.fn(async () => {}) };
  const provider = new LiveKitMediaProvider(() => room as unknown as Room);
  return { provider, room, local, emit };
}
describe('LiveKit adapter lifecycle', () => {
  it('requires TLS for remote media and rejects credential-bearing URLs before constructing a room', async () => {
    const factory = vi.fn(); const provider = new LiveKitMediaProvider(factory);
    await expect(provider.connectRoom('room', 'ephemeral', 'ws://example.com')).rejects.toThrow('TLS');
    await expect(provider.connectRoom('room', 'ephemeral', 'wss://example.com/?token=secret')).rejects.toThrow('plain');
    expect(factory).not.toHaveBeenCalled();
  });
  it('uses the granted URL/token, publishes only on explicit action, and resets tracks on leave', async () => {
    const { provider, room, local } = fixture();
    await provider.connectRoom('voice-1', 'ephemeral', 'ws://127.0.0.1:7880');
    expect(room.connect).toHaveBeenCalledWith('ws://127.0.0.1:7880/', 'ephemeral', { autoSubscribe: true });
    expect(local.setMicrophoneEnabled).not.toHaveBeenCalled();
    await provider.publishMic('mic-1'); expect(provider.snapshot().muted).toBe(false);
    await provider.mute(true); expect(provider.snapshot().muted).toBe(true);
    await provider.disconnect(); expect(room.disconnect).toHaveBeenCalledWith(true);
    expect(provider.snapshot()).toMatchObject({ status: 'not-configured', roomId: null, tracks: [], participants: [] });
  });
  it('deafen mutes the actual microphone and does not unmute it when hearing resumes', async () => {
    const { provider, local } = fixture(); await provider.connectRoom('room', 'ephemeral', 'ws://localhost:7880');
    await provider.publishMic(); await provider.deafen(true); expect(local.isMicrophoneEnabled).toBe(false);
    await provider.deafen(false); expect(local.isMicrophoneEnabled).toBe(false); expect(provider.snapshot().deafened).toBe(false);
    await provider.disconnect();
  });
  it('deafen silences remote playback including a later subscription', async () => {
    const { provider, room, emit } = fixture(); await provider.connectRoom('room', 'token', 'ws://localhost:7880');
    const element = document.createElement('audio'); element.play = vi.fn(async () => {}); element.pause = vi.fn();
    const participant = { setVolume: vi.fn(), identity: 'bob' };
    const track = { kind: 'audio', attach: () => element };
    await provider.deafen(true); emit(RoomEvent.TrackSubscribed, track, { trackSid: 'TR_audio' }, participant);
    expect(element.muted).toBe(true); await provider.deafen(false); expect(element.muted).toBe(false);
    await provider.deafen(true); await expect(provider.mute(false)).rejects.toThrow('Undeafen');
    await provider.disconnect(); expect(document.body.contains(element)).toBe(false); expect(element.pause).toHaveBeenCalled();
  });
  it('records denial without false capture success', async () => {
    const { provider, local } = fixture(); await provider.connectRoom('room', 'ephemeral', 'ws://localhost:7880');
    local.setScreenShareEnabled.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    await expect(provider.publishScreen()).rejects.toThrow();
    expect(provider.snapshot()).toMatchObject({ sharing: false }); expect(provider.snapshot().error).toContain('izni kapalı');
    await provider.disconnect();
  });
  it('connection failure never reports connected or exposes token/error URL', async () => {
    const { provider, room } = fixture(); room.connect.mockRejectedValueOnce(new Error('JWT TOP_SECRET at ws://server'));
    await expect(provider.connectRoom('room', 'TOP_SECRET', 'ws://localhost:7880')).rejects.toThrow('Unable');
    expect(provider.status).toBe('error'); expect(JSON.stringify(provider.snapshot())).not.toContain('TOP_SECRET');
    await provider.disconnect();
  });
  it('rejects a second known presenter before requesting capture', async () => {
    const { provider, room, local } = fixture(); await provider.connectRoom('room', 'token', 'ws://localhost:7880');
    room.remoteParticipants.set('bob', { isScreenShareEnabled: true });
    await expect(provider.publishScreen()).rejects.toThrow('Another participant'); expect(local.setScreenShareEnabled).not.toHaveBeenCalled();
    await provider.disconnect();
  });
  it('stops screen capture immediately even when reconnecting and unpublication fails', async () => {
    const { provider, local, emit } = fixture(); await provider.connectRoom('room', 'token', 'ws://localhost:7880');
    const stop = vi.fn(); local.getTrackPublication.mockReturnValue({ track: { stop } });
    local.setScreenShareEnabled.mockRejectedValueOnce(new Error('Network unavailable'));
    emit(RoomEvent.ConnectionStateChanged, ConnectionState.Reconnecting);
    await expect(provider.stopScreen()).rejects.toThrow('Ses işlemi'); expect(stop).toHaveBeenCalled(); expect(provider.snapshot().sharing).toBe(false);
    await provider.disconnect();
  });
  it('tracks reconnect state without reacquiring microphone or screen', async () => {
    const { provider, emit, local } = fixture(); await provider.connectRoom('room', 'token', 'ws://localhost:7880');
    emit(RoomEvent.ConnectionStateChanged, ConnectionState.Reconnecting); expect(provider.status).toBe('reconnecting');
    expect(local.setMicrophoneEnabled).not.toHaveBeenCalled(); emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected); expect(provider.status).toBe('connected');
    await provider.disconnect();
  });
});

describe('explicit screen quality and system audio',()=>{
 it('defaults to 1080p60 without capturing audio',async()=>{
  const {provider,local}=fixture();await provider.connectRoom('room','token','ws://localhost:7880');
  await provider.publishScreen();
  expect(local.setScreenShareEnabled).toHaveBeenCalledWith(true,expect.objectContaining({audio:false,resolution:{width:1920,height:1080,frameRate:60}}),expect.objectContaining({videoCodec:'h264',screenShareEncoding:{maxBitrate:10000000,maxFramerate:60}}));
  await provider.disconnect();
 });
 it('captures explicitly requested stereo system audio without microphone processing',async()=>{
  const {provider,local}=fixture();await provider.connectRoom('room','token','ws://localhost:7880');
  local.getTrackPublication.mockImplementation(source=>source===Track.Source.ScreenShareAudio?{track:{stop:vi.fn()}}:undefined);
  await provider.publishScreen({quality:'4k30',audio:true});
  expect(local.setScreenShareEnabled).toHaveBeenCalledWith(true,expect.objectContaining({audio:expect.objectContaining({channelCount:2,echoCancellation:false,noiseSuppression:false,autoGainControl:false}),resolution:{width:3840,height:2160,frameRate:30}}),expect.objectContaining({forceStereo:true}));
  await provider.disconnect();
 });
 it('stops sharing if requested system audio was not acquired',async()=>{
  const {provider,local}=fixture();await provider.connectRoom('room','token','ws://localhost:7880');
  await expect(provider.publishScreen({audio:true})).rejects.toThrow();
  expect(local.setScreenShareEnabled).toHaveBeenLastCalledWith(false);expect(provider.snapshot().sharing).toBe(false);await provider.disconnect();
 });
});

it('reports observed encoder dimensions and codec instead of the requested profile',async()=>{
 vi.useFakeTimers();
 const {provider,local}=fixture();
 try{await provider.connectRoom('room','token','ws://localhost:7880');
 const report=new Map([['video',{id:'video',type:'outbound-rtp',frameWidth:1280,frameHeight:720,framesPerSecond:28,codecId:'codec'}],['codec',{id:'codec',type:'codec',mimeType:'video/H264'}]]);
 local.trackPublications.set('screen',{trackSid:'screen',source:Track.Source.ScreenShare,kind:'video',track:{stop:vi.fn(),getRTCStatsReport:vi.fn(async()=>report)}});
 await vi.advanceTimersByTimeAsync(5000);
 expect(provider.diagnostics().video).toEqual({width:1280,height:720,framesPerSecond:28,codec:'video/H264',direction:'sent'});
 }finally{await provider.disconnect();vi.useRealTimers();}
});

 it('recovers a missing selected microphone on explicit unmute and clears the stale error',async()=>{
  const {provider,local,room}=fixture();await provider.connectRoom('room','token','ws://localhost:7880');
  local.setMicrophoneEnabled.mockRejectedValueOnce(new DOMException('Old device ID','OverconstrainedError'));
  await provider.mute(false);
  expect(room.switchActiveDevice).toHaveBeenCalledWith('audioinput','default');
  expect(local.setMicrophoneEnabled).toHaveBeenLastCalledWith(true,expect.objectContaining({deviceId:'default'}));
  expect(provider.snapshot()).toMatchObject({muted:false,error:null,inputDeviceFallback:true});await provider.disconnect();
 });
 it('does not retry capture after a permission denial',async()=>{
  const {provider,local,room}=fixture();await provider.connectRoom('room','token','ws://localhost:7880');
  local.setMicrophoneEnabled.mockRejectedValueOnce(new DOMException('Denied','NotAllowedError'));
  await expect(provider.mute(false)).rejects.toThrow('izni kapalı');
  expect(local.setMicrophoneEnabled).toHaveBeenCalledTimes(1);expect(room.switchActiveDevice).not.toHaveBeenCalled();await provider.disconnect();
 });
 it('local volume is applied again when a muted participant publishes a replacement track',async()=>{
  const {provider,room,emit}=fixture();await provider.connectRoom('room','token','ws://localhost:7880');
  const bob={identity:'bob',setVolume:vi.fn(),trackPublications:new Map()};room.remoteParticipants.set('bob',bob);
  provider.setParticipantVolume('bob',0);
  const element=document.createElement('audio');element.play=vi.fn(async()=>{});element.pause=vi.fn();
  emit(RoomEvent.TrackSubscribed,{kind:'audio',attach:()=>element},{trackSid:'replacement'},bob);
  expect(bob.setVolume).toHaveBeenLastCalledWith(0);await provider.disconnect();
 });

it('does not publish a delayed microphone into a room that was left',async()=>{
 const {provider,local}=fixture();await provider.connectRoom('room','token','ws://localhost:7880');
 let finish!:()=>void;
 local.setMicrophoneEnabled.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=()=>{local.isMicrophoneEnabled=true;resolve();};}));
 const pending=provider.mute(false);await provider.disconnect();finish();await pending;
 expect(local.isMicrophoneEnabled).toBe(false);expect(provider.snapshot()).toMatchObject({status:'not-configured',muted:true,error:null});
});
it('does not show a late permission error after leaving voice',async()=>{
 const {provider,local}=fixture();await provider.connectRoom('room','token','ws://localhost:7880');
 let fail!:(error:unknown)=>void;
 local.setMicrophoneEnabled.mockImplementationOnce(()=>new Promise<void>((_,reject)=>{fail=reject;}));
 const pending=provider.mute(false).catch(()=>{});await provider.disconnect();fail(new DOMException('Denied','NotAllowedError'));await pending;
 expect(provider.snapshot()).toMatchObject({status:'not-configured',muted:true,error:null});
});

it('stops local capture and clears old presence before network disconnect completes',async()=>{
 const {provider,room,local,emit}=fixture();await provider.connectRoom('room','token','ws://localhost:7880');
 const stop=vi.fn();local.trackPublications.set('mic',{track:{stop}});
 let finish!:()=>void;room.disconnect.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
 const leaving=provider.disconnect();expect(stop).toHaveBeenCalledTimes(1);
 expect(provider.snapshot()).toMatchObject({status:'not-configured',roomId:null,participants:[],tracks:[],muted:true});
 expect(provider.disconnect()).toBe(leaving);
 const attach=vi.fn();emit(RoomEvent.TrackSubscribed,{kind:'audio',attach},{trackSid:'late'},{identity:'bob'});
 expect(attach).not.toHaveBeenCalled();finish();await leaving;
});


it('bot listener gain reaches very quiet levels, remains local, and survives replacement tracks',async()=>{
 const {provider,room,emit}=fixture();await provider.connectRoom('room','token','ws://localhost:7880');
 const bot={identity:'rooms-music-room',setVolume:vi.fn(),trackPublications:new Map()},human={identity:'bob',setVolume:vi.fn(),trackPublications:new Map()};room.remoteParticipants.set(bot.identity,bot);room.remoteParticipants.set(human.identity,human);
 provider.setParticipantVolume(bot.identity,.01);expect(bot.setVolume).toHaveBeenLastCalledWith(.0001);expect(provider.snapshot().participants.find(p=>p.id===bot.identity)?.volume).toBe(.01);
 provider.setParticipantVolume(human.identity,.01);expect(human.setVolume).toHaveBeenLastCalledWith(.01);
 const element=document.createElement('audio');element.play=vi.fn(async()=>{});element.pause=vi.fn();emit(RoomEvent.TrackSubscribed,{kind:'audio',attach:()=>element},{trackSid:'new-bot-track'},bot);expect(bot.setVolume).toHaveBeenLastCalledWith(.0001);
 provider.setParticipantVolume(bot.identity,0);expect(bot.setVolume).toHaveBeenLastCalledWith(0);provider.setParticipantVolume(bot.identity,1);expect(bot.setVolume).toHaveBeenLastCalledWith(1);await provider.disconnect();
});
