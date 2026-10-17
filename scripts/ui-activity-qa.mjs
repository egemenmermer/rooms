import { openFixtureClient, closeFixture } from './electron-activity-fixture.mjs';
import assert from 'node:assert/strict';
const a = await openFixtureClient('qa-alice');
const b = await openFixtureClient('qa-bob');
const errors = [];
a.page.on('pageerror', (e) => errors.push(e.message));
b.page.on('pageerror', (e) => errors.push(e.message));
const go = async (page, path, selector) => {
  await page.evaluate((path) => (location.hash = path), path);
  await page.waitForSelector(selector);
};
const shot = async (page, name) => {
  await page.locator('.main-view').evaluate((e) => (e.scrollTop = 0));
  return page.screenshot({ path: `docs/screenshots/tr/${name}.png` });
};
const command = async (page, command) =>
  page.evaluate(async (command) => {
    const r = await window.rooms.activity.snapshot('qa-room');
    return window.rooms.activity.command('qa-room', {
      protocolVersion: 1,
      commandId: crypto.randomUUID(),
      expectedRevision: r.room.revision,
      command,
    });
  }, command);
try {
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  await b.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  await go(a.page, '/games', '.game-catalog');
  await go(b.page, '/games', '.game-catalog');
  await a.page.getByRole('button').filter({ hasText: 'Texas Hold’em' }).click();
  await a.page.getByRole('button', { name: 'Masayı kur', exact: true }).click();
  await a.page.waitForSelector('.game-table');
  await b.page.waitForSelector('.game-table', { timeout: 15000 });
  await b.page.getByRole('button', { name: 'Bu koltuğa otur', exact: true }).first().click();
  await a.page.getByRole('button', { name: 'Yeni eli başlat' }).click();
  await a.page.waitForSelector('.your-hand .playing-card');
  await b.page.waitForSelector('.your-hand .playing-card');
  assert.equal(await a.page.locator('.your-hand .playing-card').count(), 2);
  assert.equal(await b.page.locator('.your-hand .playing-card').count(), 2);
  await shot(a.page, 'holdem-alice-live-service');
  await shot(b.page, 'holdem-bob-live-service');
  // UI only Fold terminates this two-human hand; current actor depends on dealer rules.
  const actor = (await a.page.getByRole('button', { name: 'Pas / bırak', exact: true }).isEnabled())
    ? a.page
    : b.page;
  await actor.getByRole('button', { name: 'Pas / bırak', exact: true }).click();
  await a.page.getByRole('button', { name: 'Masa geçmişi', exact: true }).click();
  await a.page.locator('.game-history').getByText('El 1', { exact: true }).waitFor();
  assert((await a.page.locator('.game-history').innerText()).includes('El 1'));
  await shot(a.page, 'holdem-finished-service');
  await command(a.page, { type: 'end' });
  await go(a.page, '/together?tab=polls', '.together-page');
  await go(b.page, '/together?tab=polls', '.together-page');
  await a.page.getByRole('button', { name: 'Anket oluştur', exact: true }).click();
  const fields = a.page.locator('[role=dialog] input');
  await fields.nth(0).fill('QA · Bu akşam ne yapalım?');
  await fields.nth(1).fill('Film');
  await fields.nth(2).fill('Oyun');
  await a.page.getByRole('button', { name: 'Ortak anketi başlat', exact: true }).click();
  await b.page.getByRole('button', { name: 'Film 0', exact: true }).click();
  await a.page.getByRole('button', { name: 'Film 1', exact: true }).waitFor({ timeout: 15000 });
  await shot(a.page, 'poll-two-client-service');
  await go(a.page, '/together?tab=board', '.board-canvas');
  await go(b.page, '/together?tab=board', '.board-canvas');
  await a.page.getByRole('button', { name: 'Metin ekle', exact: true }).click();
  await a.page
    .getByRole('textbox', { name: 'Beyaz tahta notu', exact: true })
    .fill('QA · Birlikte gerçek bir not.');
  await a.page.getByRole('button', { name: 'Not ekle', exact: true }).click();
  await b.page
    .locator('.board-canvas text')
    .filter({ hasText: 'Birlikte gerçek bir not.' })
    .waitFor({ timeout: 15000 });
  await shot(b.page, 'whiteboard-two-client-service');
  await go(a.page, '/cinema/room', '.cinema-stage');
  await go(b.page, '/cinema/room', '.cinema-stage');
  await a.page.getByRole('button', { name: 'Ortak sinemayı başlat', exact: true }).click();
  await a.page.waitForTimeout(700);
  await a.page.getByRole('button', { name: 'Mavi saati oynat', exact: true }).click();
  await b.page.waitForFunction(() => document.querySelector('video')?.currentTime > 0, {
    timeout: 15000,
  });
  await a.page.getByRole('button', { name: 'Videoyu duraklat', exact: true }).click();
  await b.page.waitForFunction(() => document.querySelector('video')?.paused === true, {
    timeout: 15000,
  });
  await a.page.getByRole('slider', { name: 'Oynatma konumu', exact: true }).fill('14');
  await b.page.waitForFunction(
    () => Math.abs(document.querySelector('video').currentTime - 14) < 1.5,
    { timeout: 15000 },
  );
  await shot(a.page, 'cinema-alice-shared-service');
  await shot(b.page, 'cinema-bob-shared-service');
  console.log(
    JSON.stringify(
      {
        result: 'PASS',
        checks: [
          'two-client game creation/seat/start',
          'two cards rendered for each own hand',
          'fold and hand history',
          'cross-client poll vote',
          'cross-client whiteboard note',
          'cross-client cinema play pause seek',
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  assert.equal(errors.length, 0);
} finally {
  await closeFixture();
}
