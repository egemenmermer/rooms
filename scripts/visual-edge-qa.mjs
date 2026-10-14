import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
const env = { ...process.env, ROOMS_PROFILE: `visual-edge-${Date.now()}` };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const page = await app.firstWindow();
const shot = (name) =>
  page.screenshot({ path: `docs/screenshots/${name}.png`, animations: 'disabled' });
try {
  await page.waitForSelector('.hero');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  for (const factor of [1.25, 1.5]) {
    await app.evaluate(
      ({ BrowserWindow }, factor) =>
        BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor),
      factor,
    );
    await shot(`home-zoom-${factor * 100}`);
    assert.equal(await page.evaluate(() => document.body.scrollWidth > innerWidth), false);
  }
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1),
  );
  await page.evaluate(() => (location.hash = '/settings'));
  await page.waitForSelector('.settings-content');
  await page.getByRole('switch', { name: 'Show demo fixtures', exact: true }).click();
  await page.evaluate(() => (location.hash = '/voice'));
  await page.waitForSelector('.voice-stage');
  assert.equal(await page.locator('.voice-person').count(), 0);
  await shot('voice-empty-1440');
  await page.evaluate(() => (location.hash = '/cinema'));
  await page.waitForSelector('video');
  await page.locator('video').evaluate((v) => {
    v.src = './missing-qa-video.mp4';
    v.load();
  });
  await page.waitForSelector('.player-error');
  await shot('cinema-media-error');
  await page.locator('video').evaluate((v) => {
    v.src = './blue-hour.mp4';
  });
  await page.getByRole('button', { name: 'Reload demo', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
  assert.equal(await page.locator('.player-error').count(), 0);
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await page.getByRole('textbox', { name: 'Cinema local message' }).fill('A quiet');
  await page.keyboard.press('Space');
  assert.equal(await page.locator('video').evaluate((v) => v.paused), true);
  console.log(
    'PASS: 125% and 150% Chromium zoom without horizontal overflow; empty voice roster; real media-load error and retry after source recovery; Cinema typing does not start media. This is macOS, not Windows scaling validation.',
  );
} finally {
  await app.close();
}
