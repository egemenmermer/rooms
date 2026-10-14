import { vlcSourceInputs } from './build-vlc-source-mac.mjs';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve('.local/vlc-source-materials');
mkdirSync(root, { recursive: true });
const inputs = [];
for (const [name, url, sha, ext] of vlcSourceInputs) {
  const file = `${name}.${ext}`;
  const candidates = [join('.local/vlc-source-cache', file), join('.local/vlc-runtime', file)];
  const source = candidates.find(existsSync);
  if (!source) throw Error('Prepare all pinned VLC dependency sources before publishing.');
  if (
    createHash(sha.length === 128 ? 'sha512' : 'sha256')
      .update(readFileSync(source))
      .digest('hex') !== sha
  )
    throw Error('Source-material archive digest mismatch.');
  copyFileSync(source, join(root, file));
  inputs.push({ file, url, algorithm: sha.length === 128 ? 'sha512' : 'sha256', digest: sha });
}
for (const file of [
  'apps/desktop/native/vlc-player.mm',
  'scripts/prepare-vlc.mjs',
  'scripts/build-vlc-source-mac.mjs',
  'scripts/copy-vlc-runtime.cjs',
  'scripts/vlc-patches/avcodec-version-guard.patch',
  'LICENSE',
]) {
  const output = join(root, file);
  mkdirSync(dirname(output), { recursive: true });
  copyFileSync(file, output);
}
writeFileSync(join(root, 'SOURCE-MANIFEST.json'), JSON.stringify({ inputs }, null, 2));
writeFileSync(
  join(root, 'RELINKING.md'),
  `# ROOMS native playback corresponding sources\n\nThis archive includes the exact upstream source archives, the ROOMS adapter, engine build scripts and the compatibility patch. VLC's bundled libdvbpsi security patches are applied by the build script. Each component retains its own license; consult COPYING/COPYING.LIB and the FreeType license inside its source archive.\n\nBuild in a matching ROOMS source checkout at the release's recorded Git commit. Install its frozen dependencies, then run pnpm prepare:vlc on Apple Silicon macOS, or in a Visual Studio x64 developer shell on Windows. Official native SDK downloads are checksum pinned. No developer account is needed for a local development build.\n\nThe macOS engine build compiles the attached libraries into replaceable libVLC shared libraries and plugins. Its optional FreeType build supports platform fonts; complex-script shaping is not enabled in this minimal build. The Standard player remains available. Generated outputs are in dist-native. The renderer does not own provider credentials or native handles.\n\nNative resources are outside app.asar under Resources/native on macOS or resources/native on Windows. Rebuild the adapter and/or compatible libraries and replace them in your own build. Changing a signed application changes its signature; sign a resulting distribution with your own identity. Do not share signing keys or personal account credentials.\n\nRepository: https://github.com/egemenmermer/rooms\n`,
);
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const archive = resolve(`.local/ROOMS-${version}-native-sources.zip`);
const result = spawnSync('ditto', ['-c', '-k', '--norsrc', '--keepParent', root, archive], {
  stdio: 'inherit',
});
if (result.status) throw Error('Corresponding source archive creation failed.');
console.log(
  JSON.stringify({
    archive,
    digest: createHash('sha256').update(readFileSync(archive)).digest('hex'),
    inputs: inputs.length,
  }),
);
