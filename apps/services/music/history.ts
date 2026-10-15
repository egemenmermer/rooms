import { mkdir, readFile, open, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  musicHistorySchema,
  type MusicHistorySession,
} from '../../../packages/shared-contracts/src/music';
import { spotifyPlaylistTrackSchema } from '../../../packages/shared-contracts/src/music-playlists';
const storedSource = z.union([
  z.string().regex(/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/),
  spotifyPlaylistTrackSchema,
]);
const stored = z
  .object({
    channelId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    session: musicHistorySchema.element,
    sources: z.array(storedSource).max(100),
  })
  .strict();
type Record = z.infer<typeof stored>;
/** Public YouTube references and Spotify display metadata only; provider tokens and private media URLs are never archived. */
export class MusicHistory {
  private records: Record[] = [];
  private ready: Promise<void>;
  private serial: Promise<unknown> = Promise.resolve();
  constructor(private path?: string) {
    this.ready = this.load();
    void this.ready.catch(() => {});
  }
  private async load() {
    if (!this.path) return;
    try {
      const bytes = await readFile(this.path);
      if (bytes.length > 10 * 1024 * 1024) throw Error('MUSIC_HISTORY_INVALID');
      this.records = z.array(stored).max(200).parse(JSON.parse(bytes.toString()));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  async list(channelId: string): Promise<MusicHistorySession[]> {
    await this.ready;
    return this.records
      .filter((r) => r.channelId === channelId)
      .map((r) => structuredClone(r.session))
      .reverse();
  }
  async replay(channelId: string, id: string) {
    await this.ready;
    return structuredClone(
      this.records.find((r) => r.channelId === channelId && r.session.id === id) ?? null,
    );
  }
  async save(
    channelId: string,
    session: MusicHistorySession,
    sources: z.infer<typeof storedSource>[],
  ) {
    const record = stored.parse({ channelId, session, sources });
    if (record.sources.length !== record.session.tracks.length)
      throw Error('MUSIC_HISTORY_INVALID');
    const job = this.serial
      .catch(() => {})
      .then(async () => {
        await this.ready;
        const records = [...this.records.filter((r) => r.session.id !== session.id), record].slice(
          -200,
        );
        const same = records.filter((r) => r.channelId === channelId);
        const expired = new Set(
          same.slice(0, Math.max(0, same.length - 30)).map((r) => r.session.id),
        );
        const next = records.filter((r) => !expired.has(r.session.id));
        if (this.path) {
          await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
          const file = await open(this.path + '.stage', 'w', 0o600);
          try {
            await file.writeFile(JSON.stringify(next));
            await file.sync();
          } finally {
            await file.close();
          }
          await rename(this.path + '.stage', this.path);
          if (process.platform !== 'win32') {
            const directory = await open(dirname(this.path), 'r');
            try {
              await directory.sync();
            } finally {
              await directory.close();
            }
          }
        }
        this.records = next;
      });
    this.serial = job;
    await job;
  }
}
