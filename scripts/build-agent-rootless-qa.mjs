import { build } from 'esbuild';
await build({
  entryPoints: ['tests/fixtures/agent-rootless-native.ts'],
  outfile: '.local/qa/agent-rootless-native.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
});
