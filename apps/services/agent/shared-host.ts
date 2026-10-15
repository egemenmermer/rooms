import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync, statfsSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { LinuxCollector } from '../hostops/collector';
import type { HostSample } from '../../../packages/shared-contracts/src/hostops';
import type { AgentExecutor } from './worker';
import { AgentUncertainEffect } from './authority';

const exec = promisify(execFile);
const MiB = 1024 * 1024;
export class AgentInterrupted extends Error {}

/** Missing/stale telemetry fails closed. Load average is never treated as CPU usage. */
export class SharedHostAdmission {
  private samples: HostSample[] = [];
  add(sample: HostSample) {
    const previous = this.samples.at(-1);
    if (previous && sample.at <= previous.at) return;
    if (previous && sample.at - previous.at > 2500) this.samples = [];
    this.samples.push(sample);
    this.samples = this.samples.filter((s) => s.at >= sample.at - 61_000);
  }
  private current(now: number) {
    const sample = this.samples.at(-1);
    if (!sample || now < sample.at || now - sample.at > 2500) return null;
    return sample;
  }
  admission(now: number): string | null {
    const last = this.current(now);
    if (!last || this.samples.length < 2 || last.at - this.samples[0].at < 60_000)
      return 'Sunucu yükü ölçülüyor. Bir dakika sonra yeniden dene.';
    if (this.samples.some((s) => s.cpuPercent === null)) return 'Sunucu işlemci ölçümü alınamıyor.';
    let weighted = 0;
    for (let i = 1; i < this.samples.length; i++)
      weighted += this.samples[i].cpuPercent! * (this.samples[i].at - this.samples[i - 1].at);
    if (weighted / (last.at - this.samples[0].at) > 70)
      return 'Sunucu şu anda yoğun. Sesli görüşmeyi korumak için AI görevi başlatılmadı.';
    if (last.memory.available < 1024 * MiB) return 'AI görevi için yeterli boş bellek yok.';
    if (last.disk.free < 6144 * MiB) return 'AI görevi için yeterli boş disk alanı yok.';
    return null;
  }
  pressure(now: number): string | null {
    const last = this.current(now);
    if (!last || last.cpuPercent === null) return 'Sunucu yük ölçümü kesildi; AI durduruldu.';
    if (last.memory.available < 512 * MiB) return 'Boş bellek azaldı; AI durduruldu.';
    if (last.disk.free < 512 * MiB) return 'Boş disk alanı azaldı; AI durduruldu.';
    const hot = this.samples.filter((s) => s.at >= last.at - 30_000);
    if (
      hot.length > 1 &&
      last.at - hot[0].at >= 30_000 &&
      hot.every((s) => s.cpuPercent !== null && s.cpuPercent > 90)
    )
      return 'İşlemci yükü yükseldi; sesli görüşmeyi korumak için AI durduruldu.';
    return null;
  }
}

export interface SharedHostConfig {
  image: string;
  workspaceRoot: string;
}

