import { prepareVLCSourceMac } from './build-vlc-source-mac.mjs';
import { copyVLCFiles } from './copy-vlc-runtime.cjs';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  copyFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
const version = '3.0.23';
const mac = process.platform === 'darwin';
if (!mac && process.platform !== 'win32')
  throw new Error('VLC desktop playback supports macOS and Windows.');
if (mac && process.arch !== 'arm64') throw new Error('The pinned macOS runtime is ARM64.');
const archiveName = mac ? `vlc-${version}-arm64.dmg` : `vlc-${version}-win64.zip`;
const digest = mac
  ? 'e891cae6aa3ccda69bf94173d5105cbc55c7a7d9b1d21b9b21666e69eff3e7e0'
  : '992d19dbd0b8a7cde9167d2f7780b1ef6f92acc8a71acfa736101a21f35181e1';
const cache = resolve('.local/vlc-runtime');
const output = resolve('dist-native');
mkdirSync(cache, { recursive: true });
mkdirSync(output, { recursive: true });
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed`);
};
const archive = join(cache, archiveName);
if (!mac) {
  if (!existsSync(archive))
    run(mac ? 'curl' : 'curl.exe', [
      '-fSL',
      `https://download.videolan.org/pub/videolan/vlc/${version}/${mac ? 'macosx' : 'win64'}/${archiveName}`,
      '-o',
      archive,
    ]);
  if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== digest)
    throw new Error('Official VLC runtime digest mismatch.');
}
const runtime = join(output, 'vlc');
// Keep the previous generated engine available for review; never delete user data.
if (existsSync(runtime)) renameSync(runtime, join(output, `vlc-retained-${Date.now()}`));
let sourceBuild;
if (mac) {
  sourceBuild = prepareVLCSourceMac(runtime);
  let headers =
    process.env.ROOMS_NODE_HEADERS ?? join(dirname(dirname(process.execPath)), 'include/node');
  if (!existsSync(join(headers, 'node_api.h'))) {
    const sdkArchive = join(cache, 'electron-headers.tar.gz');
    if (!existsSync(sdkArchive))
      run('curl', [
        '-fSL',
        'https://artifacts.electronjs.org/headers/dist/v44.7.0/node-v44.7.0-headers.tar.gz',
        '-o',
        sdkArchive,
      ]);
    if (
      createHash('sha256').update(readFileSync(sdkArchive)).digest('hex') !==
      'bb2b300b13850a976343a506c05aad5716bda0c43511add122ecd1959383ddd0'
    )
      throw new Error('Official Electron native SDK digest mismatch.');
    run('tar', ['-xf', sdkArchive, '-C', cache]);
    headers = join(cache, 'node_headers/include/node');
  }
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
    headers,
    '-framework',
    'Cocoa',
    '-Wl,-rpath,@loader_path/vlc/lib',
    'apps/desktop/native/vlc-player.mm',
    '-o',
    join(output, 'rooms-vlc.node'),
  ]);
} else {
  const unpacked = join(cache, 'windows');
  mkdirSync(unpacked, { recursive: true });
  // tar supplied by Windows extracts ZIP without shell interpolation.
  run('tar', ['-xf', archive, '-C', unpacked]);
  copyVLCFiles(join(unpacked, `vlc-${version}`), runtime);
  const sdk = join(cache, 'electron-44.7.0');
  mkdirSync(sdk, { recursive: true });
  const sdkArchive = join(sdk, 'headers.tar.gz');
  const libraryFile = join(sdk, 'node.lib');
  const sdkBase = 'https://artifacts.electronjs.org/headers/dist/v44.7.0';
  for (const [file, url, sha] of [
    [
      sdkArchive,
      `${sdkBase}/node-v44.7.0-headers.tar.gz`,
      'bb2b300b13850a976343a506c05aad5716bda0c43511add122ecd1959383ddd0',
    ],
    [
      libraryFile,
      `${sdkBase}/win-x64/node.lib`,
      '221dac8b3f9e9e7cabb1e782c347399b24f0a68d0778e294ee34714c59d6446e',
    ],
  ]) {
    if (!existsSync(file)) run('curl.exe', ['-fSL', url, '-o', file]);
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== sha)
      throw new Error('Official Electron native SDK digest mismatch.');
  }
  run('tar', ['-xf', sdkArchive, '-C', sdk]);
  const headers = process.env.ROOMS_NODE_HEADERS ?? join(sdk, 'node_headers/include/node');
  const importLibrary = process.env.ROOMS_NODE_IMPORT_LIBRARY ?? libraryFile;
  if (
    !headers ||
    !existsSync(join(headers, 'node_api.h')) ||
    !importLibrary ||
    !existsSync(importLibrary)
  )
    throw new Error(
      'Set ROOMS_NODE_HEADERS and ROOMS_NODE_IMPORT_LIBRARY to official Electron/Node build inputs.',
    );
  // Run from a Visual Studio x64 developer shell; N-API needs no Electron rebuild dependency.
  run('cl.exe', [
    '/nologo',
    '/LD',
    '/EHsc',
    '/std:c++17',
    '/TP',
    '/DNAPI_VERSION=8',
    `/I${headers}`,
    'apps/desktop/native/vlc-player.mm',
    '/link',
    importLibrary,
    'user32.lib',
    `/OUT:${join(output, 'rooms-vlc.node')}`,
  ]);
}
writeFileSync(
  join(runtime, 'ROOMS-VLC-NOTICE.txt'),
  `VLC ${version}, copyright VideoLAN and contributors.\nOfficial release source/runtime location: https://download.videolan.org/pub/videolan/vlc/${version}/\nCorresponding source: https://download.videolan.org/pub/videolan/vlc/${version}/vlc-${version}.tar.xz\nSource SHA256: e891cae6aa3ccda69bf94173d5105cbc55c7a7d9b1d21b9b21666e69eff3e7e0\nlibVLC is LGPL-2.1-or-later; modules and accompanying notices may use other licenses, including GPL.\nReplaceable shared libraries and this adapter source/build instructions are provided; the macOS source build applies the included avcodec-version guard compatibility patch. No DRM bypass or media rebroadcast is added.\n`,
);
// Corresponding notices are source distribution files, not credentials or generated source URLs.
const sourceArchive = join(cache, `vlc-${version}.tar.xz`);
if (!existsSync(sourceArchive))
  run(mac ? 'curl' : 'curl.exe', [
    '-fSL',
    `https://download.videolan.org/pub/videolan/vlc/${version}/vlc-${version}.tar.xz`,
    '-o',
    sourceArchive,
  ]);
if (
  createHash('sha256').update(readFileSync(sourceArchive)).digest('hex') !==
  'e891cae6aa3ccda69bf94173d5105cbc55c7a7d9b1d21b9b21666e69eff3e7e0'
)
  throw new Error('VLC source digest mismatch.');
const source = join(cache, 'source');
mkdirSync(source, { recursive: true });
run('tar', [
  '-xf',
  sourceArchive,
  '-C',
  source,
  `vlc-${version}/COPYING`,
  `vlc-${version}/COPYING.LIB`,
  `vlc-${version}/THANKS`,
  `vlc-${version}/AUTHORS`,
]);
for (const name of ['COPYING', 'COPYING.LIB', 'THANKS', 'AUTHORS'])
  copyFileSync(join(source, `vlc-${version}`, name), join(runtime, name));

writeFileSync(
  join(output, 'vlc-version.json'),
  JSON.stringify({
    version,
    digest,
    platform: process.platform,
    arch: process.arch,
    ...(sourceBuild
      ? {
          engine: 'source',
          sourceBuildKey: sourceBuild.key,
          inputs: sourceBuild.inputs,
          minimumOS: '14.0',
        }
      : {}),
  }),
);
