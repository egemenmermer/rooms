import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const pnpmArgs = ['list', '--prod', '--depth', 'Infinity', '--json'];
// pnpm is a .cmd shim on Windows; execute its Node entry point without a shell.
const pnpmEntry = process.env.npm_execpath;
if (process.platform === 'win32' && !pnpmEntry)
  throw new Error('Run notices through pnpm on Windows.');
const graph = JSON.parse(
  execFileSync(
    pnpmEntry ? process.execPath : 'pnpm',
    pnpmEntry ? [pnpmEntry, ...pnpmArgs] : pnpmArgs,
    { encoding: 'utf8', maxBuffer: 20_000_000 },
  ),
);
const packages = new Map();
function collect(node, optional = false) {
  if (node.path && node.version) {
    if (existsSync(join(node.path, 'package.json')))
      packages.set(`${node.from}@${node.version}`, node);
    else if (!optional) throw new Error(`Installed dependency metadata is missing: ${node.from}`);
  }
  for (const child of Object.values(node.dependencies ?? {})) collect(child);
  for (const child of Object.values(node.optionalDependencies ?? {})) collect(child, true);
}
const desktopRoots = graph.filter((root) => root.path === process.cwd());
if (desktopRoots.length !== 1) throw new Error('Desktop dependency graph is unavailable.');
for (const root of desktopRoots) {
  for (const child of Object.values(root.dependencies ?? {})) collect(child);
  for (const child of Object.values(root.optionalDependencies ?? {})) collect(child, true);
}
let output =
  readFileSync('docs/THIRD_PARTY_NOTICES.md', 'utf8') +
  '\n\nBundled Inter font license\n' +
  readFileSync('apps/desktop/public/reference-brand/fonts/OFL-Inter.txt', 'utf8') +
  '\n\nInstalled production dependency notices\n';
for (const [name, node] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
  const metadata = JSON.parse(readFileSync(join(node.path, 'package.json'), 'utf8'));
  output += `\n${'='.repeat(72)}\n${name}\nLicense: ${JSON.stringify(metadata.license ?? 'See upstream')}. Source: ${JSON.stringify(metadata.repository ?? metadata.homepage ?? node.resolved)}\n`;
  for (const file of readdirSync(node.path).filter((name) =>
    /^(LICENSE|LICENCE|NOTICE|COPYING|COPYRIGHT)(\.|$)/i.test(name),
  )) {
    try {
      output += `\n${file}\n${readFileSync(join(node.path, file), 'utf8')}\n`;
    } catch {
      /* Directory notices are covered by upstream source links. */
    }
  }
}
writeFileSync('dist/THIRD_PARTY_NOTICES.txt', output);
console.log(`Bundled notices for ${packages.size} installed production dependencies.`);
