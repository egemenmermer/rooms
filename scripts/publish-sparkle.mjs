import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
// Explicit invocation publishes signed binary artifacts only, never source or secrets.
const output = process.env.ROOMS_RELEASE_OUTPUT ?? 'release';
const receipt = JSON.parse(readFileSync(join(output, 'notarization.json'), 'utf8'));
if (receipt.status !== 'Accepted')
  throw new Error('Only Apple Accepted releases can enter the update feed');
const host = process.env.ROOMS_DEPLOY_HOST,
  key = process.env.ROOMS_DEPLOY_KEY,
  knownHosts = process.env.ROOMS_DEPLOY_KNOWN_HOSTS;
if (!host || !/^[A-Za-z0-9_][A-Za-z0-9_.@-]+$/.test(host) || !key || !knownHosts)
  throw new Error(
    'Set ROOMS_DEPLOY_HOST, ROOMS_DEPLOY_KEY and ROOMS_DEPLOY_KNOWN_HOSTS explicitly.',
  );
const ssh = [
  '-i',
  key,
  '-o',
  'IdentitiesOnly=yes',
  '-o',
  'BatchMode=yes',
  '-o',
  'StrictHostKeyChecking=yes',
  '-o',
  `UserKnownHostsFile=${knownHosts}`,
  host,
];
const remote = (command, input) => {
  const result = spawnSync('ssh', [...ssh, command], {
    input,
    stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
  });
  if (result.status !== 0) throw new Error('Update feed publication failed');
};
const directory = process.env.ROOMS_UPDATE_REMOTE_DIR;
if (
  !directory ||
  !/^\/[A-Za-z0-9_/-]+$/.test(directory) ||
  directory.includes('..') ||
  directory === '/'
)
  throw new Error('Set a bounded absolute ROOMS_UPDATE_REMOTE_DIR.');
remote(`mkdir -p ${directory}`);
for (const file of readdirSync(join(output, 'sparkle-feed')).filter((name) =>
  name.endsWith('.zip'),
)) {
  if (!/^ROOMS-[A-Za-z0-9.-]+-arm64-mac\.zip$/.test(file))
    throw new Error('Unexpected archive name');
  remote(
    `cat > ${directory}/${file}.stage && mv ${directory}/${file}.stage ${directory}/${file}`,
    readFileSync(join(join(output, 'sparkle-feed'), file)),
  );
}
// Archive lands before appcast, so clients never discover a missing file.
remote(
  `cat > ${directory}/appcast.xml.stage && mv ${directory}/appcast.xml.stage ${directory}/appcast.xml`,
  readFileSync(join(output, 'sparkle-feed/appcast.xml')),
);
