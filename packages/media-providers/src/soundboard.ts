import { Track, type TrackProcessor, type AudioProcessorOptions } from 'livekit-client';
import {
  createNoiseSuppressionNode,
  type NoiseSuppressionNode,
  type NoiseSuppressionMode,
  type NoiseProcessingStats,
} from './noise-suppression';
/** Mix a user-selected clip into the existing authorized microphone publication. */
export class SoundboardMixer implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = 'rooms-microphone-denoise-soundboard';
  constructor(
    private noiseSuppression = false,
    private mode: NoiseSuppressionMode = 'strong',
    private callbacks: { error?(): void; stats?(value: NoiseProcessingStats): void } = {},
  ) {}
  private destroyed = false;
  private denoiser?: NoiseSuppressionNode;
  private processingAbort?: AbortController;
  private async createDenoiser() {
    let node: NoiseSuppressionNode;
    node = await createNoiseSuppressionNode(this.context!, this.mode, {
      signal: this.processingAbort?.signal,
      error: () => {
        if (this.denoiser !== node) return;
        this.stop();
        this.input?.disconnect();
        this.processedTrack?.stop();
        this.callbacks.error?.();
      },
      stats: (value) => {
        if (this.denoiser === node) this.callbacks.stats?.(value);
      },
    });
    return node;
  }
  processedTrack?: MediaStreamTrack;
  private input?: MediaStreamAudioSourceNode;
  private destination?: MediaStreamAudioDestinationNode;
  private clip?: AudioBufferSourceNode;
  private gain?: GainNode;
  private context?: AudioContext;
  async init(options: AudioProcessorOptions) {
    if (this.destroyed) throw new DOMException('Cancelled', 'AbortError');
    this.processingAbort = new AbortController();
    this.context = options.audioContext ?? this.context;
    if (!this.context) throw new Error('Microphone audio context is unavailable.');
    this.input = this.context.createMediaStreamSource(new MediaStream([options.track]));
    this.destination = this.context.createMediaStreamDestination();
    try {
      if (this.noiseSuppression) {
        this.denoiser = await this.createDenoiser();
        this.input.connect(this.denoiser);
        this.denoiser.connect(this.destination);
      } else this.input.connect(this.destination);
      this.processedTrack = this.destination.stream.getAudioTracks()[0];
    } catch (error) {
      await this.destroy();
      throw error;
    }
  }
  // LiveKit track restart does not pass audioContext; preserve the original context.
  async restart(options: AudioProcessorOptions) {
    const context = this.context;
    await this.destroy();
    this.destroyed = false;
    await this.init({ ...options, audioContext: options.audioContext ?? context! });
  }
  async setNoiseSuppression(value: boolean, mode: NoiseSuppressionMode = this.mode) {
    if (value === this.noiseSuppression && mode === this.mode) return;
    if (!this.context || !this.input || !this.destination)
      throw new Error('Microphone processor is unavailable.');
    const previousMode = this.mode;
    this.mode = mode;
    let node: NoiseSuppressionNode | undefined;
    try {
      node = value ? await this.createDenoiser() : undefined;
    } catch (error) {
      this.mode = previousMode;
      throw error;
    }
    this.input.disconnect();
    this.denoiser?.destroy();
    this.denoiser = node;
    if (node) {
      this.input.connect(node);
      node.connect(this.destination);
    } else this.input.connect(this.destination);
    this.noiseSuppression = value;
  }
  stop() {
    const clip = this.clip;
    this.clip = undefined;
    if (clip) {
      clip.onended = null;
      try {
        clip.stop();
      } catch {}
      clip.disconnect();
    }
    this.gain?.disconnect();
    this.gain = undefined;
  }
  async play(buffer: AudioBuffer, volume: number, canPlay: () => boolean) {
    if (!this.context || !this.destination) throw new Error('Mikrofon kullanılamıyor.');
    this.stop();
    await this.context.resume();
    if (!canPlay()) return;
    const clip = this.context.createBufferSource(),
      gain = this.context.createGain();
    clip.buffer = buffer;
    gain.gain.value = volume;
    clip.connect(gain);
    gain.connect(this.destination);
    // Monitor only the selected clip. Never route microphone input to the speakers.
    gain.connect(this.context.destination);
    this.clip = clip;
    this.gain = gain;
    clip.onended = () => {
      if (this.clip === clip) this.stop();
    };
    clip.start();
  }
  async destroy() {
    this.destroyed = true;
    this.processingAbort?.abort();
    this.processingAbort = undefined;
    this.stop();
    this.input?.disconnect();
    this.denoiser?.disconnect();
    this.denoiser?.destroy();
    this.denoiser = undefined;
    this.processedTrack?.stop();
    this.destination?.stream.getTracks().forEach((track) => track.stop());
    this.input = undefined;
    this.destination = undefined;
    this.processedTrack = undefined;
    this.context = undefined;
  }
}
