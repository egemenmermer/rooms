import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const cwd = '.local/stoat';
if (!existsSync(`${cwd}/Revolt.toml`)) throw new Error('Run node scripts/stoat-setup.mjs first.');
const info = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
  encoding: 'utf8',
  timeout: 10000,
});
if (info.status !== 0) {
  console.error(
    'Stoat cannot start: Docker is unavailable. Existing VMs and security settings were not changed.',
  );
  process.exit(1);
}
const validate = spawnSync('docker', ['compose', 'config', '--quiet'], {
  cwd,
  stdio: 'inherit',
  timeout: 15000,
});
if (validate.status !== 0) process.exit(1);
const result = spawnSync(
  'docker',
  [
    'compose',
    'up',
    '-d',
    'database',
    'redis',
    'rabbit',
    'minio',
    'createbuckets',
    'api',
    'events',
    'autumn',
    'january',
    'gifbox',
    'crond',
    'pushd',
    'caddy',
  ],
  { cwd, stdio: 'inherit', timeout: 180000 },
);
process.exit(result.status ?? 1);
