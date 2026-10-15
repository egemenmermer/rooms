import { afterEach, expect, it, vi } from 'vitest';
import type { AudioProcessorOptions } from 'livekit-client';
import { SoundboardMixer } from '../packages/media-providers/src/soundboard';
afterEach(() => vi.unstubAllGlobals());
it('monitors the clip once without connecting microphone input to the output device', async () => {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const input = node(),
    gain = { ...node(), gain: { value: 0 } },
    speaker = node();
  const processed = { stop: vi.fn() };
  const destination = {
    ...node(),
    stream: { getAudioTracks: () => [processed], getTracks: () => [processed] },
  };
  const clip = { ...node(), start: vi.fn(), stop: vi.fn(), onended: null };
  const context = {
    destination: speaker,
    createMediaStreamSource: () => input,
    createMediaStreamDestination: () => destination,
    createBufferSource: () => clip,
    createGain: () => gain,
    resume: async () => {},
  };
  vi.stubGlobal('MediaStream', class {});
  const mixer = new SoundboardMixer();
  await mixer.init({ track: {}, audioContext: context } as unknown as AudioProcessorOptions);
  await mixer.play({ duration: 1 } as AudioBuffer, 0.25, () => true);
  expect(input.connect).toHaveBeenCalledExactlyOnceWith(destination);
  expect(gain.connect).toHaveBeenCalledTimes(2);
  expect(gain.connect).toHaveBeenCalledWith(speaker);
  expect(gain.connect).toHaveBeenCalledWith(destination);
  expect(clip.start).toHaveBeenCalledOnce();
  mixer.stop();
  expect(clip.stop).toHaveBeenCalledOnce();
  expect(gain.disconnect).toHaveBeenCalledOnce();
  await mixer.destroy();
});
