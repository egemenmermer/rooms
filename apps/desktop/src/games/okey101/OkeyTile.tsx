import { t } from '../../i18n';
import { tileColors, type Tile } from '../shared/model';

export type TileFace = { color: string; value: number };

/** The okey of a round: the tile one above the gösterge, in the gösterge's colour (13 → 1). */
export const okeyFace = (indicator: TileFace): TileFace => ({
  color: indicator.color,
  value: (indicator.value % 13) + 1,
});

/**
 * A sahte okey: both real tiles with the okey's face are the okeys, so a non-okey tile with that face can
 * only be one of the two sahte okeys. (Classic Okey sends `fake` itself.)
 */
export const isFakeOkey = (tile: Tile & { fake?: boolean }, okey: TileFace | null) =>
  !!tile.fake || (!!okey && !tile.joker && tile.color === okey.color && tile.value === okey.value);

export const faceName = (face: TileFace) => `${tileColors[face.color] ?? face.color} ${face.value}`;

/** Screen-reader name of a tile, with the okey and the sahte okey named like on the table. */
export function tileLabel(tile: Tile, okey: TileFace | null, fake = isFakeOkey(tile, okey)) {
  if (fake) return t('Sahte okey · {face}', { face: faceName(okey ?? tile) });
  if (tile.joker) return t('Okey · {face}', { face: faceName(tile) });
  return faceName(tile);
}

/**
 * One okey tile as in the physical set. A plain tile shows its number; the real okey (`joker`) keeps its
 * face (`face` when the tile data carries the value it stands for) with a small okey mark; the sahte okey
 * (`fake`) is the ★ tile. `label` overrides the screen-reader name.
 */
export function OkeyTileView({
  tile,
  selected,
  onClick,
  onDoubleClick,
  disabled,
  small = false,
  fake,
  face,
  label,
  highlight,
  still,
}: {
  tile: Tile & { fake?: boolean };
  selected?: boolean;
  onClick?(): void;
  onDoubleClick?(): void;
  disabled?: boolean;
  small?: boolean;
  fake?: boolean;
  face?: TileFace;
  label?: string;
  highlight?: boolean;
  /** Render as a non-interactive span (inside another control, e.g. a table meld button). */
  still?: boolean;
}) {
  const sahte = fake ?? !!tile.fake,
    shown = face ?? tile;
  const name =
    label ??
    (sahte
      ? t('Sahte okey · {face}', { face: faceName(shown) })
      : tile.joker
        ? t('Okey · {face}', { face: faceName(shown) })
        : faceName(tile));
  const className = `rx-tile ${sahte ? 'o1-fake' : shown.color} ${tile.joker && !sahte ? 'o1-okey' : ''} ${selected ? 'selected' : ''} ${small ? 'small' : ''} ${highlight ? 'o1-highlight' : ''}`;
  const content = (
    <>
      <strong>{sahte ? '★' : shown.value}</strong>
      <span>•</span>
      {tile.joker && !sahte && <i className="o1-okey-mark" aria-hidden="true" />}
    </>
  );
  if (still)
    return (
      <span className={className} role="img" aria-label={name} title={name}>
        {content}
      </span>
    );
  return (
    <button
      type="button"
      className={className}
      disabled={disabled || !onClick}
      onClick={onClick}
      onDoubleClick={disabled ? undefined : onDoubleClick}
      aria-pressed={onClick ? !!selected : undefined}
      aria-label={name}
      title={sahte || tile.joker ? name : undefined}
    >
      {content}
    </button>
  );
}

/** A face-down tile (an opponent's rack, the middle stack). */
export function TileBack({ small }: { small?: boolean }) {
  return <span className={`o1-back ${small ? 'small' : ''}`} aria-hidden="true" />;
}
