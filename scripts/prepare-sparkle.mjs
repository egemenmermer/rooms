import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
const version = '2.10.0',
  digest = 'c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c';
if (process.platform !== 'darwin') throw new Error('Sparkle is macOS-only');
const root = resolve('.local/sparkle'),
  archive = join(root, `Sparkle-${version}.tar.xz`);
mkdirSync(root, { recursive: true });
const run = (command, args) => {
  const r = spawnSync(command, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${command} failed`);
};
if (!existsSync(archive))
  run('curl', [
    '-fsSL',
    `https://github.com/sparkle-project/Sparkle/releases/download/${version}/Sparkle-${version}.tar.xz`,
    '-o',
    archive,
  ]);
if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== digest)
  throw new Error('Sparkle archive digest mismatch');
if (!existsSync(join(root, 'Sparkle.framework'))) run('tar', ['-xf', archive, '-C', root]);
const include =
  process.env.ROOMS_NODE_HEADERS ?? join(dirname(dirname(process.execPath)), 'include/node');
if (!existsSync(join(include, 'node_api.h')))
  throw new Error('Set ROOMS_NODE_HEADERS to the Node N-API include directory');
mkdirSync('dist-native', { recursive: true });
run('xcrun', [
  'clang++',
  '-std=c++17',
  '-fobjc-arc',
  '-mmacosx-version-min=14.0',
  '-arch',
  'arm64',
  '-bundle',
  '-undefined',
  'dynamic_lookup',
  '-I',
  include,
  '-F',
  root,
  '-framework',
  'Cocoa',
  '-framework',
  'Sparkle',
  '-Wl,-rpath,@loader_path/../../Frameworks',
  'apps/desktop/native/sparkle.mm',
  '-o',
  'dist-native/rooms-sparkle.node',
]);
writeFileSync('dist-native/sparkle-version.json', JSON.stringify({ version, digest }));
