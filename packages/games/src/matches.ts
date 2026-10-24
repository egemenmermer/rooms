import { asMatch } from './match';
import type { GameError, GameOptionValue } from './module';
import { PISTI_TARGETS, pistiMatchWinners, pistiModule, type PistiOptions } from './pisti';
import { tavlaModule, type TavlaOptions } from './tavla';

/** Validates Pişti's `game.create` options: `target` (101/151/251) and `reshuffleJackTop`. */
export function parsePistiOptions(
  input: Record<string, GameOptionValue> | undefined,
): Partial<PistiOptions> | undefined | GameError {
  if (!input) return undefined;
  const options: Partial<PistiOptions> = {};
  for (const [key, value] of Object.entries(input)) {
    const target = PISTI_TARGETS.find((t) => t === value);
    if (key === 'target' && target) options.target = target;
    else if (key === 'reshuffleJackTop' && typeof value === 'boolean')
      options.reshuffleJackTop = value;
    else return { error: 'GAME_OPTIONS_UNSUPPORTED' };
  }
  return options;
}

/** Pişti played to the table's target (151 by default): deals are summed until a side reaches it. */
export const pistiMatchModule = asMatch(
  { ...pistiModule, parseOptions: parsePistiOptions },
  {
    title: 'Pişti', // i18n-ignore -- game name
    winners: (totals, deal) => pistiMatchWinners(totals, deal.target),
  },
);

/** Tavla played to `matchTo` points (5 by default); each round starts with the match score so far. */
export const tavlaMatchModule = asMatch<
  Parameters<typeof tavlaModule.view>[0],
  Parameters<typeof tavlaModule.action>[2],
  ReturnType<typeof tavlaModule.view>,
  TavlaOptions
>(tavlaModule, {
  title: 'Tavla',
  winners: (totals, round) =>
    totals.flatMap((total, seat) => (total >= round.options.matchTo ? [seat] : [])),
  roundOptions: (options, totals) => ({ ...options, scores: totals }),
});
