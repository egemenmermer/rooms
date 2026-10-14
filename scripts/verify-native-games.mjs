/** Actual packaged UI on a uniquely owned disposable Stoat text channel. */
import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
const config = JSON.parse(await readFile('.local/production/test-accounts.json', 'utf8'));
const staging = process.env.ROOMS_QA_GAME_STAGING === '1';
const holdemFull = process.env.ROOMS_QA_HOLDEM_FULL === '1';
const batakFull = process.env.ROOMS_QA_BATAK_FULL === '1';
const blackjackAdvanced = process.env.ROOMS_QA_BLACKJACK_ADVANCED === '1';
assert(
  Number(staging) + Number(blackjackAdvanced) + Number(batakFull) + Number(holdemFull) <= 1,
  'Choose only one optional acceptance mode',
);
const output = holdemFull
  ? 'infra/production/NATIVE_HOLDEM_FULL_RESULTS.json'
  : batakFull
    ? 'infra/production/NATIVE_BATAK_FULL_RESULTS.json'
    : blackjackAdvanced
      ? 'infra/production/NATIVE_BLACKJACK_ADVANCED_RESULTS.json'
      : staging
        ? 'infra/production/NATIVE_GAME_STAGING_RESULTS.json'
        : 'infra/production/NATIVE_GAMES_RESULTS.json';
const suffix = Date.now().toString(36),
  name = `qa-games-${suffix}`;
