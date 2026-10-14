interface RnnoiseExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  emscripten_stack_init(): void;
  __wasm_call_ctors(): void;
  rnnoise_get_frame_size(): number;
  rnnoise_create(model: number): number;
  rnnoise_destroy(state: number): void;
  rnnoise_process_frame(state: number, output: number, input: number): number;
  malloc(bytes: number): number;
  free(pointer: number): void;
}
/** Bind the pinned open-source C ABI without a DOM-dependent loader. */
export async function loadRnnoiseCore(binary: ArrayBuffer) {
  let memory: WebAssembly.Memory;
  const { instance } = await WebAssembly.instantiate(binary, {
    env: {
      emscripten_memcpy_big(destination: number, source: number, length: number) {
        new Uint8Array(memory.buffer).copyWithin(destination, source, source + length);
        return destination;
      },
      emscripten_resize_heap(size: number) {
        try {
          if (size > 64 * 1024 * 1024) return 0;
          memory.grow(Math.max(0, Math.ceil((size - memory.buffer.byteLength) / 65536)));
          return 1;
        } catch {
          return 0;
        }
      },
      __assert_fail() {
        throw new Error('RNNoise runtime assertion failed');
      },
    },
  });
  const api = instance.exports as RnnoiseExports;
  memory = api.memory;
  api.emscripten_stack_init();
  api.__wasm_call_ctors();
  const frameSize = api.rnnoise_get_frame_size();
  if (frameSize !== 480) throw new Error('Unsupported RNNoise frame size');
  const state = api.rnnoise_create(0),
    input = api.malloc(frameSize * 4),
    output = api.malloc(frameSize * 4);
  if (!state || !input || !output) {
    if (state) api.rnnoise_destroy(state);
    if (input) api.free(input);
    if (output) api.free(output);
    throw new Error('RNNoise allocation failed');
  }
  let destroyed = false;
  return {
    frameSize,
    process(frame: Float32Array) {
      if (destroyed || frame.length !== frameSize)
        throw new Error('Invalid RNNoise state or frame');
      let heap = new Float32Array(memory.buffer);
      for (let i = 0; i < frameSize; i++) heap[input / 4 + i] = frame[i] * 32767;
      const probability = api.rnnoise_process_frame(state, output, input);
      heap = new Float32Array(memory.buffer);
      for (let i = 0; i < frameSize; i++) frame[i] = heap[output / 4 + i] / 32767;
      return probability;
    },
    destroy() {
      if (!destroyed) {
        destroyed = true;
        api.rnnoise_destroy(state);
        api.free(input);
        api.free(output);
      }
    },
  };
}
