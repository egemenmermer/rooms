import { describe, it, expect } from 'vitest';
import { playbackFailure } from '../apps/desktop/src/personal-playback-failure';
describe('observed private media failures', () => {
  it.each([
    [410, undefined, 'expired'],
    [401, undefined, 'unauthorized'],
    [403, undefined, 'unauthorized'],
    [503, undefined, 'network'],
    [undefined, 2, 'network'],
    [undefined, 3, 'unsupported'],
    [undefined, 4, 'unsupported'],
    [undefined, undefined, 'unknown'],
  ] as const)('maps %s/%s without guessing authorization', (status, code, kind) =>
    expect(playbackFailure(status, code)).toBe(kind),
  );
});
