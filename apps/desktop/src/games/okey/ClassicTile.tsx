import type { ClassicTile } from '../../../../../packages/games/src/okey-classic';
import { t } from '../../i18n';
import { OkeyTileView } from '../okey101/OkeyTile';
import { tileColors } from '../shared/model';
import type { OkeyFace } from './auto-arrange';

const faceName = (face: OkeyFace) => `${tileColors[face.color] ?? face.color} ${face.value}`;

/** Screen-reader name of a classic Okey tile (the okey is named with its face, like on the table). */
export function tileLabel(tile: ClassicTile, okey: OkeyFace) {
  if (tile.fake) return t('Sahte okey · {face}', { face: faceName(okey) });
  if (tile.joker) return t('Okey · {face}', { face: faceName(tile) });
  return faceName(tile);
}

/**
 * One tile in the classic set. Plain tiles use the 101 tile; the real okey keeps its own face with a small
 * okey mark, and the sahte okey is the ★ tile of the physical set, standing for the okey's face.
 */
export function ClassicTileView({
  tile,
  okey,
  selected,
  small,
  disabled,
  onClick,
  onDoubleClick,
}: {
  tile: ClassicTile;
  okey: OkeyFace;
  selected?: boolean;
  small?: boolean;
  disabled?: boolean;
  onClick?(): void;
  onDoubleClick?(): void;
}) {
  if (!tile.joker && !tile.fake)
    return (
      <span className="ok-tile" onDoubleClick={disabled ? undefined : onDoubleClick}>
        <OkeyTileView
          tile={tile}
          selected={selected}
          small={small}
          disabled={disabled}
          onClick={onClick}
        />
      </span>
    );
  const label = tileLabel(tile, okey);
  return (
    <span className="ok-tile" onDoubleClick={disabled ? undefined : onDoubleClick}>
      <button
        type="button"
        className={`rx-tile ${tile.fake ? 'ok-fake' : `${tile.color} ok-okey`} ${selected ? 'selected' : ''} ${small ? 'small' : ''}`}
        disabled={disabled || !onClick}
        onClick={onClick}
        aria-pressed={onClick ? !!selected : undefined}
        aria-label={label}
        title={label}
      >
        <strong>{tile.fake ? '★' : tile.value}</strong>
        <span>•</span>
        {tile.joker && <i className="ok-okey-mark" aria-hidden="true" />}
      </button>
    </span>
  );
}

/** A face-down tile (an opponent's rack, the middle stack). */
export function TileBack({ small }: { small?: boolean }) {
  return <span className={`ok-back ${small ? 'small' : ''}`} aria-hidden="true" />;
}
