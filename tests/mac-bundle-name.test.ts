import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// Electron finds its helper apps as "<CFBundleName> Helper.app". The helpers are named after
// productName, so a different CFBundleName makes the packaged app crash at launch (RC27).
it('keeps the macOS bundle name equal to productName; only the display name says Tayfa', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const info = pkg.build.mac.extendInfo ?? {};
  expect(info.CFBundleName ?? pkg.build.productName).toBe(pkg.build.productName);
  expect(pkg.build.productName).toBe('ROOMS');
  expect(info.CFBundleDisplayName).toBe('Tayfa');
});