const profile = await mkdtemp(join(tmpdir(), 'rooms-native-games-'));
let app, page, nativeProfile, channelId, ownedPrimary;
const result = {
  at: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  packaged: true,
  actualPublicAuthorization: true,
  socialFixtures: false,
  scope: holdemFull
    ? 'Actual packaged native Holdem call/check to showdown and all-in settlement, natural public production cards, one human QA seat and labelled bot. Not multiple physical friends or every poker rule.'
    : batakFull
      ? 'Actual packaged native complete Batak hands for four variants on natural public production deals; one human QA client plus clearly labelled bots, not four physical friends.'
      : blackjackAdvanced
        ? 'Actual packaged native Blackjack double/split/hit and hand settlement on natural public production deals; not all rules, multi-player or physical friend acceptance.'
        : 'Native create/bots/start/action/close controls; not every legal rule or complete hand.',
  cases: [],
  rendererErrors: 0,
};
const api = async (path, method = 'GET', body) => {
  const response = await fetch(config.base + '/api' + path, {
    method,
    headers: { 'x-session-token': config.owner.token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  assert(response.ok, `Owned QA ${method} failed: ${response.status}`);
  return response.status === 204 ? null : response.json();
};
let lastReadAt = 0;
const snapshot = async () => {
  // Observation must not flood the shared production rate limiter. No write retry.
  const pause = Math.max(0, 1500 - (Date.now() - lastReadAt));
  if (pause) await page.waitForTimeout(pause);
  lastReadAt = Date.now();
  return page.evaluate((id) => window.rooms.activity.snapshot(id), channelId);
};
const current = async () => {
  const state = (await snapshot()).room;
  assert(state.primary?.startedAt === ownedPrimary, 'Do not touch an unrelated Activity');
  return state.game;
};
const close = async () => {
  await current();
  await page.getByRole('button', { name: 'Masayı kapat', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Masayı kapat', exact: true }).click();
  await page.waitForSelector('.game-catalog');
  assert.equal((await snapshot()).room.primary, null);
  ownedPrimary = null;
};
try {
  await build({
    entryPoints: ['packages/games/src/batak.ts'],
    outfile: '.local/production/batak-ui-rules.mjs',
    bundle: true,
    platform: 'node',
    format: 'esm',
  });
  const { legalBatakCards } = await import(
    pathToFileURL(resolve('.local/production/batak-ui-rules.mjs'))
  );
  // Routes/schema are verified against pinned upstream v0.15.5 servers/channel_create.rs and v0/channels.rs.
  const channel = await api(`/servers/${config.spaceId}/channels`, 'POST', {
    type: 'Text',
    name,
    description: 'Owned disposable ROOMS native game acceptance. No fixtures.',
  });
  channelId = channel._id;
  assert(channelId);
  const env = { ...process.env, ROOMS_PROFILE: `native-games-${suffix}` };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: resolve('release/mac-arm64/ROOMS.app/Contents/MacOS/ROOMS'),
    args: [`--user-data-dir=${profile}`],
    env,
  });
  nativeProfile = await app.evaluate(({ app }) => app.getPath('userData'));
  result.appVersion = await app.evaluate(({ app }) => app.getVersion());
  page = await app.firstWindow();
  page.setDefaultTimeout(25000);
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
  await page.locator('.channels').getByRole('button', { name, exact: true }).click();
  await page.waitForSelector('.chat-transcript');
  assert.equal(
    (await snapshot()).room.primary,
    null,
    'Owned channel must start without an Activity',
  );
  await page.evaluate(() => (location.hash = '/games'));
  await page.waitForSelector('.game-catalog');
  const cases = [
    { kind: 'holdem' },
    { kind: 'blackjack' },
    ...['ihaleli', 'esli', 'koz-maca', 'gommeli'].map((variant) => ({ kind: 'batak', variant })),
    ...[
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ].map(([folding, teams]) => ({ kind: '101', folding, teams })),
  ];
  const selectedCases = holdemFull
    ? [{ kind: 'holdem' }]
    : batakFull
      ? cases.filter((spec) => spec.kind === 'batak')
      : blackjackAdvanced
        ? [{ kind: 'blackjack' }]
        : staging
          ? [
              { kind: '101', folding: false, teams: false },
              { kind: '101', folding: false, teams: false },
            ]
          : cases.filter(
              (spec) =>
                !process.env.ROOMS_QA_GAME_FILTER || spec.kind === process.env.ROOMS_QA_GAME_FILTER,
            );
  for (const [caseIndex, spec] of selectedCases.entries()) {
    const check = { ...spec, controls: [] };
    result.cases.push(check);
    result.stage = `${spec.kind}:${spec.variant ?? `${spec.folding ?? ''}:${spec.teams ?? ''}`}`;
    await page
      .locator(`.game-tile`)
      .filter({ has: page.locator(`.game-symbol`) })
      .filter({
        hasText:
          spec.kind === 'holdem'
            ? 'Texas Hold’em'
            : spec.kind === 'blackjack'
              ? 'Blackjack'
              : spec.kind === 'batak'
                ? 'Batak'
                : '101 Okey',
      })
      .click();
    if (spec.variant) await page.getByRole('dialog').locator('select').selectOption(spec.variant);
    if (spec.kind === '101') {
      await page
        .getByRole('dialog')
        .getByLabel('Katlamalı', { exact: true })
        .setChecked(spec.folding);
      await page.getByRole('dialog').getByLabel('Eşli', { exact: true }).setChecked(spec.teams);
    }
    await page.getByRole('button', { name: 'Masayı kur', exact: true }).click();
    await page.waitForSelector('.game-table');
    ownedPrimary = (await snapshot()).room.primary.startedAt;
    let game = await current();
    assert.equal(game.kind, spec.kind);
    check.controls.push('native-create');
    const bots =
      spec.kind === 'holdem'
        ? 1
        : spec.kind === 'blackjack'
          ? 0
          : spec.variant === 'gommeli'
            ? 2
            : 3;
    for (let i = 0; i < bots; i++) {
      await page.getByRole('button', { name: 'Bot ekle', exact: true }).first().click();
      await page.waitForFunction(
        (n) => document.querySelectorAll('.table-seat .avatar').length >= n,
        i + 2,
      );
    }
    check.labelledBotCount = bots;
    if (spec.kind === 'blackjack') {
      await page.locator('.table-amount input').fill('40');
      await page.getByRole('button', { name: 'Bahsi belirle', exact: true }).click();
      check.controls.push('set-virtual-bet');
    }
    await page.getByRole('button', { name: 'Yeni eli başlat', exact: true }).click();
    await page.waitForSelector('.your-hand .playing-card, .your-hand .okey-tile');
    check.controls.push('start-hand');
    game = await current();
    if (spec.kind === 'holdem') {
      if (holdemFull) {
        check.rounds = [];
        const totals = (g) => g.view.seats.reduce((sum, p) => sum + p.chips, 0);
        const startingTotal =
          totals(game) + game.view.seats.reduce((sum, p) => sum + p.contribution, 0);
        assert.equal(startingTotal, 2000);
        for (let round = 0; round < 6; round++) {
          const record = {
            kind: round === 0 ? 'call-check-showdown' : 'all-in-showdown',
            actions: [],
            stages: [],
          };
          check.rounds.push(record);
          const deadline = Date.now() + 90000;
          let raised = false;
          while (Date.now() < deadline) {
            game = await current();
            if (!record.stages.includes(game.view.stage)) record.stages.push(game.view.stage);
            if (game.status === 'finished') break;
            const self = game.view.seats.find((p) => p.userId === config.owner.userId);
            assert(self);
            assert.equal(self.cards.length, 2);
            assert(
              game.view.seats
                .filter((p) => p.userId !== config.owner.userId)
                .every((p) => p.cards.length === 0 && p.hiddenCardCount === 2),
              'Other cards stay private before showdown',
            );
            if (game.turn !== 0) {
              await page.waitForTimeout(300);
              continue;
            }
            const before = structuredClone(game),
              legal = game.view.legalActions;
            if (round > 0 && !raised) {
              assert(legal.includes('raise'));
              const to = self.streetBet + self.chips;
              await page.locator('.table-amount input').fill(String(to));
              await page.getByRole('button', { name: 'Artır', exact: true }).click();
              raised = true;
              record.actions.push({ type: 'raise-all-in', to });
            } else if (legal.includes('call')) {
              assert.equal(
                await page.getByRole('button', { name: 'Bekle', exact: true }).isEnabled(),
                false,
              );
              const owed = game.view.maximumBet - self.streetBet;
              assert(owed > 0);
              await page.getByRole('button', { name: /^Gör ·/ }).click();
              record.actions.push({ type: 'call', owed });
            } else {
              assert(legal.includes('check'));
              await page.getByRole('button', { name: 'Bekle', exact: true }).click();
              record.actions.push({ type: 'check', stage: game.view.stage });
            }
            let advanced = false;
            for (let i = 0; i < 8; i++) {
              game = await current();
              if (game.view.revision > before.view.revision) {
                advanced = true;
                break;
              }
            }
            assert(advanced, 'Native action must advance the authoritative hand');
            if (record.actions.at(-1).type === 'raise-all-in') {
              const after = game.view.seats.find((p) => p.userId === config.owner.userId);
              if (game.status !== 'finished') assert.equal(after.chips, 0);
            }
          }
          assert.equal(game.status, 'finished');
          assert.equal(game.view.stage, 'ended');
          assert.equal(game.view.board.length, 5);
          assert(
            game.view.seats.every((p) => p.cards.length === 2),
            'Showdown exposes eligible cards only after the hand ends',
          );
          assert.equal(totals(game), startingTotal);
          const paid = Object.values(game.view.payouts).reduce((sum, p) => sum + p, 0),
            pot = game.view.seats.reduce((sum, p) => sum + p.contribution, 0);
          assert.equal(paid, pot);
          assert(paid > 0);
          assert.deepEqual(game.history.at(-1).result.payouts, game.view.payouts);
          assert.deepEqual(game.history.at(-1).result.board, game.view.board);
          if (round === 0) {
            for (const stage of ['preflop', 'flop', 'turn', 'river', 'ended'])
              assert(record.stages.includes(stage));
            assert(record.actions.some((a) => a.type === 'call'));
            assert(record.actions.some((a) => a.type === 'check'));
          } else assert(raised);
          await page.waitForFunction(() =>
            document.querySelector('.table-state')?.textContent?.includes('El tamamlandı'),
          );
          await page.getByRole('button', { name: 'Masa geçmişi', exact: true }).click();
          await page.waitForSelector('.game-history');
          const summaries = await page.locator('.game-history small').allTextContents();
          assert.equal(summaries.length, round + 1);
          for (const [id, points] of Object.entries(game.view.payouts)) {
            const name = game.seats.find((p) => p.userId === id).name;
            assert(summaries.at(-1).includes(`${name} · ${points}`));
          }
          record.pot = pot;
          record.paid = paid;
          record.totalVirtualChips = totals(game);
          record.nativeFinishedVisible = true;
          record.historySummary = summaries.at(-1);
          record.status = 'PASS';
          await page.locator('.game-history').scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `docs/screenshots/production/game-holdem-full-${round}.png`,
          });
          console.log(JSON.stringify(record));
          if (round > 0 && game.seats.some((p) => p.chips < 20)) {
            const button = page.getByRole('button', { name: 'Yeni eli başlat', exact: true });
            assert.equal(await button.isEnabled(), false);
            assert((await button.getAttribute('title')).includes('20 puanlık blind'));
            await page
              .locator('#game-start-help')
              .getByText(
                'Bir oyuncunun puanı 20 puanlık blind için yetersiz. Masayı kapatıp yeni bir masa kurun.',
                { exact: true },
              )
              .waitFor();
            check.insufficientChipsBlocked = true;
            await page.screenshot({
              path: 'docs/screenshots/production/game-holdem-insufficient-chips.png',
            });
            break;
          }
          if (round === 5)
            throw Error(
              'Natural all-in deals did not expose insufficient-blind state within six hands',
            );
          {
            const previous = game.history.length;
            await page.getByRole('button', { name: 'Yeni eli başlat', exact: true }).click();
            let ready = false;
            for (let i = 0; i < 8; i++) {
              game = await current();
              if (game.status === 'playing' && game.history.length === previous) {
                ready = true;
                break;
              }
            }
            assert(ready);
          }
        }
        assert.equal(check.insufficientChipsBlocked, true);
        check.controls.push(
          'insufficient-blind-start-disabled',
          'call',
          'check',
          'all-in-raise',
          'complete-five-card-showdowns',
          'private-before-reveal',
          'chip-conservation',
          'native-matching-history',
        );
      } else {
        await page.getByRole('button', { name: 'Artır', exact: true }).waitFor();
        await page.waitForFunction(() =>
          [...document.querySelectorAll('.table-action-bar button')].some(
            (b) => b.textContent === 'Artır' && !b.disabled,
          ),
        );
        await page.locator('.table-amount input').fill('60');
        await page.getByRole('button', { name: 'Artır', exact: true }).click();
        check.controls.push('raise');
        await page.waitForFunction(() =>
          [...document.querySelectorAll('button')].some(
            (b) => b.textContent === 'Pas / bırak' && !b.disabled,
          ),
        );
        await page.getByRole('button', { name: 'Pas / bırak', exact: true }).click();
        await page.getByRole('button', { name: 'Yeni eli başlat', exact: true }).waitFor();
        check.controls.push('fold-to-result');
        await page.getByRole('button', { name: 'Masa geçmişi', exact: true }).click();
        await page.waitForSelector('.game-history');
        assert((await current()).history.length > 0);
        check.controls.push('completed-history');
      }
    } else if (spec.kind === 'blackjack') {
      if (blackjackAdvanced) {
        assert.equal(
          await page.locator('.your-hand .section-heading .eyebrow').textContent(),
          'SENİN ELİN',
        );
        check.privateHandLabelCorrect = true;
        check.rounds = [];
        const covered = new Set();
        const ownPlayer = (g) => {
          const p = g.view.players.find((p) => p.userId === config.owner.userId);
          assert(p);
          return p;
        };
        const nativeAction = async (label) => {
          const previous = (await current()).view.revision;
          await page.getByRole('button', { name: label, exact: true }).click();
          for (let i = 0; i < 10; i++) {
            const next = await current();
            if (next.view.revision > previous) return next;
          }
          throw Error('Native Blackjack command did not advance the owned round');
        };
        // Use natural production deals only. Never inject a shoe or mutate server cards.
        for (let round = 0; round < 40; round++) {
          game = await current();
          const record = { round: round + 1, actions: [] };
          check.rounds.push(record);
          if (game.status === 'playing') {
            const legal = game.view.legalActions,
              initial = structuredClone(ownPlayer(game));
            if (legal.includes('split') && !covered.has('split')) {
              game = await nativeAction('Ayır');
              const after = ownPlayer(game);
              assert.equal(after.hands.length, 2);
              assert(
                after.hands.every(
                  (h) => h.split && h.cards.length === 2 && h.bet === initial.hands[0].bet,
                ),
              );
              assert.equal(await page.locator('.blackjack-hand').count(), 2);
              record.actions.push('split-two-rendered-hands');
              covered.add('split');
              await page.screenshot({
                path: 'docs/screenshots/production/game-blackjack-split.png',
              });
            } else if (legal.includes('double') && !covered.has('double')) {
              game = await nativeAction('İkiye katla');
              const hand = ownPlayer(game).hands[0];
              assert.equal(hand.bet, initial.hands[0].bet * 2);
              assert.equal(hand.cards.length, 3);
              assert.notEqual(hand.state, 'playing');
              record.actions.push('double-one-card-and-settle');
              covered.add('double');
            } else if (legal.includes('hit') && !covered.has('hit')) {
              game = await nativeAction('Kart al');
              assert.equal(ownPlayer(game).hands[0].cards.length, 3);
              if (game.status === 'playing') {
                assert(!game.view.legalActions.includes('double'));
                assert(!game.view.legalActions.includes('split'));
                assert.equal(
                  await page.getByRole('button', { name: 'İkiye katla', exact: true }).isEnabled(),
                  false,
                );
                assert.equal(
                  await page.getByRole('button', { name: 'Ayır', exact: true }).isEnabled(),
                  false,
                );
                record.postHitDisabled = true;
              }
              record.actions.push('hit-adds-card');
              covered.add('hit');
            }
            for (let i = 0; game.status === 'playing' && i < 4; i++) {
              game = await nativeAction('Dur');
              record.actions.push('stand-active-hand');
            }
          }
          assert.equal(game.status, 'finished');
          const player = ownPlayer(game),
            last = game.history.at(-1);
          assert(last);
          const settled = last.result.results.filter((r) => r.userId === config.owner.userId);
          assert.equal(settled.length, player.hands.length);
          record.settledHands = settled.length;
          record.status = 'PASS';
          console.log(JSON.stringify(record));
          if (covered.size === 3) {
            check.controls.push(...covered, 'every-played-hand-settled');
            break;
          }
          if (round === 39)
            throw Error(
              'Natural deals did not expose every requested Blackjack action within 40 hands',
            );
          await page.waitForTimeout(3000);
          const completedHands = game.history.length;
          await page.getByRole('button', { name: 'Yeni eli başlat', exact: true }).click();
          let started = false;
          for (let i = 0; i < 10; i++) {
            const next = await current();
            if (next.status === 'playing' || next.history.length > completedHands) {
              started = true;
              break;
            }
          }
          assert(
            started,
            'New native hand must be authoritatively playing or naturally settled before inspection',
          );
        }
        assert(covered.has('double') && covered.has('split') && covered.has('hit'));
      } else {
        const stand = page.getByRole('button', { name: 'Dur', exact: true });
        if ((await stand.count()) && (await stand.isEnabled())) {
          await stand.click();
          check.controls.push('stand');
        } else check.naturalBlackjackCompleted = true;
        await page.getByRole('button', { name: 'Yeni eli başlat', exact: true }).waitFor();
        assert((await current()).history.length > 0);
        check.controls.push('completed-result');
      }
    } else if (spec.kind === 'batak') {
      const deadline = Date.now() + (batakFull ? 180000 : 30000);
      let played = false;
      check.nativeCardsPlayed = 0;
      while (Date.now() < deadline) {
        game = await current();
        if (batakFull && game.status === 'finished') {
          assert(game.history.length > 0);
          assert.equal(game.view.completedTricks.length, spec.variant === 'gommeli' ? 16 : 13);
          assert(game.view.hands.every((h) => h.count === 0 && h.cards.length === 0));
          assert.equal(check.nativeCardsPlayed, spec.variant === 'gommeli' ? 16 : 13);
          check.completedTricks = game.view.completedTricks.length;
          check.completedHistory = true;
          break;
        }
        if (game.turn !== 0) {
          await page.waitForTimeout(300);
          continue;
        }
        if (game.view.stage === 'bidding') {
          await page.getByRole('button', { name: 'İhale ver', exact: true }).click();
          check.controls.push('bid');
          await page.waitForTimeout(1000);
        } else if (game.view.stage === 'trump') {
          await page.locator('.suit-choice').last().click();
          check.controls.push('choose-trump');
          await page.locator('.suit-choice').first().waitFor({ state: 'detached' });
        } else if (game.view.stage === 'bury') {
          for (let i = 0; i < 4; i++) await page.locator('.your-hand .playing-card').nth(i).click();
          await page.getByRole('button', { name: 'Seçili 4 kartı göm', exact: true }).click();
          check.controls.push('bury-four');
          await page
            .getByRole('button', { name: 'Seçili 4 kartı göm', exact: true })
            .waitFor({ state: 'detached' });
        } else if (game.view.stage === 'playing') {
          const hand = game.view.hands.find((h) => h.seat === 0).cards,
            card = legalBatakCards(hand, game.view.trick, game.view.trump)[0];
          assert(card);
          assert(
            game.view.hands.filter((h) => h.seat !== 0).every((h) => h.cards.length === 0),
            'Other private hands must stay hidden',
          );
          await page.waitForFunction(
            (n) => document.querySelectorAll('.your-hand .playing-card').length === n,
            hand.length,
          );
          await page
            .locator('.your-hand .playing-card')
            .nth(hand.findIndex((c) => c.id === card.id))
            .click();
          check.controls.push('play-legal-card');
          check.nativeCardsPlayed++;
          played = true;
          if (!batakFull) break;
          await page.waitForFunction(
            (n) => document.querySelectorAll('.your-hand .playing-card').length < n,
            hand.length,
          );
        }
      }
      assert(played, 'Native Batak action must reach an actual legal card');
      if (batakFull) {
        assert.equal(game.status, 'finished');
        assert.deepEqual(game.history.at(-1).result.scores, game.view.scores);
        await page.waitForFunction(() =>
          document.querySelector('.table-state')?.textContent?.includes('El tamamlandı'),
        );
        check.nativeFinishedStateVisible = true;
        await page.getByRole('button', { name: 'Masa geçmişi', exact: true }).click();
        await page.waitForSelector('.game-history');
        check.historySummary = await page.locator('.game-history small').allTextContents();
        assert.equal(check.historySummary.length, 1);
        for (const [index, score] of game.view.scores.entries())
          assert(check.historySummary[0].includes(`${game.seats[index].name} · ${score}`));
        check.controls.push('native-complete-hand-history');
      }
    } else {
      if (staging) {
        assert.equal(
          await page.locator('.staged-melds > div').count(),
          0,
          'A new table must not retain the previous staged groups',
        );
        assert.equal(
          await page.locator('.your-hand .okey-tile.selected').count(),
          0,
          'A new table must clear tile selection',
        );
        await page.waitForFunction(
          () => !!document.querySelector('.your-hand .okey-tile:not(:disabled)'),
        );
        const hand = page.locator('.your-hand .okey-tile');
        const n = await hand.count();
        await hand.nth(n - 2).click();
        await hand.nth(n - 1).click();
        await page.getByRole('button', { name: 'Seçimi seri / çift yap', exact: true }).click();
        assert.equal(await page.locator('.staged-melds > div').count(), 1);
        assert.equal(await page.locator('.staged-melds .okey-tile').count(), 2);
        await page.getByRole('button', { name: 'Hazır grubu kaldır', exact: true }).click();
        assert.equal(await page.locator('.staged-melds > div').count(), 0);
        await hand.nth(n - 2).click();
        await hand.nth(n - 1).click();
        await page.getByRole('button', { name: 'Seçimi seri / çift yap', exact: true }).click();
        check.controls.push(
          'stage-two-tiles',
          'remove-staged-group',
          'restage-before-table-close',
          'fresh-table-state',
        );
      }
      assert.equal(game.view.rules.folding, spec.folding);
      assert.equal(game.view.rules.teams, spec.teams);
      check.rulesMatch = true;
      await page.waitForFunction(
        () => !!document.querySelector('.your-hand .okey-tile:not(:disabled)'),
      );
      if ((await current()).view.stage === 'draw') {
        await page.getByRole('button', { name: 'Taş çek', exact: true }).click();
        check.controls.push('initial-draw');
        await page.waitForFunction(
          () => document.querySelectorAll('.your-hand .okey-tile').length === 22,
        );
      }
      await page.locator('.your-hand .okey-tile').first().click();
      await page.getByRole('button', { name: 'Seçili taşı at', exact: true }).click();
      check.controls.push('select-discard');
      const roundTripStarted = Date.now();
      await page.waitForFunction(() =>
        [...document.querySelectorAll('button')].some(
          (b) => b.textContent === 'Taş çek' && !b.disabled,
        ),
      );
      await page.getByRole('button', { name: 'Taş çek', exact: true }).click();
      check.controls.push('draw');
      check.botRoundTripElapsedMs = Date.now() - roundTripStarted;
      await page.waitForFunction(
        () => document.querySelectorAll('.your-hand .okey-tile').length === 22,
      );
      await page.waitForFunction(
        () => !!document.querySelector('.your-hand .okey-tile:not(:disabled)'),
      );
      await page.locator('.your-hand .okey-tile').first().click();
      await page.getByRole('button', { name: 'Seçili taşı at', exact: true }).click();
      check.controls.push('discard-after-draw');
    }
    await page.locator('.main-view').evaluate((e) => (e.scrollTop = 0));
    await page.screenshot({
      path: `docs/screenshots/production/game-${batakFull ? 'full-' : blackjackAdvanced ? 'advanced-' : staging ? 'staging-' + caseIndex + '-' : ''}${spec.kind}-${spec.variant ?? `${Number(spec.folding ?? false)}${Number(spec.teams ?? false)}`}.png`,
    });
    if (batakFull) {
      await page.locator('.game-history').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `docs/screenshots/production/game-full-batak-history-${spec.variant}.png`,
      });
    }
    await close();
    if (spec.kind === '101' && spec.folding && spec.teams) {
      const stopped = (await snapshot()).room.game;
      assert.equal(stopped.status, 'playing');
      await page.waitForTimeout(3500);
      assert.deepEqual((await snapshot()).room.game, stopped);
      result.closedTableFrozenAcrossSweeps = true;
    }
    check.controls.push('confirm-close');
    check.status = 'PASS';
    console.log(JSON.stringify(check));
    await page.waitForTimeout(5000);
  }
  assert.equal(result.rendererErrors, 0);
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  result.failure = error.message.slice(0, 350);
  if (page) {
    result.alerts = await page
      .locator('[role=alert]')
      .allTextContents()
      .catch(() => []);
    await page.screenshot({ path: '.local/production/native-games-failure.png' }).catch(() => {});
  }
} finally {
  if (ownedPrimary && page) {
    try {
      await close();
      result.ownedTableClosed = true;
    } catch {
      result.ownedTableClosed = false;
      result.status = 'FAIL';
    }
  }
  if (page) await page.evaluate(() => window.rooms.social.logout()).catch(() => {});
  if (app) await app.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
  if (nativeProfile) await rm(nativeProfile, { recursive: true, force: true });
  if (channelId) {
    try {
      const owned = await api(`/channels/${channelId}`);
      assert.equal(owned.name, name);
      assert.equal(owned.server, config.spaceId);
      await api(`/channels/${channelId}`, 'DELETE');
      result.ownedChannelRemoved = true;
    } catch {
      result.ownedChannelRemoved = false;
      result.status = 'FAIL';
    }
  }
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
if (result.status !== 'PASS') process.exitCode = 1;
