import { readFile, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentResourceUsage } from '../../../packages/agent-contracts/src/index';
/** Actual aggregate Agent-user cgroup, normalized to total host CPU; no process/command contents. */
export class SharedHostUsage {
  private previous: { at: number; cpu: number } | null = null;
  constructor(
    private workspaceRoot: string,
    private options: {
      cgroup?: string;
      read?: (path: string) => Promise<string>;
      filesystem?: () => Promise<{ bsize: number; blocks: number; bfree: number }>;
      now?: () => number;
    } = {},
  ) {}
  async sample(cores: number): Promise<AgentResourceUsage> {
    const root =
      this.options.cgroup ?? `/sys/fs/cgroup/user.slice/user-${process.getuid?.()}.slice`;
    const read = this.options.read ?? ((path) => readFile(path, 'utf8'));
    const counter = (text: string | null) =>
      text !== null && /^\d+\s*$/.test(text) && Number.isSafeInteger(Number(text))
        ? Number(text)
        : null;
    const [cpuText, memoryText, pidsText, fs] = await Promise.all([
      read(join(root, 'cpu.stat')).catch(() => null),
      read(join(root, 'memory.current')).catch(() => null),
      read(join(root, 'pids.current')).catch(() => null),
      (this.options.filesystem?.() ?? statfs(this.workspaceRoot)).catch(() => null),
    ]);
    const at = (this.options.now ?? Date.now)();
    const cpu = counter(cpuText?.match(/^usage_usec\s+(\d+)\s*$/m)?.[1] ?? null);
    let percent: number | null = null;
    if (
      this.previous &&
      cpu !== null &&
      cpu >= this.previous.cpu &&
      at > this.previous.at &&
      at - this.previous.at <= 15_000 &&
      Number.isInteger(cores) &&
      cores > 0
    )
      percent = Math.min(100, (cpu - this.previous.cpu) / ((at - this.previous.at) * 10 * cores));
    this.previous = cpu === null ? null : { at, cpu };
    const used = fs ? (fs.blocks - fs.bfree) * fs.bsize : null;
    return {
      scope: 'agent-aggregate',
      measuredAt: at,
      cpuPercent: percent,
      memoryBytes: counter(memoryText),
      pids: counter(pidsText),
      workspaceBytes: used !== null && Number.isFinite(used) && used >= 0 ? used : null,
    };
  }
}
