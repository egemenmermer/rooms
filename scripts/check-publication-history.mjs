import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const excluded = new Set(
  readFileSync('docs/publication/EXCLUDED_HISTORY_PATHS.txt', 'utf8').trim().split('\n'),
);
const paths = execFileSync(
  'git',
  ['log', '--full-history', '-m', '--format=', '--name-only', '--no-renames', 'HEAD'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean);
const failures = [];
for (const path of paths) {
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
