import { t } from '../../i18n';
import { scoreHistoryResult } from '../card-history/CardHistory';
import type { GameDefinition } from '../registry';
import { object } from '../shared/model';
import { okey101Catalog } from './catalog';
import { okey101Create } from './create';
import { OkeyHistory } from './OkeyHistory';
import { ReferenceOkey } from './OkeyTable';
import './okey101.css';

export const okey101Game: GameDefinition = {
  catalog: okey101Catalog,
  Table: ReferenceOkey,
  ruleRows: (game) => [
    [t('Açılış'), object(game.view.rules).folding ? t('101 · her açılış öncekini geçer') : '101'],
    [t('Çift açılışı'), t('{count} çift', { count: Number(game.view.requiredPairs ?? 5) })],
    [t('Katlamalı'), object(game.view.rules).folding ? t('Açık') : t('Kapalı')],
    [t('Eşli'), object(game.view.rules).teams ? t('Açık') : t('Kapalı')],
    [t('Bitirme'), t('Son taş atılır')],
  ],
  HistoryDetail: OkeyHistory,
  historyResult: scoreHistoryResult,
  create: okey101Create,
};
