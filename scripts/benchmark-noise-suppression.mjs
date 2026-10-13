import vm from 'node:vm';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';

// Offline invocation of the exact distributed worklet code and embedded models.
// This is an audio algorithm benchmark, not browser/SFU/physical-device acceptance.
const directory = path.resolve('.local/noise-v2');
await mkdir(directory, { recursive: true });
function decodeWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') throw new Error('Expected PCM WAV');
  let format, data;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const name = buffer.toString('ascii', offset, offset + 4), size = buffer.readUInt32LE(offset + 4);
    if (name === 'fmt ') format = { encoding: buffer.readUInt16LE(offset + 8), channels: buffer.readUInt16LE(offset + 10), rate: buffer.readUInt32LE(offset + 12), bits: buffer.readUInt16LE(offset + 22) };
    if (name === 'data') data = buffer.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  if (!format || !data || format.encoding !== 1 || format.bits !== 16) throw new Error('Expected 16-bit PCM WAV');
  const original = new Float32Array(data.length / (2 * format.channels));
  for (let i = 0; i < original.length; i++) for (let channel = 0; channel < format.channels; channel++) original[i] += data.readInt16LE((i * format.channels + channel) * 2) / (32768 * format.channels);
  if (format.rate === 48000) return original;
  const samples = new Float32Array(Math.round(original.length * 48000 / format.rate));
  for (let i = 0; i < samples.length; i++) {
    const position = i * format.rate / 48000, index = Math.floor(position), fraction = position - index;
    samples[i] = original[index] * (1 - fraction) + original[Math.min(index + 1, original.length - 1)] * fraction;
  }
  return samples;
}
function encodeWav(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(48000, 24); buffer.writeUInt32LE(96000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, i) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(.999969, sample)) * 32768), 44 + i * 2));
  return buffer;
}
const energy = samples => samples.reduce((sum, sample) => sum + sample * sample, 0);
const rms = samples => Math.sqrt(energy(samples) / samples.length);
async function model(engine) {
  const owned = process.argv.includes('--owned');
  const worklet = owned ? (await readdir('dist/assets')).find(name => name.startsWith('noise-worklet-') && name.endsWith('.js')) : undefined;
  const [source, binary] = await Promise.all([
    readFile(owned ? `dist/assets/${worklet}` : `node_modules/@sapphi-red/web-noise-suppressor/dist/${engine}/workletProcessor.js`, 'utf8'),
    readFile(owned && engine==='gtcrn' ? 'node_modules/@sapphi-red/gtcrn-wasm/dist/gtcrn.wasm' : `node_modules/@sapphi-red/web-noise-suppressor/dist/${engine}.wasm`),
  ]);
  let Processor;
  const messages = [];
  const rnnoise = owned ? await readFile('node_modules/@sapphi-red/web-noise-suppressor/dist/rnnoise.wasm') : null;
  const errors = [];
  const context = vm.createContext({
    AudioWorkletProcessor: class { constructor() { this.port = { addEventListener() {}, start() {}, postMessage(value) { messages.push(value); } }; } },
    registerProcessor(_name, value) { Processor = value; }, sampleRate: 48000,
    TextEncoder, TextDecoder, WebAssembly, setTimeout, clearTimeout,
    console: { debug() {}, log() {}, warn() {}, error(...messages) { errors.push(messages.join(' ')); } },
  });
  const module = new vm.SourceTextModule(source, { context, initializeImportMeta(meta) { meta.url = 'file:///workletProcessor.js'; } });
  await module.link(() => { throw new Error('Unexpected external worklet import'); });
  await module.evaluate({ timeout: 5000 });
  const bytes = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
  const processor = new Processor({ processorOptions: owned ? { mode: engine === 'gtcrn' ? 'strong' : 'standard', rnnoiseBinary: rnnoise.buffer.slice(rnnoise.byteOffset, rnnoise.byteOffset + rnnoise.byteLength), gtcrnBinary: engine === 'gtcrn' ? bytes : undefined } : { wasmBinary: bytes, maxChannels: 1 } });
  const deadline = performance.now() + 5000;
  while (!(owned ? messages.some(value => value.type === 'ready') : processor.processor) && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  if (!(owned ? messages.some(value => value.type === 'ready') : processor.processor)) throw new Error(`${engine} initialization failed: ${errors.join(';')} ${JSON.stringify(messages)}`);
  return {
    process(samples) {
      const paddedLength = Math.ceil((samples.length + 8192) / 128) * 128;
      const output = new Float32Array(paddedLength), input = new Float32Array(128);
      const started = performance.now();
      for (let offset = 0; offset < paddedLength; offset += 128) {
        input.fill(0); if (offset < samples.length) input.set(samples.subarray(offset, offset + 128));
        const block = output.subarray(offset, offset + 128);
        if (processor.process([[input]], [[block]], {}) === false) throw new Error(`${engine}: worklet stopped: ${JSON.stringify(messages.at(-1))}`);
      }
      return { samples: output, processingMs: performance.now() - started };
    }, verifyInvalidInput() { if (!owned) return; const invalid=new Float32Array(128);invalid[0]=NaN;if(processor.process([[invalid]],[[new Float32Array(128)]],{})!==false||messages.at(-1)?.type!=='error')throw new Error('Invalid input did not fail closed'); }, destroy() { if (owned) processor.port.onmessage({data:{type:'destroy'}}); else processor.destroy(); },
  };
}
function alignedSpeech(reference, output, start, end) {
  let bestLag = 0, bestCorrelation = -Infinity;
  const from = Math.floor(start * 48000), to = Math.min(reference.length, Math.floor(end * 48000));
  for (let lag = 0; lag < 8192; lag += 16) {
    let dot = 0, power = 0;
    for (let i = from; i < to; i += 16) { dot += reference[i] * output[i + lag]; power += output[i + lag] ** 2; }
    const correlation = dot / Math.sqrt(Math.max(power, 1e-20));
    if (correlation > bestCorrelation) { bestCorrelation = correlation; bestLag = lag; }
  }
  const coarseLag = bestLag;
  for (let lag = Math.max(0, coarseLag - 16); lag <= coarseLag + 16; lag++) {
    let dot = 0, power = 0;
    for (let i = from; i < to; i += 4) { dot += reference[i] * output[i + lag]; power += output[i + lag] ** 2; }
    const correlation = dot / Math.sqrt(Math.max(power, 1e-20));
    if (lag === Math.max(0, coarseLag - 16) || correlation > bestCorrelation) { bestCorrelation = correlation; bestLag = lag; }
  }
  let dot = 0, refPower = 0;
  for (let i = from; i < to; i++) { dot += reference[i] * output[i + bestLag]; refPower += reference[i] ** 2; }
  const scale = dot / refPower;
  let targetPower = 0, residualPower = 0;
  for (let i = from; i < to; i++) { const target = reference[i] * scale; targetPower += target ** 2; residualPower += (output[i + bestLag] - target) ** 2; }
  return { estimatedDelayMs: bestLag / 48, speechSiSdrDb: 10 * Math.log10(Math.max(targetPower, 1e-20) / Math.max(residualPower, 1e-20)), speechProjectionGainDb: 20 * Math.log10(Math.max(Math.abs(scale), 1e-20)) };
}
const human = process.argv.includes('--human');
const speech = decodeWav(await readFile(path.join(directory, human ? 'human-speech.wav' : 'speech.wav')));
const duration = Math.ceil(2 + speech.length / 48000 + 1), voice = new Float32Array(duration * 48000);
const speechGain = .12 / rms(speech);
for (let i = 0; i < speech.length; i++) voice[2 * 48000 + i] = speech[i] * speechGain;
const cases = [];
for (const name of ['clean', 'keyboard', 'wood-knock', 'glass-break', 'dishes', 'vacuum']) {
  const noisy = new Float32Array(voice), noise = name === 'clean' ? null : decodeWav(await readFile(path.join(directory, `${name}.wav`)));
  if (noise) { const gain = .06 / rms(noise); for (let i = 0; i < noisy.length; i++) noisy[i] += noise[i % noise.length] * gain; }
  await writeFile(path.join(directory, `${name}-input.wav`), encodeWav(noisy));
  const unprocessed = alignedSpeech(voice, noisy, 2, 2 + speech.length / 48000);
  for (const engine of ['rnnoise', 'gtcrn']) {
    const processor = await model(engine);
    const output = processor.process(noisy); processor.verifyInvalidInput(); processor.destroy();
    if (![...output.samples].every(Number.isFinite) || energy(output.samples) === 0) throw new Error(`${engine}: invalid/silent output`);
    const metrics = alignedSpeech(voice, output.samples, 2, 2 + speech.length / 48000);
    const rawNoisePower = energy(noisy.subarray(24000, 96000)), filteredNoisePower = energy(output.samples.subarray(24000 + Math.round(metrics.estimatedDelayMs * 48), 96000 + Math.round(metrics.estimatedDelayMs * 48)));
    const record = { name, engine, duration, noiseOnlyBelowMeasurementFloor: !!noise && filteredNoisePower / 72000 < 1e-12, noiseOnlyReductionDb: noise && filteredNoisePower / 72000 >= 1e-12 ? 10 * Math.log10(rawNoisePower / filteredNoisePower) : null, inputSpeechSiSdrDb: unprocessed.speechSiSdrDb, ...metrics, processingMs: output.processingMs, offlineRealTimeFactor: output.processingMs / (duration * 1000) };
    cases.push(record);console.log(JSON.stringify(record));
    await writeFile(path.join(directory, `${name}-${engine}.wav`), encodeWav(output.samples));
  }
}
await writeFile(path.join(directory, human ? 'human-benchmark.json' : process.argv.includes('--owned') ? 'owned-benchmark.json' : 'benchmark.json'), JSON.stringify({ method: 'Exact distributed worklet inference in a Node VM, 48 kHz mono; Speech fixture and noise provenance are recorded in the report. Wood/glass impacts are proxies for the user pen; dishes are a real Freesound recording, not the user microphone. Delay estimated by speech correlation, not end-to-end transport latency.', cases }, null, 2));
