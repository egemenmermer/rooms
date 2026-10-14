import { _electron as electron } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const env = { ...process.env, ROOMS_PROFILE: `qa-performance-${Date.now()}` };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const metrics = () =>
  app.evaluate(({ app }) =>
    app
      .getAppMetrics()
      .map((p) => ({
        type: p.type,
        workingSetKB: p.memory.workingSetSize,
        cpuPercent: p.cpu.percentCPUUsage,
      })),
  );
try {
  const page = await app.firstWindow();
  await page.waitForSelector('.hero');
  await page.evaluate(() => (location.hash = '/cinema'));
  await page.waitForSelector('.cinema-stage');
  await page.getByRole('button', { name: 'Mavi saati oynat', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 1);
  await page.locator('video').evaluate((video) => {
    video.loop = true;
    video.muted = true;
  });
  await metrics();
  const samples = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(10000);
    samples.push({
      seconds: (i + 1) * 10,
      processes: await metrics(),
      video: await page
        .locator('video')
        .evaluate((v) => ({
          time: v.currentTime,
          dropped: v.getVideoPlaybackQuality().droppedVideoFrames,
          total: v.getVideoPlaybackQuality().totalVideoFrames,
          ready: v.readyState,
        })),
    });
    console.log(`Playback performance sample ${(i + 1) * 10}/120 seconds.`);
  }
  await page.evaluate(() => (location.hash = '/home'));
  await page.waitForSelector('.hero');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus());
  await page.waitForTimeout(10000);
  const idle = await metrics();
  const frames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const timings = [];
        let previous = performance.now();
        const stop = previous + 5000;
        function frame(now) {
          timings.push(now - previous);
          previous = now;
          if (now < stop) requestAnimationFrame(frame);
          else
            resolve({
              count: timings.length,
              over33ms: timings.filter((t) => t > 33).length,
              maxMS: Math.max(...timings),
            });
        }
        requestAnimationFrame(frame);
      }),
  );
  const result = {
    host: execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string', 'hw.memsize'], {
      encoding: 'utf8',
    }).trim(),
    kind: '120-second local-demo playback plus 10-second idle sample; not a transport/provider or long-duration soak',
    samples,
    idle,
    homeFrames: frames,
  };
  await writeFile('docs/PERFORMANCE_CURRENT.json', JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      maxWorkingSetMiB: Math.max(
        ...samples.map((s) => s.processes.reduce((sum, p) => sum + p.workingSetKB, 0) / 1024),
      ),
      idleCPU: idle.reduce((sum, p) => sum + p.cpuPercent, 0),
      homeFrames: frames,
    }),
  );
} finally {
  await app.close();
}
