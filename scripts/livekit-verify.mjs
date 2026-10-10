/** Actual two Electron renderer clients, synthetic licensed media; no native capture claim. */
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import { AccessToken } from 'livekit-server-sdk';
import { _electron as electron } from '@playwright/test';
import executablePath from 'electron';

try { const local = await readFile('infra/local/.env', 'utf8'); for (const line of local.split('\n')) { const match = line.match(/^([A-Z_]+)=(.*)$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); } } catch {}
const url = process.env.LIVEKIT_URL || 'ws://127.0.0.1:7880';
const actual = process.env.ROOMS_STOAT_TEST_ACCOUNTS ? JSON.parse(await readFile(process.env.ROOMS_STOAT_TEST_ACCOUNTS,'utf8')) : null;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
if (!actual && (!apiKey || !apiSecret)) throw new Error('Set SFU credentials for a local test, or provide actual deployed Stoat accounts.');
const dir = await mkdtemp(path.join(tmpdir(), 'rooms-livekit-verify-'));
let roomName = `rooms-verification-${Date.now()}`;
let transportUrl = url;
const identities = actual ? [actual.owner.userId,actual.guest.userId] : ['test-alice','test-bob'];
const broker = async (role,path) => {
  const response=await fetch(`${actual.base}/rooms-access/v1/media/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${actual[role].token}`},body:JSON.stringify({channelId:actual.voiceId})});
  const body=await response.json();if(!response.ok)throw new Error(`Actual media broker ${path} returned ${response.status}: ${body.error}`);return body;
};
const tokens = actual ? await Promise.all(['owner','guest'].map(async role=>{const grant=await broker(role,'grant');roomName=grant.roomName;transportUrl=grant.serverUrl;return grant.token;})) : await Promise.all(identities.map(async identity => {
  const grant = new AccessToken(apiKey, apiSecret, { identity, ttl: 120 });
  grant.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true });
  return grant.toJwt();
}));
const entry = `import { Room, Track, RoomEvent } from 'livekit-client';
import { LiveKitMediaProvider } from './packages/media-providers/src/index.ts';
const room = new Room({ adaptiveStream: false });
const provider = new LiveKitMediaProvider(() => room); window.test = { room, provider, remote: [], contexts: [], states: [] }; provider.subscribeState(() => window.test.states.push(provider.status));
room.on(RoomEvent.TrackSubscribed, (track, pub) => window.test.remote.push({ track, pub }));
window.test.publish = async () => {
 const context = new AudioContext(); await context.resume(); const oscillator = context.createOscillator();
 const destination = context.createMediaStreamDestination(); oscillator.frequency.value=440; oscillator.connect(destination); oscillator.start(); window.test.contexts.push(context);
 await room.localParticipant.publishTrack(destination.stream.getAudioTracks()[0], { source: Track.Source.Microphone });
 const canvas=document.createElement('canvas'); canvas.width=640; canvas.height=360; const paint=canvas.getContext('2d'); let frame=0;
 window.test.timer=setInterval(() => { paint.fillStyle=frame++%2?'#324b81':'#426faf'; paint.fillRect(0,0,640,360); paint.fillStyle='white'; paint.fillText('ROOMS synthetic transport verification '+frame,20,100); },33);
 window.test.screen=canvas.captureStream(30).getVideoTracks()[0];
 await room.localParticipant.publishTrack(window.test.screen, { source: Track.Source.ScreenShare });
};
window.test.received=async () => { let packets=0; for(const {track} of window.test.remote) {const stats=await track.getRTCStatsReport(); stats?.forEach(s=>{if(s.type==='inbound-rtp') packets+=s.packetsReceived||0;});} return packets; };
window.test.stopScreen=async()=>{ await room.localParticipant.unpublishTrack(window.test.screen,true); clearInterval(window.test.timer); };
window.test.cleanup=async()=>{ clearInterval(window.test.timer); await provider.disconnect(); for(const ctx of window.test.contexts) await ctx.close(); };`;
const compiled = await build({ stdin: { contents: entry, resolveDir: process.cwd(), sourcefile: 'transport-check.ts', loader: 'ts' }, bundle: true, write: false, format: 'iife', platform: 'browser', tsconfig: 'tsconfig.json' });
const server = http.createServer((req, res) => {
  if (req.url === '/bundle.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(compiled.outputFiles[0].text); }
  else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>ROOMS transport verification</title><script src="/bundle.js"></script>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
await writeFile(path.join(dir, 'main.cjs'), `const {app,BrowserWindow}=require('electron'); app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required'); app.whenReady().then(()=>{for(let i=0;i<2;i++){ const w=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}}); w.loadURL(${JSON.stringify(origin)});}});`);
let app; let connectionTimer;
try {
  app = await electron.launch({ executablePath, args: [path.join(dir, 'main.cjs')] });
  const deadline = Date.now() + 15_000;
  while (app.windows().length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  const pages = app.windows(); if (pages.length !== 2) throw new Error('Two renderer clients did not open.');
  await Promise.all(pages.map(p => p.waitForFunction(() => !!window.test)));
  await Promise.race([Promise.all(pages.map((p, i) => p.evaluate(async grant => window.test.provider.connectRoom(grant.room, grant.token, grant.url), { room: roomName, token: tokens[i], url:transportUrl }))), new Promise((_, reject) => connectionTimer = setTimeout(() => reject(new Error('Media server connection timed out after 20 seconds.')), 20_000))]);
  if(actual)await broker('owner','screen/acquire');
  await pages[0].evaluate(() => window.test.publish());
  await pages[1].waitForFunction(() => window.test.remote.length >= 2, { timeout: 20_000 });
  await pages[1].waitForFunction(async () => await window.test.received() > 10, { timeout: 20_000 });
  await pages[0].evaluate(() => window.test.provider.mute(true));
  await pages[1].waitForFunction(identity => window.test.room.remoteParticipants.get(identity)?.getTrackPublication('microphone')?.isMuted === true,identities[0]);
  await pages[0].evaluate(() => window.test.provider.mute(false));
  await pages[1].waitForFunction(identity => window.test.room.remoteParticipants.get(identity)?.getTrackPublication('microphone')?.isMuted === false,identities[0]);
  await pages[1].evaluate(() => window.test.room.simulateScenario('signal-reconnect'));
  await pages[1].waitForFunction(() => window.test.states.includes('reconnecting') && window.test.provider.status === 'connected');
  const afterReconnect = await pages[1].evaluate(() => window.test.received());
  await pages[1].waitForFunction(async prior => await window.test.received() > prior, afterReconnect);
  await pages[0].evaluate(() => window.test.stopScreen());
  await pages[1].waitForFunction(identity => !window.test.room.remoteParticipants.get(identity)?.isScreenShareEnabled,identities[0]);
  if(actual)await broker('owner','screen/release');
  const result={ verified: true, clients: 2, actualStoatAuthorizedGrants:!!actual,publicTls:transportUrl.startsWith('wss://'),syntheticAudioReceived: true, syntheticVideoReceived: true, remoteMuteObserved: true, screenUnpublicationObserved: true, realSignalReconnectObserved: true, nativeDevicesAndPickerVerified: false };
  if(actual)await writeFile('infra/production/MEDIA_RESULTS.json',JSON.stringify({at:new Date().toISOString(),...result},null,2)+'\n');
  console.log(JSON.stringify(result));
} finally {
  clearTimeout(connectionTimer);
  if (app) { await Promise.allSettled(app.windows().map(p => p.evaluate(() => window.test?.cleanup()))); await app.close(); }
  if(actual)await Promise.allSettled(['owner','guest'].map(role=>broker(role,'leave')));
  await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true });
}
