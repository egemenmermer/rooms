import { t } from '../../i18n';
import { tileColors, type Tile } from '../shared/model';

export function OkeyTileView({
  tile,
  selected,
  onClick,
  disabled,
  small = false,
}: {
  tile: Tile;
  selected?: boolean;
  onClick?(): void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className={`rx-tile ${tile.color} ${selected ? 'selected' : ''} ${small ? 'small' : ''}`}
      disabled={disabled || !onClick}
      onClick={onClick}
      aria-pressed={onClick ? !!selected : undefined}
      aria-label={
        tile.joker ? t('Okey taşı') : `${tileColors[tile.color] ?? tile.color} ${tile.value}`
      }
    >
      <strong>{tile.joker ? '★' : tile.value}</strong>
      <span>•</span>
    </button>
  );
}
