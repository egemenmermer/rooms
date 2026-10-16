import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
for (const service of ['access', 'activities', 'agent', 'music', 'hostops', 'apns'])
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
