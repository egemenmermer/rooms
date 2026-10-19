// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ActivityCommand } from '../packages/activity-protocol/src';
import type { CinemaBridge } from '../packages/community-cinema/src/bridge';

vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => ({ participants: [], tracks: [], status: 'idle', channelId: null }),
}));
vi.mock('@rooms/media', () => ({ liveKitMediaProvider: {} }));
vi.mock('../apps/desktop/src/RealSocial', () => ({
  CommunityChat: () => <div>Salon sohbeti</div>,
}));

import CinemaHall from '../apps/desktop/src/cinema/CinemaHall';
import { installCinemaFixture } from '../apps/desktop/src/cinema/cinema-bridge';
import { resetGuideCache } from '../apps/desktop/src/cinema/guide-cache';
import { resetRmdbStore } from '../apps/desktop/src/cinema/rmdb-store';
import { useCommunity } from '../apps/desktop/src/community';
import { installDevelopmentRuntime } from '../apps/desktop/src/runtime-sources';
import {
  communityCinemaFixtureRoom,
  createCommunityCinemaFixtureActivity,
  createCommunityCinemaFixtureBridge,
  fixtureArt,
  FIXTURE_COMMUNITY_ID,
  FIXTURE_HALL_ID,
  type CommunityCinemaFixtureVariant,
} from '../apps/desktop/src/dev/community-cinema-fixture';

// Several mounts and fixture round trips per test; keep them stable on a busy machine.
configure({ asyncUtilTimeout: 4000 });

class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
}
let cleanups: (() => void)[] = [];
let sent: ActivityCommand[] = [];
let bridge: CinemaBridge;
let notify: Mock<(message: string) => void>;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );
  localStorage.clear();
  sent = [];
});
afterEach(() => {
  cleanup();
  cleanups.forEach((clean) => clean());
  cleanups = [];
  resetGuideCache();
  resetRmdbStore();
  vi.unstubAllGlobals();
});

/** Mounts the hall; `again` keeps the same fixture service, like reopening the app. */
function mount(variant: CommunityCinemaFixtureVariant, again = false) {
  const owner = variant !== 'member' && variant !== 'remote';
  useCommunity.setState({
    user: { id: 'demo-deniz', username: 'deniz', displayName: 'Deniz', avatar: null },
    serverUrl: `https://cinema-${variant}-${Math.random()}`,
    activeSpaceId: FIXTURE_COMMUNITY_ID,
    activeChannelId: FIXTURE_HALL_ID,
    spaces: [
      {
        id: FIXTURE_COMMUNITY_ID,
        name: 'Bizim Oda',
        ownerId: owner ? 'demo-deniz' : 'demo-ece',
        icon: null,
      },
    ],
    channels: [
      {
        id: FIXTURE_HALL_ID,
        spaceId: FIXTURE_COMMUNITY_ID,
        name: 'film-gecesi',
        type: 0,
        topic: null,
      },
    ],
    openChannel: vi.fn(async () => {}),
  });
  const activity = createCommunityCinemaFixtureActivity(communityCinemaFixtureRoom(variant));
  const command = activity.command;
  activity.command = async (roomId, envelope) => {
    sent.push(envelope.command);
    return command(roomId, envelope);
  };
  if (!again) bridge = createCommunityCinemaFixtureBridge(variant);
  cleanups.push(
    installDevelopmentRuntime({
      mediaProvider: {} as never,
      mediaBridge: {} as never,
      activityBridge: activity,
    }),
    installCinemaFixture({ bridge, art: fixtureArt }),
  );
  notify = vi.fn();
  return render(
    <MemoryRouter>
      <CinemaHall notify={notify} />
    </MemoryRouter>,
  );
}

const hallTabs = async () => screen.findByRole('tablist', { name: 'Sinema' });

async function openRmdb() {
  fireEvent.click(within(await hallTabs()).getByRole('tab', { name: 'RMDB' }));
}

/** Opens a work from the RMDB home page (its poster names it first). */
async function openWork(title: string) {
  await openRmdb();
  const cards = await screen.findAllByRole('button', { name: new RegExp(`^${title},`) });
  fireEvent.click(cards[0]!);
  await screen.findByRole('heading', { level: 2, name: title });
}

const mine = async (workId: string) =>
  (await bridge.rmdbWork(FIXTURE_HALL_ID, workId)).reviews.find(
    (review) => review.author.userId === 'demo-deniz',
  );

