import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
const env = { ...process.env, ROOMS_PROFILE: `qa-hls-${Date.now()}` };
delete env.ELECTRON_RUN_AS_NODE;
// Public test stream explicitly supplied by the hls.js maintainers; never shipped as product content.
// https://github.com/video-dev/hls.js/blob/master/demo/basic-usage.html
const app = await electron.launch({ args: ['.'], env });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForSelector('.hero');
  const connection = await page.evaluate(() =>
    window.rooms.providers.connectPlaylist({
      name: 'QA · Public hls.js test stream',
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    }),
  );
  assert.equal(connection.channelCount, 1);
  await page.evaluate(() => (location.hash = '/settings?tab=connections'));
  await page.getByRole('button', { name: 'Kanalları aç', exact: true }).click();
  await page.locator('.personal-library-modal .personal-channel > button').first().click();
  await page.waitForSelector('.personal-player video');
  await page.locator('.personal-player video').evaluate((video) => {
    video.muted = true;
  });
  await page.waitForFunction(
    () => document.querySelector('.personal-player video')?.readyState >= 2,
    { timeout: 45000 },
  );
  await page.locator('.personal-player video').evaluate((video) => video.play());
  await page.waitForFunction(
    () => document.querySelector('.personal-player video')?.currentTime > 2,
    { timeout: 20000 },
  );
  const result = await page
    .locator('.personal-player video')
    .evaluate((video) => ({
      time: video.currentTime,
      width: video.videoWidth,
      height: video.videoHeight,
      readyState: video.readyState,
      source: video.currentSrc,
    }));
  assert(result.width > 0 && result.height > 0);
  assert.equal(await page.locator('[src*="test-streams.mux.dev"]').count(), 0);
  assert.equal(errors.length, 0);
  await page.screenshot({ path: 'docs/screenshots/tr/personal-hls-public-demo.png' });
  await page.evaluate((id) => window.rooms.providers.disconnect(id), connection.id);
  console.log(
    JSON.stringify(
      {
        result: 'PASS',
        source: 'Public hls.js test demo; not a paid IPTV account',
        video: result,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
}
