/** Fault injection affects only this owned Electron client, never the core/provider. */
import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const config = JSON.parse(await readFile('.local/production/test-accounts.json', 'utf8'));
const profile = await mkdtemp(join(tmpdir(), 'rooms-youtube-recovery-'));
const env = { ...process.env, ROOMS_PROFILE: `youtube-recovery-${Date.now().toString(36)}` };
delete env.ELECTRON_RUN_AS_NODE;
const result = {
  at: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  packaged: process.env.ROOMS_QA_PACKAGED === '1',
  actualProductionOrigin: true,
  faultScope:
    'Only this client aborts the official iframe_api request; no core or provider mutation.',
  rendererErrors: 0,
};
let app, page, nativeProfile;
const owned = [];
const command = async (payload) =>
  page.evaluate(
    async ({ roomId, payload, commandId }) => {
      const snapshot = await window.rooms.activity.snapshot(roomId);
      return window.rooms.activity.command(roomId, {
        protocolVersion: 1,
        commandId,
        expectedRevision: snapshot.room.revision,
        command: payload,
      });
    },
    { roomId: config.textId, payload, commandId: randomUUID() },
  );
try {
  app = await electron.launch(
    process.env.ROOMS_QA_PACKAGED === '1'
      ? {
          executablePath: resolve('release/mac-arm64/ROOMS.app/Contents/MacOS/ROOMS'),
          args: [`--user-data-dir=${profile}`],
          env,
        }
      : { args: ['.', `--user-data-dir=${profile}`], env },
  );
  nativeProfile = await app.evaluate(({ app }) => app.getPath('userData'));
  page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  page.on('pageerror', () => result.rendererErrors++);
  await page.waitForSelector('.hero');
  await page.evaluate(() => (location.hash = '/settings?tab=connections'));
  await page.waitForSelector('.social-connection form');
  await page.locator('.social-connection input[type=url]').fill(config.base);
  await page.locator('.social-connection input[type=email]').fill(config.owner.email);
  await page.locator('.social-connection input[type=password]').fill(config.owner.password);
  await page.locator('.social-connection button[type=submit]').click();
  await page.waitForSelector('.signed-in-profile');
  await page.evaluate(() => (location.hash = '/chat'));
  await page.waitForSelector('.chat-transcript');
  const route = 'https://www.youtube.com/iframe_api';
  await page.route(route, (request) => request.abort('internetdisconnected'));
  await page.evaluate(() => (location.hash = '/youtube'));
  await page.waitForSelector('.youtube-page');
  const add = async (videoId, label) => {
    await page.locator('.shared-queue input').first().fill(videoId);
    await page.locator('.shared-queue input').nth(1).fill(label);
    await page.getByRole('button', { name: 'Ortak sıraya ekle', exact: true }).click();
    await page.getByText(label, { exact: true }).waitFor();
    const snapshot = await page.evaluate(
      (roomId) => window.rooms.activity.snapshot(roomId),
      config.textId,
    );
    const item = snapshot.room.queue.find((item) => item.media.title === label);
    assert(item);
    owned.push(item.id);
    await page
      .locator('.shared-queue-item')
      .filter({ hasText: label })
      .locator('button')
      .first()
      .click();
    return item.id;
  };
  const itemId = await add('M7lc1UVf-VE', `QA recovery ${Date.now().toString(36)}`);
  const frame = page.locator('.youtube-stage iframe');
  await frame.waitFor();
  const initialUrl = await frame.getAttribute('src');
  result.stage = 'bounded-load-timeout';
  await page.getByRole('alert').filter({ hasText: '25 saniye' }).waitFor({ timeout: 35000 });
  assert(await page.getByRole('button', { name: 'Herkes için oynat', exact: true }).isDisabled());
  assert(await page.getByRole('slider', { name: 'Ortak oynatma konumu' }).isDisabled());
  result.timeoutDisablesControls = true;
  assert.equal(
    await page.locator('.youtube-external').getAttribute('href'),
    'https://www.youtube.com/watch?v=M7lc1UVf-VE',
  );
  result.officialExternalFallback = true;
  await page.screenshot({ path: 'docs/screenshots/production/youtube-timeout.png' });
  result.stage = 'retry-and-real-playback';
  await page.unroute(route);
  await page.getByRole('button', { name: 'Oynatıcıyı yeniden aç', exact: true }).click();
  await page.waitForFunction(
    (previous) => document.querySelector('.youtube-stage iframe')?.src !== previous,
    initialUrl,
  );
  await page.waitForFunction(
    () => !document.querySelector('.shared-player-controls button').disabled,
    null,
    { timeout: 35000 },
  );
  assert.equal(await page.locator('.youtube-player-error').count(), 0);
  const snapshot = await page.evaluate(
    (roomId) => window.rooms.activity.snapshot(roomId),
    config.textId,
  );
  assert.equal(snapshot.room.timeline.itemId, itemId);
  result.retryPreservesSelectedItem = true;
  result.retryUsesFreshNonce = true;
  const official = page
    .frames()
    .find((frame) => frame.url().startsWith('https://www.youtube.com/embed/'));
  assert(official);
  const play = official.getByRole('button', { name: /^Play/ }).first();
  if (await play.isVisible()) await play.click();
  const sharedPlay = page.getByRole('button', { name: 'Herkes için oynat', exact: true });
  if (await sharedPlay.isVisible()) await sharedPlay.click();
  const player = () =>
    page.frames().find((frame) => frame.url().includes('/rooms-activities/player/youtube'));
  await player().waitForFunction(
    () => player.getPlayerState() === 1 && player.getCurrentTime() > 1,
    null,
    { timeout: 30000 },
  );
  result.actualOfficialPlaybackAfterRetry = true;
  await page.getByRole('button', { name: 'Herkes için duraklat', exact: true }).click();
  result.stage = 'actual-unavailable-video';
  await add('00000000000', `QA unavailable ${Date.now().toString(36)}`);
  await page.locator('.youtube-player-error').waitFor({ timeout: 35000 });
  const message = await page.locator('.youtube-player-error p').innerText();
  assert(/kod (100|101|150)/.test(message));
  result.actualProviderErrorCode = Number(message.match(/kod (\d+)/)[1]);
  assert(await page.getByRole('button', { name: 'Herkes için oynat', exact: true }).isDisabled());
  result.unavailableVideoDisablesControls = true;
  await page.screenshot({ path: 'docs/screenshots/production/youtube-unavailable.png' });
  assert.equal(result.rendererErrors, 0);
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  result.failure = error.message.slice(0, 240);
  if (page) {
    result.uiErrors = await page
      .locator('[role=alert]')
      .allTextContents()
      .catch(() => []);
    const frame = page
      .frames()
      .find((frame) => frame.url().includes('/rooms-activities/player/youtube'));
    result.playerState = await frame
      ?.evaluate(() =>
        typeof player === 'undefined'
          ? null
          : { state: player.getPlayerState(), position: player.getCurrentTime() },
      )
      .catch(() => null);
    await page
      .screenshot({ path: '.local/production/youtube-recovery-failure.png' })
      .catch(() => {});
  }
} finally {
  for (const itemId of owned) await command({ type: 'queue.remove', itemId }).catch(() => {});
  if (page) await page.evaluate(() => window.rooms.social.logout()).catch(() => {});
  if (app) await app.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
  if (nativeProfile) await rm(nativeProfile, { recursive: true, force: true });
  await writeFile(
    'infra/production/YOUTUBE_RECOVERY_RESULTS.json',
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(JSON.stringify(result));
}
if (result.status !== 'PASS') process.exitCode = 1;
