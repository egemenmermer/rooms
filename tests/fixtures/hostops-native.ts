/** Ephemeral Linux CI machine only. Never imports accounts or a Core configuration. */
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TerminalHub } from '../../apps/services/hostops/terminals';
import { nativeTerminalDriver } from '../../apps/services/hostops/driver';
async function main() {
  if (process.platform !== 'linux' || process.env.ROOMS_HOSTOPS_NATIVE_QA !== 'ephemeral-ci')
    throw Error('Explicit ephemeral Linux CI fixture required.');
  const directory = resolve('.local/qa/hostops-native');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const driver = nativeTerminalDriver(
    resolve('infra/hostops'),
    '/usr/local/libexec/rooms-terminal-helper',
  );
  const profiles = [
    { id: 'qa-operator', user: 'rooms-operator', directory: '/srv/rooms-operator' },
  ];
  const file = join(directory, 'terminals.json');
  let hub = new TerminalHub(file, profiles, driver);
  let output = '';
  const wait = async (check: () => boolean, label: string) => {
    const until = Date.now() + 15000;
    while (!check()) {
      if (Date.now() > until) throw Error(label);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const session = hub.create('qa-host', 'qa-owner', 'qa-operator');
  let connection = hub.attach('qa-host', session.id, 'qa-owner', (event) => {
    if (event.type === 'output') output += event.data;
  });
  let sequence = 0;
  const send = (data: string) => connection.input({ type: 'input', sequence: sequence++, data });
  const marker = async (text: string) => {
    const encoded = [...Buffer.from(text)]
      .map((byte) => '\\' + byte.toString(8).padStart(3, '0'))
      .join('');
    send(`printf '%b\\n' '${encoded}'\r`);
    await wait(() => output.includes(text), 'Shell marker/Unicode missing');
  };
  try {
    await marker('QA-' + randomUUID());
    send('stty -echo\r');
    await marker('Özel — çalışıyor');
    connection.input({ type: 'resize', cols: 91, rows: 33 });
    await new Promise((r) => setTimeout(r, 300));
    output = '';
    send('stty size\r');
    await wait(
      () => output.includes('33 91'),
      `PTY resize failed: ${JSON.stringify(output.slice(-500))}`,
    );
    send('sleep 30\r');
    await new Promise((r) => setTimeout(r, 300));
    send('\x03');
    await marker('CTRL-C-' + randomUUID());
    // A once-only side effect remains once across a broker restart.
    send(
      'value=$(cat qa-restart-counter 2>/dev/null || printf 0); printf %s "$((value+1))" > qa-restart-counter\r',
    );
    await marker('BEFORE-RESTART-' + randomUUID());
    connection.detach();
    hub.shutdown();
    hub = new TerminalHub(file, profiles, driver);
    if (hub.list('qa-host', 'qa-owner')[0]?.state !== 'detached')
      throw Error('Session lost across broker restart');
    output = '';
    sequence = 0;
    connection = hub.attach('qa-host', session.id, 'qa-owner', (event) => {
      if (event.type === 'output') output += event.data;
    });
    await marker('AFTER-RESTART-' + randomUUID());
    output = '';
    send('printf "COUNTER="; cat qa-restart-counter; printf "\\n"\r');
    await wait(
      () => output.includes('COUNTER=1'),
      'Shell workspace/session lost or command replayed',
    );
    hub.action('qa-host', session.id, 'qa-owner', 'close');
    if (driver.exists(session.id, profiles[0]))
      throw Error('Explicit termination did not close tmux');
    console.log(
      'Actual Linux node-pty/helper/tmux: Unicode, resize, Ctrl+C, detach, broker restart, once-only state and explicit termination passed.',
    );
  } finally {
    connection.detach();
    hub.shutdown();
  }
}
void main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