/** Root-owned ancestor slice constrains BOTH the broker and its rootless worker scopes. */
export async function verifySharedHost(config: SharedHostConfig) {
  const uid = process.getuid?.();
  if (process.platform !== 'linux' || !uid || uid < 1000 || uid === 10001)
    throw Error('A distinct unprivileged shared Agent Linux identity is required.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*@sha256:[a-f0-9]{64}$/.test(config.image))
    throw Error('A locally installed, digest-pinned worker image is required.');
  const slice = `/user.slice/user-${uid}.slice`;
  if (!readFileSync('/proc/self/cgroup', 'utf8').trim().startsWith(`0::${slice}/`))
    throw Error('Agent must run inside its dedicated limited user slice.');
  const cgroup = `/sys/fs/cgroup${slice}`;
  for (const name of ['memory.max', 'cpu.max', 'pids.max']) {
    const st = statSync(join(cgroup, name));
    if (st.uid !== 0 || st.mode & 0o022)
      throw Error('Aggregate slice limits must remain root-owned and non-writable.');
  }
  const memory = Number(readFileSync(join(cgroup, 'memory.max'), 'utf8').trim());
  const [quota, period] = readFileSync(join(cgroup, 'cpu.max'), 'utf8')
    .trim()
    .split(/\s+/)
    .map(Number);
  const pids = Number(readFileSync(join(cgroup, 'pids.max'), 'utf8').trim());
  if (!(
    memory > 0 &&
    memory <= 768 * MiB &&
    quota > 0 &&
    period > 0 &&
    quota / period <= 0.5 &&
    pids > 0 &&
    pids <= 256
  ))
    throw Error('Root-owned aggregate CPU, memory and process limits are required.');
  const root = realpathSync(config.workspaceRoot);
  // A dedicated bounded persistent filesystem also caps direct write_file tool operations.
  const mount = readFileSync('/proc/self/mountinfo', 'utf8')
    .split('\n')
    .find((line) => line.split(' ')[4] === root);
  const fs = statfsSync(root);
  if (!mount || !mount.includes(' - ext4 ') || fs.bsize * fs.blocks > 2048 * MiB)
    throw Error('A dedicated persistent workspace filesystem of at most 2 GiB is required.');
  const st = statSync(root);
  if (st.uid !== uid || st.mode & 0o077) throw Error('Private Agent-owned workspaces required.');
  const { stdout } = await exec('/usr/bin/podman', ['info', '--format=json'], {
    timeout: 10_000,
    maxBuffer: 1_000_000,
  });
  const info = JSON.parse(stdout);
  if (
    info.host?.security?.rootless !== true ||
    info.host?.cgroupVersion !== 'v2' ||
    info.host?.cgroupManager !== 'systemd'
  )
    throw Error('Rootless Podman with systemd cgroups v2 is required.');
  // A broker crash must not leave an old AI command running behind the next task.
  const stale = await exec(
    '/usr/bin/podman',
    ['ps', '-a', '--filter', 'name=^rooms-shared-', '--format', '{{.Names}}'],
    { timeout: 10_000, maxBuffer: 16_384 },
  );
  for (const name of stale.stdout.trim().split('\n').filter(Boolean)) {
    if (!/^rooms-shared-[a-f0-9-]{36}$/.test(name))
      throw Error('Unexpected shared worker identity.');
    await exec('/usr/bin/podman', ['rm', '--force', '--ignore', '--time=2', name], {
      timeout: 15_000,
      maxBuffer: 4096,
    });
  }
}

/** Accept only the existing API-model shell-tool shape; never inherit arbitrary runtime flags. */
export function sharedWorkerArguments(config: SharedHostConfig, args: string[], name: string) {
  const root = realpathSync(config.workspaceRoot);
  if (
    args.length !== 10 ||
    args[0] !== '--network' ||
    args[1] !== 'none' ||
    args[2] !== '-v' ||
    args[4] !== '-w' ||
    args[5] !== '/workspace' ||
    args[6] !== config.image ||
    args[7] !== 'sh' ||
    args[8] !== '-lc'
  )
    throw Error('Shared-host workers support only isolated offline workspace commands.');
  const suffix = ':/workspace:rw';
  if (!args[3].endsWith(suffix)) throw Error('Invalid workspace mount.');
  const workspace = args[3].slice(0, -suffix.length);
  if (
    realpathSync(workspace) !== workspace ||
    !workspace.startsWith(root + sep) ||
    !/^[a-f0-9-]{36}$/.test(workspace.slice(root.length + 1))
  )
    throw Error('Task workspace mount is outside the bounded workspace filesystem.');
  return [
    'run',
    '--rm',
    '--pull=never',
    '--name',
    name,
    '--init',
    '--network=none',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--pids-limit=128',
    '--memory=512m',
    '--memory-swap=512m',
    '--cpus=0.5',
    '--read-only',
    '--userns=keep-id:uid=10001,gid=10001',
    '--user=10001:10001',
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=64m',
    '--ipc=private',
    '--pid=private',
    '--env=HOME=/tmp',
    '--env=PATH=/usr/local/bin:/usr/bin:/bin',
    '--volume',
    `${workspace}:/workspace:rw,nosuid,nodev`,
    '--workdir=/workspace',
    config.image,
    'sh',
    '-lc',
    args[9],
  ];
}

export function sharedWorker(config: SharedHostConfig) {
  return async (args: string[], input: string, signal: AbortSignal): Promise<string> => {
    if (signal.aborted) throw new AgentInterrupted('AI durduruldu.');
    const name = `rooms-shared-${randomUUID()}`;
    const argv = sharedWorkerArguments(config, args, name);
    return new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/podman', argv, { stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '',
        tooLarge = false;
      let stopping: Promise<unknown> | undefined;
      const stop = () => {
        // Do not resolve takeover/cancellation until the actual container has stopped.
        stopping ??= exec('/usr/bin/podman', ['rm', '--force', '--ignore', '--time=2', name], {
          timeout: 15_000,
          maxBuffer: 4096,
        });
        void stopping.catch(() => {});
        child.kill('SIGTERM');
      };
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
      child.stdout.on('data', (chunk: Buffer) => {
        if (output.length + chunk.length > 500_000) {
          tooLarge = true;
          stop();
        } else output += chunk.toString();
      });
      child.stderr.resume();
      child.on('error', () => {
        signal.removeEventListener('abort', stop);
        reject(Error('Rootless worker could not start.'));
      });
      child.on('close', (code) => {
        signal.removeEventListener('abort', stop);
        void (async () => {
          try {
            // A cancellation may race container creation. Remove again AFTER the launcher exits.
            if (stopping) {
              await stopping.catch(() => {});
              await exec('/usr/bin/podman', ['rm', '--force', '--ignore', '--time=2', name], {
                timeout: 15_000,
                maxBuffer: 4096,
              });
            }
            if (signal.aborted) throw new AgentInterrupted('AI durduruldu.');
            if (code !== 0 || tooLarge)
              throw Error('İzole komut tamamlanamadı veya çıktı sınırını aştı.');
            resolve(output);
          } catch (error) {
            reject(error);
          }
        })();
      });
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    });
  };
}

