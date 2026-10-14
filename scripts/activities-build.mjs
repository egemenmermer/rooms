import { build } from 'esbuild';
await build({
  entryPoints: ['apps/services/activities/server.ts'],
  outfile: 'dist-services/activities.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['fastify', '@fastify/rate-limit'],
});
