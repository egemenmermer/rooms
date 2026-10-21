import { afterEach, expect, it, vi } from 'vitest';
import type { AudioProcessorOptions } from 'livekit-client';
import { SoundboardMixer } from '../packages/media-providers/src/soundboard';
afterEach(() => vi.unstubAllGlobals());
it('monitors the clip once without connecting microphone input to the output device', async () => {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const input = node(),
    level = { ...node(), gain: { value: 0, setTargetAtTime: vi.fn() } },
    gain = { ...node(), gain: { value: 0 } },
    speaker = node();
  const processed = { stop: vi.fn() };
  const destination = {
    ...node(),
    stream: { getAudioTracks: () => [processed], getTracks: () => [processed] },
  };
  const clip = { ...node(), start: vi.fn(), stop: vi.fn(), onended: null };
  const gains = [level, gain];
  const context = {
    destination: speaker,
    currentTime: 0,
    createMediaStreamSource: () => input,
    createMediaStreamDestination: () => destination,
    createBufferSource: () => clip,
    createGain: () => gains.shift(),
    resume: async () => {},
  };
  vi.stubGlobal('MediaStream', class {});
  const mixer = new SoundboardMixer();
  await mixer.init({ track: {}, audioContext: context } as unknown as AudioProcessorOptions);
  await mixer.play({ duration: 1 } as AudioBuffer, 0.25, () => true);
  // The microphone passes only through its level stage to the room.
  expect(input.connect).toHaveBeenCalledExactlyOnceWith(level);
  expect(level.connect).toHaveBeenCalledExactlyOnceWith(destination);
  expect(gain.connect).toHaveBeenCalledTimes(2);
  expect(gain.connect).toHaveBeenCalledWith(speaker);
  expect(gain.connect).toHaveBeenCalledWith(destination);
  expect(clip.start).toHaveBeenCalledOnce();
  mixer.stop();
  expect(clip.stop).toHaveBeenCalledOnce();
  expect(gain.disconnect).toHaveBeenCalledOnce();
  await mixer.destroy();
});
it('applies the input level before and after the microphone opens', async () => {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const level = { ...node(), gain: { value: 0, setTargetAtTime: vi.fn() } };
  const processed = { stop: vi.fn() };
  const context = {
    currentTime: 3,
    createMediaStreamSource: () => node(),
    createMediaStreamDestination: () => ({
      ...node(),
      stream: { getAudioTracks: () => [processed], getTracks: () => [processed] },
    }),
    createGain: () => level,
  };
  vi.stubGlobal('MediaStream', class {});
  const mixer = new SoundboardMixer();
  mixer.setInputLevel(0.5);
  await mixer.init({ track: {}, audioContext: context } as unknown as AudioProcessorOptions);
  expect(level.gain.value).toBe(0.5);
  mixer.setInputLevel(1.5);
  expect(level.gain.setTargetAtTime).toHaveBeenCalledWith(1.5, 3, 0.02);
  await mixer.destroy();
});
