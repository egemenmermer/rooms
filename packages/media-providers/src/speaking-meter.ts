/** Visual speech activity from existing microphone tracks; never captures or plays audio. */
export class SpeakingMeter {
  private context: AudioContext | null = null;
  private nodes = new Map<
    string,
    {
      track: MediaStreamTrack;
      source: MediaStreamAudioSourceNode;
      analyser: AnalyserNode;
      samples: Float32Array<ArrayBuffer>;
      speaking: boolean;
      lastLoud: number;
    }
  >();
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(
    private changed: () => void,
    private createContext = () => new AudioContext(),
  ) {}
  reconcile(tracks: Map<string, MediaStreamTrack>) {
    for (const [id, node] of this.nodes)
      if (tracks.get(id) !== node.track) {
        node.source.disconnect();
        node.analyser.disconnect();
        this.nodes.delete(id);
      }
    if (!tracks.size) {
      this.stop();
      return;
    }
    try {
      this.context ??= this.createContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
      for (const [id, track] of tracks)
        if (!this.nodes.has(id)) {
          const source = this.context.createMediaStreamSource(new MediaStream([track]));
          const analyser = this.context.createAnalyser();
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0;
          source.connect(analyser);
          this.nodes.set(id, {
            track,
            source,
            analyser,
            samples: new Float32Array(analyser.fftSize),
            speaking: false,
            lastLoud: -Infinity,
          });
        }
      this.timer ??= setInterval(() => this.sample(), 40);
    } catch {
      this.stop(); /* SDK speaking state remains available when Web Audio cannot run. */
    }
  }
  speaking(id: string): boolean | undefined {
    return this.context?.state === 'running' ? this.nodes.get(id)?.speaking : undefined;
  }
  private sample() {
    if (this.context?.state !== 'running') return;
    let changed = false;
    const now = performance.now();
    for (const node of this.nodes.values()) {
      node.analyser.getFloatTimeDomainData(node.samples);
      const rms = Math.sqrt(
        node.samples.reduce((sum, value) => sum + value * value, 0) / node.samples.length,
      );
      if (rms >= (node.speaking ? 0.008 : 0.012)) node.lastLoud = now;
      const speaking =
        node.track.readyState !== 'ended' && !node.track.muted && now - node.lastLoud < 180;
      if (speaking !== node.speaking) {
        node.speaking = speaking;
        changed = true;
      }
    }
    if (changed) this.changed();
  }
  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    for (const node of this.nodes.values()) {
      node.source.disconnect();
      node.analyser.disconnect();
    }
    this.nodes.clear();
    const context = this.context;
    this.context = null;
    if (context) void context.close().catch(() => {});
  }
}
