// Opt-in: imports Kanal's deterministic mock IPTV panel. Start it from the Kanal repository with
// `dart run tools/mock_server/bin/mock_server.dart --port 8787 --scale small|large` and run
// `ROOMS_CINEMA_KANAL_MOCK=http://127.0.0.1:8787 vitest run tests/community-cinema-kanal-mock.test.ts`.
import { describe, expect, it } from 'vitest';
import { Catalog } from '../apps/services/cinema/catalog';
import { Importer } from '../apps/services/cinema/importer';

const server = process.env.ROOMS_CINEMA_KANAL_MOCK;
const source = {
  kind: 'xtream' as const,
  server: server ?? '',
  username: 'kanal',
  password: 'test123',
  guideUrl: null,
};

describe.skipIf(!server)('Kanal mock provider import', () => {
  it('imports the catalog and guide within Kanal’s budgets', async () => {
    const importer = new Importer({ userAgent: 'ROOMS-Cinema/test', allowPrivateNetwork: true });
    const account = await importer.verify(source);
    expect(account).toMatchObject({ active: true, maxConnections: 2 });
    let started = performance.now();
    const snapshot = await importer.importCatalog(source, () => {});
    const catalogMs = performance.now() - started;
    const catalog = new Catalog(snapshot);
    started = performance.now();
    const guide = await importer.importGuide(
      importer.guideUrl(source, snapshot)!,
      snapshot.items,
      () => {},
    );
    const guideMs = performance.now() - started;
    catalog.setGuide(guide.programmes, guide.matches, Date.now());
    const counts = catalog.counts();
    console.log(
      JSON.stringify({ counts, catalogMs: Math.round(catalogMs), guideMs: Math.round(guideMs) }),
    );
    expect(counts.live).toBeGreaterThanOrEqual(300);
    // The mock ships one nameless channel (stream 10021, number 33).
    expect(catalog.item('l-10021')?.title).toBe('Kanal 33');
    expect(counts.programmes).toBeGreaterThan(1000);
    expect(catalogMs).toBeLessThan(45_000);
    expect(guideMs).toBeLessThan(90_000);

    const trt = catalog.item('l-1001')!;
    expect(trt).toMatchObject({ title: 'TRT 1', badges: ['HD'], hasGuide: true });
    expect(catalog.categories('live').find((c) => c.id === trt.categoryId)).toMatchObject({
      flag: '🇹🇷',
    });
    const now = Date.now();
    expect(catalog.guide(['l-1001'], now - 1, now + 1)['l-1001']).toHaveLength(1);
    expect(catalog.search('sicak kafa').map((item) => item.ref)).toContain('s-5001');
    expect(catalog.search('kis uykusu').map((item) => item.ref)).toContain('m-3001');

    const times: number[] = [];
    for (const query of ['trt', 'show', 'haber', 'spor', 'film', 'kanal d', 'sıcak', 'çocuk']) {
      const t = performance.now();
      catalog.search(query);
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    console.log(
      JSON.stringify({ searchP95Ms: Math.round(times[Math.floor(times.length * 0.95)] * 10) / 10 }),
    );
    expect(times[times.length - 1]).toBeLessThan(100);
  }, 180_000);
});
