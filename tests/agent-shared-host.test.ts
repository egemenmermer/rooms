import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SharedHostAdmission, sharedWorkerArguments } from '../apps/services/agent/shared-host';
import { emptySupplement } from '../apps/services/hostops/collector';
import type { HostSample } from '../packages/shared-contracts/src/hostops';
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const sample = (at: number, cpuPercent = 10): HostSample => ({
  hostId: 'core',
  at,
  cpuPercent,
  cores: 2,
  perCorePercent: [cpuPercent, cpuPercent],
  load: [1, 1, 1],
  memory: { total: 4e9, available: 2e9, swapTotal: 0, swapUsed: 0 },
  disk: { total: 20e9, free: 10e9, readBps: null, writeBps: null },
  network: { receivedBytes: null, sentBytes: null, receiveBps: null, sendBps: null },
  temperatureC: null,
  ...emptySupplement(),
});
describe('shared host admission', () => {
  it('requires a continuous actual CPU window and rejects stale or backwards time', () => {
    const guard = new SharedHostAdmission();
    for (let at = 0; at < 60_000; at += 1000) guard.add(sample(at));
    expect(guard.admission(59_000)).toMatch(/ölçülüyor/);
    guard.add(sample(60_000));
    expect(guard.admission(60_000)).toBeNull();
    expect(guard.admission(59_999)).not.toBeNull();
    expect(guard.admission(63_000)).not.toBeNull();
    guard.add(sample(64_000));
    expect(guard.admission(64_000)).not.toBeNull();
  });
  it('separates admission thresholds from sustained pressure and fails closed on missing CPU', () => {
    const guard = new SharedHostAdmission();
    for (let at = 0; at <= 60_000; at += 1000) guard.add(sample(at, 80));
    expect(guard.admission(60_000)).toMatch(/yoğun/);
    expect(guard.pressure(60_000)).toBeNull();
    for (let at = 61_000; at <= 91_000; at += 1000) guard.add(sample(at, 95));
    expect(guard.pressure(91_000)).toMatch(/İşlemci/);
    guard.add({ ...sample(92_000), cpuPercent: null });
    expect(guard.pressure(92_000)).toMatch(/ölçümü/);
    guard.add({ ...sample(93_000), memory: { ...sample(0).memory, available: 100e6 } });
    expect(guard.pressure(93_000)).toMatch(/bellek/);
  });
  it('does not start below memory/disk minima', () => {
    for (const kind of ['memory', 'disk']) {
      const guard = new SharedHostAdmission();
      for (let at = 0; at <= 60_000; at += 1000) {
        const value = sample(at);
        if (kind === 'memory') value.memory.available = 1e9;
        else value.disk.free = 6e9;
        guard.add(value);
      }
      expect(guard.admission(60_000)).toMatch(kind === 'memory' ? /bellek/ : /disk/);
    }
  });
});
it('accepts only one task workspace mount and offline commands, never host/config/auth mounts', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rooms-shared-')));
  dirs.push(root);
  const task = join(root, randomUUID());
  mkdirSync(task);
  const config = { image: `localhost/worker@sha256:${'a'.repeat(64)}`, workspaceRoot: root };
  const args = [
    '--network',
    'none',
    '-v',
    `${task}:/workspace:rw`,
    '-w',
    '/workspace',
    config.image,
    'sh',
    '-lc',
    'echo hello',
  ];
  const actual = sharedWorkerArguments(config, args, 'rooms-shared-test');
  expect(actual).toContain('--network=none');
  expect(actual).toContain('--memory=512m');
  expect(actual).toContain('--userns=keep-id:uid=10001,gid=10001');
  expect(actual).not.toContain('--privileged');
  for (const mount of ['/etc', '/var/run/docker.sock', root, join(root, '..')]) {
    const bad = [...args];
    bad[3] = `${mount}:/workspace:rw`;
    expect(() => sharedWorkerArguments(config, bad, 'test')).toThrow();
  }
  const link = join(root, randomUUID());
  symlinkSync(task, link);
  const bad = [...args];
  bad[3] = `${link}:/workspace:rw`;
  expect(() => sharedWorkerArguments(config, bad, 'test')).toThrow();
  expect(() => sharedWorkerArguments(config, [...args, '--privileged'], 'test')).toThrow();
  const network = [...args];
  network[1] = 'host';
  expect(() => sharedWorkerArguments(config, network, 'test')).toThrow();
});
