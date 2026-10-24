import { locale, t } from '../../i18n';
import { chipsFor } from './model';

/**
 * Virtual chips drawn as coloured discs (one colour per denomination), stacked by value.
 * `compact`: three discs at most, no amount (next to a seat's stack count).
 */
export function ChipStack({
  amount,
  className = '',
  label = false,
  compact = false,
}: {
  amount: number;
  className?: string;
  /** Print the amount under the stack (bets and pushed pots). */
  label?: boolean;
  compact?: boolean;
}) {
  const discs = chipsFor(amount, compact ? 3 : 10);
  if (!discs.length) return null;
  // Same denominations share a column, as a dealer would stack them.
  const columns: number[][] = [];
  for (const value of discs) {
    const column = columns.find((items) => items[0] === value);
    if (column) column.push(value);
    else columns.push([value]);
  }
  return (
    <span
      className={`ho-chips${compact ? ' compact' : ''} ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label ? t('{amount} fiş', { amount: amount.toLocaleString(locale) }) : undefined}
      aria-hidden={label ? undefined : true}
    >
      <span className="ho-chip-columns">
        {columns.slice(0, compact ? 1 : 4).map((column) => (
          <span className="ho-chip-column" key={column[0]}>
            {column.map((value, index) => (
              <i className={`ho-chip v${value}`} key={index} />
            ))}
          </span>
        ))}
      </span>
      {label && <b>{amount.toLocaleString(locale)}</b>}
    </span>
  );
}
