import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentTask } from '../../../packages/agent-contracts/src/index';
import { TerminalHub, type TerminalDriver, type TerminalProfile } from '../hostops/terminals';
import {
  sharedWorkerArguments,
  type SharedHostConfig,
  AgentInterrupted,
  podmanEnvironment,
} from './shared-host';
import type { AgentExecutor } from './worker';

/** Human shells use only the bounded task volume in a rootless container, never a host PTY. */
export function rootlessTerminalDriver(
  config: SharedHostConfig,
  moduleRoot: string,
): TerminalDriver {
  if (process.platform !== 'linux') throw Error('LINUX_TERMINAL_REQUIRED');
  const st = statSync(moduleRoot);
  if (st.uid !== 0 || st.mode & 0o022) throw Error('TERMINAL_NATIVE_KIT_NOT_TRUSTED');
  const pty = createRequire(join(moduleRoot, 'package.json'))('node-pty') as {
    spawn(
      file: string,
      args: string[],
      options: Record<string, unknown>,
    ): {
      write(data: string): void;
      resize(cols: number, rows: number): void;
      kill(): void;
      onData(cb: (s: string) => void): void;
      onExit(cb: () => void): void;
    };
  };
  const name = (id: string) => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('INVALID_TERMINAL');
    return `rooms-workspace-${id}`;
  };
  const call = (args: string[]) =>
    execFileSync('/usr/bin/podman', args, {
      encoding: 'utf8',
      timeout: 15_000,
      maxBuffer: 16_384,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: podmanEnvironment(),
    });
  const exists = (id: string) => {
    const value = call(['ps', '--filter', `name=^${name(id)}$`, '--format', '{{.Names}}']).trim();
    if (value === '') return false;
    if (value !== name(id)) throw Error('TERMINAL_STATUS_UNAVAILABLE');
    return true;
  };
  return {
    exists,
    create(id, profile) {
      const argv = sharedWorkerArguments(
        config,
        [
          '--network',
          'none',
          '-v',
          `${profile.directory}:/workspace:rw`,
          '-w',
          '/workspace',
          config.image,
          'sh',
          '-lc',
          'exec sh',
        ],
        name(id),
      );
      argv.splice(1, 0, '--detach', '--interactive', '--tty');
      call(argv);
      if (!exists(id)) throw Error('WORKSPACE_SHELL_FAILED');
    },
    attach(id, _profile, onData, onExit) {
      const child = pty.spawn('/usr/bin/podman', ['attach', '--sig-proxy=false', name(id)], {
        name: 'xterm-256color',
        cols: 100,
        rows: 30,
        env: { ...podmanEnvironment(), TERM: 'xterm-256color' },
      });
      child.onData(onData);
      child.onExit(onExit);
      return {
        write: (data) => child.write(data),
        resize: (cols, rows) => child.resize(cols, rows),
        detach: () => child.kill(),
      };
    },
    close(id) {
      call(['rm', '--force', '--ignore', '--time=2', name(id)]);
    },
  };
}

/** The model and humans share files; each side gets its own explicitly identified process context. */
export class WorkspaceTerminals {
  readonly hub: TerminalHub;
  private profiles: TerminalProfile[];
  private aiTask: string | null = null;
  private aiStopped: Promise<void> = Promise.resolve();
  private taking = false;
  private held = new Map<string, string>();
  constructor(
    readonly hostId: string,
    private config: SharedHostConfig,
    file: string,
    driver: TerminalDriver,
    tasks: AgentTask[],
  ) {
    this.profiles = tasks.filter((t) => t.kind !== 'reminder').map((t) => this.profile(t.id));
    this.hub = new TerminalHub(file, this.profiles, driver);
    for (const t of tasks) {
      this.owners.set(t.id, t.ownerId);
      const session = this.hub.list(hostId, t.ownerId).find((s) => s.taskId === t.id);
      if (session) this.held.set(t.id, session.id);
    }
  }
  private profile(taskId: string) {
    if (!/^[a-f0-9-]{36}$/.test(taskId)) throw Error('INVALID_TASK');
    return {
      id: taskId,
      user: 'isolated-agent',
      directory: join(this.config.workspaceRoot, taskId),
    };
  }
  guard(executor: AgentExecutor): AgentExecutor {
    const wrapped: AgentExecutor = async (ctx) => {
      this.prune();
      if (this.taking || this.aiTask || this.held.size)
        throw new AgentInterrupted(
          'Çalışma terminali bir insanın kontrolünde. Önce terminali sonlandır.',
        );
      this.aiTask = ctx.task.id;
      let complete!: () => void;
      this.aiStopped = new Promise<void>((resolve) => {
        complete = resolve;
      });
      try {
        return await executor(ctx);
      } finally {
        this.aiTask = null;
        complete();
      }
    };
    wrapped.close = async () => {
      this.hub.shutdown();
      await executor.close?.();
    };
    return wrapped;
  }
  private prune() {
    this.hub.expire();
    for (const [taskId, sessionId] of this.held) {
      // No user-supplied identity can select another task's profile.
      try {
        this.hub.check(this.hostId, sessionId, this.owners.get(taskId)!);
      } catch {
        this.held.delete(taskId);
      }
    }
  }
  private owners = new Map<string, string>();
  async take(task: AgentTask, stopTask: () => Promise<void>) {
    if (this.taking || (this.aiTask && this.aiTask !== task.id))
      throw Error('WORKSPACE_TAKEOVER_BUSY');
    this.taking = true;
    try {
      // Stop the WHOLE model task, including API-side writes, not only its current shell child.
      await stopTask();
      await this.aiStopped;
      this.prune();
      const existing = this.held.get(task.id);
      if (existing) return this.hub.check(this.hostId, existing, task.ownerId);
      if (this.held.size) throw Error('WORKSPACE_TERMINAL_LIMIT');
      const profile = this.profile(task.id);
      mkdirSync(profile.directory, { recursive: true, mode: 0o700 });
      if (!this.profiles.some((p) => p.id === profile.id)) this.profiles.push(profile);
      const session = this.hub.create(this.hostId, task.ownerId, task.id, { taskId: task.id });
      this.held.set(task.id, session.id);
      this.owners.set(task.id, task.ownerId);
      return session;
    } finally {
      this.taking = false;
    }
  }
  list(task: AgentTask) {
    this.owners.set(task.id, task.ownerId);
    return this.hub.list(this.hostId, task.ownerId).filter((s) => s.taskId === task.id);
  }
  close(task: AgentTask, sessionId: string) {
    if (!this.list(task).some((s) => s.id === sessionId)) throw Error('TERMINAL_ACCESS_DENIED');
    const value = this.hub.action(this.hostId, sessionId, task.ownerId, 'close');
    this.held.delete(task.id);
    return value;
  }
  async recheck(tasks: AgentTask[], authorize: (task: AgentTask) => Promise<void>) {
    for (const task of tasks) {
      const session = this.held.get(task.id);
      if (!session) continue;
      try {
        await authorize(task);
      } catch {
        if (this.held.get(task.id) === session) this.close(task, session);
      }
    }
  }
}
