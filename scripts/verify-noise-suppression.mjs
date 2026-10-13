import { _electron } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const env={...process.env,ROOMS_DEV_URL:'http://127.0.0.1:5173',ROOMS_PROFILE:'noise-v2-verification'};delete env.ELECTRON_RUN_AS_NODE;
console.log('Launching isolated Electron');
const app=await _electron.launch({args:['.'],env,timeout:30000});
try{
  console.log('Waiting for window');const page=await app.firstWindow({timeout:30000});console.log('Window ready');await page.waitForLoadState('domcontentloaded');
  page.on('console',message=>{if(message.text().startsWith('noise-qa'))console.log(message.text());});await page.addInitScript(()=>{window.noiseQaBlobs=new Map();const create=URL.createObjectURL;URL.createObjectURL=blob=>{const url=create.call(URL,blob);window.noiseQaBlobs.set(url,blob);return url;};const Native=AudioWorkletNode;window.AudioWorkletNode=class extends Native{constructor(...args){super(...args);this.port.addEventListener('message',event=>{if(event.data?.type==='error')console.log('noise-qa '+JSON.stringify(event.data));});}};});
  await page.goto('http://127.0.0.1:5173/?fixture=S66#/settings?tab=audio');
  await page.getByRole('region',{name:'Filtre karşılaştırması'}).waitFor();console.log('Settings ready');await page.locator('body').click({position:{x:400,y:180}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  console.log('Checking audio graph');const result=await page.evaluate(async({modulePath,mixerPath})=>{
    const {createNoiseSuppressionNode}=await import('/@fs/'+modulePath);
    const {SoundboardMixer}=await import('/@fs/'+mixerPath);
    const context=new AudioContext({sampleRate:48000});
    const abort=new AbortController();abort.abort();let aborted=false;try{await createNoiseSuppressionNode(context,'strong',{signal:abort.signal});}catch(error){aborted=error.name==='AbortError';}if(!aborted)throw new Error('Pre-aborted initialization accepted');
    const stats=[];
    const strong=await createNoiseSuppressionNode(context,'strong',{stats:value=>stats.push(value)});
    const standard=await createNoiseSuppressionNode(context,'standard');
    const destination=context.createMediaStreamDestination();
    const oscillator=context.createOscillator();oscillator.connect(destination);oscillator.start();
    await context.resume();
    const mixer=new SoundboardMixer(true,'strong');
    const track=destination.stream.getAudioTracks()[0];
    await mixer.init({track,audioContext:context});
    const outputId=mixer.processedTrack.id;
    await mixer.setNoiseSuppression(true,'standard');
    if(mixer.processedTrack.id!==outputId)throw new Error('Mode switch replaced publication output');
    await mixer.setNoiseSuppression(false);await mixer.setNoiseSuppression(true,'strong');
    await mixer.restart({track});
    if(mixer.processedTrack.readyState!=='live')throw new Error('Restart failed');
    await mixer.destroy();if(mixer.processedTrack)throw new Error('Cleanup failed');
    let faultMuted=false;const fault=await createNoiseSuppressionNode(context,'strong',{error:()=>{faultMuted=true;}});fault.dispatchEvent(new Event('processorerror'));if(!faultMuted)throw new Error('Processor failure callback missing');fault.destroy();
    const cancelled=new SoundboardMixer(true,'strong');await cancelled.destroy();let cancelledInit=false;try{await cancelled.init({track,audioContext:context});}catch(error){cancelledInit=error.name==='AbortError';}if(!cancelledInit)throw new Error('Destroyed mixer resurrected');
    strong.destroy();standard.destroy();oscillator.stop();oscillator.disconnect();track.stop();await context.close();
    const invalid=new AudioContext({sampleRate:44100});let refused=false;
    try{await createNoiseSuppressionNode(invalid,'strong');}catch{refused=true;}finally{await invalid.close();}
    if(!refused)throw new Error('Unsupported sample rate was accepted');
    return{preAbortedInitializationRefused:true,destroyedMixerRefused:true,runtimeFaultCallback:true,strongInitialization:true,standardInitialization:true,stableOutputTrackOnModeSwitch:true,restart:true,cleanup:true,unsupportedRateRefused:true};
  },{modulePath:path.resolve('packages/media-providers/src/noise-suppression.ts'),mixerPath:path.resolve('packages/media-providers/src/soundboard.ts')});
  // Exercise the production mode selector and file comparison UI.
  console.log('Audio graph passed; checking comparison UI');const mode=page.getByRole('combobox',{name:'Gürültü filtresi modu'});
  await mode.selectOption('standard');await mode.selectOption('strong');
  await page.locator('input[type=file]').setInputFiles(path.resolve('.local/noise-v2/dishes-input.wav'));
  try{await page.getByText('Filtreli kaydı indir',{exact:true}).waitFor({timeout:70000});}catch(error){console.log(await page.getByRole('region',{name:'Filtre karşılaştırması'}).innerText());throw error;}
  if(await page.locator('.noise-comparison audio').count()!==2)throw new Error('Comparison outputs missing');
  const recordings=await page.evaluate(async()=>{const context=new AudioContext({sampleRate:48000});try{return await Promise.all([...document.querySelectorAll('.noise-comparison audio')].map(async player=>{const buffer=await context.decodeAudioData(await window.noiseQaBlobs.get(player.src).arrayBuffer());const samples=buffer.getChannelData(0);let power=0;for(const value of samples){if(!Number.isFinite(value))throw new Error('Invalid recorded sample');power+=value*value;}if(power/samples.length<1e-8)throw new Error('Silent comparison output');return{duration:buffer.duration,rms:Math.sqrt(power/samples.length)};}));}finally{await context.close();}});
  if(Math.abs(recordings[0].duration-recordings[1].duration)>.2)throw new Error('Unmatched recording durations');
  await page.getByRole('button',{name:'Kaydı sil',exact:true}).click();
  if(await page.locator('.noise-comparison audio').count())throw new Error('Comparison did not clear');
  await page.locator('input[type=file]').setInputFiles(path.resolve('.local/noise-v2/dishes-input.wav'));
  await page.getByRole('button',{name:'İptal',exact:true}).click();
  await page.locator('input[type=file]').waitFor({state:'attached'});await page.waitForFunction(()=>!document.querySelector('input[type=file]').disabled);
  await page.getByRole('region',{name:'Filtre karşılaştırması'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'.local/noise-v2/settings.png'});
  if(errors.length)throw new Error('Renderer errors: '+errors.join(';'));
  const summary={...result,fileComparisonUi:true,nonSilentRecordings:recordings,cancellation:true,rendererErrors:errors,scope:'Local Electron fixture and production audio graph, no microphone permission, account, remote server, or physical call'};
  await writeFile('.local/noise-v2/browser-results.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}finally{await app.close();}
