import { t } from '../../i18n';
import { ScoreHistory } from '../card-history/CardHistory';
import type { GameHistoryEntry } from '../registry';
import { array, type Tile } from '../shared/model';
import type { PenaltyEntry } from './moves';
import { endingLine, PenaltyList, type Okey101Ending } from './OkeyRoundSummary';
import { OkeyTileView } from './OkeyTile';

export function OkeyHistory({ entry }: { entry: GameHistoryEntry }) {
  const result = entry.result;
  const nameOf = (seat: number) =>
    entry.seats?.find((item) => item.position === seat)?.name ??
    t('Koltuk {number}', { number: seat + 1 });
  const winner = typeof result.winner === 'number' ? result.winner : null,
    ending = (result.ending as Okey101Ending | null | undefined) ?? null,
    log = array<PenaltyEntry>(result.penaltyLog);
  return (
    <ScoreHistory
      entry={entry}
      header={
        <>
          {(!!ending || winner === null) && (
            <p className="o1-history-ending">
              {endingLine(winner, ending, nameOf)}
              {ending && ending.multiplier > 1
                ? ` · ${t('Cezalar ×{multiplier}', { multiplier: ending.multiplier })}`
                : ''}
            </p>
          )}
          {!!result.lastDiscard && (
            <div className="rh-last-discard">
              <span>{t('Son atılan taş')}</span>
              <OkeyTileView tile={result.lastDiscard as Tile} small />
            </div>
          )}
          <PenaltyList log={log} nameOf={nameOf} />
        </>
      }
      seatSuffix={(position) =>
        typeof result.winner === 'number' && result.winner === position ? t(' · Bitirdi') : ''
      }
      note={t('İlk açılış puanı ve son işlenen taş bu kayıtta bulunmuyor.')}
    />
  );
}
