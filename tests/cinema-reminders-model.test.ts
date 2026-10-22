// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

it('keeps the community of a reminder and drops a stale request to open another hall', async () => {
  const model = await import('../apps/desktop/src/cinema/reminders');
  model.toggleReminder({
    hallId: 'hall-a',
    communityId: 'space-a',
    ref: 'l-1',
    channel: 'TRT 1',
    title: 'Haberler',
    start: Date.now() + 60_000,
  });
  vi.resetModules();
  const reloaded = await import('../apps/desktop/src/cinema/reminders');
  expect(reloaded.reminders()[0]?.communityId).toBe('space-a');
  vi.useFakeTimers();
  try {
    reloaded.requestHallOpen('hall-a', 'l-1');
    // Another hall may show for a moment while the community switches; the request waits.
    expect(reloaded.takeHallOpen('hall-b')).toBeNull();
    expect(reloaded.takeHallOpen('hall-a')).toBe('l-1');
    // One that no hall takes in time does not fire later by surprise.
    reloaded.requestHallOpen('hall-a', 'l-1');
    vi.advanceTimersByTime(31_000);
    expect(reloaded.takeHallOpen('hall-a')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
