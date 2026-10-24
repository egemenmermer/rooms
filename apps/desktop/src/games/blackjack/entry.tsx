import { t } from '../../i18n';
import type { GameDefinition } from '../registry';
import { array, chipNet } from '../shared/model';
import { BlackjackTable } from './BlackjackTable';
import { blackjackCatalog } from './catalog';
import { blackjackCreate, blackjackRuleRows } from './create';
import { BlackjackHistory } from './BlackjackHistory';
import { rulesOf } from './model';

export const blackjackGame: GameDefinition = {
  catalog: blackjackCatalog,
  Table: BlackjackTable,
  // Insurance and surrender follow the table's switches (`view.rules`; defaults before the first deal).
  ruleRows: (game) => blackjackRuleRows(rulesOf(game)),
  create: blackjackCreate,
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
                  surrender: t('Teslim oldu'),
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
