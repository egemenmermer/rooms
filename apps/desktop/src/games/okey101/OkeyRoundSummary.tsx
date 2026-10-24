import { t } from '../../i18n';
import { array, object } from '../shared/model';
import { penaltyReason, signed, type PenaltyEntry } from './moves';

export type Okey101Ending = { okey: boolean; pairs: boolean; elden: boolean; multiplier: number };

/** Why the round ended, in one line (also used by the history). */
export function endingLine(
  winner: number | null,
  ending: Okey101Ending | null,
  nameOf: (seat: number) => string,
) {
  if (winner === null) return t('Taşlar bitti, kimse bitiremedi');
  const name = nameOf(winner);
  if (ending?.elden && ending.okey) return t('{name} elden okey atarak bitirdi', { name });
  if (ending?.elden && ending.pairs) return t('{name} elden çift bitirdi', { name });
  if (ending?.elden) return t('{name} elden bitirdi', { name });
  if (ending?.okey) return t('{name} okey atarak bitirdi', { name });
  if (ending?.pairs) return t('{name} çift bitirdi', { name });
  return t('{name} bitirdi', { name });
}

/** Penalty lines of a round (işlek, unused side pick, reclaimed okey, gösterge). */
export function PenaltyList({
  log,
  nameOf,
}: {
  log: PenaltyEntry[];
  nameOf: (seat: number) => string;
}) {
  if (!log.length) return null;
  return (
    <ul className="o1-penalties" aria-label={t('Cezalar ve bonuslar')}>
      {log.map((entry, index) => (
        <li key={index} className={entry.amount < 0 ? 'bonus' : ''}>
          <span>{nameOf(entry.seat)}</span>
          <span>{penaltyReason(entry.reason)}</span>
          <b>{signed(entry.amount)}</b>
        </li>
      ))}
    </ul>
  );
}

/** End of a 101 round: why it ended, the multiplier, penalties and each seat's points. */
export function OkeyRoundSummary({
  view,
  nameOf,
  seats,
}: {
  view: Record<string, unknown>;
  nameOf: (seat: number) => string;
  seats: number[];
}) {
  const winner = typeof view.winner === 'number' ? view.winner : null,
    ending = (view.ending as Okey101Ending | null) ?? null,
    scores = array<number>(view.scores),
    penalties = array<number>(view.penalties),
    opened = array<string | null>(view.opened),
    log = array<PenaltyEntry>(view.penaltyLog),
    teams = !!object(view.rules).teams;
  return (
    <section className="o1-summary" aria-label={t('El sonucu')}>
      <header>
        <h3>{endingLine(winner, ending, nameOf)}</h3>
        {!!ending && ending.multiplier > 1 && (
          <span className="o1-multiplier">
            {t('Cezalar ×{multiplier}', { multiplier: ending.multiplier })}
          </span>
        )}
      </header>
      <p>
        {winner === null
          ? t('Açanlar elinde kalan taşları, açmayanlar 202 yazar.')
          : t('Bitiren −101 (okey ya da çift bitişte −202). Açmayan 202 yazar.')}
        {teams ? ` ${t('Eşli masada eşlerin puanı toplanır.')}` : ''}
      </p>
      <table className="rx-results o1-scores">
        <thead>
          <tr>
            <th>{t('Oyuncu')}</th>
            <th>{t('Durum')}</th>
            <th>{t('Ceza')}</th>
            <th>{t('Puan')}</th>
          </tr>
        </thead>
        <tbody>
          {seats.map((seat) => (
            <tr key={seat} className={seat === winner ? 'winner' : ''}>
              <td>{nameOf(seat)}</td>
              <td>
                {seat === winner
                  ? t('Bitirdi')
                  : opened[seat] === 'pairs'
                    ? t('Çift açtı')
                    : opened[seat]
                      ? t('Açtı')
                      : t('Açmadı')}
              </td>
              <td>{penalties[seat] ? signed(penalties[seat]) : '—'}</td>
              <td>{scores[seat] ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <PenaltyList log={log} nameOf={nameOf} />
    </section>
  );
}
