import {
  fromBase64,
  parsePersonalSoundWav,
} from '../../../packages/shared-contracts/src/personal-sound-audio';

export interface PersonalSoundRequest {
  channelId: string;
  userId: string;
  sound: string;
}
type Read = (channelId: string, userId: string, soundId: string) => Promise<string>;
export const PERSONAL_SOUND_CACHE_LIMITS = {
  entries: 24,
  bytes: 10_000_000,
  failureMs: 60_000,
  prefetchGapMs: 300,
};
const bridgeRead = (): Read | undefined => {
  const bridge = window.rooms?.personalSounds;
  return bridge && ((channelId, userId, soundId) => bridge.read(channelId, userId, soundId));
};

/**
 * Other people's clips as blob URLs for the current account. Without the desktop bridge every
 * lookup is unavailable, so callers fall back to the classic cue.
 */
export class PersonalSoundCache {
  private scope = '';
  private generation = 0;
  private bytes = 0;
  private readonly entries = new Map<string, { url: string; size: number }>();
  private readonly pending = new Map<string, Promise<string | null>>();
  private readonly failed = new Map<string, number>();
  private queue: PersonalSoundRequest[] = [];
  private prefetching = false;
  constructor(
    private readonly read: () => Read | undefined = bridgeRead,
    private readonly limits = PERSONAL_SOUND_CACHE_LIMITS,
  ) {}
  get available() {
    return !!this.read();
  }
  /** Another account never reuses a clip or a failure fetched by this one. */
  setScope(scope: string) {
    if (scope === this.scope) return;
    this.clear();
    this.scope = scope;
  }
  clear() {
    this.generation++;
    for (const entry of this.entries.values()) URL.revokeObjectURL(entry.url);
    this.entries.clear();
    this.pending.clear();
    this.failed.clear();
    this.queue = [];
    this.prefetching = false;
    this.bytes = 0;
  }
  /** The clip's URL, or null when it cannot be had; never rejects. */
  resolve(request: PersonalSoundRequest): Promise<string | null> {
    const key = this.key(request.sound),
      ready = this.entries.get(key);
    if (ready) {
      this.entries.delete(key);
      this.entries.set(key, ready);
      return Promise.resolve(ready.url);
    }
    const running = this.pending.get(key);
    if (running) return running;
    const read = this.read();
    if (!read || !request.channelId || this.failing(key)) return Promise.resolve(null);
    const generation = this.generation;
    const task = Promise.resolve()
      .then(() => read(request.channelId, request.userId, request.sound))
      .then((value) => {
        const bytes = fromBase64(value);
        // Anything but the canonical clip is a failure here, never something handed to playback.
        parsePersonalSoundWav(bytes);
        return bytes;
      })
      .then(
        (bytes) => (generation === this.generation ? this.store(key, bytes) : null),
        () => {
          if (generation === this.generation) {
            this.pending.delete(key);
            this.failed.set(key, performance.now());
          }
          return null;
        },
      );
    this.pending.set(key, task);
    return task;
  }
  /** Background warm-up, one request at a time; a newer list replaces what is still queued. */
  prefetch(requests: PersonalSoundRequest[]) {
    this.queue = requests.filter((request) => this.wanted(request));
    if (!this.prefetching && this.queue.length) void this.drain(this.generation);
  }
  private async drain(generation: number) {
    this.prefetching = true;
    try {
      while (generation === this.generation) {
        await new Promise((done) => setTimeout(done, this.limits.prefetchGapMs));
        const request = generation === this.generation ? this.queue.shift() : undefined;
        if (!request) break;
        if (this.wanted(request)) await this.resolve(request);
      }
    } finally {
      if (generation === this.generation) this.prefetching = false;
    }
  }
  private wanted(request: PersonalSoundRequest) {
    const key = this.key(request.sound);
    return (
      !!request.channelId &&
      !this.entries.has(key) &&
      !this.pending.has(key) &&
      !this.failing(key) &&
      this.available
    );
  }
  private failing(key: string) {
    const at = this.failed.get(key);
    if (at === undefined) return false;
    if (performance.now() - at < this.limits.failureMs) return true;
    this.failed.delete(key);
    return false;
  }
  private store(key: string, bytes: Uint8Array) {
    this.pending.delete(key);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/wav' }));
    this.entries.set(key, { url, size: bytes.byteLength });
    this.bytes += bytes.byteLength;
    for (const [old, entry] of this.entries) {
      if (old === key) break;
      if (this.entries.size <= this.limits.entries && this.bytes <= this.limits.bytes) break;
      this.entries.delete(old);
      this.bytes -= entry.size;
      URL.revokeObjectURL(entry.url);
    }
    return url;
  }
  private key(sound: string) {
    return JSON.stringify([this.scope, sound]);
  }
}
