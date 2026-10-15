import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const mac = process.platform === 'darwin';
if (!mac && process.platform !== 'win32') throw Error('Remote input supports macOS and Windows.');
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} failed`);
};
const output = resolve('dist-native'),
  sdk = resolve('.local/remote-input-sdk');
mkdirSync(output, { recursive: true });
mkdirSync(sdk, { recursive: true });
let headers =
  process.env.ROOMS_NODE_HEADERS ?? join(dirname(dirname(process.execPath)), 'include/node');
if (!existsSync(join(headers, 'node_api.h')) || !mac) {
  const archive = join(sdk, 'headers.tar.gz');
  if (!existsSync(archive))
    run(mac ? 'curl' : 'curl.exe', [
      '-fSL',
      'https://artifacts.electronjs.org/headers/dist/v44.7.0/node-v44.7.0-headers.tar.gz',
      '-o',
      archive,
    ]);
  if (
    createHash('sha256').update(readFileSync(archive)).digest('hex') !==
    'bb2b300b13850a976343a506c05aad5716bda0c43511add122ecd1959383ddd0'
  )
    throw Error('Electron SDK digest mismatch.');
  run('tar', ['-xf', archive, '-C', sdk]);
  headers = join(sdk, 'node_headers/include/node');
}
if (mac)
  run('xcrun', [
    'clang++',
    '-std=c++17',
    '-DNAPI_VERSION=8',
    '-mmacosx-version-min=14.0',
    '-bundle',
    '-undefined',
    'dynamic_lookup',
    '-I',
    headers,
    '-framework',
    'ApplicationServices',
    '-framework',
    'CoreFoundation',
    'apps/desktop/native/remote-input.cc',
    '-o',
    join(output, 'rooms-remote-input.node'),
  ]);
else {
  const lib = join(sdk, 'node.lib');
  if (!existsSync(lib))
    run('curl.exe', [
      '-fSL',
      'https://artifacts.electronjs.org/headers/dist/v44.7.0/win-x64/node.lib',
      '-o',
      lib,
    ]);
  if (
    createHash('sha256').update(readFileSync(lib)).digest('hex') !==
    '221dac8b3f9e9e7cabb1e782c347399b24f0a68d0778e294ee34714c59d6446e'
  )
    throw Error('Electron import library digest mismatch.');
  run('cl.exe', [
    '/nologo',
    '/LD',
    '/EHsc',
    '/std:c++17',
    '/DNAPI_VERSION=8',
    `/I${headers}`,
    'apps/desktop/native/remote-input.cc',
    'apps/desktop/native/windows-node-host.cc',
    '/link',
    lib,
    'delayimp.lib',
    '/DELAYLOAD:node.exe',
    'user32.lib',
    `/OUT:${join(output, 'rooms-remote-input.node')}`,
  ]);
}
// Compile/load only: never arm a monitor, install hooks or inject input as a build test.
const { createRequire } = await import('node:module');
const native = createRequire(import.meta.url)(join(output, 'rooms-remote-input.node'));
if (!native.status().supported || native.status().active)
  throw Error('Native remote input smoke failed.');
if (native.apply(2, 0, 0, 65, true)) throw Error('Unapproved native input was accepted.');
writeFileSync(
  join(output, 'remote-input-version.json'),
  JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    sourceSha256: createHash('sha256')
      .update(readFileSync('apps/desktop/native/remote-input.cc'))
      .digest('hex'),
  }),
);
native.end();
console.log('Native remote input compiled and loaded without activating input.');
