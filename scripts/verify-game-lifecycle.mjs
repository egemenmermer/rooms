/** Full hands through public production APIs, real permissions and real wall clock. */
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const c = JSON.parse(await readFile('.local/production/test-accounts.json', 'utf8'));
await build({
  entryPoints: ['packages/games/src/batak.ts'],
  outfile: '.local/production/batak-public-rules.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { legalBatakCards } = await import(
  pathToFileURL(resolve('.local/production/batak-public-rules.mjs'))
);
const endpoint = c.base + '/rooms-activities/v1/rooms/' + c.textId + '/activity';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;
async function request(role, body) {
  await delay(Math.max(0, 600 - (Date.now() - lastRequest)));
  lastRequest = Date.now();
  const r = await fetch(endpoint + (body ? '/commands' : ''), {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + c[role].token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  return { status: r.status, data: await r.json() };
}
async function read(role = 'owner') {
  const r = await request(role);
  assert.equal(r.status, 200);
  return r.data;
}
async function send(role, command) {
  const commandId = randomUUID();
  for (let attempt = 0; attempt < 5; attempt++) {
    const s = await read(role);
    const r = await request(role, {
      protocolVersion: 1,
      commandId,
      expectedRevision: s.room.revision,
      command,
    });
    if (r.status === 409 && r.data.error === 'REVISION_CONFLICT') continue;
    assert.equal(r.status, 200, r.data.error);
    return r.data;
  }
  throw Error('Concurrent revision did not converge');
}
const result = { at: new Date().toISOString(), actualPublicPermissions: true, realClock: true };
try {
  await send('owner', { type: 'join' });
  await send('guest', { type: 'join' });
  const previous = await read();
  if (previous.room.primary) await send('owner', { type: 'end' });
  await send('owner', { type: 'game.create', game: 'holdem' });
  await send('guest', { type: 'game.sit', seat: 1 });
  await send('owner', { type: 'game.action', action: 'start' });
  const initial = (await read('guest')).room.game;
  const cards = initial.view.seats.find((x) => x.userId === c.guest.userId).cards;
  await send('guest', { type: 'game.leave' });
  const state = (await read()).room.game;
  if (state.turn === 0)
    await send('owner', {
      type: 'game.action',
      action: state.view.legalActions.includes('check') ? 'check' : 'call',
    });
  await delay(35000);
  const substitute = (await read()).room.game;
  assert(substitute.seats.find((x) => x.userId === c.guest.userId).bot);
  result.disconnectGraceBotSubstitution = true;
  // Returning UI explicitly joins the Activity before reclaiming the existing seat.
  await send('guest', { type: 'join' });
  await send('guest', { type: 'game.sit', seat: 1 });
  const returned = (await read('guest')).room.game;
  assert.deepEqual(returned.view.seats.find((x) => x.userId === c.guest.userId).cards, cards);
  assert.equal(returned.history.length, 0);
  result.returnDidNotRedeal = true;
  await send('guest', { type: 'end' });
  // A fresh host lease isolates explicit host departure from earlier disconnect expiry.
  await send('owner', { type: 'join' });
  await send('guest', { type: 'join' });
  await send('owner', {
    type: 'start',
    activity: 'cinema',
    title: 'Owned host transfer verification',
  });
  await send('owner', { type: 'leave' });
  const transferred = (await read('guest')).room;
  assert.equal(transferred.primary.hostUserId, c.guest.userId);
  result.automaticHostTransfer = true;
  await send('guest', { type: 'end' });
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  result.reason = error.message.slice(0, 200);
  process.exitCode = 1;
}
await writeFile(
  'infra/production/GAME_LIFECYCLE_RESULTS.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result));