/** One active task; admission and pressure encompass API calls as well as shell commands. */
export function sharedHostExecutor(
  config: SharedHostConfig,
  executor: AgentExecutor,
): AgentExecutor {
  const collector = new LinuxCollector('agent-shared');
  const admission = new SharedHostAdmission();
  let sampling = false,
    active = false,
    stopped = false;
  let activeController: AbortController | null = null;
  let completion: Promise<void> = Promise.resolve();
  const sample = async () => {
    if (sampling || stopped) return;
    sampling = true;
    try {
      admission.add(await collector.sample());
    } catch {
      /* Stale telemetry fails closed. */
    } finally {
      sampling = false;
    }
  };
  const timer = setInterval(() => void sample(), 1000);
  timer.unref();
  void sample();
  const wrapped: AgentExecutor = async (ctx) => {
    if (stopped || active) throw Error('AI çalıştırıcısı meşgul veya kapalı.');
    const reason = admission.admission(Date.now());
    if (reason) throw Error(reason);
    active = true;
    const controller = new AbortController();
    activeController = controller;
    let complete!: () => void;
    completion = new Promise<void>((resolve) => {
      complete = resolve;
    });
    let interrupted: string | null = null;
    const abort = () => controller.abort();
    ctx.signal.addEventListener('abort', abort, { once: true });
    if (ctx.signal.aborted) abort();
    const deadline = setTimeout(() => {
      interrupted = 'AI görevi 15 dakikalık süre sınırına ulaştı.';
      abort();
    }, 15 * 60_000);
    const pressure = setInterval(() => {
      const reason = admission.pressure(Date.now());
      if (reason) {
        interrupted = reason;
        abort();
      }
    }, 1000);
    try {
      const result = await executor({ ...ctx, signal: controller.signal });
      if (controller.signal.aborted) throw new AgentInterrupted(interrupted ?? 'AI durduruldu.');
      return result;
    } catch (error) {
      if (interrupted && error instanceof AgentUncertainEffect) {
        error.message = `${interrupted} ${error.message}`;
        throw error;
      }
      if (interrupted) throw new AgentInterrupted(interrupted);
      throw error;
    } finally {
      clearTimeout(deadline);
      clearInterval(pressure);
      ctx.signal.removeEventListener('abort', abort);
      active = false;
      activeController = null;
      complete();
    }
  };
  wrapped.close = async () => {
    stopped = true;
    clearInterval(timer);
    activeController?.abort();
    await completion;
    await executor.close?.();
  };
  return wrapped;
}
