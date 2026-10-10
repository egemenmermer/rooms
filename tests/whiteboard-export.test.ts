import { describe, expect, it } from 'vitest';
import { whiteboardSvg } from '../apps/desktop/electron/whiteboard-export';

const note = { id: 'private-element-id', authorId: 'private-user-id', kind: 'text', points: [[20, 30]], text: '<script>alert("x")</script> & friends', color: '#B8CDFF', width: 2 };
describe('safe whiteboard artwork export', () => {
  it('escapes authored text and omits identity and unrelated metadata', () => {
    const output = whiteboardSvg([{ ...note, providerToken: 'private-test-secret' }]);
    expect(output).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; friends');
    for (const forbidden of ['<script>', 'private-element-id', 'private-user-id', 'private-test-secret', 'authorId']) expect(output).not.toContain(forbidden);
  });
  it('rejects executable colors, malformed coordinates and oversized artwork', () => {
    for (const invalid of [{ ...note, color: 'red" onload="alert(1)' }, { ...note, points: [[Infinity, 0]] }, { ...note, points: [[-1, 0]] }, { ...note, points: Array(501).fill([0, 0]) }, { ...note, text: 'x'.repeat(2001) }]) expect(() => whiteboardSvg([invalid])).toThrow();
    expect(() => whiteboardSvg(Array(1001).fill(note))).toThrow();
  });
});
