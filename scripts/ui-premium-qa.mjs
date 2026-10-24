import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const env = { ...process.env, ROOMS_PROFILE: `tr-design-${Date.now()}` };
delete env.ELECTRON_RUN_AS_NODE;
const profile = await mkdtemp(join(tmpdir(), 'rooms-tr-'));
const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await mkdir('docs/screenshots/tr', { recursive: true });
try {
  await page.waitForSelector('.hero');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  await page.screenshot({ path: 'docs/screenshots/tr/home-1440.png' });
  for (const [path, selector, name] of [
    ['/cinema', '.cinema-stage', 'cinema'],
    ['/agent', '.agent-page', 'agent'],
    ['/games', '.games-page', 'games'],
    ['/together', '.together-page', 'together'],
    ['/youtube', '.youtube-page', 'youtube'],
    ['/settings?tab=connections', '.personal-connections', 'providers'],
    ['/settings?tab=agent', '.agent-settings', 'agent-settings'],
    ['/settings?tab=desktop', '.desktop-updates', 'updates'],
  ]) {
    await page.evaluate((path) => (location.hash = path), path);
    await page.waitForSelector(selector);
    if (name === 'updates') {
      const native = await page.evaluate(() => window.rooms.notifications.status());
      const toggle = page.getByRole('switch', {
        name: 'Mesaj bildirimlerini etkinleştir',
        exact: true,
      });
      assert.equal(await toggle.getAttribute('aria-checked'), String(native.enabled));
      if (native.supported) {
        await toggle.click();
        await page.waitForFunction(async () => (await window.rooms.notifications.status()).enabled);
        await toggle.click();
        await page.waitForFunction(
          async () => !(await window.rooms.notifications.status()).enabled,
        );
      }
      assert.equal(
        await page
          .getByRole('switch', { name: 'Oturum açınca başlat', exact: true })
          .getAttribute('aria-checked'),
        String(await page.evaluate(() => window.rooms.loginItemStatus())),
      );
    }
    if (name === 'providers' || name === 'updates')
      await page.locator(selector).scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `docs/screenshots/tr/${name}-1440.png` });
    console.log(name, await page.locator('body').evaluate((e) => e.scrollWidth > innerWidth));
  }
  await page.evaluate(() => (location.hash = '/home'));
  await page.waitForSelector('.hero');
  // Home has no voice dock; the toolbar's "Etkinlikler" opens the same launcher.
  await page
    .locator('.minimal-toolbar')
    .getByRole('button', { name: 'Etkinlikler', exact: true })
    .click();
  // Nothing running opens the catalogue (appdir); a running activity opens the launcher.
  await page.waitForSelector('.appdir-modal, .launcher-modal');
  await page.screenshot({ path: 'docs/screenshots/tr/launcher-1440.png' });
  await page.keyboard.press('Escape');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 800));
  await page.screenshot({ path: 'docs/screenshots/tr/home-1280.png' });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 700));
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'docs/screenshots/tr/home-900.png' });
  await writeFile('docs/screenshots/tr/qa-errors.json', JSON.stringify(errors, null, 2));
  console.log('ERRORS', JSON.stringify(errors));
} finally {
  await app.close();
}
