const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { mkdirSync, copyFileSync, existsSync } = require('node:fs');

module.exports = async (context) => {
  if (context.electronPlatformName !== 'darwin') return;
  // Finder/resource-fork metadata on generated files invalidates codesign sealing.
  // Restrict cleanup to this build's generated app, never source, user data or installed apps.
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (process.env.ROOMS_SPARKLE === '1') {
    const framework = join(process.cwd(), '.local/sparkle/Sparkle.framework');
    if (!existsSync(framework) || !existsSync('dist-native/rooms-sparkle.node'))
      throw new Error('Prepare Sparkle before packaging');
    const copied = spawnSync(
      '/bin/cp',
      ['-R', framework, join(app, 'Contents/Frameworks/Sparkle.framework')],
      { stdio: 'inherit' },
    );
    if (copied.status !== 0) throw new Error('Sparkle framework copy failed');
    const native = join(app, 'Contents/Resources/native');
    mkdirSync(native, { recursive: true });
    copyFileSync('dist-native/rooms-sparkle.node', join(native, 'rooms-sparkle.node'));
    copyFileSync('.local/sparkle/LICENSE', join(native, 'Sparkle-LICENSE.txt'));
  }
  const result = spawnSync('/usr/bin/xattr', ['-cr', app], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error('Could not clean generated app metadata before signing.');
};
