import { t } from '../../i18n';
import { ScoreHistory } from '../card-history/CardHistory';
import type { GameHistoryEntry } from '../registry';
import type { Tile } from '../shared/model';
import { OkeyTileView } from './OkeyTile';

export function OkeyHistory({ entry }: { entry: GameHistoryEntry }) {
  const result = entry.result;
  return (
    <ScoreHistory
      entry={entry}
      header={
        !!result.lastDiscard && (
          <div className="rh-last-discard">
            <span>{t('Son atılan taş')}</span>
            <OkeyTileView tile={result.lastDiscard as Tile} small />
          </div>
        )
      }
      seatSuffix={(position) =>
        typeof result.winner === 'number' && result.winner === position ? t(' · Bitirdi') : ''
      }
      note={t('İlk açılış puanı ve son işlenen taş bu kayıtta bulunmuyor.')}
    />
  );
}
