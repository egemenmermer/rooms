import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import packagePrivacy from './package-privacy.cjs';

const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const forbidden =
  /^(docs\/(screenshots|reference|rooms-implementation|release)\/|infra\/production\/|\.local\/)|\.(p8|p12|pfx|pem|key|dump|sqlite)$/i;
const failures = [];
for (const path of paths) {
  if (!existsSync(path)) continue;
  if (forbidden.test(path) || /recep-dj\.(png|webm)$/.test(path)) failures.push(path);
  if (
    path === 'scripts/check-publication.mjs' ||
    !/\.(ts|tsx|mjs|cjs|json|md|py|yml|yaml|example)$/.test(path)
  )
    continue;
  if (statSync(path).size > 2_000_000) continue;
  const text = readFileSync(path, 'utf8');
  const fixture = path.startsWith('tests/') || /\.test\.[^.]+$/.test(path);
  if (packagePrivacy.containsPrivateLiteral(text, process.env, fixture)) failures.push(path);
}
if (failures.length)
  throw new Error(`Private publication material remains: ${[...new Set(failures)].join(', ')}`);
if (!readFileSync('LICENSE', 'utf8').startsWith('MIT License'))
  throw new Error('Selected license missing');
console.log('Publication tree policy passed; private Git history is a separate gate.');
