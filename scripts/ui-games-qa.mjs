import { openFixtureClient, closeFixture } from './electron-activity-fixture.mjs';
import assert from 'node:assert/strict';
const { app, page } = await openFixtureClient('qa-alice');
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const screenshot = async (name) => {
  await page.locator('.main-view').evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({ path: `docs/screenshots/tr/${name}.png` });
};
const close = async () => {
  await page.getByRole('button', { name: 'Masayı kapat', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Masayı kapat', exact: true }).click();
  await page.waitForSelector('.game-catalog');
};
try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  await page.evaluate(() => (location.hash = '/games'));
  await page.waitForSelector('.game-catalog');
  for (const game of ['blackjack', 'ihaleli', 'esli', 'koz-maca', 'gommeli', '101']) {
    await page
      .locator(
        `.game-tile.${game === 'blackjack' ? 'blackjack' : game === '101' ? '\\31 01' : 'batak'}`,
      )
      .click();
    if (!['blackjack', '101'].includes(game))
      await page.getByRole('dialog').locator('select').selectOption(game);
    if (game === '101') {
      await page.getByRole('dialog').getByLabel('Katlamalı', { exact: true }).check();
      await page.getByRole('dialog').getByLabel('Eşli', { exact: true }).check();
    }
    await page.getByRole('button', { name: 'Masayı kur', exact: true }).click();
    await page.waitForSelector('.game-table');
    if (game !== 'blackjack')
      for (let i = 0; i < (game === 'gommeli' ? 2 : 3); i++) {
        await page.getByRole('button', { name: 'Bot ekle', exact: true }).first().click();
        await page.waitForFunction(
          (n) => document.querySelectorAll('.table-seat .avatar').length >= n,
          i + 2,
        );
      }
    await page.getByRole('button', { name: 'Yeni eli başlat', exact: true }).click();
    if (game === '101') {
      await page.waitForSelector('.your-hand .okey-tile');
      assert((await page.locator('.your-hand .okey-tile').count()) >= 21);
    } else {
      await page.waitForSelector('.your-hand .playing-card');
      assert((await page.locator('.your-hand .playing-card').count()) > 1);
    }
    await screenshot(`${game}-service-table`);
    if (
      game === 'blackjack' &&
      (await page.getByRole('button', { name: 'Dur', exact: true }).isEnabled())
    ) {
      await page.getByRole('button', { name: 'Dur', exact: true }).click();
      await page.getByRole('button', { name: 'Yeni eli başlat', exact: true }).waitFor();
    }
    if (['ihaleli', 'esli', 'koz-maca', 'gommeli'].includes(game)) {
      await page.waitForFunction(() =>
        [...document.querySelectorAll('button')].some(
          (b) =>
            (b.textContent === 'İhale ver' || b.classList.contains('suit-choice')) && !b.disabled,
        ),
      );
      if (await page.getByRole('button', { name: 'İhale ver', exact: true }).count())
        await page.getByRole('button', { name: 'İhale ver', exact: true }).click();
      else await page.locator('.suit-choice').first().click();
    }
    if (game === '101') {
      const draw = page.getByRole('button', { name: 'Taş çek', exact: true });
      await page.waitForTimeout(1000);
      if (await draw.isEnabled()) await draw.click();
      await page.waitForFunction(
        () => !!document.querySelector('.your-hand .okey-tile:not(:disabled)'),
      );
      await page.locator('.your-hand .okey-tile').first().click();
      if (await page.getByRole('button', { name: 'Seçili taşı at', exact: true }).isEnabled())
        await page.getByRole('button', { name: 'Seçili taşı at', exact: true }).click();
    }
    await close();
    console.log('PASS', game);
  }
  assert.equal(errors.length, 0);
  console.log('Page errors', JSON.stringify(errors));
} finally {
  await closeFixture();
}
