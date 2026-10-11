const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

module.exports = async context => {
  if (context.electronPlatformName !== 'darwin') return;
  // Finder/resource-fork metadata on generated files invalidates codesign sealing.
  // Restrict cleanup to this build's generated app, never source, user data or installed apps.
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const result = spawnSync('/usr/bin/xattr', ['-cr', app], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Could not clean generated app metadata before signing.');
};
