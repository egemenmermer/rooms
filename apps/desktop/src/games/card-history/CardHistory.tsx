import { t } from '../../i18n';
import type { ReactNode } from 'react';
import type { GameHistoryEntry } from '../registry';
import { array } from '../shared/model';

/**
 * Points per seat for a finished hand: the default history detail for score games. Games add their
 * own lines through the slots (Batak's contract and teams, 101's last discard).
 */
export function ScoreHistory({
  entry,
  header,
  seatSuffix,
  footer,
  note = t('El sonuçları sunucuda kaydedilen puanları gösterir.'),
}: {
  entry: GameHistoryEntry;
  /** Shown above the seat rows. */
  header?: ReactNode;
  /** Appended to a seat's name, e.g. " · 3 el". */
  seatSuffix?(position: number): string;
  /** Shown below the seat rows. */
  footer?: ReactNode;
  note?: string;
}) {
  const result = entry.result,
    historical = entry.seats ?? [];
  const scores = array<number>(result.scores);
  return (
    <>
      {header}
      <div className="rh-detail-rows">
        {scores.map((score, position) => {
          const seat = historical.find((seat) => seat.position === position);
          return (
            <div key={position}>
              <span>
                {seat?.name ?? t('Koltuk sırası {number}', { number: position + 1 })}
                {seatSuffix?.(position) ?? ''}
              </span>
              <strong>{t('{score} puan', { score })}</strong>
            </div>
          );
        })}
      </div>
      {footer}
      {!entry.seats && <p>{t('Bu eski kayıtta oyuncu eşlemesi bulunmuyor.')}</p>}
      <p>{note}</p>
    </>
  );
}

/** The viewer's points on a history row (score games). */
export function scoreHistoryResult(
  result: Record<string, unknown>,
  entry: GameHistoryEntry,
  userId?: string,
) {
  const own = entry.seats?.find((seat) => seat.userId === userId);
  const scores = array<number>(result.scores);
  return own && scores[own.position] !== undefined
    ? t('{score} puan', { score: scores[own.position] })
    : t('Koltuk puanları');
}
