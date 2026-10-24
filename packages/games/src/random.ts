/**
 * Uniform integer in [0, max) from the platform CSPRNG. Web Crypto exists in browsers and in Node 19+, so the
 * game engines can be imported by the desktop renderer (views, previews, fixtures) without pulling in node:crypto.
 */
export function secureRandomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32)
    throw new RangeError('max must be an integer in 1..2^32');
  // Rejection sampling keeps the result unbiased for every max.
  const limit = Math.floor(2 ** 32 / max) * max;
  const word = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(word);
    if (word[0] < limit) return word[0] % max;
  }
}
