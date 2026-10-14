import { openFixtureClient, closeFixture } from './electron-activity-fixture.mjs';
import assert from 'node:assert/strict';
const { app, page, fixture } = await openFixtureClient('qa-alice');
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await app.evaluate(({ ipcMain }, f) => {
    const replace = (name, handler) => {
      ipcMain.removeHandler(name);
      ipcMain.handle(name, handler);
    };
    const tasks = [];
    globalThis.reminderQA = { calls: [], memoryWrites: 0, modelSubmits: 0, enabled: true };
    replace('rooms:social-messages', () => [
      {
        id: 'qa-source-message',
        channelId: 'qa-room',
        author: f.user,
        content: 'QA · Cuma günü film seçimini konuşalım.',
        timestamp: new Date().toISOString(),
        editedTimestamp: null,
      },
    ]);
    replace('rooms:social-read-states', () => []);
    replace('rooms:social-friends', () => []);
    replace('rooms:social-ack', () => {});
    replace('rooms:agent-status', () => ({
      configured: true,
      connected: true,
      yolo: false,
      executionHost: 'separate-server',
      capabilities: globalThis.reminderQA.enabled ? ['stoat-reminders'] : [],
    }));
    replace('rooms:agent-connections', () => []);
    replace('rooms:agent-memory', () => []);
    replace('rooms:agent-tasks', () => tasks);
    replace('rooms:agent-remind', (_e, input) => {
      globalThis.reminderQA.calls.push(input);
      const task = {
        id: 'qa-reminder-task',
        kind: 'reminder',
        roomId: input.roomId,
        ownerId: f.user.id,
        prompt: input.text,
        modelConnectionId: '',
        state: 'scheduled',
        progress: [],
        result: null,
        artifacts: [],
        createdAt: new Date().toISOString(),
        runAt: input.runAt,
        error: null,
      };
      tasks.push(task);
      return task;
    });
    replace('rooms:agent-cancel', (_e, id) => {
      tasks.find((t) => t.id === id).state = 'cancelled';
      return tasks.find((t) => t.id === id);
    });
    replace('rooms:agent-save-memory', () => {
      globalThis.reminderQA.memoryWrites++;
      throw Error('Unexpected memory write');
    });
    replace('rooms:agent-submit', () => {
      globalThis.reminderQA.modelSubmits++;
      throw Error('Unexpected model task');
    });
  }, fixture);
  await page.reload();
  await page.waitForSelector('.hero');
  await page.evaluate(() => {
    const label = document.createElement('div');
    label.textContent = 'QA FIXTURE · Simulated Agent bridge · No live bot delivery';
    Object.assign(label.style, {
      position: 'fixed',
      bottom: '0',
      left: '0',
      right: '0',
      background: '#e7b96f',
      color: '#111',
      font: '11px system-ui',
      textAlign: 'center',
      zIndex: '999999',
      padding: '4px',
    });
    document.body.append(label);
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  await page.evaluate(() => (location.hash = '/chat'));
  await page.getByText('QA · Cuma günü film seçimini konuşalım.', { exact: true }).hover();
  await page.getByRole('button', { name: 'Bu mesajı sonra hatırlat', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Hatırlatma notu', exact: true })
    .fill('QA · Film listesini birlikte seçelim.');
  const local = new Date(Date.now() + 60 * 60000)
    .toLocaleString('sv-SE')
    .replace(' ', 'T')
    .slice(0, 16);
  await page.getByLabel('Hatırlatma zamanı', { exact: true }).fill(local);
  await page.screenshot({ path: 'docs/screenshots/tr/reminder-dialog-fixture.png' });
  await page.getByRole('button', { name: 'Hatırlatmayı zamanla', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const observed = await app.evaluate(() => globalThis.reminderQA);
  assert.equal(observed.calls.length, 1);
  assert.deepEqual(observed.calls[0], {
    roomId: 'qa-room',
    channelId: 'qa-room',
    sourceMessageId: 'qa-source-message',
    text: 'QA · Film listesini birlikte seçelim.',
    runAt: new Date(local).toISOString(),
  });
  assert.equal(observed.memoryWrites, 0);
  assert.equal(observed.modelSubmits, 0);
  await page.evaluate(() => (location.hash = '/agent'));
  await page.getByRole('button', { name: /Hatırlatma · Zamanlandı/ }).waitFor();
  await page.getByRole('button', { name: 'Hatırlatmayı iptal et', exact: true }).click();
  await page.getByRole('button', { name: /Hatırlatma · İptal edildi/ }).waitFor();
  await page.screenshot({ path: 'docs/screenshots/tr/reminder-cancelled-fixture.png' });
  await app.evaluate(() => {
    globalThis.reminderQA.enabled = false;
  });
  await page.evaluate(() => (location.hash = '/chat'));
  await page.getByText('QA · Cuma günü film seçimini konuşalım.', { exact: true }).hover();
  await page.getByRole('button', { name: 'Bu mesajı sonra hatırlat', exact: true }).click();
  await page
    .getByText(
      'Kaynak sohbete hatırlatma göndermek için sunucuda Stoat botu ve oda eşlemesi yapılandırılmalı.',
      { exact: false },
    )
    .waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Hatırlatmayı zamanla', exact: true }).isDisabled(),
    true,
  );
  await page.screenshot({ path: 'docs/screenshots/tr/reminder-unavailable-fixture.png' });
  assert.equal(errors.length, 0);
  console.log(
    'PASS reminder source binding, exact note/time, no model, no memory, task kind, cancel, unavailable reason; fixture bridge only; no bot delivery claim.',
  );
} finally {
  await closeFixture();
}
