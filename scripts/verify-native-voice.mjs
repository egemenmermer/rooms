import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const config = JSON.parse(await readFile('.local/production/test-accounts.json', 'utf8'));
const clients = [],
  profiles = [],
  errors = [],
  launches = [];
const suffix = Date.now().toString(36),
  content = `Owned native production check ${suffix}`;
let delivered;
const result = {
  at: new Date().toISOString(),
  actualDesktopClients: 2,
  platform: process.platform,
  arch: process.arch,
  syntheticMedia: false,
  packaged: false,
  permissionScope: 'development Electron identity',
  voiceAcrossNavigation: false,
  nativeMicrophonePublished: false,
  remoteAudioPackets: false,
  physicalTwoComputerVerified: false,
};
try {
  for (const role of ['owner', 'guest']) {
    const profile = await mkdtemp(join(tmpdir(), 'rooms-production-ui-'));
    profiles.push(profile);
    const env = { ...process.env, ROOMS_PROFILE: `production-${role}-${suffix}` };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = { args: ['.', `--user-data-dir=${profile}`], env };
    launches.push(launch);
    const app = await electron.launch(launch);
    clients.push(app);
    profiles.push(await app.evaluate(({ app }) => app.getPath('userData')));
    const page = await app.firstWindow();
    page.on('pageerror', () => errors.push('renderer-error'));
    await page.waitForSelector('.hero');
    await page.evaluate(() => (location.hash = '/settings?tab=connections'));
    await page.waitForSelector('.social-connection form');
    await page.locator('.social-connection input[type=url]').fill(config.base);
    await page.locator('.social-connection input[type=email]').fill(config[role].email);
    await page.locator('.social-connection input[type=password]').fill(config[role].password);
    await page.locator('.social-connection button[type=submit]').click();
    await page.waitForSelector('.signed-in-profile', { timeout: 30000 });
    assert.equal(await page.locator('.social-connection .error-pane').count(), 0);
    await page.evaluate(() => (location.hash = '/chat'));
    await page.waitForSelector('.chat-transcript');
  }
  const owner = await clients[0].firstWindow(),
    guest = await clients[1].firstWindow();
  for (const page of [owner, guest]) {
    page.setDefaultTimeout(20000);
    await page.evaluate(() => {
      const Original = window.RTCPeerConnection;
      window.qaPeers = [];
      window.RTCPeerConnection = class extends Original {
        constructor(...args) {
          super(...args);
          window.qaPeers.push(this);
        }
      };
    });
    await page.evaluate(() => (location.hash = '/voice'));
    await page.waitForSelector('.real-voice-channels');
    const channels = await page.evaluate(
      (space) => window.rooms.social.channels(space),
      config.spaceId,
    );
    const room = channels.find((ch) => ch.id === config.voiceId);
    assert(room);
    await page
      .locator('.real-voice-channels')
      .getByRole('button', { name: room.name, exact: true })
      .click();
  }
  await guest
    .locator('.real-voice-dock')
    .getByText(/2 kişi odada/)
    .waitFor({ timeout: 30000 });
  for (const route of ['/home', '/chat', '/cinema', '/games', '/voice']) {
    await owner.evaluate((route) => (location.hash = route), route);
    await owner
      .locator('.real-voice-dock')
      .getByText(/2 kişi odada/)
      .waitFor();
  }
  result.voiceAcrossNavigation = true;
  await owner.getByRole('button', { name: 'Mikrofonu aç', exact: true }).click();
  await owner
    .getByRole('button', { name: 'Mikrofonu kapat', exact: true })
    .waitFor({ timeout: 20000 });
  result.nativeMicrophonePublished = true;
  await guest.waitForFunction(
    async () => {
      let packets = 0;
      for (const pc of window.qaPeers ?? []) {
        const stats = await pc.getStats();
        stats.forEach((s) => {
          if (s.type === 'inbound-rtp' && s.kind === 'audio') packets += s.packetsReceived ?? 0;
        });
      }
      return packets > 10;
    },
    null,
    { timeout: 20000 },
  );
  result.remoteAudioPackets = true;
  await owner.getByRole('button', { name: 'Mikrofonu kapat', exact: true }).click();
  result.permissions = await owner.evaluate(() => window.rooms.media.captureStatus());
  const videoPackets = () =>
    guest.evaluate(async () => {
      let packets = 0;
      for (const pc of window.qaPeers ?? []) {
        const stats = await pc.getStats();
        stats.forEach((s) => {
          if (s.type === 'inbound-rtp' && s.kind === 'video') packets += s.packetsReceived ?? 0;
        });
      }
      return packets;
    });
  result.nativeCameraPublished = false;
  result.nativeWindowPickerVerified = false;
  if (result.permissions.camera === 'granted') {
    const before = await videoPackets();
    await owner.getByRole('button', { name: 'Kamerayı aç', exact: true }).click();
    await owner.getByRole('button', { name: 'Kamerayı kapat', exact: true }).waitFor();
    await guest.waitForFunction(
      async (prior) => {
        let packets = 0;
        for (const pc of window.qaPeers ?? []) {
          const stats = await pc.getStats();
          stats.forEach((s) => {
            if (s.type === 'inbound-rtp' && s.kind === 'video') packets += s.packetsReceived ?? 0;
          });
        }
        return packets > prior + 10;
      },
      before,
      { timeout: 20000 },
    );
    result.nativeCameraPublished = true;
    await owner.getByRole('button', { name: 'Kamerayı kapat', exact: true }).click();
  }
  if (result.permissions.screen === 'granted') {
    await owner.getByRole('button', { name: 'Ekran veya pencere paylaş', exact: true }).click();
    const ownWindow = owner.locator('.capture-grid button').filter({ hasText: /ROOMS/i }).first();
    await ownWindow.waitFor({ timeout: 15000 });
    await ownWindow.click();
    const before = await videoPackets();
    await owner.getByRole('button', { name: 'Seçili kaynağı paylaş', exact: true }).click();
    await owner.getByRole('button', { name: 'Paylaşımı durdur', exact: true }).waitFor();
    await guest.waitForFunction(
      async (prior) => {
        let packets = 0;
        for (const pc of window.qaPeers ?? []) {
          const stats = await pc.getStats();
          stats.forEach((s) => {
            if (s.type === 'inbound-rtp' && s.kind === 'video') packets += s.packetsReceived ?? 0;
          });
        }
        return packets > prior + 10;
      },
      before,
      { timeout: 20000 },
    );
    result.nativeWindowPickerVerified = true;
    await owner.getByRole('button', { name: 'Paylaşımı durdur', exact: true }).click();
  }
  result.rendererErrors = errors.length;
  assert.equal(errors.length, 0);
} catch (error) {
  result.failure = error.message.slice(0, 240);
} finally {
  await writeFile(
    'infra/production/NATIVE_VOICE_RESULTS.json',
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(JSON.stringify(result));
  for (const app of clients) {
    await (
      await app.firstWindow().catch(() => null)
    )
      ?.evaluate(() => window.rooms.social.logout())
      .catch(() => {});
    await app.close().catch(() => {});
  }
  for (const profile of profiles) await rm(profile, { recursive: true, force: true });
}
if (result.failure) process.exitCode = 1;
