import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ActivityEvent, RoomSnapshot } from '../../../packages/activity-protocol/src/index';
import {decodeStoredRoom} from './storage-codec';
import type { GameTable } from './games';

export interface StoredRoom { schemaVersion?:1; snapshot: RoomSnapshot; events: ActivityEvent[]; receipts: { actorId: string; commandId: string; fingerprint: string; revision: number }[]; game?: GameTable | null; gameArchives?: { kind: GameTable['kind']; history: GameTable['history']; statistics: GameTable['statistics'] }[] }
export interface ActivityRepository {
  load(roomId: string): Promise<StoredRoom | null>;
  save(room: StoredRoom): Promise<void>;
  list(): Promise<StoredRoom[]>;
}
export class MemoryActivityRepository implements ActivityRepository {
  private rooms = new Map<string, StoredRoom>();
  async load(id: string) { return structuredClone(this.rooms.get(id) ?? null); }
  async save(room: StoredRoom) { this.rooms.set(room.snapshot.roomId, structuredClone(room)); }
  async list() { return structuredClone([...this.rooms.values()]); }
}
/** Local-development persistence. One server process only; use a transaction repository in production. */
export class FileActivityRepository implements ActivityRepository {
  private rooms = new Map<string, StoredRoom>();
  private writes: Promise<void> = Promise.resolve();
  private constructor(private directory: string) {}
  static async open(directory: string) {
    const repository = new FileActivityRepository(directory);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      const value: unknown = JSON.parse(await readFile(join(directory, 'activities.json'), 'utf8'));
      if (!Array.isArray(value)) throw new Error('Invalid Activity repository');
      for (const item of value) {
        const room=decodeStoredRoom(item);
        if(repository.rooms.has(room.snapshot.roomId))throw new Error('Duplicate Activity room');
        repository.rooms.set(room.snapshot.roomId, room);
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return repository;
  }
  async load(id: string) { return structuredClone(this.rooms.get(id) ?? null); }
  async list() { return structuredClone([...this.rooms.values()]); }
  async save(room: StoredRoom) {
    // Publish to memory only after the durable atomic replacement succeeds.
    const work = this.writes.catch(() => {}).then(async () => {
      const validated=decodeStoredRoom(room);
      const next = new Map(this.rooms); next.set(validated.snapshot.roomId, validated);
      const temporary = join(this.directory, 'activities.json.tmp');
      await writeFile(temporary, JSON.stringify([...next.values()]), { mode: 0o600 });
      await rename(temporary, join(this.directory, 'activities.json')); this.rooms = next;
    });
    this.writes = work; await work;
  }
}