describe('RMDB in the cinema hall', { timeout: 30_000 }, () => {
  it('is the last tab and works without an IPTV account', async () => {
    mount('member');
    const tabs = within(await hallTabs()).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Salon',
      'Canlı TV',
      'Filmler',
      'Diziler',
      'YouTube',
      'RMDB',
    ]);
    await openRmdb();
    expect(await screen.findByRole('heading', { level: 2, name: 'RMDB' })).toBeTruthy();
    expect(screen.getByText(/8 film · 5 dizi · 13 yorum/)).toBeTruthy();
    for (const row of ['Devam et', 'İzlenecekler', 'Son izlenenler', 'Topluluğun favorileri'])
      expect(screen.getByRole('region', { name: row })).toBeTruthy();
    expect(screen.queryByText('Sahip henüz bir kaynak bağlamadı')).toBeNull();
    // The unfinished film comes first in "Devam et", with its progress on the poster.
    const continuing = screen.getByRole('region', { name: 'Devam et' });
    const first = within(continuing).getAllByRole('button')[0]!;
    expect(first.getAttribute('aria-label')).toMatch(/^Gecenin Kıyısında, .*yarım kaldı/);
    expect(first.querySelector('.rmdb-progress.on-poster')).toBeTruthy();
    // Without a catalog nothing opens, but the record stays readable.
    await openWork('Kuzey Treni');
    expect(screen.getByText(/IPTV hesabı yok; salonda açılamaz/)).toBeTruthy();
    expect(screen.getByText(/Katalogdan kalktı ama kaydı burada duruyor/)).toBeTruthy();
  });

  it('explains an empty RMDB and points to the catalog', async () => {
    mount('rmdb_empty');
    await openRmdb();
    expect(await screen.findByText('RMDB henüz boş')).toBeTruthy();
    expect(screen.getByText(/Salonda izlediğiniz filmler ve diziler burada birikir/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Filmler' }));
    expect(
      within(await hallTabs())
        .getByRole('tab', { name: 'Filmler' })
        .getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('saves a rating, a review and a spoiler mark that a reload still shows', async () => {
    mount('default');
    await openWork('Son Vapur');
    let editor = screen.getByRole('region', { name: 'Senin puanın ve yorumun' });
    const stars = within(editor).getByRole('radiogroup', { name: 'Puanın' });
    // Keyboard: half a star per arrow, Delete clears.
    fireEvent.keyDown(stars, { key: 'ArrowRight' });
    fireEvent.keyDown(stars, { key: 'ArrowRight' });
    expect(
      within(editor).getByRole('radio', { name: '1 yıldız' }).getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.keyDown(stars, { key: 'ArrowLeft' });
    expect(
      within(editor).getByRole('radio', { name: 'yarım yıldız' }).getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.keyDown(stars, { key: 'Delete' });
    expect(within(editor).queryByRole('radio', { checked: true })).toBeNull();
    // The spoiler mark needs words first.
    const spoiler = within(editor).getByRole('checkbox', { name: 'Spoiler içerir' });
    expect((spoiler as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(editor).getByRole('radio', { name: '3,5 yıldız' }));
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Yorumun' }), {
      target: { value: 'Son sahnede vapur hiç gelmiyor.' },
    });
    expect(within(editor).getByText('3.969 karakter kaldı')).toBeTruthy();
    fireEvent.click(spoiler);
    fireEvent.click(within(editor).getByRole('button', { name: 'Kaydet' }));
    expect(await within(editor).findByText('Kaydedildi')).toBeTruthy();
    expect(await mine('w-demo-son-vapur')).toMatchObject({
      rating: 7,
      text: 'Son sahnede vapur hiç gelmiyor.',
      spoiler: true,
      liked: false,
    });
    // The community score now counts it: (3,5 + 3,5) / 2.
    const score = screen.getByRole('region', { name: 'Topluluk puanı' });
    expect(within(score).getByText('3,5')).toBeTruthy();

    // Reopen the app over the same service.
    cleanup();
    resetRmdbStore();
    mount('default', true);
    await openWork('Son Vapur');
    editor = screen.getByRole('region', { name: 'Senin puanın ve yorumun' });
    expect(
      within(editor).getByRole('radio', { name: '3,5 yıldız' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      (within(editor).getByRole('textbox', { name: 'Yorumun' }) as HTMLTextAreaElement).value,
    ).toBe('Son sahnede vapur hiç gelmiyor.');
    expect(
      (within(editor).getByRole('checkbox', { name: 'Spoiler içerir' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    // One's own spoiler is never hidden from oneself; it leads the list.
    const reviews = screen.getByRole('region', { name: 'Yorumlar' });
    const own = within(reviews).getAllByRole('listitem')[0]!;
    expect(within(own).getByText('Sen')).toBeTruthy();
    expect(within(own).getByRole('img', { name: '3,5 yıldız' })).toBeTruthy();
    expect(own.querySelector('.rmdb-review-text.hidden')).toBeNull();
  });

  it("blurs another member's spoiler until it is revealed", async () => {
    mount('default');
    await openWork('Sessiz Sokak');
    const text = screen.getByText(/Katil baştan beri karşı komşuymuş/);
    expect(text.closest('.rmdb-review-text')?.classList.contains('hidden')).toBe(true);
    expect(text.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: "Spoiler'ı göster" }));
    expect(text.closest('.rmdb-review-text')?.classList.contains('hidden')).toBe(false);
    expect(text.getAttribute('aria-hidden')).toBeNull();
    // Escape steps back to the RMDB home page, not out to the stage.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(await screen.findByRole('heading', { level: 2, name: 'RMDB' })).toBeTruthy();
  });

  it('toggles the heart and İzlenecekler, and the poster shows both', async () => {
    mount('default');
    await openWork('Son Vapur');
    const hearts = screen.getAllByRole('button', { name: 'Beğen' });
    expect(hearts).toHaveLength(2);
    expect(hearts.every((heart) => heart.getAttribute('aria-pressed') === 'false')).toBe(true);
    fireEvent.click(hearts[0]!);
    // Shown at once, in both places.
    expect(
      screen
        .getAllByRole('button', { name: 'Beğen' })
        .every((heart) => heart.getAttribute('aria-pressed') === 'true'),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: "İzlenecekler'e ekle" }));
    expect(await screen.findByRole('button', { name: "İzlenecekler'de" })).toBeTruthy();
    await waitFor(async () =>
      expect(await bridge.rmdbWork(FIXTURE_HALL_ID, 'w-demo-son-vapur')).toMatchObject({
        onWatchlist: true,
        mine: { liked: true, rating: null },
        watchlist: { by: { userId: 'demo-deniz' } },
      }),
    );
    expect(screen.getByText(/İzlenecekler listesinde · sen ekledin/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'RMDB' }));
    const watchlist = await screen.findByRole('region', { name: 'İzlenecekler' });
    const card = within(watchlist).getByRole('button', { name: /^Son Vapur,/ });
    expect(card.getAttribute('aria-label')).toContain("İzlenecekler'de");
    expect(card.getAttribute('aria-label')).toContain('beğendin');
  });

  it('keeps owner-only removals from members and lets the owner use them', async () => {
    mount('member');
    await openWork('Sessiz Sokak');
    expect(screen.queryByRole('button', { name: "RMDB'den kaldır" })).toBeNull();
    expect(screen.queryByRole('button', { name: /adlı üyenin yorumunu kaldır/ })).toBeNull();
    expect(
      within(screen.getByRole('region', { name: 'Günlük' })).queryByRole('button', {
        name: 'Günlükten kaldır',
      }),
    ).toBeNull();
    cleanup();
    resetRmdbStore();
    mount('default');
    await openWork('Sessiz Sokak');
    fireEvent.click(screen.getByRole('button', { name: 'Can adlı üyenin yorumunu kaldır' }));
    const dialog = await screen.findByRole('dialog', { name: 'Yorum kaldırılsın mı?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yorumu kaldır' }));
    await waitFor(() => expect(screen.queryByText(/Katil baştan beri/)).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: "RMDB'den kaldır" }));
    const confirm = await screen.findByRole('dialog', { name: "RMDB'den kaldırılsın mı?" });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Kaldır' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'RMDB' })).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryAllByRole('button', { name: /^Sessiz Sokak,/ })).toHaveLength(0),
    );
    await expect(bridge.rmdbWork(FIXTURE_HALL_ID, 'w-demo-sessiz-sokak')).rejects.toThrow(
      'CINEMA_RMDB_NOT_FOUND',
    );
  });

  it('logs a watch by hand that only its author removes', async () => {
    mount('member');
    await openWork('Son Vapur');
    fireEvent.click(screen.getByRole('button', { name: 'İzledim' }));
    const form = screen.getByRole('form', { name: 'Günlüğe ekle' });
    fireEvent.click(within(form).getByRole('button', { name: 'Günlüğe ekle' }));
    const diary = screen.getByRole('region', { name: 'Günlük' });
    await waitFor(() => expect(within(diary).getAllByText('Elle')).toHaveLength(1));
    expect(notify).toHaveBeenCalledWith('Günlüğe eklendi.');
    const remove = within(diary).getAllByRole('button', { name: 'Günlükten kaldır' });
    expect(remove).toHaveLength(1);
    fireEvent.click(remove[0]!);
    fireEvent.click(within(diary).getByRole('button', { name: 'Kaldırmayı onayla' }));
    await waitFor(() => expect(within(diary).queryByText('Elle')).toBeNull());
  });

  it('continues where the hall stopped with the remote: open now, then seek', async () => {
    mount('default');
    await openWork('Gecenin Kıyısında');
    fireEvent.click(screen.getByRole('button', { name: 'Devam et · 42:10' }));
    await waitFor(() => expect(sent.some((command) => command.type === 'playback')).toBe(true));
    const steps = sent.filter((command) => command.type !== 'join');
    expect(steps.map((command) => command.type)).toEqual(['queue.add', 'queue.remove', 'playback']);
    expect(steps[0]).toMatchObject({
      type: 'queue.add',
      start: true,
      media: { kind: 'community-media', ref: 'm-3015', title: 'Gecenin Kıyısında', live: false },
    });
    // The fixture service resumes 5 s before where the hall stopped (42:10).
    expect(steps[2]).toEqual({ type: 'playback', playing: true, positionSec: 2525, rate: 1 });
    expect(await screen.findByRole('button', { name: 'Salonda açık' })).toBeTruthy();
  });

  it('only suggests from the start when the host holds the remote', async () => {
    mount('remote');
    await openWork('Gecenin Kıyısında');
    expect(await screen.findByText(/Kumanda ev sahibinde\. .*baştan başlar/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sıraya öner' }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        'Gecenin Kıyısında sıraya önerildi; açılınca baştan başlar.',
      ),
    );
    const add = sent.find((command) => command.type === 'queue.add');
    expect(add).toMatchObject({ media: { ref: 'm-3015' } });
    expect(add && 'start' in add ? add.start : undefined).toBeUndefined();
    expect(sent.some((command) => command.type === 'playback')).toBe(false);
  });

  it('offers the next episode of a finished one', async () => {
    mount('default');
    await openWork('Kayıp Şehir');
    expect(screen.getByRole('button', { name: 'Sonraki bölüm · S2 B1' })).toBeTruthy();
    const episodes = screen.getByRole('region', { name: 'İzlenen bölümler' });
    expect(within(episodes).getByText('1. Sezon')).toBeTruthy();
    expect(within(episodes).getAllByText('Bitti')).toHaveLength(8);
  });

  it('adds a catalog film by hand and opens it in RMDB', async () => {
    mount('default');
    fireEvent.click(within(await hallTabs()).getByRole('tab', { name: 'Filmler' }));
    // Catalog posters read "Yeni Kırmızı Balon …" while they are new.
    fireEvent.click((await screen.findAllByRole('button', { name: /Kırmızı Balon/ }))[0]!);
    fireEvent.click(await screen.findByRole('button', { name: "RMDB'ye ekle" }));
    fireEvent.click(await screen.findByRole('button', { name: "RMDB'de aç" }));
    expect(
      within(await hallTabs())
        .getByRole('tab', { name: 'RMDB' })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(await screen.findByRole('heading', { level: 2, name: 'Kırmızı Balon' })).toBeTruthy();
    expect(screen.getByText('Film · RMDB')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salonda oynat' })).toBeTruthy();
    // A film the hall already watched links to its entry at once.
    fireEvent.click(within(await hallTabs()).getByRole('tab', { name: 'Filmler' }));
    fireEvent.click(screen.getByRole('button', { name: 'Filmler' }));
    fireEvent.click((await screen.findAllByRole('button', { name: /Mavi Saat/ }))[0]!);
    fireEvent.click(await screen.findByRole('button', { name: "RMDB'de aç" }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Mavi Saat' })).toBeTruthy();
  });
});
