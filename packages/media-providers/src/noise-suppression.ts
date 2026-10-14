import workletUrl from './noise-worklet.ts?worker&url';
import rnnoiseUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import gtcrnUrl from '@sapphi-red/gtcrn-wasm/gtcrn.wasm?url';
export type NoiseSuppressionMode = 'standard' | 'strong';
export interface NoiseProcessingStats {
  speechGateOpen: boolean;
  averageFrameMs: number;
  maxFrameMs: number;
}
export interface NoiseProcessingState {
  status: 'off' | 'starting' | 'active' | 'failed';
  mode: NoiseSuppressionMode;
  stats?: NoiseProcessingStats;
}
const binaries = new Map<string, Promise<ArrayBuffer>>();
const modules = new WeakMap<AudioContext, Promise<void>>();
function binary(url: string) {
  let loaded = binaries.get(url);
  if (!loaded) {
    loaded = fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error('Model could not be loaded');
        const bytes = await response.arrayBuffer();
        await WebAssembly.compile(bytes);
        return bytes;
      })
      .catch((error) => {
        binaries.delete(url);
        throw error;
      });
    binaries.set(url, loaded);
  }
  return loaded;
}
export type NoiseSuppressionNode = AudioWorkletNode & { destroy(): void };
/** Cancelling one caller must not cancel the shared model download. */
function cancellable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
/** Return only after models initialize; errors never trigger a raw fallback. */
export async function createNoiseSuppressionNode(
  context: AudioContext,
  mode: NoiseSuppressionMode,
  callbacks: {
    error?(): void;
    stats?(value: NoiseProcessingStats): void;
    signal?: AbortSignal;
  } = {},
): Promise<NoiseSuppressionNode> {
  const check = () => {
    if (callbacks.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  };
  check();
  if (
    typeof AudioWorkletNode !== 'function' ||
    context.sampleRate !== 48000 ||
    !context.audioWorklet
  )
    throw new Error('Gürültü azaltma için 48 kHz ses işleme desteği gerekiyor.');
  let module = modules.get(context);
  if (!module) {
    module = context.audioWorklet.addModule(workletUrl).catch((error) => {
      modules.delete(context);
      throw error;
    });
    modules.set(context, module);
  }
  const [rnnoiseBinary, gtcrnBinary] = await cancellable(
    Promise.all([binary(rnnoiseUrl), mode === 'strong' ? binary(gtcrnUrl) : undefined, module]),
    callbacks.signal,
  );
  check();
  const node = new AudioWorkletNode(context, 'rooms-noise-suppression', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: 'explicit',
    processorOptions: { mode, rnnoiseBinary, gtcrnBinary },
  }) as NoiseSuppressionNode;
  let disposed = false;
  node.destroy = () => {
    if (!disposed) {
      disposed = true;
      node.port.postMessage({ type: 'destroy' });
      node.disconnect();
      node.port.close();
    }
  };
  try {
    await new Promise<void>((resolve, reject) => {
      let ready = false;
      const fail = () => {
        if (!ready) {
          clearTimeout(timer);
          callbacks.signal?.removeEventListener('abort', abort);
          reject(new Error('Gürültü filtresi başlatılamadı. Standart modu seçip yeniden dene.'));
        } else callbacks.error?.();
      };
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      const timer = setTimeout(fail, 8000);
      callbacks.signal?.addEventListener('abort', abort, { once: true });
      node.addEventListener('processorerror', fail);
      node.port.onmessage = (event) => {
        if (event.data?.type === 'ready') {
          ready = true;
          clearTimeout(timer);
          callbacks.signal?.removeEventListener('abort', abort);
          resolve();
        } else if (event.data?.type === 'error') fail();
        else if (event.data?.type === 'stats') callbacks.stats?.(event.data);
      };
    });
    return node;
  } catch (error) {
    node.destroy();
    throw error;
  }
}
