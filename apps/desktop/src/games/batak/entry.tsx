import { t } from '../../i18n';
import { scoreHistoryResult } from '../card-history/CardHistory';
import type { GameDefinition } from '../registry';
import { suits } from '../shared/model';
import { BatakHistory } from './BatakHistory';
import { ReferenceBatak } from './BatakTable';
import { batakCatalog } from './catalog';
import { batakCreate } from './create';
import { BATAK_RULE_DEFAULTS, variantName } from './model';

const yes = (on: boolean) => (on ? t('Açık') : t('Kapalı'));

export const batakGame: GameDefinition = {
  catalog: batakCatalog,
  Table: ReferenceBatak,
  ruleRows: (game) => {
    const rules = { ...BATAK_RULE_DEFAULTS, ...game.view.rules },
      kozMaca = game.view.variant === 'koz-maca';
    return [
      [t('Tür'), variantName(String(game.view.variant ?? ''))],
      [t('Koz'), suits[String(game.view.trump)] ?? '—'],
      [t('Oyuncu'), String(game.seats.length)],
      [t('Koz kırılmadan koz açılmaz'), yes(rules.noTrumpLeadUntilBroken === true)],
      [t('Savunma batağı'), kozMaca ? '—' : yes(rules.defenderBatakPenalty === true)],
      [t('İhale kadar yaz'), kozMaca ? '—' : yes(rules.writeContract === true)],
      [t('Gömmeli akışı'), t('İhale → koz → 4 kart gömme → oyun')],
    ];
  },
  HistoryDetail: BatakHistory,
  historyResult: scoreHistoryResult,
  create: batakCreate,
};
