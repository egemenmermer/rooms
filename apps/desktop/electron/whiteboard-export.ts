import { z } from 'zod';

const element = z.object({
  kind: z.enum(['stroke', 'text', 'rectangle', 'ellipse']),
  points: z.array(z.tuple([z.number().finite().min(0).max(4096), z.number().finite().min(0).max(4096)])).min(1).max(500),
  text: z.string().max(2000).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().finite().min(1).max(24),
});
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

/** Serialize only bounded artwork. No IDs, participants, room metadata or credentials. */
export function whiteboardSvg(input: unknown): string {
  const board = z.array(element).max(1000).parse(input);
  const shapes = board.map(item => item.kind === 'text'
    ? `<text x="${item.points[0][0]}" y="${item.points[0][1]}" fill="${item.color}" font-size="20" font-family="system-ui,sans-serif" xml:space="preserve">${escape(item.text ?? '')}</text>`
    : `<polyline points="${item.points.map(p => p.join(',')).join(' ')}" stroke="${item.color}" stroke-width="${item.width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="620" viewBox="0 0 1000 620"><rect width="1000" height="620" fill="#0b0d11"/>\n${shapes}\n</svg>\n`;
}
