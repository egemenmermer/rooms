import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
// Container builds have no .git directory; they pass the source SHA explicitly.
const sourceSha =
  process.env.ROOMS_SOURCE_SHA ||
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const all = [
  'access',
  'activities',
  'admin',
  'agent',
  'music',
  'hostops',
  'apns',
  'claude-bot',
  'cinema',
];
const selected = process.argv.slice(2);
for (const name of selected) if (!all.includes(name)) throw new Error(`Unknown service: ${name}`);
for (const service of selected.length ? selected : all)
  await build({
    entryPoints: [`apps/services/${service}/start.ts`],
    outfile: `dist-services/${service}.cjs`,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    define: {
      __ROOMS_BUILD_VERSION__: JSON.stringify(version),
      __ROOMS_SOURCE_SHA__: JSON.stringify(sourceSha),
    },
    external: ['pg-native', '@livekit/rtc-node'],
  });
