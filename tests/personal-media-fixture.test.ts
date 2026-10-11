import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPersonalProviders, installPersonalProviderFixture } from '../apps/desktop/src/personal-provider-runtime';
import { getPersonalMediaFixtureSeed, installPersonalMediaFixture } from '../apps/desktop/src/dev/personal-media-fixture';

const cleanup: (() => void)[] = [];
const install = (screen: string, variant = 'default') => {
  const result = installPersonalMediaFixture(screen, variant); cleanup.push(result.dispose); return result;
};
afterEach(() => { cleanup.splice(0).reverse().forEach(dispose => dispose()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('DEV personal provider metadata boundary', () => {
  it('never reads native methods while the explicit fixture is installed', async () => {
    const nativeRead = vi.fn(() => { throw new Error('Native bridge consulted'); });
    vi.stubGlobal('window', { get rooms() { return nativeRead(); } });
    install('S33');
    const bridge = getPersonalProviders()!;
    expect(await bridge.status()).toHaveLength(2);
    expect((await bridge.status()).every(c => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(c.id))).toBe(true);
    const saved = await bridge.connectPlaylist({name: 'Local demo', url: 'https://private.invalid'});
    expect(saved.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await bridge.channels('00000000-0000-4000-8000-000000000033')).toHaveLength(5);
    expect(await bridge.rdLibrary()).toHaveLength(4);
    expect(await bridge.pickPlaylist()).toBeNull();
    await expect(bridge.play('00000000-0000-4000-8000-000000000033', 'dev-fixture-kiyi')).rejects.toThrow('oynatma kaynağı yok');
    await expect(bridge.rdPlay('dev-fixture-library-0')).rejects.toThrow('oynatma kaynağı yok');
    expect(nativeRead).not.toHaveBeenCalled();
  });

  it.each([
    ['S33', 'default empty offline iptv_removed'], ['S34', 'default xtream checking error edit remove'],
    ['S35', 'default empty no_guide'], ['S36', 'default buffering error expired rewound'],
    ['S37', 'default waiting expired cancelled connected error'], ['S38', 'default empty details playing'],
    ['S39', 'default unsupported external'],
  ])('accepts each exact %s variant with explicit metadata', async (screen, variants) => {
    for (const variant of variants.split(' ')) {
      const fixture = install(screen, variant);
      expect(fixture.seed.intent).toMatchObject({ screen, variant });
      expect(fixture.seed.label).toContain('DEV fixture');
      expect((await getPersonalProviders()!.status()).every(c => c.name.includes('DEV fixture'))).toBe(true);
      fixture.dispose();
    }
  });

  it.each([['S32', 'default'], ['S33', 'details'], ['S34', '1280x800'], ['S39', 'bogus'], ['__proto__', 'default']])('rejects unsupported %s/%s rather than normalizing', (screen, variant) => {
    expect(() => install(screen, variant)).toThrow('Unsupported personal media fixture');
    expect(getPersonalProviders()).toBeUndefined();
  });

  it('copies reads and isolates local favorite/name/removal mutations', async () => {
    const first = install('S35');
    const bridge = getPersonalProviders()!;
    const rows = await bridge.channels('00000000-0000-4000-8000-000000000033'); rows[0].name = 'Injected';
    const status = await bridge.status(); status[0].name = 'Injected';
    await bridge.favorite('00000000-0000-4000-8000-000000000033', 'dev-fixture-kiyi', false);
    expect((await bridge.channels('00000000-0000-4000-8000-000000000033'))[0]).toMatchObject({ favorite: false });
    expect((await bridge.channels('00000000-0000-4000-8000-000000000033'))[0].name).toContain('DEV fixture');
    expect((await bridge.status())[0].name).toContain('DEV fixture');
    await bridge.disconnect('00000000-0000-4000-8000-000000000033');
    await expect(bridge.channels('00000000-0000-4000-8000-000000000033')).rejects.toThrow('bağlantı bulunamadı');
    first.dispose();
    install('S35');
    expect((await getPersonalProviders()!.channels('00000000-0000-4000-8000-000000000033'))[0].favorite).toBe(true);
    await expect(bridge.status()).rejects.toThrow('disposed');
  });

  it('cancels local auth without simulating provider success', async () => {
    install('S37', 'waiting'); const bridge = getPersonalProviders()!;
    expect(await bridge.rdStart()).toMatchObject({ userCode: 'DEV-DEMO', verificationUrl: 'about:blank' });
    expect(await bridge.rdPoll()).toEqual({ state: 'pending' });
    await bridge.rdCancel(); expect(await bridge.rdPoll()).toEqual({ state: 'expired' });
    expect((await bridge.status()).some(c => c.type === 'real-debrid')).toBe(false);
    await expect(bridge.rdLibrary()).rejects.toThrow('bağlantı bulunamadı');
  });

  it('keeps checking pending until disposal and does not keep submitted credentials', async () => {
    const fixture = install('S34', 'checking'); const bridge = getPersonalProviders()!;
    let settled = false;
    const pending = bridge.connectXtream({ name: 'Local', serverUrl: 'https://private.invalid', username: 'private-user', password: 'private-password' });
    const rejection = expect(pending).rejects.toThrow('cancelled');
    void pending.then(() => { settled = true; }, () => { settled = true; });
    await Promise.resolve(); expect(settled).toBe(false);
    expect(JSON.stringify(await bridge.status())).not.toMatch(/private-user|private-password|private.invalid/);
    fixture.dispose(); await rejection;
  });

  it('fails closed in production and leaves native fallback available', () => {
    vi.stubEnv('DEV', false);
    const native = { status: vi.fn() };
    vi.stubGlobal('window', { rooms: { providers: native } });
    expect(getPersonalProviders()).toBe(native);
    expect(() => install('S33')).toThrow('unavailable in production');
    expect(getPersonalMediaFixtureSeed()).toBeNull();
    expect(() => installPersonalProviderFixture(native as never)).toThrow('unavailable in production');
  });

  it('disposes nested installations out of order without resurrecting stale fixtures', async () => {
    const first = install('S33'); const stale = getPersonalProviders()!;
    const second = install('S33', 'empty'); first.dispose();
    expect(await getPersonalProviders()!.status()).toEqual([]);
    expect(getPersonalMediaFixtureSeed()?.intent.variant).toBe('empty');
    second.dispose(); expect(getPersonalProviders()).toBeUndefined();
    expect(getPersonalMediaFixtureSeed()).toBeNull();
    await expect(stale.status()).rejects.toThrow('disposed');
  });
});
