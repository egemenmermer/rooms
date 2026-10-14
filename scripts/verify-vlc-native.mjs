// Real native decoder and local capability transport. Synthetic media, not provider acceptance.
import { _electron as electron } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const outputMode = process.env.ROOMS_VLC_QA_OUTPUT ?? 'display';
if (!['display', 'decode'].includes(outputMode)) throw Error('Invalid native QA output mode');
const displayRequired = outputMode === 'display';
const output = resolve('.local/vlc-native-check');
await mkdir(output, { recursive: true });
const chunk = (type, bytes) => {
  const header = Buffer.alloc(8);
  header.write(type);
  header.writeUInt32LE(bytes.length, 4);
  return Buffer.concat([header, bytes, Buffer.alloc(bytes.length % 2)]);
};
const list = (type, chunks) => chunk('LIST', Buffer.concat([Buffer.from(type), ...chunks]));
const width = 160,
  height = 90,
  frames = 150,
  rate = 25,
  frameSize = width * height * 3;
const header = Buffer.alloc(56);
[40000, frameSize * rate + 16000, 0, 0, frames, 0, 2, frameSize, width, height].forEach((v, i) =>
  header.writeUInt32LE(v, i * 4),
);
const videoHeader = Buffer.alloc(56);
videoHeader.write('vids');
videoHeader.write('DIB ', 4);
videoHeader.writeUInt32LE(1, 20);
videoHeader.writeUInt32LE(rate, 24);
videoHeader.writeUInt32LE(frames, 32);
videoHeader.writeUInt32LE(frameSize, 36);
videoHeader.writeUInt32LE(0xffffffff, 40);
videoHeader.writeInt16LE(width, 52);
videoHeader.writeInt16LE(height, 54);
const videoFormat = Buffer.alloc(40);
videoFormat.writeUInt32LE(40);
videoFormat.writeInt32LE(width, 4);
videoFormat.writeInt32LE(height, 8);
videoFormat.writeUInt16LE(1, 12);
videoFormat.writeUInt16LE(24, 14);
videoFormat.writeUInt32LE(frameSize, 20);
const audioHeader = Buffer.alloc(56);
audioHeader.write('auds');
audioHeader.writeUInt32LE(2, 20);
audioHeader.writeUInt32LE(16000, 24);
audioHeader.writeUInt32LE(frames * 320, 32);
audioHeader.writeUInt32LE(640, 36);
audioHeader.writeUInt32LE(0xffffffff, 40);
audioHeader.writeUInt32LE(2, 44);
const audioFormat = Buffer.alloc(16);
audioFormat.writeUInt16LE(1);
audioFormat.writeUInt16LE(1, 2);
audioFormat.writeUInt32LE(8000, 4);
audioFormat.writeUInt32LE(16000, 8);
audioFormat.writeUInt16LE(2, 12);
audioFormat.writeUInt16LE(16, 14);
const movi = [];
for (let i = 0; i < frames; i++) {
  const pixels = Buffer.alloc(frameSize);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 3;
      pixels[p] = (x + i) % 256;
      pixels[p + 1] = (y * 2 + i) % 256;
      pixels[p + 2] = i % 256;
    }
  const audio = Buffer.alloc(640);
  for (let n = 0; n < 320; n++)
    audio.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 440 * (i * 320 + n)) / 8000) * 2000),
      n * 2,
    );
  movi.push(chunk('00db', pixels), chunk('01wb', audio));
}
const hdrl = list('hdrl', [
  chunk('avih', header),
  list('strl', [chunk('strh', videoHeader), chunk('strf', videoFormat)]),
  list('strl', [chunk('strh', audioHeader), chunk('strf', audioFormat)]),
]);
const content = Buffer.concat([Buffer.from('AVI '), hdrl, list('movi', movi)]);
const riff = Buffer.alloc(8);
riff.write('RIFF');
riff.writeUInt32LE(content.length, 4);
await writeFile(join(output, 'sample.avi'), Buffer.concat([riff, content]));
await build({
  entryPoints: ['apps/desktop/electron/personal-vlc-stream.ts'],
  outfile: join(output, 'stream.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
});
const nativeRoot = resolve(process.env.ROOMS_VLC_QA_NATIVE_ROOT ?? 'dist-native');
await writeFile(
  join(output, 'main.cjs'),
  `
const {app,BrowserWindow}=require('electron');const {readFileSync}=require('node:fs');const {createVLCStream}=require('./stream.cjs');
let check;
app.whenReady().then(async()=>{
 const binding=require(${JSON.stringify(join(nativeRoot, 'rooms-vlc.node'))});
 binding.initialize(${JSON.stringify(join(nativeRoot, 'vlc', process.platform === 'darwin' ? 'lib/libvlc.dylib' : 'libvlc.dll'))},${JSON.stringify(join(nativeRoot, 'vlc/plugins'))});
 const win=new BrowserWindow({width:900,height:700,show:true,webPreferences:{sandbox:true}});await win.loadURL('data:text/html,<html><body>ROOMS native media check</body></html>');
 const data=readFileSync(__dirname+'/sample.avi');let current=true;const stream=await createVLCStream('rooms-provider://11111111-1111-4111-8111-111111111111/stream',async(request)=>{
 const range=request.headers.get('range');const start=range?Number(range.match(/bytes=(\\d+)/)[1]):0;
 return new Response(data.subarray(start),{status:range?206:200,headers:{'Content-Type':'video/x-msvideo','Content-Length':String(data.length-start),...(range?{'Content-Range':'bytes '+start+'-'+(data.length-1)+'/'+data.length,'Accept-Ranges':'bytes'}:{'Accept-Ranges':'bytes'})}});
 },()=>{if(!current)throw new Error('Scope changed');});
 await binding.create(win.getNativeWindowHandle());binding.control('volume',0);binding.bounds(20,20,640,360,true);binding.play(stream.url);
 check={binding,win,stream,get current(){return current},revoke(){current=false;stream.close();}};
}).catch(e=>{globalThis.failure=e.message;});
globalThis.getCheck=()=>check;
`,
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [join(output, 'main.cjs')], env, timeout: 120000 });
const result = {
  scope:
    'Synthetic AVI/PCM, real libVLC native output and capability transport; no real IPTV or physical-device acceptance',
  platform: process.platform,
  outputMode,
  compositorAcceptance: displayRequired
    ? 'required by this check'
    : 'excluded: hosted decoder check only',
  status: 'FAIL',
};
try {
  await app.evaluate(async () => {
    const started = Date.now();
    while (!globalThis.getCheck()) {
      if (globalThis.failure) throw Error(globalThis.failure);
      if (Date.now() - started > 120000) throw Error('VLC initialization deadline');
      await new Promise((r) => setTimeout(r, 50));
    }
  });
  const waitState = async (predicate) => {
    const end = Date.now() + 15000;
    let lastState;
    while (Date.now() < end) {
      const state = await app.evaluate(() => globalThis.getCheck().binding.state());
      lastState = state;
      if (predicate(state)) return state;
      await new Promise((r) => setTimeout(r, 100));
    }
    result.lastState = lastState;
    throw Error('Native output did not reach required state');
  };
  result.playing = await waitState(
    (s) =>
      s.decodedFrames > 2 &&
      s.audioBuffers > 0 &&
      s.time > 0.5 &&
      (!displayRequired || s.displayedFrames > 2),
  );
  assert.equal(result.playing.width, width);
  assert.equal(result.playing.height, height);
  await app.evaluate(() => globalThis.getCheck().binding.control('pause', 1));
  await waitState((s) => s.state === 4);
  await app.evaluate(() => {
    const p = globalThis.getCheck().binding;
    p.bounds(20, 20, 320, 180, false);
    p.bounds(20, 20, 640, 360, true);
    p.control('pause', 0);
  });
  await waitState((s) => s.state === 3);
  await app.evaluate(async () => {
    const p = globalThis.getCheck();
    p.revoke();
    await p.binding.dispose();
    p.win.destroy();
  });
  result.status = 'PASS';
  result.checks = [
    displayRequired
      ? 'actual video frames displayed'
      : 'actual video frames decoded; compositor not certified',
    'actual decoded PCM reaches audio output (muted test)',
    'pause/resume',
    'resize/hide/show API',
    'scope revocation and asynchronous stop',
  ];
} finally {
  await app.close();
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
