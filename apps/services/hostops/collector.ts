import { readFile, readdir, statfs } from 'node:fs/promises';
import { cpus, loadavg, totalmem, freemem } from 'node:os';
import type { HostSample } from '../../../packages/shared-contracts/src/hostops';
export type HostSupplement = Pick<HostSample, 'services' | 'lastBackupAt' | 'media' | 'workloads'>;
export const emptySupplement = (): HostSupplement => ({
  services: [],
  lastBackupAt: null,
  workloads: [],
  media: {
    rooms: null,
    participants: null,
    streams: null,
    bitrate: null,
    rttMs: null,
    lossPercent: null,
    jitterMs: null,
  },
});
export class LinuxCollector {
  private previous?: {
    at: number;
    cpu: number[][];
    rx: number;
    tx: number;
    read: number | null;
    write: number | null;
  };
  constructor(
    private hostId: string,
    private options: {
      diskPath?: string;
      interfaces?: string[];
      blockDevices?: string[];
      supplement?: () => Promise<HostSupplement>;
      now?: () => number;
      read?: (path: string) => Promise<string>;
    } = {},
  ) {}
  async sample(): Promise<HostSample> {
    if (process.platform !== 'linux' && !this.options.read) throw Error('LINUX_COLLECTOR_REQUIRED');
    const read = this.options.read ?? ((path: string) => readFile(path, 'utf8'));
    const [cpuText, memoryText, networkText, diskText, disk] = await Promise.all([
      read('/proc/stat'),
      read('/proc/meminfo'),
      read('/proc/net/dev'),
      read('/proc/diskstats').catch(() => ''),
      statfs(this.options.diskPath ?? '/'),
    ]);
    const at = this.options.now?.() ?? Date.now();
    const cpu = cpuText
      .split('\n')
      .filter((l) => /^cpu\d*\s/.test(l))
      .map((l) => l.trim().split(/\s+/).slice(1, 9).map(Number));
    if (cpu.length < 2 || cpu.some((c) => c.some((v) => !Number.isFinite(v))))
      throw Error('COLLECTOR_CPU_INVALID');
    const memory = Object.fromEntries(
      memoryText.split('\n').map((l) => {
        const m = /^(\w+):\s+(\d+)/.exec(l);
        return m ? [m[1], Number(m[2]) * 1024] : ['', 0];
      }),
    );
    const interfaces = networkText
      .split('\n')
      .map((l) => l.trim().split(/[:\s]+/))
      .filter(
        (p) =>
          p.length >= 17 &&
          (this.options.interfaces?.length
            ? this.options.interfaces.includes(p[0])
            : !/^(lo|veth|docker|br-|podman|tun|tap)/.test(p[0])),
      );
    const rx = interfaces.reduce((n, p) => n + Number(p[1]), 0),
      tx = interfaces.reduce((n, p) => n + Number(p[9]), 0);
    const devices = diskText
      .split('\n')
      .map((l) => l.trim().split(/\s+/))
      .filter((p) => this.options.blockDevices?.includes(p[2]));
    const io = (index: number) =>
      devices.length ? devices.reduce((n, p) => n + Number(p[index]) * 512, 0) : null;
    const bytesRead = io(5),
      bytesWritten = io(9),
      previous = this.previous;
    const seconds = previous ? (at - previous.at) / 1000 : 0;
    const rate = (next: number | null, last: number | null | undefined) =>
      next !== null && last != null && seconds > 0 && next >= last ? (next - last) / seconds : null;
    const busy = cpu.map((ticks, i) => {
      const last = previous?.cpu[i];
      if (!last) return null;
      const total = ticks.reduce((n, t, j) => n + t - (last[j] ?? 0), 0);
      const idle = ticks[3] + (ticks[4] ?? 0) - last[3] - (last[4] ?? 0);
      return total > 0 ? Math.min(100, Math.max(0, 100 * (1 - idle / total))) : null;
    });
    this.previous = { at, cpu, rx, tx, read: bytesRead, write: bytesWritten };
    let temperatureC: number | null = null;
    if (!this.options.read) {
      const zones = await readdir('/sys/class/thermal').catch(() => []);
      for (const zone of zones.filter((v) => /^thermal_zone\d+$/.test(v))) {
        const type = await read(`/sys/class/thermal/${zone}/type`).catch(() => '');
        if (!/cpu|x86_pkg|soc/i.test(type)) continue;
        const n = Number(await read(`/sys/class/thermal/${zone}/temp`).catch(() => 'NaN')) / 1000;
        if (Number.isFinite(n) && n >= -50 && n <= 150)
          temperatureC = Math.max(temperatureC ?? n, n);
      }
    }
    const extra = await (this.options.supplement?.() ?? Promise.resolve(emptySupplement())).catch(
      () => emptySupplement(),
    );
    return {
      hostId: this.hostId,
      at,
      cpuPercent: busy[0],
      cores: cpu.length - 1,
      perCorePercent: busy.slice(1),
      load: process.platform === 'linux' ? loadavg() : [0, 0, 0],
      memory: {
        total: memory.MemTotal ?? totalmem(),
        available: memory.MemAvailable ?? memory.MemFree ?? freemem(),
        swapTotal: memory.SwapTotal ?? 0,
        swapUsed: Math.max(0, (memory.SwapTotal ?? 0) - (memory.SwapFree ?? 0)),
      },
      disk: {
        total: Number(disk.blocks) * Number(disk.bsize),
        free: Number(disk.bavail) * Number(disk.bsize),
        readBps: rate(bytesRead, previous?.read),
        writeBps: rate(bytesWritten, previous?.write),
      },
      network: {
        receiveBps: interfaces.length ? rate(rx, previous?.rx) : null,
        sendBps: interfaces.length ? rate(tx, previous?.tx) : null,
        receivedBytes: interfaces.length ? rx : null,
        sentBytes: interfaces.length ? tx : null,
      },
      temperatureC,
      ...extra,
    };
  }
}
