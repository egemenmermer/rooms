import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
await build({
  entryPoints: ['tests/fixtures/hostops-native.ts'],
  outfile: '.local/qa/hostops-native.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
});
execFileSync(process.execPath, ['.local/qa/hostops-native.cjs'], {
  stdio: 'inherit',
  env: { ...process.env, ROOMS_HOSTOPS_NATIVE_QA: 'ephemeral-ci' },
});
