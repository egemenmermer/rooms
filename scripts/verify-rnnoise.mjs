import { _electron } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Local audio pipeline checks only; no microphone, accounts, or media server.
const directory = path.resolve('.local/rnnoise');
await mkdir(directory, { recursive: true });
const assets = {
  comparisonPath: path.resolve('packages/media-providers/src/noise-comparison.ts'),
  mixerPath: path.resolve('packages/media-providers/src/soundboard.ts'),
};
for (const name of ['keyboard.wav', 'vacuum.wav', 'speech.wav'])
  assets[name] = (await readFile(path.join(directory, name))).toString('base64');
const env = {
  ...process.env,
  ROOMS_DEV_URL: 'http://127.0.0.1:5173',
  ROOMS_PROFILE: 'rnnoise-verification',
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ args: ['.'], env });
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const results = await page.evaluate(async (assets) => {
    const { compareNoise } = await import('/@fs/' + assets.comparisonPath);
    const { SoundboardMixer } = await import('/@fs/' + assets.mixerPath);
    const decodeContext = new AudioContext({ sampleRate: 48000 });
    const decode = async (name) =>
      decodeContext.decodeAudioData(
        Uint8Array.from(atob(assets[name]), (char) => char.charCodeAt(0)).buffer,
      );
    const speech = await decode('speech.wav');
    const encodeWav = (samples) => {
      const data = new ArrayBuffer(44 + samples.length * 2),
        view = new DataView(data);
      const str = (offset, value) =>
        [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
      str(0, 'RIFF');
      view.setUint32(4, data.byteLength - 8, true);
      str(8, 'WAVE');
      str(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, 48000, true);
      view.setUint32(28, 96000, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      str(36, 'data');
      view.setUint32(40, samples.length * 2, true);
      samples.forEach((sample, i) =>
        view.setInt16(
          44 + i * 2,
          Math.max(-32768, Math.min(32767, Math.round(sample * 32767))),
          true,
        ),
      );
      return data;
    };
    const rms = (samples) =>
      Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    const bytes = async (blob) => Array.from(new Uint8Array(await blob.arrayBuffer()));
    const results = [];
    try {
      for (const name of ['keyboard', 'vacuum']) {
        const noise = (await decode(`${name}.wav`)).getChannelData(0);
        for (const mixed of [false, true]) {
          const samples = mixed ? new Float32Array(15 * 48000) : new Float32Array(noise);
          if (mixed) {
            const voice = speech.getChannelData(0);
            const noiseGain = 0.06 / rms(noise),
              speechGain = 0.12 / rms(voice);
            for (let i = 0; i < samples.length; i++)
              samples[i] =
                noise[i % noise.length] * noiseGain +
                (i >= 3 * 48000 && i < 3 * 48000 + voice.length
                  ? voice[i - 3 * 48000] * speechGain
                  : 0);
          }
          const file = new File([encodeWav(samples)], `${name}.wav`, { type: 'audio/wav' });
          const result = await compareNoise({
            file,
            signal: new AbortController().signal,
            onRecording() {},
          });
          if (!result.raw.size || !result.filtered.size || result.filteredDb === null)
            throw new Error(`${name}: missing audio output`);
          const filtered = await decodeContext.decodeAudioData(await result.filtered.arrayBuffer());
          if (filtered.length < samples.length * 0.9)
            throw new Error(
              `${name}: truncated output (${filtered.length}/${samples.length} samples)`,
            );
          results.push({
            name,
            mixed,
            rawDb: result.rawDb,
            filteredDb: result.filteredDb,
            reductionDb: result.rawDb - result.filteredDb,
            duration: result.duration,
            raw: await bytes(result.raw),
            filtered: await bytes(result.filtered),
          });
        }
      }
      const context = new AudioContext({ sampleRate: 48000 });
      const destination = context.createMediaStreamDestination();
      const track = destination.stream.getAudioTracks()[0];
      const mixer = new SoundboardMixer(true);
      await mixer.init({ track, audioContext: context });
      await mixer.setNoiseSuppression(false);
      await mixer.setNoiseSuppression(true);
      await mixer.restart({ track }); // SDK restart omits audioContext.
      if (mixer.processedTrack?.readyState !== 'live')
        throw new Error('Processor restart did not preserve output');
      await mixer.destroy();
      if (mixer.processedTrack) throw new Error('Processor cleanup retained output');
      track.stop();
      await context.close();
      return { cases: results, processorLifecycle: 'passed', sampleRate: decodeContext.sampleRate };
    } finally {
      await decodeContext.close();
    }
  }, assets);
  const summary = { ...results, cases: [] };
  for (const result of results.cases) {
    const stem = `${result.name}-${result.mixed ? 'mixed-tts' : 'noise-only'}`;
    await writeFile(path.join(directory, `${stem}-raw.webm`), Buffer.from(result.raw));
    await writeFile(path.join(directory, `${stem}-rnnoise.webm`), Buffer.from(result.filtered));
    const { raw, filtered, ...metrics } = result;
    summary.cases.push(metrics);
  }
  summary.rendererErrors = errors;
  await writeFile(path.join(directory, 'results.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (errors.length) throw new Error('Renderer errors occurred during audio checks');
} finally {
  await app.close();
}
