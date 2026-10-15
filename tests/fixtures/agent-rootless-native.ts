// Disposable Linux CI only. No Core host, production profile, model or account credentials.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { verifySharedHost, sharedWorker } from '../../apps/services/agent/shared-host';
import {
  rootlessTerminalDriver,
  WorkspaceTerminals,
} from '../../apps/services/agent/workspace-terminals';
import type { AgentTask } from '../../packages/agent-contracts/src/index';
async function main() {
  assert.equal(process.env.ROOMS_AGENT_ROOTLESS_QA, 'ephemeral-ci');
  const config = {
    image: process.env.ROOMS_AGENT_WORKER_IMAGE!,
    workspaceRoot: '/var/lib/rooms-agent/workspaces',
  };
  await verifySharedHost(config);
  const task = join(config.workspaceRoot, randomUUID());
  mkdirSync(task, { mode: 0o700 });
  const worker = sharedWorker(config);
  const args = (command: string) => [
    '--network',
    'none',
    '-v',
    `${task}:/workspace:rw`,
    '-w',
    '/workspace',
    config.image,
    'sh',
    '-lc',
    command,
  ];
  const output = await worker(
    args(`set -eu
test "$(id -u)" = 10001
test ! -e /var/run/docker.sock
test ! -e /etc/rooms-agent/shared.env
if touch /etc/rooms-must-not-write 2>/dev/null; then exit 40; fi
if wget -T 2 -qO- http://127.0.0.1:1 >/dev/null 2>&1; then exit 41; fi
cat /sys/fs/cgroup/memory.max
cat /sys/fs/cgroup/cpu.max
cat /sys/fs/cgroup/pids.max
printf 'kalıcı Türkçe ✓' > /workspace/proof
`),
    '',
    new AbortController().signal,
  );
  const [memory, cpu, pids] = output.trim().split('\n');
  assert.equal(Number(memory), 512 * 1024 * 1024);
  const [quota, period] = cpu.split(/\s+/).map(Number);
  assert.equal(quota / period, 0.5);
  assert.equal(Number(pids), 128);
  assert.equal(readFileSync(join(task, 'proof'), 'utf8'), 'kalıcı Türkçe ✓');
  assert.equal(
    await worker(args('cat /workspace/proof'), '', new AbortController().signal),
    'kalıcı Türkçe ✓',
  );
  const abort = new AbortController();
  const running = worker(
    args('echo ready > /workspace/ready; sleep 30; echo late > /workspace/late'),
    '',
    abort.signal,
  );
  const deadline = Date.now() + 15_000;
  while (!existsSync(join(task, 'ready'))) {
    assert.ok(Date.now() < deadline, 'worker did not start');
    await new Promise((r) => setTimeout(r, 100));
  }
  abort.abort();
  await assert.rejects(running, /durduruldu/);
  assert.ok(!existsSync(join(task, 'late')), 'cancelled process continued');
  // Actual ENOSPC from the bounded volume, not a mocked size counter.
  await assert.rejects(
    worker(
      args('dd if=/dev/zero of=/workspace/quota bs=1M count=2050 2>/dev/null'),
      '',
      new AbortController().signal,
    ),
  );
  await worker(args('rm /workspace/quota'), '', new AbortController().signal);
  const terminalTask: AgentTask = {
    id: randomUUID(),
    ownerId: 'qa-operator',
    roomId: 'qa-room',
    prompt: 'QA',
    modelConnectionId: randomUUID(),
    state: 'interrupted',
    progress: [],
    result: null,
    artifacts: [],
    createdAt: new Date().toISOString(),
    runAt: null,
    error: null,
  };
  const driver = rootlessTerminalDriver(config, '/opt/rooms-agent-qa/native');
  const file = '/var/lib/rooms-agent/workspace-terminal-qa.json';
  let manager = new WorkspaceTerminals('qa-host', config, file, driver, [terminalTask]);
  const terminal = await manager.take(terminalTask, async () => {});
  let text = '';
  let attached = manager.hub.attach('qa-host', terminal.id, terminalTask.ownerId, (event) => {
    if (event.type === 'output') text += event.data;
  });
  let sequence = 0;
  const write = (data: string) => attached.input({ type: 'input', sequence: sequence++, data });
  const wait = async (marker: string) => {
    const until = Date.now() + 15_000;
    while (!text.includes(marker)) {
      assert.ok(Date.now() < until, `Missing PTY marker: ${marker}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  attached.input({ type: 'resize', cols: 91, rows: 33 });
  write(
    "printf '\\122\\117\\117\\115\\123\\137PTY Türkçe ✓\\n'; stty size; echo once >> /workspace/counter\r",
  );
  await wait('ROOMS_PTY Türkçe ✓');
  await wait('33 91');
  attached.detach();
  manager.hub.shutdown();
  manager = new WorkspaceTerminals('qa-host', config, file, driver, [terminalTask]);
  assert.equal(manager.list(terminalTask)[0].id, terminal.id);
  text = '';
  sequence = 0;
  attached = manager.hub.attach('qa-host', terminal.id, terminalTask.ownerId, (event) => {
    if (event.type === 'output') text += event.data;
  });
  write('sleep 30\r');
  await new Promise((r) => setTimeout(r, 500));
  write('\x03');
  write("printf '\\122\\105\\123\\125\\115\\105\\104\\n'\r");
  await wait('RESUMED');
  assert.equal(
    readFileSync(join(config.workspaceRoot, terminalTask.id, 'counter'), 'utf8').trim(),
    'once',
  );
  await manager.recheck([terminalTask], async () => {
    throw Error('grant revoked');
  });
  assert.equal(manager.list(terminalTask).length, 0);
  assert.equal(
    driver.exists(terminal.id, {
      id: terminalTask.id,
      user: 'isolated-agent',
      directory: join(config.workspaceRoot, terminalTask.id),
    }),
    false,
  );
  manager.hub.shutdown();
  console.log(
    'Actual rootless isolation, cgroup limits, quota, cancellation, PTY Unicode/resize/Ctrl+C, broker restart, no replay and revocation passed.',
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
