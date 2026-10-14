import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const {
  assertPublicEntries,
  distributionScope,
  verifyPublicResources,
} = require('../scripts/package-privacy.cjs');
const entry = (path: string, text = '') => ({ path, bytes: Buffer.from(text) });

it('defaults packaging to public and requires an explicit valid community scope', () => {
  expect(distributionScope({})).toBe('public');
  expect(distributionScope({ ROOMS_DISTRIBUTION_SCOPE: 'community' })).toBe('community');
  expect(() => distributionScope({ ROOMS_DISTRIBUTION_SCOPE: 'typo' })).toThrow();
});
it('inspects nested members in a real ASAR and loose resource exports', async () => {
  const store = resolve('node_modules/.pnpm');
  const name = readdirSync(store).find((value) => value.startsWith('@electron+asar@'))!;
  const asar = require(join(store, name, 'node_modules/@electron/asar'));
  const root = mkdtempSync(join(tmpdir(), 'rooms-package-privacy-'));
  try {
    const input = join(root, 'input');
    const resources = join(root, 'resources');
    mkdirSync(join(input, 'dist'), { recursive: true });
    mkdirSync(resources);
    writeFileSync(join(input, 'dist/app.js'), 'console.log("ROOMS");');
    await asar.createPackage(input, join(resources, 'app.asar'));
    expect(() => verifyPublicResources(resources)).not.toThrow();
    const hook = require('../scripts/mac-preview-after-pack.cjs');
    await expect(hook({ electronPlatformName: 'win32', appOutDir: root })).resolves.toBeUndefined();
    writeFileSync(join(resources, 'session.json'), '{}');
    expect(() => verifyPublicResources(resources)).toThrow('private material');
    rmSync(join(resources, 'session.json'));
    writeFileSync(join(input, 'dist/update-config.json'), '{"feed":"https://10.23.45.67/"}');
    await asar.createPackage(input, join(resources, 'app.asar'));
    expect(() => verifyPublicResources(resources)).toThrow('dist/update-config.json');
    await expect(hook({ electronPlatformName: 'win32', appOutDir: root })).rejects.toThrow(
      'private material',
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});
it('rejects community addresses/artwork, account exports and signing secrets without printing content', () => {
  for (const toxic of [
    entry('dist/update-config.json', '{"feed":"https://10.23.45.67/updates/"}'),
    entry('dist/dj/recep-dj.webm'),
    entry('resources/music-history.json'),
    entry('native/signing.p12'),
    entry('data.json', '{"refresh_token":"fixture-sensitive-value"}'),
    entry('data.txt', '-----BEGIN PRIVATE KEY-----'),
  ]) {
    expect(() => assertPublicEntries([toxic])).toThrow('private material');
  }
  try {
    assertPublicEntries([entry('data.json', '{"password":"fixture-sensitive-value"}')]);
  } catch (error) {
    expect(String(error)).not.toContain('fixture-sensitive-value');
  }
});
it('allows generic application resources, public verification keys and configuration references', () => {
  expect(() =>
    assertPublicEntries([
      entry('dist/app.js', 'process.env.ROOMS_UPDATE_FEED; refresh_token;'),
      entry(
        'dist/update-config.json',
        '{"feed":"https://updates.example.org/","teamId":"PUBLICID"}',
      ),
      entry('dist/dj/original-static.svg', '<svg/>'),
      entry('public-key.txt', '-----BEGIN PUBLIC KEY-----'),
    ]),
  ).not.toThrow();
});
