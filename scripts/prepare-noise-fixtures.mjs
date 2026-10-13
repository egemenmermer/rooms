import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
// Explicit local QA inputs; no fixtures are bundled with the product.
const directory=path.resolve('.local/noise-v2');await mkdir(directory,{recursive:true});
const assets={
  'keyboard.wav':'https://raw.githubusercontent.com/karolpiczak/ESC-50/master/audio/1-137-A-32.wav',
  'vacuum.wav':'https://raw.githubusercontent.com/karolpiczak/ESC-50/master/audio/1-100210-A-36.wav',
  'wood-knock.wav':'https://raw.githubusercontent.com/karolpiczak/ESC-50/master/audio/1-101336-A-30.wav',
  'glass-break.wav':'https://raw.githubusercontent.com/karolpiczak/ESC-50/master/audio/1-20133-A-39.wav',
  'human-speech.wav':'https://raw.githubusercontent.com/mozilla/DeepSpeech/master/data/smoke_test/LDC93S1.wav',
  'dishes.mp3':'https://cdn.freesound.org/previews/848/848942_9616576-hq.mp3',
};
for(const [name,url] of Object.entries(assets)){const response=await fetch(url);if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);await writeFile(path.join(directory,name),Buffer.from(await response.arrayBuffer()));}
if(process.platform!=='darwin')throw new Error('Convert dishes.mp3 to PCM16 WAV and supply speech.wav manually on non-macOS hosts. See docs/NOISE_SUPPRESSION_V2.md.');
execFileSync('afconvert',['-f','WAVE','-d','LEI16@48000',path.join(directory,'dishes.mp3'),path.join(directory,'dishes.wav')]);
execFileSync('say',['-o',path.join(directory,'speech.aiff'),'Rooms microphone noise suppression test. Can you hear my voice clearly while the keyboard and vacuum cleaner are running?']);
execFileSync('afconvert',['-f','WAVE','-d','LEI16@48000',path.join(directory,'speech.aiff'),path.join(directory,'speech.wav')]);
console.log('Local fixtures prepared. They remain in ignored .local/noise-v2; do not redistribute the speech corpus or ESC-50 with the application.');
