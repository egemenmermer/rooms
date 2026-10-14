import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  lstatSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, expect, it } from 'vitest';
const { copyVLCFiles } = createRequire(import.meta.url)('../scripts/copy-vlc-runtime.cjs');
const created: string[] = [];
afterEach(() => {
  for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true });
});
function paths() {
  const root = mkdtempSync(join(tmpdir(), 'vlc-copy-'));
  created.push(root);
  const source = join(root, 'source');
  mkdirSync(source);
  return { root, source, target: join(root, 'target') };
}
it('flattens only internal aliases while preserving library contents and plugin timestamps', () => {
  const { source, target } = paths();
  writeFileSync(join(source, 'libvlc.5.dylib'), 'owned synthetic library');
  symlinkSync('libvlc.5.dylib', join(source, 'libvlc.dylib'));
  copyVLCFiles(source, target);
  expect(lstatSync(join(target, 'libvlc.dylib')).isSymbolicLink()).toBe(false);
  expect(readFileSync(join(target, 'libvlc.dylib'), 'utf8')).toBe('owned synthetic library');
  expect(
    Math.abs(
      lstatSync(join(target, 'libvlc.dylib')).mtimeMs -
        lstatSync(join(source, 'libvlc.5.dylib')).mtimeMs,
    ),
  ).toBeLessThan(1);
});
it('rejects aliases leaving the verified runtime tree', () => {
  const { root, source, target } = paths();
  writeFileSync(join(root, 'outside.txt'), 'synthetic external content');
  symlinkSync('../outside.txt', join(source, 'escape'));
  expect(() => copyVLCFiles(source, target)).toThrow('escaping link');
});
