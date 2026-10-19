import { describe, expect, it } from 'vitest';
import type { RoomSnapshot } from '../packages/activity-protocol/src';
import { liveDrift, liveRate, liveStep } from '../apps/desktop/src/cinema/HallPlayer';
import {
  hallMedia,
  minutesLabel,
  neighbour,
  openNowCommands,
  programmeProgress,
  suggestCommands,
} from '../apps/desktop/src/cinema/hall-model';
import { cinemaErrorCode, cinemaErrorText } from '../apps/desktop/src/cinema/cinema-bridge';

const live = (ref: string, title: string) =>
  ({ kind: 'community-media', ref, title, live: true, art: null }) as const;
function room(queue: RoomSnapshot['queue'], itemId: string | null): RoomSnapshot {
  return {
    roomId: 'hall',
    revision: 4,
    participants: [],
    primary: {
      activity: 'hall',
      title: 'Sinema salonu',
      hostUserId: 'a',
      startedAt: 0,
      state: 'live',
    },
    timeline: {
      itemId,
      epoch: 2,
      positionSec: 0,
      playing: true,
      rate: 1,
      effectiveServerTimeMs: 0,
    },
    queue,
    polls: [],
    whiteboard: [],
  };
}

describe('hall commands', () => {
  it('starts the hall when nothing runs', () => {
    expect(openNowCommands(null, live('l-1', 'TRT 1'), 'x')).toEqual([
      { type: 'start', activity: 'hall', title: 'Sinema salonu' },
      { type: 'queue.add', itemId: 'x', media: live('l-1', 'TRT 1'), start: true },
    ]);
  });

  it('replaces the previous live channel so zapping never fills the queue', () => {
    const current = room([{ id: 'a', addedBy: 'me', media: live('l-1', 'TRT 1') }], 'a');
    expect(openNowCommands(current, live('l-2', 'Show TV'), 'b')).toEqual([
      { type: 'queue.add', itemId: 'b', media: live('l-2', 'Show TV'), start: true },
      { type: 'queue.remove', itemId: 'a' },
    ]);
  });

  it('selects an item already in the queue instead of adding it twice', () => {
    const movie = {
      kind: 'community-media',
      ref: 'm-1',
      title: 'Mavi Saat',
      live: false,
    } as const;
    const current = room(
      [
        { id: 'a', addedBy: 'me', media: movie },
        { id: 'b', addedBy: 'me', media: live('l-2', 'Show TV') },
      ],
      'a',
    );
    expect(openNowCommands(current, live('l-2', 'Show TV'), 'c')).toEqual([
      { type: 'queue.select', itemId: 'b', play: true },
    ]);
    expect(suggestCommands(current, movie, 'd')).toEqual([
      { type: 'queue.add', itemId: 'd', media: movie },
    ]);
  });

  it('builds strict queue media from catalog items', () => {
    expect(
      hallMedia({
        ref: 'm-1',
        kind: 'movie',
        title: '  Mavi Saat  ',
        badges: [],
        categoryId: null,
        number: null,
        art: 'not-hex',
        year: 2025,
        rating: null,
        addedAt: null,
        hasGuide: false,
      }),
    ).toEqual({ kind: 'community-media', ref: 'm-1', title: 'Mavi Saat', live: false, art: null });
  });

  it('wraps zapping around the channel list', () => {
    const list = [{ ref: 'a' }, { ref: 'b' }, { ref: 'c' }];
    expect(neighbour(list, 'c', 1)?.ref).toBe('a');
    expect(neighbour(list, 'a', -1)?.ref).toBe('c');
    expect(neighbour(list, 'zzz', 1)?.ref).toBe('a');
    expect(neighbour([], 'a', 1)).toBeNull();
  });
});

describe('live sync', () => {
  it('measures drift against the relay live edge and corrects gently', () => {
    expect(liveDrift(40, 40)).toBe(0);
    expect(liveDrift(38, 40)).toBe(2);
    expect(liveRate(0.2)).toBe(1);
    expect(liveRate(1.2)).toBe(1.05);
    expect(liveRate(-0.8)).toBe(0.95);
    expect(liveRate(4)).toBeNull();
  });

  it('jumps only to the sync position, never to the start of the relay window', () => {
    // On the target: no jump, normal speed.
    expect(liveStep(40, 40, true)).toEqual({ seekTo: null, rate: 1, behindLive: false });
    // A second behind: catch up by playing slightly faster.
    expect(liveStep(39, 40, true)).toEqual({ seekTo: null, rate: 1.05, behindLive: false });
    // Far behind: one jump to the sync position, and not again until the guard allows it.
    expect(liveStep(30, 40, true)).toEqual({ seekTo: 40, rate: 1, behindLive: true });
    expect(liveStep(30, 40, false)).toEqual({ seekTo: null, rate: 1, behindLive: true });
    // Ahead of the hall, e.g. waiting at the edge when a stalled upstream resumes: never a
    // jump back (that replays the last seconds on every stall), only a slower pace.
    expect(liveStep(44, 40, true)).toEqual({ seekTo: null, rate: 0.95, behindLive: false });
    expect(liveStep(48, 40, true)).toEqual({ seekTo: null, rate: 0.95, behindLive: false });
  });
});

describe('copy', () => {
  it('formats durations and progress', () => {
    expect(minutesLabel(45 * 60_000)).toBe('45 dk');
    expect(minutesLabel(110 * 60_000)).toBe('1 sa 50 dk');
    expect(minutesLabel(120 * 60_000)).toBe('2 sa');
    expect(
      programmeProgress(
        { start: 0, stop: 100, title: '', subTitle: null, description: null, category: null },
        25,
      ),
    ).toBe(0.25);
  });

  it('maps bridge errors to Turkish copy, also when IPC wraps them', () => {
    expect(
      cinemaErrorCode(
        new Error("Error invoking remote method 'rooms:cinema-watch': Error: CINEMA_RELAY_BUSY"),
      ),
    ).toBe('CINEMA_RELAY_BUSY');
    expect(cinemaErrorText(new Error('CINEMA_ACCOUNT_EXPIRED'))).toContain('süresi dolmuş');
    expect(cinemaErrorText(new Error('LIVE_PLAYBACK_FIXED'))).toContain('Canlı yayın');
    expect(cinemaErrorText(new Error('boom'))).toBe('Bir şeyler ters gitti. Yeniden dene.');
  });
});
