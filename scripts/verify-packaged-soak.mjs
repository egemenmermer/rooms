/** Bounded packaged M1 local-playback soak; never claims live transport/provider acceptance. */
import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const duration = Number(process.env.ROOMS_QA_SOAK_SECONDS ?? 600);
assert(Number.isInteger(duration) && duration >= 120 && duration <= 3600);
const profile = await mkdtemp(join(tmpdir(), 'rooms-packaged-soak-'));
const env = { ...process.env, ROOMS_PROFILE: `soak-${Date.now().toString(36)}` };
delete env.ELECTRON_RUN_AS_NODE;
const result = {
  at: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  requestedSeconds: duration,
  scope:
    'One actual packaged client, explicit bundled local demo video, navigation cycles. Not voice/provider/network/full-evening certification.',
  host: execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string', 'hw.memsize'], {
    encoding: 'utf8',
  }).trim(),
  samples: [],
  rendererErrors: 0,
  rendererProcessGone: 0,
};
let app, page, nativeProfile;
const output = 'infra/production/PACKAGED_SOAK_RESULTS.json';
try {
  app = await electron.launch({
    executablePath: resolve('release/mac-arm64/ROOMS.app/Contents/MacOS/ROOMS'),
    args: [`--user-data-dir=${profile}`],
    env,
  });
  nativeProfile = await app.evaluate(({ app }) => app.getPath('userData'));
  result.appVersion = await app.evaluate(({ app }) => app.getVersion());
  page = await app.firstWindow();
  page.on('pageerror', () => result.rendererErrors++);
  page.on('crash', () => result.rendererProcessGone++);
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(1280, 800);
    window.focus();
  });
  await page.waitForSelector('.hero');
  const startVideo = async () => {
    await page.evaluate(() => (location.hash = '/cinema'));
    await page.waitForSelector('.cinema-stage');
    await page.getByRole('button', { name: 'Mavi saati oynat', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0);
    await page.locator('.cinema-stage video').evaluate((video) => {
      video.loop = true;
      video.muted = true;
    });
  };
  await startVideo();
  const start = Date.now();
  result.navigationCycles = 0;
  while (Date.now() - start < duration * 1000) {
    await page.waitForTimeout(10000);
    const sample = {
      seconds: Math.round((Date.now() - start) / 1000),
      processes: await app.evaluate(({ app }) =>
        app
          .getAppMetrics()
          .map((p) => ({
            type: p.type,
            workingSetKB: p.memory.workingSetSize,
            cpuPercent: p.cpu.percentCPUUsage,
          })),
      ),
      video: await page.locator('.cinema-stage video').evaluate((video) => {
        const q = video.getVideoPlaybackQuality();
        return {
          time: video.currentTime,
          paused: video.paused,
          ready: video.readyState,
          dropped: q.droppedVideoFrames,
          total: q.totalVideoFrames,
        };
      }),
    };
    assert(!sample.video.paused && sample.video.ready >= 2, 'Local playback must remain active');
    assert(
      sample.processes.some((p) => p.type === 'Tab'),
      'Renderer process must remain alive',
    );
    result.samples.push(sample);
    if (result.samples.length % 6 === 0) {
      await page.evaluate(() => (location.hash = '/home'));
      await page.waitForSelector('.hero');
      await page.evaluate(() => (location.hash = '/settings?tab=appearance'));
      await page.waitForSelector('.settings-page');
      await startVideo();
      result.navigationCycles++;
    }
    result.elapsedSeconds = Math.round((Date.now() - start) / 1000);
    await writeFile(output, JSON.stringify({ ...result, status: 'RUNNING' }, null, 2) + '\n');
    if (result.samples.length % 6 === 0)
      console.log(
        `Actual packaged soak: ${result.elapsedSeconds}/${duration} seconds, ${result.navigationCycles} navigation cycles.`,
      );
  }
  const totals = result.samples.map(
    (s) => s.processes.reduce((n, p) => n + p.workingSetKB, 0) / 1024,
  );
  result.maxWorkingSetMiB = Math.max(...totals);
  result.firstWorkingSetMiB = totals[0];
  result.lastWorkingSetMiB = totals.at(-1);
  result.endMinusStartMiB = result.lastWorkingSetMiB - result.firstWorkingSetMiB;
  result.cpuPercentSamples = result.samples.map((s) =>
    s.processes.reduce((n, p) => n + p.cpuPercent, 0),
  );
  assert.equal(result.rendererErrors, 0);
  assert.equal(result.rendererProcessGone, 0);
  await page.screenshot({ path: 'docs/screenshots/production/packaged-soak-cinema.png' });
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  result.failure = error.message.slice(0, 300);
} finally {
  if (app) await app.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
  if (nativeProfile) await rm(nativeProfile, { recursive: true, force: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify({
      status: result.status,
      elapsedSeconds: result.elapsedSeconds,
      appVersion: result.appVersion,
      maxWorkingSetMiB: result.maxWorkingSetMiB,
      endMinusStartMiB: result.endMinusStartMiB,
      failure: result.failure,
    }),
  );
}
if (result.status !== 'PASS') process.exitCode = 1;
