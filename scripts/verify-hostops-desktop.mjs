// Isolated, explicitly labeled UI fixture. Never connects to a real account or host.
import { _electron as electron } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('.local/qa/hostops', { recursive: true });
const env = { ...process.env, ROOMS_PROFILE: `qa-hostops-${Date.now()}` };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const page = await app.firstWindow();
page.on('pageerror', (e) => console.error('QA renderer:', e.message));
try {
  await app.evaluate(({ ipcMain }) => {
    const social = (name, fn) => {
      ipcMain.removeHandler('rooms:social-' + name);
      ipcMain.handle('rooms:social-' + name, fn);
    };
    social('session', () => ({
      instanceUrl: 'https://qa-fixture.invalid',
      user: { id: 'qa-alice', username: 'QA FIXTURE', displayName: 'QA FIXTURE', avatar: null },
      status: 'connected',
      remembered: false,
    }));
    social('spaces', () => [
      { id: 'qa-space', name: 'QA FIXTURE', ownerId: 'qa-alice', icon: null },
    ]);
    social('channels', () => []);
    social('messages', () => []);
    social('dms', () => []);
    const host = {
      id: 'qa-host',
      label: 'QA FIXTURE — Server',
      physicalHostId: 'qa-physical',
      mode: 'shared',
      owner: true,
      permissions: ['monitor', 'terminal', 'agent'],
      terminalAvailable: false,
      agentAvailable: false,
      reason: null,
    };
    const replace = (name, fn) => {
      ipcMain.removeHandler('rooms:hostops-' + name);
      ipcMain.handle('rooms:hostops-' + name, fn);
    };
    replace('hosts', () => ({ hosts: [host] }).hosts);
    replace('snapshot', () => ({
      host,
      sample: {
        hostId: host.id,
        at: Date.now(),
        cpuPercent: 22,
        cores: 2,
        perCorePercent: [20, 24],
        load: [0.5, 0.6, 0.7],
        memory: {
          total: 4 * 1024 ** 3,
          available: 2 * 1024 ** 3,
          swapTotal: 1024 ** 3,
          swapUsed: 0,
        },
        disk: { total: 40 * 1024 ** 3, free: 20 * 1024 ** 3, readBps: null, writeBps: null },
        network: { receiveBps: 12000, sendBps: 4000, receivedBytes: 12000, sentBytes: 4000 },
        temperatureC: null,
        services: [{ name: 'QA API', state: 'healthy', restarts: 0 }],
        lastBackupAt: null,
        media: {
          rooms: 1,
          participants: 2,
          streams: 1,
          bitrate: null,
          rttMs: null,
          lossPercent: null,
          jitterMs: null,
        },
        workloads: [],
      },
      stale: false,
      thresholds: { cpuPercent: 85, cpuSeconds: 60, diskFreePercent: 15, backupHours: 24 },
      alerts: [],
    }));
    replace('history', () => []);
    replace('terminals', () => []);
    replace('operators', () => []);
  });
  await page.reload();
  await page.waitForFunction(() => document.body.innerText.includes('Mesajlar'));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    location.hash = '/settings?tab=hostops';
  });
  await page.locator('.ops-surface').waitFor();
  await page.getByText('Desteklenmiyor', { exact: true }).waitFor();
  for (const [width, height] of [
    [1440, 900],
    [900, 700],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size),
      [width, height],
    );
    await page.waitForTimeout(150);
    await page.screenshot({ path: `.local/qa/hostops/monitor-${width}.png` });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 2,
    );
    if (overflow) throw Error(`Horizontal overflow at ${width}`);
  }
  await page.getByText('Operatörler ve uyarı eşikleri', { exact: false }).click();
  await page.getByRole('button', { name: 'Operatörleri yükle' }).click();
  await page.getByLabel('Operatör kullanıcı kimliği').fill('qa-operator');
  await page.getByLabel('CPU eşiği (%)').focus();
  await page.keyboard.press('Tab');
  console.log(
    'Labeled HostOps Electron fixture: 1440×900 / 900×700, no horizontal overflow, owner details and keyboard passed. No live host/terminal acceptance claimed.',
  );
} catch (error) {
  console.error('QA URL', page.url());
  console.error((await page.locator('body').innerText()).slice(0, 2000));
  await page.screenshot({ path: '.local/qa/hostops/failure.png' });
  throw error;
} finally {
  await app.close();
}
