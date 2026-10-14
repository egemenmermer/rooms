const {
  readdirSync,
  lstatSync,
  realpathSync,
  statSync,
  mkdirSync,
  copyFileSync,
  chmodSync,
  utimesSync,
  unlinkSync,
  existsSync,
} = require('node:fs');
const { resolve, join, sep } = require('node:path');
/** Flatten internal library aliases to ordinary files; reject escaping links and special files. */
function copyVLCFiles(source, destination) {
  const root = realpathSync(source);
  function walk(input, output) {
    if (existsSync(output) && lstatSync(output).isSymbolicLink())
      throw new Error('Unexpected destination link in generated VLC resources.');
    mkdirSync(output, { recursive: true });
    for (const entry of readdirSync(input, { withFileTypes: true })) {
      const path = join(input, entry.name),
        target = join(output, entry.name);
      const canonical = realpathSync(path);
      if (canonical !== root && !canonical.startsWith(root + sep))
        throw new Error('Official VLC runtime contains an escaping link.');
      const info = statSync(canonical);
      if (entry.isDirectory()) walk(path, target);
      else if (info.isFile()) {
        if (existsSync(target) && lstatSync(target).isSymbolicLink()) unlinkSync(target);
        copyFileSync(canonical, target);
        chmodSync(target, info.mode & 0o777);
        // VLC's signed plugin cache checks mtimes. Retain them to avoid reloading every plugin.
        utimesSync(target, info.atime, info.mtime);
      } else throw new Error('Unexpected file type in official VLC runtime.');
    }
  }
  walk(root, resolve(destination));
}
module.exports = { copyVLCFiles };
