import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const binaries = '/opt/homebrew/opt/postgresql@16/bin';
mkdirSync('.local', { recursive: true });
const directory = mkdtempSync(resolve('.local/qa-postgres-'));
const socket = mkdtempSync(join(tmpdir(), 'rooms-pg-'));
const data = join(directory, 'data');
let started = false;
try {
  execFileSync(join(binaries, 'initdb'), ['-D', data, '--auth=trust', '--no-locale'], {
    stdio: 'ignore',
  });
  execFileSync(
    join(binaries, 'pg_ctl'),
    [
      '-D',
      data,
      '-l',
      join(directory, 'server.log'),
      '-o',
      `-h 127.0.0.1 -p 55433 -k ${socket}`,
      'start',
    ],
    { stdio: 'ignore' },
  );
  started = true;
  const outfile = resolve('.local/qa/postgres-activity.cjs');
  await build({
    entryPoints: ['tests/fixtures/postgres-activity.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['pg'],
  });
  const module = createRequire(import.meta.url)(outfile);
  const result = await module.verifyPostgresActivity('postgresql://127.0.0.1:55433/postgres');
  writeFileSync('docs/POSTGRES_ACTIVITY_RESULTS.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(readFileSync(join(directory, 'server.log'), 'utf8'));
  throw error;
} finally {
  if (!started) {
    try {
      execFileSync(join(binaries, 'pg_ctl'), ['-D', data, 'status'], { stdio: 'ignore' });
      started = true;
    } catch {
      /* No owned server is running. */
    }
  }
  if (started)
    execFileSync(join(binaries, 'pg_ctl'), ['-D', data, '-m', 'fast', 'stop'], { stdio: 'ignore' });
  rmSync(directory, { recursive: true, force: true });
  rmSync(socket, { recursive: true, force: true });
}
