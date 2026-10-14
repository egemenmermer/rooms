// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  CinemaSourceCheck,
  cinemaSourceReadiness,
  type CinemaSourceReadiness,
} from '../apps/desktop/src/CinemaSourceCheck';
import {
  cinemaFixtureRoom,
  cinemaFixtureVariant,
  createCinemaFixtureActivity,
} from '../apps/desktop/src/dev/cinema-fixture';
import type { ActivityCommand } from '@rooms/activity-protocol';

const ready: CinemaSourceReadiness = {
  duration: 6120,
  expectedDuration: 6120,
  mediaReady: true,
  buffering: false,
  error: '',
  confirmed: true,
  connected: true,
  busy: false,
};
afterEach(cleanup);
describe('Cinema local source readiness boundary', () => {
  it('permits joining only after source metadata, explicit confirmation and connection', () => {
    expect(cinemaSourceReadiness(ready).canJoin).toBe(true);
    for (const change of [
      { duration: NaN },
      { duration: Infinity },
      { duration: 0 },
      { expectedDuration: NaN },
      { expectedDuration: Infinity },
      { mediaReady: false },
      { buffering: true },
      { error: 'Codec unavailable' },
      { confirmed: false },
      { connected: false },
      { busy: true },
    ])
      expect(cinemaSourceReadiness({ ...ready, ...change }).canJoin).toBe(false);
  });
  it('blocks a mismatched duration and allows the first declared source', () => {
    expect(cinemaSourceReadiness({ ...ready, duration: 5892 }).mismatch).toBe(true);
    expect(cinemaSourceReadiness({ ...ready, duration: 6122 }).canJoin).toBe(true);
    expect(cinemaSourceReadiness({ ...ready, duration: 6122.01 }).canJoin).toBe(false);
    expect(cinemaSourceReadiness({ ...ready, expectedDuration: null }).canJoin).toBe(true);
  });
  it('reports late-join position and calls the join action only when ready', () => {
    const join = vi.fn();
    render(
      <CinemaSourceCheck
        title="Owned title"
        sourceName="Owned file"
        position={2068}
        readiness={ready}
        nativeAvailable
        onChoose={vi.fn()}
        onConfirm={vi.fn()}
        onJoin={join}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '34:28 konumundan katıl' }));
    expect(join).toHaveBeenCalledOnce();
    expect(screen.queryByText(/rooms-media:/)).toBeNull();
  });
  it('shows source failure with a real replacement control and prevents joining', () => {
    const choose = vi.fn(),
      join = vi.fn();
    render(
      <CinemaSourceCheck
        title="Owned title"
        sourceName="Owned file"
        position={0}
        readiness={{ ...ready, error: 'Codec unavailable' }}
        nativeAvailable
        onChoose={choose}
        onConfirm={vi.fn()}
        onJoin={join}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Codec unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Başka kaynak seç' }));
    expect(choose).toHaveBeenCalledOnce();
    expect(join).not.toHaveBeenCalled();
  });
  it('requires current user confirmation even with a matching source', () => {
    const confirm = vi.fn(),
      join = vi.fn();
    render(
      <CinemaSourceCheck
        title="Owned title"
        sourceName="Owned file"
        position={0}
        readiness={{ ...ready, confirmed: false }}
        nativeAvailable
        onChoose={vi.fn()}
        onConfirm={confirm}
        onJoin={join}
        onClose={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: 'Hazırım, katıl' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(join).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(confirm).toHaveBeenCalledWith(true);
  });
});
describe('Cinema development fixture contract', () => {
  it('accepts exact named variants and responsive defaults; refuses unknown states', () => {
    for (const [id, variants] of Object.entries({
      S24: ['default', 'empty'],
      S25: ['default', 'buffering', 'reconnect', 'source_missing', 'host_left'],
      S26: ['default', 'matching', 'late', 'mismatch', 'error'],
      S27: ['default', 'presenter', 'source_lost'],
      S28: ['default', 'empty', 'keyboard', 'shared'],
    }))
      for (const variant of variants) expect(cinemaFixtureVariant(id, variant)).toBe(variant);
    expect(cinemaFixtureVariant('S25', '900x700')).toBe('default');
    expect(() => cinemaFixtureVariant('S26', 'made_up')).toThrow();
    expect(() => cinemaFixtureVariant('S29', 'default')).toThrow();
  });
  it('contains only content identities and readiness hints in the public room', () => {
    const room = cinemaFixtureRoom('S25', 'default');
    const serialized = JSON.stringify(room);
    expect(serialized).not.toMatch(
      /rooms-fixture:|rooms-media:|https:\/\/|file:\/\/|token|password|\/Users\//,
    );
    expect(room.primary?.activity).toBe('cinema');
    expect(room.cinema?.sources.every((source) => source.userId !== 'demo-deniz')).toBe(true);
  });
  it('uses isolated queue commands, preserves the selected item, and rejects stale revisions', async () => {
    const adapter = createCinemaFixtureActivity(cinemaFixtureRoom('S28', 'default'));
    const send = async (command: ActivityCommand) => {
      const state = await adapter.snapshot('demo-channel-salon');
      return adapter.command('demo-channel-salon', {
        protocolVersion: 1,
        commandId: crypto.randomUUID(),
        expectedRevision: state.room.revision,
        command,
      });
    };
    await expect(send({ type: 'queue.remove', itemId: 'demo-cinema-1' })).rejects.toThrow(
      'current item',
    );
    await expect(
      send({ type: 'queue.reorder', itemIds: ['demo-cinema-2', 'demo-cinema-1', 'demo-cinema-3'] }),
    ).rejects.toThrow('current item');
    const reordered = await send({
      type: 'queue.reorder',
      itemIds: ['demo-cinema-1', 'demo-cinema-3', 'demo-cinema-2'],
    });
    expect(reordered.room.queue.map((item) => item.id)).toEqual([
      'demo-cinema-1',
      'demo-cinema-3',
      'demo-cinema-2',
    ]);
    const added = await send({
      type: 'queue.add',
      itemId: 'owned-title',
      media: { kind: 'independent-source', referenceId: 'owned-reference', title: 'Owned media' },
    });
    expect(added.room.queue.at(-1)?.media.title).toBe('Owned media');
    await expect(
      adapter.command('demo-channel-salon', {
        protocolVersion: 1,
        commandId: crypto.randomUUID(),
        expectedRevision: 1,
        command: { type: 'join' },
      }),
    ).rejects.toThrow('revision');
  });
  it('requires source declaration before readiness and playback', async () => {
    const adapter = createCinemaFixtureActivity(cinemaFixtureRoom('S26', 'default'));
    const send = async (command: ActivityCommand) => {
      const state = await adapter.snapshot('demo-channel-salon');
      return adapter.command('demo-channel-salon', {
        protocolVersion: 1,
        commandId: crypto.randomUUID(),
        expectedRevision: state.room.revision,
        command,
      });
    };
    const common = {
      itemId: 'demo-cinema-1',
      timelineEpoch: 1,
      sourceVersion: '00000000-0000-4000-8000-000000000025',
    };
    await expect(send({ type: 'cinema.ready', ...common, ready: true })).rejects.toThrow('Declare');
    await send({
      type: 'cinema.source',
      ...common,
      referenceId: 'demo-film-1',
      expectedSourceVersion: null,
      durationSec: 6120,
    });
    await send({ type: 'cinema.ready', ...common, ready: true });
    const played = await send({
      type: 'cinema.playback',
      ...common,
      playing: true,
      positionSec: 2068,
      rate: 1,
    });
    expect(played.room.timeline.positionSec).toBe(2068);
    expect(played.room.timeline.playing).toBe(true);
  });
});
