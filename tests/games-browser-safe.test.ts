import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { secureRandomInt } from '../packages/games/src/random';

const root = join(__dirname, '../packages/games/src');

it('keeps the game engines free of Node-only imports, so the desktop renderer can bundle them', () => {
  const offenders = readdirSync(root)
    .filter((file) => file.endsWith('.ts'))
    .filter((file) => /from ['"]node:/.test(readFileSync(join(root, file), 'utf8')));
  expect(offenders).toEqual([]);
});

it('draws uniform integers in range from Web Crypto', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 400; i++) {
    const value = secureRandomInt(4);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(4);
    seen.add(value);
  }
  expect(seen.size).toBe(4);
  expect(() => secureRandomInt(0)).toThrow(RangeError);
});
