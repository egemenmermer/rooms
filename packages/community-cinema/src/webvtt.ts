/** One subtitle cue; times are seconds. */
export type SubtitleCue = { start: number; end: number; text: string };

const TIMING = /^((?:\d+:)?\d{2}:\d{2}\.\d{3})[ \t]+-->[ \t]+((?:\d+:)?\d{2}:\d{2}\.\d{3})/;
const MAX_CUES = 20_000;

function seconds(stamp: string) {
  const parts = stamp.split(':').map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function stamp(value: number) {
  const ms = Math.max(0, Math.round(value * 1000));
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(
    Math.floor(ms / 1000) % 60,
  )}.${pad(ms % 1000, 3)}`;
}

/**
 * Reads the cues of a WebVTT document. With `complete`, a final line the writer may
 * still be appending to is left out. ffmpeg ends every cue with a single newline and
 * starts the next one with the blank line, so a newline-terminated last cue is whole.
 */
export function parseVtt(text: string, options: { complete?: boolean } = {}): SubtitleCue[] {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!/^WEBVTT(?:[ \t][^\n]*)?(?:\n|$)/.test(normalized)) return [];
  const whole = options.complete
    ? normalized.slice(0, normalized.lastIndexOf('\n') + 1)
    : normalized;
  const blocks = whole.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const at = lines.findIndex((line) => line.includes('-->'));
    const timing = at < 0 ? null : TIMING.exec(lines[at]!.trim());
    if (!timing) continue;
    const start = seconds(timing[1]!);
    const end = seconds(timing[2]!);
    const body = lines
      .slice(at + 1)
      .join('\n')
      .trim();
    if (!body || !(end > start)) continue;
    cues.push({ start, end, text: body });
    if (cues.length >= MAX_CUES) break;
  }
  return cues;
}

/** Writes cues as WebVTT, one block per cue. Cue text must not contain blank lines. */
export function formatVtt(cues: SubtitleCue[]) {
  return `WEBVTT\n\n${cues
    .map(
      (cue) =>
        `${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text.replace(/\n{2,}/g, '\n')}\n\n`,
    )
    .join('')}`;
}

/** Display text of a cue: tags and timestamps removed, the usual entities decoded. */
export function cueText(text: string) {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lrm;|&rlm;/g, '')
    .replace(/&amp;/g, '&')
    .trim();
}
