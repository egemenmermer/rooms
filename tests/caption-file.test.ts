import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCaptionFile } from '../apps/desktop/electron/caption-file';

function file(bytes: string | Uint8Array, name = 'owned.vtt') {
  const dir = mkdtempSync(join(tmpdir(), 'rooms-captions-'));
  const path = join(dir, name); writeFileSync(path, bytes);
  return { path, remove: () => rmSync(dir, { recursive: true, force: true }) };
}
describe('explicit private WebVTT sidecars', () => {
  it('accepts a UTF-8 sidecar and strips the BOM', () => {
    const selected = file('\uFEFFWEBVTT\n\n00:00.000 --> 00:01.000\nOwned caption\n');
    try { expect(readCaptionFile(selected.path)).toBe('WEBVTT\n\n00:00.000 --> 00:01.000\nOwned caption\n'); } finally { selected.remove(); }
  });
  it.each(['not a WebVTT file', 'WEBVTTbad\n', 'WEBVTT\n\0'])('rejects malformed headers/control bytes', text => {
    const selected = file(text);
    try { expect(() => readCaptionFile(selected.path)).toThrow(); } finally { selected.remove(); }
  });
  it('rejects invalid UTF-8 and files above the bound', () => {
    for (const bytes of [new Uint8Array([255]), new Uint8Array(2_000_001)]) {
      const selected = file(bytes);
      try { expect(() => readCaptionFile(selected.path)).toThrow(); } finally { selected.remove(); }
    }
  });
  it('rejects non-WebVTT extensions even with a valid header', () => {
    const selected = file('WEBVTT\n', 'owned.txt');
    try { expect(() => readCaptionFile(selected.path)).toThrow(); } finally { selected.remove(); }
  });
});
