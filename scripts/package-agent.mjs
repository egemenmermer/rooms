/** Package explicit deployment inputs only; never include local credentials or profiles. */
import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A plain release version is required.');
const root = resolve('.local/deployment'),
  name = `rooms-agent-${version}`,
  directory = join(root, name);
await mkdir(root, { recursive: true, mode: 0o700 });
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { mode: 0o700 });
await build({
  entryPoints: ['apps/services/agent/start.ts'],
  outfile: join(directory, 'agent.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['pg-native'],
});
const inputs = [
  'infra/agent/worker.Dockerfile',
  'infra/agent/browser.cjs',
  'infra/agent/egress.Dockerfile',
  'infra/agent/egress-proxy.mjs',
  'infra/agent/compose.yml',
  'infra/agent/rooms-agent.service',
  'infra/agent/service.env.example',
  'scripts/agent-issue-access.mjs',
  'scripts/agent-model-login.mjs',
  'docs/AGENT_DEPLOYMENT.md',
  'dist/THIRD_PARTY_NOTICES.txt',
];
const manifest = { version, files: {} };
for (const input of inputs) {
  const destination = join(directory, input);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(input, destination);
}
await writeFile(join(directory, 'auth.json.example'), '[]\n');
await writeFile(
  join(directory, 'policy.json.example'),
  JSON.stringify(
    {
      version: 1,
      egressVerified: false,
      allowedResearchHosts: [],
      browserHosts: [],
      connectorScopes: [],
    },
    null,
    2,
  ) + '\n',
);
for (const file of ['agent.cjs', ...inputs, 'auth.json.example', 'policy.json.example'])
  manifest.files[file] = createHash('sha256')
    .update(await readFile(join(directory, file)))
    .digest('hex');
await writeFile(join(directory, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
const archive = join(root, `${name}.tar.gz`);
execFileSync('tar', ['-czf', archive, '-C', root, name]);
await writeFile(
  `${archive}.sha256`,
  `${createHash('sha256')
    .update(await readFile(archive))
    .digest('hex')}  ${name}.tar.gz\n`,
);
console.log(
  `Separate Agent deployment kit packaged: ${archive}. No host installation or acceptance was performed.`,
);
