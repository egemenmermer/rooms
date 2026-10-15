import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import type { TerminalDriver, TerminalProfile } from './terminals';
/** Native dependency is installed only in the Linux HostOps kit, never the desktop. */
export function nativeTerminalDriver(moduleRoot: string, helper: string): TerminalDriver {
  if (process.platform !== 'linux') throw Error('LINUX_TERMINAL_REQUIRED');
  const info = statSync(helper);
  if (!info.isFile() || info.uid !== 0 || info.mode & 0o022)
    throw Error('TERMINAL_HELPER_NOT_TRUSTED');
  const pty = createRequire(moduleRoot + '/package.json')('node-pty') as {
    spawn(
      file: string,
      args: string[],
      options: Record<string, unknown>,
    ): {
      write(data: string): void;
      resize(cols: number, rows: number): void;
      kill(): void;
      onData(cb: (data: string) => void): void;
      onExit(cb: () => void): void;
    };
  };
  const args = (verb: string, id: string, profile: TerminalProfile) => [
    '-n',
    helper,
    verb,
    profile.id,
    id,
  ];
  const call = (verb: string, id: string, profile: TerminalProfile) =>
    execFileSync('/usr/bin/sudo', args(verb, id, profile), {
      timeout: 10000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    });
  const exists = (id: string, p: TerminalProfile) => {
    const result = call('exists', id, p).trim();
    if (result === 'exists') return true;
    if (result === 'absent') return false;
    throw Error('TERMINAL_STATUS_UNAVAILABLE');
  };
  return {
    exists,
    create: (id, p) => {
      call('create', id, p);
    },
    attach: (id, p, onData, onExit) => {
      const child = pty.spawn('/usr/bin/sudo', args('attach', id, p), {
        name: 'xterm-256color',
        cwd: '/',
        cols: 100,
        rows: 30,
        env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TERM: 'xterm-256color' },
      });
      child.onData(onData);
      child.onExit(onExit);
      return {
        write: (data) => child.write(data),
        resize: (c, r) => child.resize(c, r),
        detach: () => child.kill(),
      };
    },
    close: (id, p) => {
      try {
        call('close', id, p);
      } catch (error) {
        if (!exists(id, p)) return;
        throw error;
      }
    },
  };
}
