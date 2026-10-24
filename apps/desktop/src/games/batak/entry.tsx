import { t } from '../../i18n';
import { scoreHistoryResult } from '../card-history/CardHistory';
import type { GameDefinition } from '../registry';
import { suits } from '../shared/model';
import { BatakHistory } from './BatakHistory';
import { ReferenceBatak } from './BatakTable';
import { batakCatalog } from './catalog';
import { batakCreate } from './create';

export const batakGame: GameDefinition = {
  catalog: batakCatalog,
  Table: ReferenceBatak,
  ruleRows: (game) => [
    [t('Tür'), String(game.view.variant ?? '—')],
    [t('Koz'), suits[String(game.view.trump)] ?? '—'],
    [t('Oyuncu'), String(game.seats.length)],
    [t('Gömmeli akışı'), t('İhale → koz → 4 kart gömme → oyun')],
  ],
  HistoryDetail: BatakHistory,
  historyResult: scoreHistoryResult,
  create: batakCreate,
};
