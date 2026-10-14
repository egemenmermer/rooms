import { openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { extname } from 'node:path';

/** Explicitly selected sidecars only. No path or filesystem capability crosses IPC. */
export function readCaptionFile(path: string): string {
  if (extname(path).toLowerCase() !== '.vtt')
    throw new Error('Choose a WebVTT (.vtt) subtitle file.');
  const descriptor = openSync(path, 'r');
  let bytes: Buffer;
  try {
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.size > 2_000_000)
      throw new Error('The subtitle file must be smaller than 2 MB.');
    const buffer = Buffer.alloc(2_000_001);
    let count = 0,
      read = 0;
    while (
      count < buffer.length &&
      (read = readSync(descriptor, buffer, count, buffer.length - count, null)) > 0
    )
      count += read;
    if (count > 2_000_000) throw new Error('The subtitle file must be smaller than 2 MB.');
    bytes = buffer.subarray(0, count);
  } finally {
    closeSync(descriptor);
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  if (!/^WEBVTT(?:[ \t][^\r\n]*)?(?:\r?\n|$)/.test(text) || text.includes('\0'))
    throw new Error('The subtitle file is not valid UTF-8 WebVTT.');
  return text;
}
