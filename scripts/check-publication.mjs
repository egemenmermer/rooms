import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = /^(docs\/(screenshots|reference|rooms-implementation|release)\/|infra\/production\/|\.local\/)|\.(p8|p12|pfx|pem|key|dump|sqlite)$/i;
const markers = ['62.238' + '.119.134', '37.27' + '.182.96', '/Users/' + 'egemenmermer', 'U956' + '37XJ6C'];
const failures = [];
for (const path of paths) {
  if (!existsSync(path)) continue;
  if (forbidden.test(path) || /recep-dj\.(png|webm)$/.test(path)) failures.push(path);
  if (path === 'scripts/check-publication.mjs' || !/\.(ts|tsx|mjs|cjs|json|md|py|yml|yaml|example)$/.test(path)) continue;
  if (statSync(path).size > 2_000_000) continue;
  const text = readFileSync(path, 'utf8');
  if (markers.some(marker => text.includes(marker))) failures.push(path);
}
if (failures.length) throw new Error(`Private publication material remains: ${[...new Set(failures)].join(', ')}`);
if (!readFileSync('LICENSE', 'utf8').startsWith('MIT License')) throw new Error('Selected license missing');
console.log('Publication tree policy passed; private Git history is a separate gate.');
