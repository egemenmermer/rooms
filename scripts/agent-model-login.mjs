import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [provider, ownerId, connectionId] = process.argv.slice(2);
if (
  process.platform !== 'linux' ||
  process.getuid?.() !== 10001 ||
  !['codex', 'claude'].includes(provider) ||
  !ownerId ||
  !/^[a-f0-9-]{36}$/.test(connectionId ?? '')
)
  throw new Error(
    'Run as the agent service UID10001 on its separate Linux host: node scripts/agent-model-login.mjs codex|claude OWNER_ID CONNECTION_ID',
  );
const network = process.env.ROOMS_AGENT_NETWORK ?? 'rooms-agent-egress';
if (!/^rooms-[a-z0-9-]{1,80}$/.test(network))
  throw new Error('A dedicated restricted worker network is required.');
const inspected = JSON.parse(
  execFileSync('docker', ['network', 'inspect', network], { encoding: 'utf8' }),
);
if (inspected.length !== 1 || inspected[0].Internal !== true)
  throw new Error(
    'Official model login requires a verified internal worker network with the configured allowlisted HTTPS proxy.',
  );
const home = join(
  process.env.ROOMS_AGENT_DATA ?? '/var/lib/rooms-agent',
  'model-homes',
  createHash('sha256').update(ownerId).digest('hex'),
  connectionId,
);
mkdirSync(home, { recursive: true, mode: 0o700 });
const child = spawn(
  'docker',
  [
    'run',
    '--rm',
    '-it',
    '--network',
    network,
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--user',
    '10001:10001',
    '-v',
    `${home}:/home/agent:rw`,
    '-e',
    'HOME=/home/agent',
    '-e',
    'HTTPS_PROXY=http://rooms-egress:3128',
    '-e',
    'HTTP_PROXY=http://rooms-egress:3128',
    '-e',
    'NODE_USE_ENV_PROXY=1',
    process.env.ROOMS_AGENT_WORKER_IMAGE ?? 'rooms-agent-worker:local',
    provider,
    ...(provider === 'codex' ? ['login', '--device-auth'] : ['auth', 'login']),
  ],
  { stdio: 'inherit' },
);
child.on('error', () => {
  console.error(
    'The isolated official model login could not start. Check Docker access and network policy.',
  );
  process.exitCode = 1;
});
child.on('exit', (code) => (process.exitCode = code ?? 1));
