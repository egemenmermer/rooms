/**
 * The player's own ıstaka: two rows of 15 cells, each holding a tile id or nothing. The order is local only
 * (the server keeps an unordered hand); it is kept per round in sessionStorage so a reload keeps the rack.
 */
export const RACK_COLUMNS = 15;
export const RACK_CELLS = RACK_COLUMNS * 2;

export type RackLayout = (string | null)[];

export const emptyLayout = (): RackLayout => Array.from({ length: RACK_CELLS }, () => null);

/**
 * Keep every known tile where the player put it, drop tiles that left the hand and put new tiles (a draw,
 * the deal) into the first empty cell.
 */
export function reconcileLayout(layout: RackLayout | null | undefined, ids: readonly string[]) {
  const wanted = new Set(ids),
    seen = new Set<string>(),
    next = emptyLayout();
  (layout ?? []).slice(0, RACK_CELLS).forEach((id, index) => {
    if (id && wanted.has(id) && !seen.has(id)) {
      next[index] = id;
      seen.add(id);
    }
  });
  for (const id of ids) {
    if (seen.has(id)) continue;
    const free = next.indexOf(null);
    if (free < 0) break;
    next[free] = id;
    seen.add(id);
  }
  return next;
}

/**
 * Move a tile to a cell. An empty target takes the tile; an occupied one makes room by pushing its
 * neighbours toward the nearest empty cell in the same row (like sliding tiles on a real rack), and swaps
 * when that row is full.
 */
export function moveTile(layout: RackLayout, id: string, to: number): RackLayout {
  const from = layout.indexOf(id);
  if (from < 0 || to < 0 || to >= RACK_CELLS || from === to) return layout;
  const next = [...layout];
  next[from] = null;
  if (next[to] === null) {
    next[to] = id;
    return next;
  }
  const rowStart = to - (to % RACK_COLUMNS),
    rowEnd = rowStart + RACK_COLUMNS;
  for (let cell = to + 1; cell < rowEnd; cell++)
    if (next[cell] === null) {
      for (let shift = cell; shift > to; shift--) next[shift] = next[shift - 1];
      next[to] = id;
      return next;
    }
  for (let cell = to - 1; cell >= rowStart; cell--)
    if (next[cell] === null) {
      for (let shift = cell; shift < to; shift++) next[shift] = next[shift + 1];
      next[to] = id;
      return next;
    }
  next[from] = next[to];
  next[to] = id;
  return next;
}

/**
 * Lay blocks (sets, pairs) left to right with one empty cell between them, never splitting a block across
 * the two rows, then the leftover tiles after one more gap. Falls back to packing without gaps when the
 * gaps would not fit.
 */
export function layoutFromBlocks(blocks: readonly string[][], rest: readonly string[]): RackLayout {
  const next = emptyLayout();
  let cursor = 0;
  const place = (ids: readonly string[]) => {
    const column = cursor % RACK_COLUMNS;
    if (column + ids.length > RACK_COLUMNS && ids.length <= RACK_COLUMNS && column > 0)
      cursor += RACK_COLUMNS - column;
    if (cursor + ids.length > RACK_CELLS) return false;
    ids.forEach((id, offset) => (next[cursor + offset] = id));
    cursor += ids.length + 1;
    return true;
  };
  const fits = blocks.filter((block) => block.length).every(place);
  if (fits) {
    // Leftovers may wrap freely; they fill the cells after the last gap.
    let index = Math.min(cursor, RACK_CELLS);
    const remaining = [...rest];
    while (remaining.length && index < RACK_CELLS) {
      if (next[index] === null) next[index] = remaining.shift()!;
      index++;
    }
    if (!remaining.length) return next;
  }
  return reconcileLayout(null, [...blocks.flat(), ...rest]);
}

export function loadLayout(key: string): RackLayout | null {
  try {
    const raw = sessionStorage.getItem(key);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(value) && value.every((item) => item === null || typeof item === 'string')
      ? (value as RackLayout)
      : null;
  } catch {
    return null;
  }
}

export function saveLayout(key: string, layout: RackLayout) {
  try {
    sessionStorage.setItem(key, JSON.stringify(layout));
  } catch {
    // Private windows and blocked storage: the rack still works for this session.
  }
}
