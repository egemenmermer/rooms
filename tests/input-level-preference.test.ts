// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  INPUT_LEVEL_DEVICES,
  normalizeInputLevels,
  useRooms,
  withInputLevel,
} from '../apps/desktop/src/store';
const original = useRooms.getState().preferences;
afterEach(() => {
  useRooms.setState({ preferences: original });
  localStorage.clear();
});
describe('microphone level per device', () => {
  it('keeps one bounded level per named device', () => {
    expect(normalizeInputLevels({ Headset: 50, Laptop: 250, Broken: 'x', '': 10 })).toEqual({
      Headset: 50,
      Laptop: 200,
    });
    expect(normalizeInputLevels(['Headset'])).toEqual({});
    const many = Object.fromEntries(
      Array.from({ length: INPUT_LEVEL_DEVICES + 5 }, (_, i) => [`Mic ${i}`, i]),
    );
    const kept = normalizeInputLevels(many);
    expect(Object.keys(kept)).toHaveLength(INPUT_LEVEL_DEVICES);
    expect(kept[`Mic ${INPUT_LEVEL_DEVICES + 4}`]).toBe(INPUT_LEVEL_DEVICES + 4);
    expect(kept['Mic 0']).toBeUndefined();
  });
  it('moves an updated device to the newest end', () => {
    expect(Object.keys(withInputLevel({ A: 20, B: 50 }, 'A', 30))).toEqual(['B', 'A']);
    expect(withInputLevel({}, 'MacBook Pro Microphone', 20.4)).toEqual({
      'MacBook Pro Microphone': 20,
    });
  });
  it('survives a restart', async () => {
    useRooms.getState().setPreference('inputLevels', { Headset: 50, Laptop: 20 });
    const saved = localStorage.getItem('rooms-local-v1')!;
    useRooms.getState().setPreference('inputLevels', {});
    localStorage.setItem('rooms-local-v1', saved);
    await useRooms.persist.rehydrate();
    expect(useRooms.getState().preferences.inputLevels).toEqual({ Headset: 50, Laptop: 20 });
  });
});
