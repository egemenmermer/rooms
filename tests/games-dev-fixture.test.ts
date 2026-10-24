// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  createGamesFixtureProjection,
  gameFixtureVariants,
  getGamesFixtureMetadata,
} from '../apps/desktop/src/dev/games-fixture';

const self = 'demo-deniz';
const project = (id: string, variant = 'default') => createGamesFixtureProjection(id, variant).room;

describe('dev games fixture', () => {
  it('projects every inventoried screen and variant (private hands audited)', () => {
    for (const [id, variants] of Object.entries(gameFixtureVariants))
      for (const variant of variants) {
        if (getGamesFixtureMetadata(id, variant).unsupportedReason) continue;
        expect(() => project(id, variant), `${id}/${variant}`).not.toThrow();
      }
  });

  it('reaches each game’s own fixture scenes with the demo user as the viewer', () => {
    const seated: [string, string, string][] = [
      ['S42', 'scene_your_turn', 'holdem'],
      ['S43', 'scene_showdown', 'holdem'],
      ['S44', 'scene_insurance', 'blackjack'],
      ['S46', 'scene_bidding', 'batak'],
      ['S47', 'scene_trick_complete', 'batak'],
      ['S49', 'scene_draw', '101'],
      ['S50', 'scene_finished', '101'],
      ['S73', 'default', 'rooms-pisti-v1'],
      ['S74', 'scene_discard', 'rooms-okey-v1'],
      ['S75', 'scene_your_move', 'rooms-tavla-v1'],
    ];
    for (const [id, variant, kind] of seated) {
      const game = project(id, variant).game!;
      expect(game.kind, `${id}/${variant}`).toBe(kind);
      expect(
        game.seats.some((seat) => seat.userId === self),
        `${id}/${variant}`,
      ).toBe(true);
      expect(JSON.stringify(game)).not.toContain('"self"');
    }
    // Spectator scenes leave the demo user out of the seats, even where the scene seats a Deniz.
    for (const [id, variant] of [
      ['S47', 'scene_spectator'],
      ['S49', 'scene_spectator'],
      ['S74', 'scene_spectator'],
    ])
      expect(project(id, variant).game!.seats.some((seat) => seat.userId === self)).toBe(false);
  });

  it('gives the Hold’em screens a public action log', () => {
    const log = project('S42').game!.view.log as { action: string; street: string }[];
    expect(log.slice(0, 2).map((entry) => entry.action)).toEqual(['smallBlind', 'bigBlind']);
    expect(log.some((entry) => entry.street === 'flop' && entry.action === 'raise')).toBe(true);
  });

  it('shows the Batak auction without a trump, and the house rules', () => {
    const view = project('S46').game!.view;
    expect(view.stage).toBe('bidding');
    expect(view.trump).toBeNull();
    expect((view.bidLog as unknown[]).length).toBeGreaterThan(0);
    expect(view.rules).toMatchObject({ noTrumpLeadUntilBroken: true });
    expect(view.trumpBroken).toBe(false);
    expect(project('S47').game!.view.trump).toBe('spades');
  });

  it('keeps every Blackjack player’s hands in the history detail', () => {
    const tables = project('S51', 'blackjack').game!.view.previousTables as {
      kind: string;
      history: { result: { players: { hands: unknown[] }[] } }[];
    }[];
    const blackjack = tables.find((table) => table.kind === 'blackjack')!;
    const players = blackjack.history[0].result.players;
    expect(players.filter((player) => player.hands.length > 0).length).toBeGreaterThan(1);
  });
});
