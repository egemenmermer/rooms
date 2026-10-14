import { GtcrnProcessor, loadGtcrnModule } from '@sapphi-red/gtcrn-wasm';
import { loadRnnoiseCore } from './rnnoise-core';
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: unknown): void;

// AudioWorkletGlobalScope does not expose performance in Electron/Chromium.
const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

class RoomsNoiseProcessor extends AudioWorkletProcessor {
  private rnnoise?: Awaited<ReturnType<typeof loadRnnoiseCore>>;
  private gtcrn?: GtcrnProcessor;
  private destroyed = false;
  private ready = false;
  private strong: boolean;
  private frame?: Float32Array;
  private framePosition = 0;
  private vadFrame = new Float32Array(480);
  private vadPosition = 0;
  private output = new Float32Array(8192);
  private writePosition = 0;
  private readPosition = 0;
  private queued = 0;
  private inputSamples = 0;
  private speechFrames = 0;
  private lastSpeechSample = -48000;
  private gain = 0;
  private frameCount = 0;
  private frameTime = 0;
  private maxFrameTime = 0;
  private lastReport = 0;
  constructor(options: {
    processorOptions: { mode: string; rnnoiseBinary: ArrayBuffer; gtcrnBinary?: ArrayBuffer };
  }) {
    super();
    this.strong = options.processorOptions.mode === 'strong';
    this.port.onmessage = (event) => {
      if (event.data?.type === 'destroy') this.destroy();
    };
    void this.initialize(options.processorOptions);
  }
  private async initialize(options: { rnnoiseBinary: ArrayBuffer; gtcrnBinary?: ArrayBuffer }) {
    try {
      if (sampleRate !== 48000) throw new Error('Unsupported sample rate');
      this.rnnoise = await loadRnnoiseCore(options.rnnoiseBinary);
      if (this.strong) {
        if (!options.gtcrnBinary) throw new Error('Missing model');
        const module = await loadGtcrnModule({
          wasmBinary: options.gtcrnBinary,
          locateFile: (file) => file,
        });
        this.gtcrn = new GtcrnProcessor(module, { sampleRate: 48000 });
      }
      if (this.destroyed) {
        this.releaseModels();
        return;
      }
      const frameSize = this.gtcrn?.frameSize ?? this.rnnoise.frameSize;
      this.frame = new Float32Array(frameSize);
      // Strong mode gives speech detection 32 ms of extra lookahead.
      this.queued = this.strong ? frameSize - 128 + 1536 : 512;
      this.writePosition = this.queued;
      this.ready = true;
      this.port.postMessage({ type: 'ready', mode: this.strong ? 'strong' : 'standard' });
    } catch (error) {
      this.port.postMessage({
        type: 'error',
        reason:
          error instanceof Error ? error.message.slice(0, 240) : 'Model initialization failed',
      });
      this.destroy();
    }
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    if (this.destroyed) return false;
    const input = inputs[0]?.[0],
      output = outputs[0]?.[0];
    if (!this.ready || !this.frame || !input || !output) return true;
    try {
      if (input.length !== 128 || output.length !== 128)
        throw new Error('Unsupported render block');
      for (const sample of input) {
        if (!Number.isFinite(sample)) throw new Error('Invalid input sample');
        this.frame[this.framePosition++] = sample;
        this.inputSamples++;
        if (this.strong) {
          this.vadFrame[this.vadPosition++] = sample;
          if (this.vadPosition === this.vadFrame.length) {
            const probability = this.rnnoise!.process(this.vadFrame);
            if (!Number.isFinite(probability)) throw new Error('Invalid speech score');
            this.speechFrames = probability >= 0.6 ? this.speechFrames + 1 : 0;
            if (
              this.speechFrames >= 2 ||
              (probability >= 0.2 && this.inputSamples - this.lastSpeechSample < 14400)
            )
              this.lastSpeechSample = this.inputSamples;
            this.vadPosition = 0;
          }
        }
        if (this.framePosition === this.frame.length) {
          const started = now();
          let denoised: Float32Array;
          if (this.gtcrn) denoised = this.gtcrn.process(this.frame);
          else {
            this.rnnoise!.process(this.frame);
            denoised = this.frame;
          }
          const elapsed = now() - started;
          this.frameTime += elapsed;
          this.maxFrameTime = Math.max(this.maxFrameTime, elapsed);
          this.frameCount++;
          if (this.queued + denoised.length > this.output.length)
            throw new Error('Output overflow');
          for (const value of denoised) {
            if (!Number.isFinite(value)) throw new Error('Invalid output sample');
            this.output[this.writePosition] = value;
            this.writePosition = (this.writePosition + 1) % this.output.length;
          }
          this.queued += denoised.length;
          this.framePosition = 0;
        }
      }
      const open = !this.strong || this.inputSamples - this.lastSpeechSample < 14400;
      for (let i = 0; i < output.length; i++) {
        if (!this.queued) throw new Error('Output underrun');
        this.gain += ((open ? 1 : 0) - this.gain) * 0.004;
        output[i] = this.output[this.readPosition] * (this.strong ? this.gain : 1);
        this.readPosition = (this.readPosition + 1) % this.output.length;
        this.queued--;
      }
      if (this.inputSamples - this.lastReport >= 24000) {
        this.lastReport = this.inputSamples;
        this.port.postMessage({
          type: 'stats',
          speechGateOpen: open,
          averageFrameMs: this.frameCount ? this.frameTime / this.frameCount : 0,
          maxFrameMs: this.maxFrameTime,
        });
        this.frameCount = 0;
        this.frameTime = 0;
        this.maxFrameTime = 0;
      }
      return true;
    } catch (error) {
      this.port.postMessage({
        type: 'error',
        reason: error instanceof Error ? error.message.slice(0, 240) : 'Processing failed',
      });
      this.destroy();
      return false;
    }
  }
  private releaseModels() {
    this.rnnoise?.destroy();
    this.rnnoise = undefined;
    this.gtcrn?.destroy();
    this.gtcrn = undefined;
  }
  private destroy() {
    this.destroyed = true;
    this.ready = false;
    this.releaseModels();
  }
}
registerProcessor('rooms-noise-suppression', RoomsNoiseProcessor);
