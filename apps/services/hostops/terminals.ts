import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { opsId, terminalInfoSchema } from '../../../packages/shared-contracts/src/hostops';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  OpsTerminal,
  TerminalEvent,
  TerminalInput,
} from '../../../packages/shared-contracts/src/hostops';
export interface TerminalProfile {
  id: string;
  user: string;
  directory: string;
}
export interface TerminalDriver {
  exists(id: string, profile: TerminalProfile): boolean;
  create(id: string, profile: TerminalProfile): void;
  attach(
    id: string,
    profile: TerminalProfile,
    onData: (data: string) => void,
    onExit: () => void,
  ): { write(data: string): void; resize(cols: number, rows: number): void; detach(): void };
  close(id: string, profile: TerminalProfile): void;
}
interface RecordEntry {
  info: Omit<OpsTerminal, 'access' | 'writable'>;
  profileId: string;
  shares: Record<string, 'view' | 'control'>;
}
export class TerminalHub {
  private sessions = new Map<string, RecordEntry>();
  private stopped = false;
  private runtime = new Map<
    string,
    {
      driver: ReturnType<TerminalDriver['attach']>;
      output: string;
      sequence: number;
      writerKey: string | null;
      listeners: Map<string, (event: TerminalEvent) => void>;
      inputs: Map<string, number>;
    }
  >();
  constructor(
    private file: string,
    private profiles: TerminalProfile[],
    private driver: TerminalDriver,
    private now = () => Date.now(),
  ) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    try {
      const data = z
        .object({
          version: z.literal(1),
          sessions: z
            .array(
              z
                .object({
                  info: terminalInfoSchema.omit({ access: true, writable: true }),
                  profileId: opsId,
                  shares: z.record(opsId, z.enum(['view', 'control'])),
                })
                .strict(),
            )
            .max(10000),
        })
        .strict()
        .parse(JSON.parse(readFileSync(file, 'utf8')));
      for (const r of data.sessions) {
        if (!this.profile(r.profileId)) continue;
        if (['active', 'detached'].includes(r.info.state)) {
          r.info.state = this.driver.exists(r.info.id, this.profile(r.profileId)!)
            ? 'detached'
            : 'interrupted';
          r.info.detachedAt ??= this.now();
          r.info.writer = null;
        }
        this.sessions.set(r.info.id, r);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw Error('TERMINAL_STATE_INVALID');
    }
  }
  private profile(id: string) {
    return this.profiles.find((p) => p.id === id);
  }
  private save() {
    const t = this.file + '.tmp';
    writeFileSync(t, JSON.stringify({ version: 1, sessions: [...this.sessions.values()] }), {
      mode: 0o600,
    });
    renameSync(t, this.file);
  }
  private get(id: string, host: string, user: string) {
    if (this.stopped) throw Error('TERMINAL_BROKER_CLOSED');
    const r = this.sessions.get(id);
    if (
      !r ||
      r.info.hostId !== host ||
      !(r.info.ownerId === user || ['view', 'control'].includes(r.shares[user]))
    )
      throw Object.assign(Error('TERMINAL_ACCESS_DENIED'), { statusCode: 403 });
    return r;
  }
  check(host: string, id: string, user: string) {
    const r = this.get(id, host, user);
    if (!['active', 'detached'].includes(r.info.state)) throw Error('TERMINAL_CLOSED');
    return this.view(r, user);
  }
  hasProfile(id: string) {
    return !!this.profile(id);
  }
  private view(r: RecordEntry, user: string, connection?: string): OpsTerminal {
    return {
      ...r.info,
      access: r.info.ownerId === user ? 'owner' : r.shares[user] === 'control' ? 'control' : 'view',
      ...(connection
        ? {
            writable:
              this.runtime.get(r.info.id)?.writerKey === connection && r.info.writer === user,
          }
        : {}),
    };
  }
  list(host: string, user: string) {
    this.expire();
    return [...this.sessions.values()]
      .filter(
        (r) =>
          r.info.hostId === host &&
          (r.info.ownerId === user || ['view', 'control'].includes(r.shares[user])) &&
          !['closed', 'interrupted'].includes(r.info.state),
      )
      .map((r) => this.view(r, user));
  }
  create(
    host: string,
    user: string,
    profileId: string,
    workspace?: { taskId: string },
  ): OpsTerminal {
    if (this.stopped) throw Error('TERMINAL_BROKER_CLOSED');
    this.expire();
    const p = this.profile(profileId);
    if (!p) throw Object.assign(Error('TERMINAL_PROFILE_UNAVAILABLE'), { statusCode: 503 });
    if (this.list(host, user).filter((r) => r.ownerId === user).length >= 3)
      throw Object.assign(Error('TERMINAL_LIMIT'), { statusCode: 409 });
    if (
      [...this.sessions.values()].some(
        (r) =>
          r.profileId === profileId &&
          r.info.ownerId !== user &&
          !['closed', 'interrupted'].includes(r.info.state),
      )
    )
      throw Object.assign(Error('TERMINAL_PROFILE_IN_USE'), { statusCode: 409 });
    const id = randomUUID();
    this.driver.create(id, p);
    const r: RecordEntry = {
      profileId,
      shares: {},
      info: {
        id,
        hostId: host,
        ownerId: user,
        user: p.user,
        directory: p.directory,
        kind: workspace ? 'workspace' : 'host',
        taskId: workspace?.taskId ?? null,
        state: 'detached',
        writer: null,
        createdAt: this.now(),
        detachedAt: this.now(),
      },
    };
    this.sessions.set(id, r);
    this.save();
    return this.view(r, user);
  }
  private broadcast(r: RecordEntry) {
    const rt = this.runtime.get(r.info.id);
    for (const [u, cb] of rt?.listeners ?? [])
      cb({ type: 'state', session: this.view(r, u.split(':')[0], u) });
  }
  attach(host: string, id: string, user: string, cb: (event: TerminalEvent) => void) {
    const r = this.get(id, host, user);
    if (!['active', 'detached'].includes(r.info.state)) throw Error('TERMINAL_CLOSED');
    let rt = this.runtime.get(id);
    if (!rt) {
      const created = {
        output: '',
        sequence: 0,
        writerKey: null as string | null,
        listeners: new Map<string, (event: TerminalEvent) => void>(),
        inputs: new Map<string, number>(),
      };
      const driver = this.driver.attach(
        id,
        this.profile(r.profileId)!,
        (data) => {
          const active = this.runtime.get(id);
          if (!active) return;
          active.output = (active.output + data).slice(-262144);
          active.sequence++;
          for (const callback of active.listeners.values())
            callback({
              type: 'output',
              sequence: active.sequence,
              data: data.slice(-262144),
              reset: false,
            });
        },
        () => {
          if (this.stopped || r.info.state === 'closed') return;
          r.info.state = 'detached';
          r.info.writer = null;
          r.info.detachedAt = this.now();
          this.broadcast(r);
          this.save();
          for (const cb of this.runtime.get(id)?.listeners.values() ?? [])
            cb({ type: 'error', message: 'Terminal bağlantısı kesildi. Yeniden bağlan.' });
          this.runtime.delete(id);
        },
      );
      rt = { ...created, driver };
      this.runtime.set(id, rt);
    }
    const key = user + ':' + randomUUID();
    rt.listeners.set(key, cb);
    r.info.state = 'active';
    r.info.detachedAt = null;
    if (!r.info.writer && r.info.ownerId === user) r.info.writer = user;
    if (r.info.writer === user && !rt.writerKey) rt.writerKey = key;
    cb({ type: 'output', sequence: rt.sequence, data: rt.output, reset: true });
    this.broadcast(r);
    this.save();
    let detached = false;
    const detach = () => {
      if (detached || this.stopped) return;
      detached = true;
      rt!.listeners.delete(key);
      rt!.inputs.delete(key);
      if (rt!.writerKey === key)
        rt!.writerKey = [...rt!.listeners.keys()].find((k) => k.startsWith(user + ':')) ?? null;
      if (
        ![...rt!.listeners.keys()].some((k) => k.startsWith(user + ':')) &&
        r.info.writer === user
      )
        r.info.writer = null;
      if (!rt!.listeners.size) {
        r.info.state = 'detached';
        r.info.detachedAt = this.now();
      }
      this.broadcast(r);
      this.save();
    };
    return {
      input: (value: TerminalInput) => {
        if (detached || !this.runtime.get(id)?.listeners.has(key)) throw Error('TERMINAL_DETACHED');
        const current = this.get(id, host, user);
        if (!['active', 'detached'].includes(current.info.state)) throw Error('TERMINAL_CLOSED');
        if (value.type === 'detach') {
          detach();
          return;
        }
        if (
          rt!.writerKey !== key ||
          current.info.writer !== user ||
          (current.info.ownerId !== user && current.shares[user] !== 'control')
        )
          throw Error('TERMINAL_VIEW_ONLY');
        if (value.type === 'resize') rt!.driver.resize(value.cols, value.rows);
        else {
          const last = rt!.inputs.get(key) ?? -1;
          if (value.sequence <= last) throw Error('TERMINAL_STALE_INPUT');
          rt!.inputs.set(key, value.sequence);
          rt!.driver.write(value.data);
        }
      },
      detach: () => detach(),
    };
  }
  detachAll(host: string, user: string, sessionId?: string) {
    for (const r of this.sessions.values())
      if (r.info.hostId === host && (!sessionId || r.info.id === sessionId)) {
        const rt = this.runtime.get(r.info.id);
        for (const key of rt?.listeners.keys() ?? [])
          if (key.startsWith(user + ':')) {
            rt?.listeners.get(key)?.({
              type: 'error',
              message: 'Terminal erişimin değişti. Yeniden bağlan.',
            });
            rt?.listeners.delete(key);
            rt?.inputs.delete(key);
          }
        if (r.info.writer === user) {
          r.info.writer = null;
          if (rt) rt.writerKey = null;
        }
        if (rt && !rt.listeners.size) {
          r.info.state = 'detached';
          r.info.detachedAt = this.now();
        }
        this.broadcast(r);
        this.save();
      }
  }
  revokeUser(host: string, user: string) {
    for (const r of this.sessions.values())
      if (r.info.hostId === host) {
        if (r.info.ownerId === user && ['active', 'detached'].includes(r.info.state))
          this.action(host, r.info.id, user, 'close');
        delete r.shares[user];
      }
    this.detachAll(host, user);
    this.save();
  }
  action(
    host: string,
    id: string,
    user: string,
    action: 'close' | 'take' | 'release' | 'share',
    target?: { userId: string; access: 'view' | 'control' | 'none' },
  ): OpsTerminal {
    this.check(host, id, user);
    const r = this.get(id, host, user),
      owner = r.info.ownerId === user;
    if (action === 'close' || action === 'share') {
      if (!owner) throw Object.assign(Error('TERMINAL_OWNER_REQUIRED'), { statusCode: 403 });
    }
    if (action === 'close') {
      this.driver.close(id, this.profile(r.profileId)!);
      r.info.state = 'closed';
      r.info.detachedAt = this.now();
      r.info.writer = null;
      this.broadcast(r);
      this.runtime.get(id)?.driver.detach();
      this.runtime.delete(id);
    }
    if (action === 'share') {
      if (!target) throw Error('TARGET_REQUIRED');
      if (target.access === 'none') {
        delete r.shares[target.userId];
        this.detachAll(host, target.userId, id);
      } else r.shares[target.userId] = target.access;
      if (r.info.writer === target.userId && target.access !== 'control') r.info.writer = null;
    }
    if (action === 'take') {
      if (!owner && r.shares[user] !== 'control') throw Error('TERMINAL_VIEW_ONLY');
      if (r.info.writer && r.info.writer !== user && !owner)
        throw Object.assign(Error('TERMINAL_WRITER_BUSY'), { statusCode: 409 });
      r.info.writer = user;
      const rt = this.runtime.get(id);
      if (rt) rt.writerKey = [...rt.listeners.keys()].find((k) => k.startsWith(user + ':')) ?? null;
    }
    if (action === 'release' && r.info.writer === user) {
      r.info.writer = null;
      const rt = this.runtime.get(id);
      if (rt) rt.writerKey = null;
    }
    this.save();
    this.broadcast(r);
    return this.view(r, user);
  }
  expire() {
    if (this.stopped) return;
    for (const r of this.sessions.values()) {
      if (
        ['closed', 'interrupted'].includes(r.info.state) &&
        this.now() - (r.info.detachedAt ?? r.info.createdAt) >= 30 * 86400000
      ) {
        this.sessions.delete(r.info.id);
        this.save();
        continue;
      }
      if (
        r.info.state === 'detached' &&
        r.info.detachedAt !== null &&
        this.now() - r.info.detachedAt >= 86400000
      ) {
        this.driver.close(r.info.id, this.profile(r.profileId)!);
        r.info.state = 'closed';
        r.info.writer = null;
        this.runtime.get(r.info.id)?.driver.detach();
        this.runtime.delete(r.info.id);
        r.info.detachedAt = this.now();
        this.save();
      }
    }
  }
  shutdown() {
    if (this.stopped) return;
    this.stopped = true;
    for (const [id, rt] of this.runtime) {
      rt.driver.detach();
      const r = this.sessions.get(id)!;
      if (r.info.state !== 'closed') {
        r.info.state = 'detached';
        r.info.writer = null;
        r.info.detachedAt = this.now();
      }
    }
    this.runtime.clear();
    this.save();
  }
}
