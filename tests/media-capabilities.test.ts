import { expect, it } from 'vitest';
import { localMediaId } from '../apps/desktop/electron/media-capabilities';
const id = '8328ee97-e4d5-49fb-b493-95abec07b485';
it('resolves exactly the local opaque chooser capability', () => {
  expect(localMediaId(`rooms-media://${id}/video`)).toBe(id);
});
it.each([
  null,
  42,
  `https://${id}/video`,
  `file:///video`,
  `rooms-media://${id}/video?secret=hidden`,
  `rooms-media://${id}/video#fragment`,
  `rooms-media://${id}/other`,
  `rooms-media://${id}/folder/../video`,
  `rooms-media://${id}/%76ideo`,
  `rooms-media://user@${id}/video`,
  `rooms-media://${id}:80/video`,
  'rooms-media://not-a-token/video',
])('rejects alternate authority, path, credential and query scopes (%s)', (value) => {
  expect(() => localMediaId(value)).toThrow('Invalid media selection.');
});
