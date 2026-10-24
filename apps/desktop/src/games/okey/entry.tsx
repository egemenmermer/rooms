import type { OkeyClassicOptions } from '../../../../../packages/games/src/okey-classic';
import { t } from '../../i18n';
import type { GameDefinition } from '../registry';
import { object } from '../shared/model';
import { okeyCatalog } from './catalog';
import { okeyCreate, okeyScoringRows } from './create';
import { okeyClassicHistoryResult, OkeyClassicHistory } from './history';
import { OkeyClassicTable } from './OkeyClassicTable';
import './okey.css';

/** Classic Okey (`rooms-okey-v1`): four players, draw and discard, finish with 14 tiles in sets or 7 pairs. */
export const okeyGame: GameDefinition = {
  catalog: okeyCatalog,
  Table: OkeyClassicTable,
  ruleRows: (game) => {
    const options = object(game.view.options) as Partial<OkeyClassicOptions>;
    return [
      [t('Dağıtım'), t('Başlayan 15, diğerleri 14 taş')],
      [t('Bitirme'), t('14 taş per ya da 7 çift, 15. taş ortaya atılır')],
      ...okeyScoringRows(
        options.scoring === 'winner' ? 'winner' : 'countdown',
        options.startingPoints ?? 20,
      ),
    ];
  },
  HistoryDetail: OkeyClassicHistory,
  historyResult: okeyClassicHistoryResult,
  create: okeyCreate,
};
