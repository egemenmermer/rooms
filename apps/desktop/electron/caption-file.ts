import { openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { extname } from 'node:path';
import {
  decodeSubtitle,
  formatVtt,
  subtitleCues,
} from '../../../packages/community-cinema/src/webvtt';

const MAX_BYTES = 2_000_000;

/** At most 2 MB of a regular file, read through one descriptor. */
function readSmallFile(path: string) {
  const descriptor = openSync(path, 'r');
  try {
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.size > MAX_BYTES)
      throw new Error('The subtitle file must be smaller than 2 MB.');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let count = 0,
      read = 0;
    while (
      count < buffer.length &&
      (read = readSync(descriptor, buffer, count, buffer.length - count, null)) > 0
    )
      count += read;
    if (count > MAX_BYTES) throw new Error('The subtitle file must be smaller than 2 MB.');
    return buffer.subarray(0, count);
  } finally {
    closeSync(descriptor);
  }
}

/** Explicitly selected sidecars only. No path or filesystem capability crosses IPC. */
export function readCaptionFile(path: string): string {
  if (extname(path).toLowerCase() !== '.vtt')
    throw new Error('Choose a WebVTT (.vtt) subtitle file.');
  const bytes = readSmallFile(path);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  if (!/^WEBVTT(?:[ \t][^\r\n]*)?(?:\r?\n|$)/.test(text) || text.includes('\0'))
    throw new Error('The subtitle file is not valid UTF-8 WebVTT.');
  return text;
}

/**
 * A subtitle the viewer picked for the hall: SubRip, ASS/SSA or WebVTT, in UTF-8 or the
 * Windows-1254 most older Turkish files use. Always returned as WebVTT.
 */
export function readSubtitleFile(path: string): string {
  if (!/^\.(srt|vtt|ass|ssa)$/.test(extname(path).toLowerCase()))
    throw new Error('Choose a SubRip (.srt), WebVTT (.vtt) or ASS (.ass) subtitle file.');
  const text = decodeSubtitle(readSmallFile(path));
  const cues = text.includes('\0') ? [] : subtitleCues(text);
  if (!cues.length) throw new Error('No subtitles could be read from this file.');
  return formatVtt(cues);
}
