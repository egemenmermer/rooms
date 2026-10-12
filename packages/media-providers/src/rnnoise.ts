import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import simdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import type { RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';

let binary: Promise<ArrayBuffer> | undefined;
const modules = new WeakMap<BaseAudioContext, Promise<void>>();

/** Bundled assets only; microphone audio never leaves the device for processing. */
export async function createRnnoiseNode(context: AudioContext): Promise<RnnoiseWorkletNode> {
  if (context.sampleRate !== 48_000 || !context.audioWorklet)
    throw new Error('RNNoise için 48 kHz ses işleme desteği gerekiyor.');
  const { loadRnnoise, RnnoiseWorkletNode } = await import('@sapphi-red/web-noise-suppressor');
  binary ??= loadRnnoise({ url: wasmUrl, simdUrl }).catch(error => { binary = undefined; throw error; });
  let module = modules.get(context);
  if (!module) {
    module = context.audioWorklet.addModule(workletUrl).catch(error => { modules.delete(context); throw error; });
    modules.set(context, module);
  }
  const [wasmBinary] = await Promise.all([binary, module]);
  // Detect invalid assets and CSP failures before replacing the microphone path.
  await WebAssembly.compile(wasmBinary);
  return new RnnoiseWorkletNode(context, { wasmBinary, maxChannels: 1 });
}
