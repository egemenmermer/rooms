// Reproducible personal-playback engine. All build output stays in a task-owned temp/cache tree.
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  statSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { copyVLCFiles } from './copy-vlc-runtime.cjs';
export const vlcSourceInputs = [
  [
    'vlc-3.0.23',
    'https://download.videolan.org/pub/videolan/vlc/3.0.23/vlc-3.0.23.tar.xz',
    'e891cae6aa3ccda69bf94173d5105cbc55c7a7d9b1d21b9b21666e69eff3e7e0',
    'tar.xz',
  ],
  [
    'ffmpeg-7.1.5',
    'https://ffmpeg.org/releases/ffmpeg-7.1.5.tar.xz',
    'de668509caf9e35e3cd162473441fdb29538c6d96ed080292b3cf9e6fc5d558f',
    'tar.xz',
  ],
  [
    'libdvbpsi-1.3.3',
    'https://download.videolan.org/pub/libdvbpsi/1.3.3/libdvbpsi-1.3.3.tar.bz2',
    '70f9e783a947e026ea50afe98ad2b3bfce075bd8d76932f73a6253b077a3a180aa632e9a1fff20308e2f0f3f881d727b4e4aad9b8da2b384edf9a3a0f9eacc69',
    'tar.bz2',
  ],
  [
    'libgpg-error-1.58',
    'https://gnupg.org/ftp/gcrypt/libgpg-error/libgpg-error-1.58.tar.bz2',
    'f943aea9a830a8bd938e5124b579efaece24a3225ff4c3d27611a80ce1260c27',
    'tar.bz2',
  ],
  [
    'libgcrypt-1.12.0',
    'https://gnupg.org/ftp/gcrypt/libgcrypt/libgcrypt-1.12.0.tar.bz2',
    '0311454e678189bad62a7e9402a9dd793025efff6e7449898616e2fc75e0f4f5',
    'tar.bz2',
  ],
  [
    'freetype-2.14.1',
    'https://download.savannah.gnu.org/releases/freetype/freetype-2.14.1.tar.xz',
    '32427e8c471ac095853212a37aef816c60b42052d4d9e48230bab3bdf2936ccc',
    'tar.xz',
  ],
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const sourceBuildKey = () =>
  hash(
    Buffer.concat([
      readFileSync(new URL(import.meta.url)),
      readFileSync('scripts/vlc-patches/avcodec-version-guard.patch'),
    ]),
  );
function run(command, args, cwd, env = process.env) {
  const r = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error(`${command} failed`);
}
export function prepareVLCSourceMac(destination) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64')
    throw Error('Source engine builder requires Apple Silicon macOS.');
  const key = sourceBuildKey();
  const cache = resolve('.local/vlc-source-cache');
  mkdirSync(cache, { recursive: true });
  const cached = join(cache, 'engine-' + key);
  const ready = join(cached, 'manifest.json');
  if (existsSync(ready)) {
    const info = JSON.parse(readFileSync(ready, 'utf8'));
    if (info.key !== key) throw Error('VLC source build key mismatch.');
    for (const [path, sha] of Object.entries(info.files))
      if (hash(readFileSync(join(cached, path))) !== sha)
        throw Error('VLC source build cache content mismatch.');
    copyVLCFiles(join(cached, 'runtime'), destination);
    return { key, inputs: vlcSourceInputs };
  }
  const work = join(tmpdir(), 'rooms-vlc-' + key.slice(0, 16));
  mkdirSync(work, { recursive: true });
  const src = join(work, 'source');
  const deps = join(work, 'deps');
  mkdirSync(src, { recursive: true });
  for (const [name, url, sha, ext] of vlcSourceInputs) {
    const archive = join(cache, `${name}.${ext}`);
    if (!existsSync(archive)) run('curl', ['-fSL', url, '-o', archive], work);
    const algorithm = sha.length === 128 ? 'sha512' : 'sha256';
    if (createHash(algorithm).update(readFileSync(archive)).digest('hex') !== sha)
      throw Error('Pinned VLC dependency source digest mismatch.');
    if (!existsSync(join(src, name, 'configure'))) run('tar', ['-xf', archive, '-C', src], work);
  }
  const vlc = join(src, 'vlc-3.0.23');
  const dvb = join(src, 'libdvbpsi-1.3.3');
  const patches = [
    'dvbpsi-noexamples.patch',
    'dvbpsi-sys-types.patch',
    '0001-really-identify-duplicates.patch',
    '0002-really-reset-packet-counter.patch',
    '0001-dvbpsi_packet_push-compute-sizes-using-pointer-to-en.patch',
    '0002-dvbpsi_packet_push-check-adaptation-field-length.patch',
    '0003-dvbpsi_packet_push-check-section-pointers-field.patch',
    '0004-dvbpsi_packet_push-check-section-length.patch',
  ];
  const patched = join(work, 'upstream-patches-applied');
  if (!existsSync(patched)) {
    for (const name of patches) {
      if (
        name === 'dvbpsi-sys-types.patch' &&
        readFileSync(join(dvb, 'src/descriptor.h'), 'utf8').includes('#include <sys/types.h>')
      )
        continue;
      run('patch', ['-N', '--batch', '-p1', '-i', join(vlc, 'contrib/src/dvbpsi', name)], dvb);
    }
    run(
      'patch',
      ['-N', '--batch', '-p1', '-i', resolve('scripts/vlc-patches/avcodec-version-guard.patch')],
      vlc,
    );
    writeFileSync(patched, key);
  }
  const flags = `-O2 -mmacosx-version-min=14.0 -ffile-prefix-map=${work}=vlc-build`;
  const env = {
    ...process.env,
    CFLAGS: flags,
    CXXFLAGS: flags,
    OBJCFLAGS: flags,
    MACOSX_DEPLOYMENT_TARGET: '14.0',
    PKG_CONFIG_PATH: join(deps, 'lib/pkgconfig'),
    PKG_CONFIG_LIBDIR: join(deps, 'lib/pkgconfig'),
  };
  const compile = (name, options, extra = {}) => {
    const dir = join(work, 'build-' + name);
    mkdirSync(dir, { recursive: true });
    const local = { ...env, ...extra };
    run(join(src, name, 'configure'), [`--prefix=${deps}`, ...options], dir, local);
    run('make', ['-j4'], dir, local);
    run('make', ['install'], dir, local);
  };
  compile('libdvbpsi-1.3.3', ['--disable-static', '--enable-shared']);
  compile('ffmpeg-7.1.5', [
    '--disable-autodetect',
    '--disable-shared',
    '--enable-static',
    '--enable-pic',
    '--disable-programs',
    '--disable-doc',
    '--disable-debug',
    '--disable-network',
    '--disable-avformat',
    '--disable-avdevice',
    '--disable-avfilter',
    '--disable-postproc',
    '--disable-encoders',
    '--disable-muxers',
    '--disable-demuxers',
    '--disable-protocols',
    '--disable-filters',
    `--extra-cflags=${flags}`,
  ]);
  compile('libgpg-error-1.58', [
    '--disable-nls',
    '--disable-doc',
    '--disable-shared',
    '--enable-static',
  ]);
  compile('libgcrypt-1.12.0', [
    `--with-libgpg-error-prefix=${deps}`,
    '--disable-shared',
    '--enable-static',
    '--disable-asm',
    '--disable-doc',
  ]);
  compile('freetype-2.14.1', [
    '--disable-shared',
    '--enable-static',
    '--with-harfbuzz=no',
    '--with-brotli=no',
    '--with-png=no',
    '--with-zlib=no',
    '--with-bzip2=no',
  ]);
  const build = join(work, 'build-vlc');
  mkdirSync(build, { recursive: true });
  const vlcEnv = {
    ...env,
    GCRYPT_CFLAGS: `-I${deps}/include`,
    GCRYPT_LIBS: `-L${deps}/lib -lgcrypt -lgpg-error`,
  };
  const disabled = [
    'nls',
    'lua',
    'qt',
    'skins2',
    'macosx',
    'vlc',
    'chromecast',
    'sout',
    'vlm',
    'sparkle',
    'update-check',
    'libva',
    'libplacebo',
    'dbus',
    'notify',
    'pulse',
    'alsa',
    'jack',
    'caca',
    'svg',
    'taglib',
    'bluray',
    'dvdread',
    'dvdnav',
    'vcd',
    'mtp',
    'smbclient',
    'nfs',
    'realrtsp',
    'live555',
    'srt',
    'faad',
    'avformat',
    'gnutls',
  ];
  run(
    join(vlc, 'configure'),
    [
      '--host=aarch64-apple-darwin25',
      `--prefix=${work}/install-prefix`,
      ...disabled.map((name) => '--disable-' + name),
    ],
    build,
    vlcEnv,
  );
  run('make', ['-j4'], build, vlcEnv);
  run('make', ['install'], build, vlcEnv);
  const engine = join(work, 'runtime');
  mkdirSync(join(engine, 'lib'), { recursive: true });
  mkdirSync(join(engine, 'plugins'), { recursive: true });
  for (const name of ['libvlc.5.dylib', 'libvlc.dylib', 'libvlccore.9.dylib', 'libvlccore.dylib'])
    copyFileSync(join(work, 'install-prefix/lib', name), join(engine, 'lib', name));
  copyFileSync(join(deps, 'lib/libdvbpsi.10.dylib'), join(engine, 'lib/libdvbpsi.10.dylib'));
  const collect = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) collect(path);
      else if (e.name.endsWith('.dylib')) copyFileSync(path, join(engine, 'plugins', e.name));
    }
  };
  collect(join(work, 'install-prefix/lib/vlc/plugins'));
  for (const dir of [join(engine, 'lib'), join(engine, 'plugins')])
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      const text = spawnSync('otool', ['-L', file], { encoding: 'utf8' }).stdout;
      for (const line of text.split('\n').slice(1)) {
        const dep = line.trim().split(' (')[0];
        // Plugins are loaded by libvlccore, not by the adapter's Mach-O loader.
        // Resolve bundled dependencies relative to the loading binary itself.
        if (existsSync(join(engine, 'lib', basename(dep)))) {
          const relative = dir.endsWith('/plugins') ? '../lib/' : '';
          run(
            'install_name_tool',
            ['-change', dep, '@loader_path/' + relative + basename(dep), file],
            work,
          );
        }
      }
      if (name === 'libdvbpsi.10.dylib')
        run('install_name_tool', ['-id', '@rpath/' + name, file], work);
      run('codesign', ['--force', '--sign', '-', file], work);
    }
  const notices = join(engine, 'notices');
  mkdirSync(notices, { recursive: true });
  for (const [name] of vlcSourceInputs) {
    const destination = join(notices, name);
    mkdirSync(destination, { recursive: true });
    for (const file of [
      'COPYING',
      'COPYING.LIB',
      'COPYING.LGPLv2.1',
      'COPYING.LGPLv3',
      'LICENSE',
      'LICENSE.md',
      'AUTHORS',
      'THANKS',
    ]) {
      const input = join(src, name, file);
      if (existsSync(input)) copyFileSync(input, join(destination, file));
    }
    if (name.startsWith('freetype-'))
      for (const file of ['FTL.TXT', 'GPLv2.TXT'])
        copyFileSync(join(src, name, 'docs', file), join(destination, file));
  }
  writeFileSync(
    join(engine, 'SOURCE-MATERIALS.json'),
    JSON.stringify(
      {
        inputs: vlcSourceInputs,
        patch: 'avcodec-version-guard.patch',
        note: 'Mac engine built from source. avcodec version detection is corrected when avformat is omitted. MPEG-TS upstream security patches are applied. Build scripts and all dependency source locations/digests accompany the engine.',
      },
      null,
      2,
    ),
  );
  const cacheEnv = { ...process.env, DYLD_LIBRARY_PATH: join(engine, 'lib') };
  run(join(build, 'bin/.libs/vlc-cache-gen'), [join(engine, 'plugins')], work, cacheEnv);
  // Reuse exactly the public gate; no third-party binary exemptions.
  const scan = spawnSync(
    process.execPath,
    [
      '-e',
      `const fs=require('fs'),p=require('path'),{assertPublicEntries}=require('./scripts/package-privacy.cjs');function* w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isDirectory())yield*w(f);else yield{path:f,bytes:fs.readFileSync(f)};}}assertPublicEntries(w(process.argv[1]));`,
      engine,
    ],
    { cwd: resolve('.'), stdio: 'inherit' },
  );
  if (scan.status) throw Error('Source-built VLC privacy gate failed.');
  mkdirSync(cached, { recursive: true });
  copyVLCFiles(engine, join(cached, 'runtime'));
  const files = {};
  const manifest = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) manifest(path);
      else files[path.slice(cached.length + 1)] = hash(readFileSync(path));
    }
  };
  manifest(join(cached, 'runtime'));
  writeFileSync(ready, JSON.stringify({ key, files, inputs: vlcSourceInputs }));
  copyVLCFiles(engine, destination);
  return { key, inputs: vlcSourceInputs };
}
