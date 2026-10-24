import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The table's docked bottom region (`shared/TableShell.tsx`). The shell lays the page out as
 * header → table area (flex: 1, the felt shrinks) → dock (always on screen), and puts the dock's
 * element in this context.
 */
export const TableDockContext = createContext<HTMLElement | null>(null);

/**
 * Renders the player's own controls (hand, rack, action bar, turn status) in the shell's dock so
 * they never scroll below the fold. Use it anywhere inside a game's `Table`; state and handlers
 * stay in the table component, only the DOM moves (a portal, so React context and events behave
 * as if the children were rendered in place). Outside the shell (tests, a table rendered by the
 * lobby) or before the dock element exists, the children render in place.
 *
 * ```tsx
 * <TableDock label={t('Elin')}>
 *   <p role="status">{status}</p>
 *   <div className="xx-actions">…</div>
 * </TableDock>
 * ```
 * Size the table area's content to its container (`height: 100%`, `minmax(0, 1fr)` rows for the
 * felt) so nothing else scrolls.
 */
export function TableDock({
  label,
  className,
  children,
}: {
  /** Accessible name of the docked region, e.g. "Elin" or "Hamle". */
  label?: string;
  /** Extra class on the docked wrapper for game-specific layout (`xx-dock`). */
  className?: string;
  children: ReactNode;
}) {
  const target = useContext(TableDockContext);
  const body = (
    <section className={`rx-dock-body${className ? ` ${className}` : ''}`} aria-label={label}>
      {children}
    </section>
  );
  return target ? createPortal(body, target) : body;
}
