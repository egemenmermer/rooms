import { t } from '../../i18n';
import type { GameDefinition } from '../registry';
import { array, chipNet } from '../shared/model';
import { ReferenceBlackjack } from './BlackjackTable';
import { blackjackCatalog } from './catalog';
import { BlackjackHistory } from './BlackjackHistory';

export const blackjackGame: GameDefinition = {
  catalog: blackjackCatalog,
  Table: ReferenceBlackjack,
  ruleRows: () => [
    [t('Deste'), '6'],
    [t('Krupiye'), t('Soft 17’de durur (S17)')],
    ['Blackjack', '3:2'],
    ['Insurance', t('Kapalı')],
    ['Double', t('İlk iki kartta')],
    ['Split', t('Aynı puan değeri · En fazla 4 el')],
    [t('Split As'), t('Tek kart · yeniden ayırma kapalı')],
  ],
  HistoryDetail: BlackjackHistory,
  historyResult: (result, _entry, userId) => {
    const net = chipNet(result, userId);
    if (net) return net;
    const own = array<Record<string, unknown>>(result.results).filter(
      (item) => item.userId === userId,
    );
    return own.length
      ? own
          .map(
            (item) =>
              (
                ({
                  win: t('Kazandı'),
                  lose: t('Kaybetti'),
                  push: t('Berabere'),
                  blackjack: 'Blackjack',
                }) as Record<string, string>
              )[String(item.outcome)] ?? t('Sonuç'),
          )
          .join(' · ')
      : '—';
  },
  minSeats: 1,
  // Bets are placed before the deal, outside the turn order.
  betweenHandActions: ['bet'],
};
