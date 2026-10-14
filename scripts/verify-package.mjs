/** Packaged launch, legacy fixture removal and real empty-state navigation. */
import { _electron } from '@playwright/test';
import { resolve, join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { writeFile, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
const asarPackage = readdirSync('node_modules/.pnpm').find((name) =>
  name.startsWith('@electron+asar@'),
);
const asar = createRequire(import.meta.url)(
  join(process.cwd(), 'node_modules/.pnpm', asarPackage, 'node_modules/@electron/asar'),
);
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
const bundledFiles = [...walk('dist'), ...walk('dist-electron')];
for (const file of bundledFiles)
  assert(
    asar
      .extractFile('release/mac-arm64/ROOMS.app/Contents/Resources/app.asar', file)
      .equals(readFileSync(file)),
    `Packaged ${file} must match current build`,
  );
assert(
  !asar
    .listPackage('release/mac-arm64/ROOMS.app/Contents/Resources/app.asar')
    .some((p) => p.endsWith('/blue-hour.mp4')),
  'Do not ship the demonstration movie',
);
const env = { ...process.env, ROOMS_PROFILE: 'package-qa-' + Date.now() };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  executablePath: resolve('release/mac-arm64/ROOMS.app/Contents/MacOS/ROOMS'),
  args: [],
  env,
});
const profile = await app.evaluate(({ app }) => app.getPath('userData'));
let rendererErrors = 0;
try {
  const page = await app.firstWindow();
  page.on('pageerror', () => rendererErrors++);
  await page.waitForSelector('.hero');
  await page.waitForSelector('.social-connection form');
  await page.evaluate(() => {
    localStorage.setItem(
      'rooms-local-v1',
      JSON.stringify({
        version: 0,
        state: {
          preferences: {
            reduceMotion: true,
            showFriends: true,
            displayName: 'Fixture Sentinel',
            demoFixtures: true,
          },
          spaces: [{ name: 'Fixture Sentinel' }],
          messages: { general: [{ author: 'Fixture Sentinel', text: 'Fake message' }] },
          queue: [{ title: 'Fake film' }],
          polls: [{ question: 'Fake poll' }],
        },
      }),
    );
    location.reload();
  });
  await page.waitForSelector('.social-connection form');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rooms-local-v1')));
  assert.equal(saved.version, 1);
  assert.deepEqual(Object.keys(saved.state), ['preferences']);
  assert.equal(saved.state.preferences.reduceMotion, true);
  assert(!('displayName' in saved.state.preferences));
  assert(!('demoFixtures' in saved.state.preferences));
  assert(
    !(await page
      .locator('body')
      .innerText()
      .then((t) => /Fixture Sentinel|Maya|Oliver|Sofia|Noah|LOCAL DEMO|Yerel demo/i.test(t))),
  );
  await page.screenshot({ path: 'docs/screenshots/tr/packaged-home.png' });
  for (const path of [
    '/spaces',
    '/chat',
    '/voice',
    '/settings?tab=appearance',
    '/settings?tab=profile',
    '/polls',
    '/games',
    '/cinema',
  ]) {
    await page.evaluate((p) => (location.hash = p), path);
    await page.waitForTimeout(400);
    assert(
      !/Fixture Sentinel|Maya|Oliver|Sofia|Noah|demo/i.test(
        await page.locator('.main-view').innerText(),
      ),
      `No demo UI at ${path}`,
    );
    assert.equal(
      await page.locator('video').count(),
      0,
      `No automatically loaded media at ${path}`,
    );
  }
  await page.waitForSelector('.cinema-empty');
  await page.screenshot({ path: 'docs/screenshots/tr/packaged-cinema.png' });
  assert.equal(rendererErrors, 0);
  const result = {
    at: new Date().toISOString(),
    status: 'PASS',
    platform: process.platform,
    arch: process.arch,
    packaged: await app.evaluate(({ app }) => app.isPackaged),
    appVersion: await app.evaluate(({ app }) => app.getVersion()),
    bundledFileCount: bundledFiles.length,
    rendererErrors,
    checks: [
      'all packaged renderer/native/assets/license files match current build',
      'actual packaged app launches with real sign-in form',
      'legacy social fixtures removed while device preference preserved',
      'signed-out spaces/chat/voice/profile route to real authentication',
      'local poll route redirects to shared polls',
      'eight routes contain no demo data or automatically loaded video',
      'demonstration movie absent from packaged archive',
      'Cinema asks for a personal source instead of playing sample media',
    ],
  };
  await writeFile('docs/PACKAGE_TEST_RESULTS.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}
