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
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
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

const SRT_TIMING =
  /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})[ \t]*-->[ \t]*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

const srtSeconds = (h: string, m: string, s: string, ms: string) =>
  Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;

/** Reads SubRip cues; numbering lines are optional, as many hand-made files leave them out. */
export function parseSrt(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const at = lines.findIndex((line) => SRT_TIMING.test(line.trim()));
    if (at < 0) continue;
    const t = SRT_TIMING.exec(lines[at]!.trim())!;
    const start = srtSeconds(t[1]!, t[2]!, t[3]!, t[4]!);
    const end = srtSeconds(t[5]!, t[6]!, t[7]!, t[8]!);
    const body = lines
      .slice(at + 1)
      .join('\n')
      .trim();
    if (!body || !(end > start)) continue;
    cues.push({ start, end, text: body });
    if (cues.length >= MAX_CUES) break;
  }
  return cues.sort((a, b) => a.start - b.start);
}

const ASS_TIME = /^(\d+):(\d{2}):(\d{2})[.:](\d{1,3})$/;

function assSeconds(value: string) {
  const t = ASS_TIME.exec(value.trim());
  return t ? srtSeconds(t[1]!, t[2]!, t[3]!, t[4]!.padEnd(2, '0').padEnd(3, '0')) : NaN;
}

/** Reads ASS/SSA dialogue lines; override tags are dropped, `\N` becomes a line break. */
export function parseAss(text: string): SubtitleCue[] {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  let fields: string[] = [];
  let events = false;
  const cues: SubtitleCue[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[.+\]$/.test(line)) {
      events = line.toLowerCase() === '[events]';
      continue;
    }
    if (!events) continue;
    if (/^format:/i.test(line)) {
      fields = line
        .slice(7)
        .split(',')
        .map((field) => field.trim().toLowerCase());
      continue;
    }
    if (!/^dialogue:/i.test(line) || !fields.length) continue;
    const parts = line.slice(9).split(',');
    // Text is the last field and may itself contain commas.
    const values = [...parts.slice(0, fields.length - 1), parts.slice(fields.length - 1).join(',')];
    const field = (name: string) => values[fields.indexOf(name)] ?? '';
    const start = assSeconds(field('start'));
    const end = assSeconds(field('end'));
    const body = field('text')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\N/gi, '\n')
      .replace(/\\h/g, ' ')
      .trim();
    if (!body || !(end > start)) continue;
    cues.push({ start, end, text: body });
    if (cues.length >= MAX_CUES) break;
  }
  return cues.sort((a, b) => a.start - b.start);
}

/** Cues of a WebVTT, SubRip or ASS/SSA document, whichever it is. */
export function subtitleCues(text: string): SubtitleCue[] {
  const head = text.replace(/^﻿/, '').trimStart();
  if (head.startsWith('WEBVTT')) return parseVtt(text);
  if (/^\[script info\]/i.test(head) || /^\[v4\+? styles\]/i.test(head)) return parseAss(text);
  return parseSrt(text);
}

/**
 * Text of a subtitle file: UTF-8 when it decodes cleanly, otherwise Windows-1254, the
 * encoding older Turkish subtitles were made in (it agrees with Latin-1 for most letters).
 */
export function decodeSubtitle(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1254').decode(bytes);
  }
}
