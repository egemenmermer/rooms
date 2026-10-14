import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const excluded = new Set(
  readFileSync('docs/publication/EXCLUDED_HISTORY_PATHS.txt', 'utf8').trim().split('\n'),
);
const objects = execFileSync('git', ['rev-list', '--objects', 'HEAD'], { encoding: 'utf8' });
const failures = [];
for (const line of objects.split('\n')) {
  const separator = line.indexOf(' ');
  if (separator < 0) continue;
  const path = line.slice(separator + 1);
  if (
    excluded.has(path) ||
    /^(docs\/(screenshots|reference|rooms-implementation|release|site)\/|infra\/production\/)/.test(
      path,
    ) ||
    /recep-dj\.(png|webm)$/.test(path) ||
    /\.(p8|p12|pfx|pem|key|dump|sqlite)$/i.test(path)
  )
    failures.push(path);
}
if (failures.length)
  throw new Error(
    `Private paths remain in reachable history: ${[...new Set(failures)].join(', ')}`,
  );
console.log(
  'Reachable commit history excludes reviewed private paths. GitHub retained views require separate review.',
);
