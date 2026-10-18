import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCaptionFile, readSubtitleFile } from '../apps/desktop/electron/caption-file';
import { parseVtt } from '../packages/community-cinema/src/webvtt';

function file(bytes: string | Uint8Array, name = 'owned.vtt') {
  const dir = mkdtempSync(join(tmpdir(), 'rooms-captions-'));
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return { path, remove: () => rmSync(dir, { recursive: true, force: true }) };
}
describe('explicit private WebVTT sidecars', () => {
  it('accepts a UTF-8 sidecar and strips the BOM', () => {
    const selected = file('\uFEFFWEBVTT\n\n00:00.000 --> 00:01.000\nOwned caption\n');
    try {
      expect(readCaptionFile(selected.path)).toBe(
        'WEBVTT\n\n00:00.000 --> 00:01.000\nOwned caption\n',
      );
    } finally {
      selected.remove();
    }
  });
  it.each(['not a WebVTT file', 'WEBVTTbad\n', 'WEBVTT\n\0'])(
    'rejects malformed headers/control bytes',
    (text) => {
      const selected = file(text);
      try {
        expect(() => readCaptionFile(selected.path)).toThrow();
      } finally {
        selected.remove();
      }
    },
  );
  it('rejects invalid UTF-8 and files above the bound', () => {
    for (const bytes of [new Uint8Array([255]), new Uint8Array(2_000_001)]) {
      const selected = file(bytes);
      try {
        expect(() => readCaptionFile(selected.path)).toThrow();
      } finally {
        selected.remove();
      }
    }
  });
  it('rejects non-WebVTT extensions even with a valid header', () => {
    const selected = file('WEBVTT\n', 'owned.txt');
    try {
      expect(() => readCaptionFile(selected.path)).toThrow();
    } finally {
      selected.remove();
    }
  });
});

describe('subtitle files a viewer picks for the hall', () => {
  it('reads a Windows-1254 SubRip file as WebVTT', () => {
    const legacy = Buffer.concat([
      Buffer.from('1\r\n00:00:01,000 --> 00:00:02,500\r\n'),
      // "Şimdi değil" in Windows-1254.
      Buffer.from([0xde, 0x69, 0x6d, 0x64, 0x69, 0x20, 0x64, 0x65, 0xf0, 0x69, 0x6c, 0x0d, 0x0a]),
    ]);
    const selected = file(legacy, 'film.tr.srt');
    try {
      expect(parseVtt(readSubtitleFile(selected.path))).toEqual([
        { start: 1, end: 2.5, text: 'Şimdi değil' },
      ]);
    } finally {
      selected.remove();
    }
  });
  it('reads ASS dialogue and keeps WebVTT', () => {
    const ass = file(
      '[Script Info]\n\n[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:03.00,0:00:04.00,Default,{\\i1}evet\n',
      'film.ass',
    );
    const vtt = file('WEBVTT\n\n00:05.000 --> 00:06.000\nvtt\n', 'film.vtt');
    try {
      expect(parseVtt(readSubtitleFile(ass.path))).toEqual([{ start: 3, end: 4, text: 'evet' }]);
      expect(parseVtt(readSubtitleFile(vtt.path))[0]?.text).toBe('vtt');
    } finally {
      ass.remove();
      vtt.remove();
    }
  });
  it('rejects other extensions, files without cues and control bytes', () => {
    for (const [content, name] of [
      ['1\n00:00:01,000 --> 00:00:02,000\nx\n', 'film.txt'],
      ['just some words', 'film.srt'],
      ['1\n00:00:01,000 --> 00:00:02,000\nx\0\n', 'film.srt'],
    ] as const) {
      const selected = file(content, name);
      try {
        expect(() => readSubtitleFile(selected.path)).toThrow();
      } finally {
        selected.remove();
      }
    }
  });
});
