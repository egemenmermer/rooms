import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// Friends receive one link; no visible surface should ask them for an invitation "code".
const banned = [
  /davet kodu/i,
  /DAVET KODU/,
  /Kodu kopyala/,
  /Davetimi aç/,
  /Davetle hesap oluştur/,
  /Sunucu ve davet seçenekleri/,
  /Tek kullanımlık, 24 saat/,
  /INVITATION CODE/,
];

async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return entry.name === 'dev' ? [] : sources(path);
      return /\.(tsx?|html)$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

it('keeps invitation-code wording out of the desktop app and the landing page', async () => {
  const files = [
    ...(await sources('apps/desktop/src')),
    ...(await sources('apps/desktop/electron')),
    'apps/services/access/invite-page.ts',
  ];
  const hits: string[] = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const pattern of banned) if (pattern.test(text)) hits.push(`${file}: ${pattern}`);
  }
  expect(hits).toEqual([]);
});
