import { t } from '../../i18n';
import type { GameDefinition } from '../registry';
import { matchFinishLabels } from '../shared/model';
import { tavlaCatalog } from './catalog';
import { tavlaCreate } from './create';
import { type TavlaTableView } from './model';
import { TavlaHistory, tavlaHistoryResult } from './TavlaHistory';
import { TavlaTable } from './TavlaTable';

const match = (view: unknown) => (view as Partial<TavlaTableView>).match;

export const tavlaGame: GameDefinition = {
  catalog: tavlaCatalog,
  Table: TavlaTable,
  ruleRows: (game) => {
    const rules = match(game.view);
    return [
      [t('Maç'), rules ? t('{points} puan', { points: rules.matchTo }) : '—'],
      [
        t('Açılış'),
        rules?.starterRerolls
          ? t('Büyük atan iki zarı yeniden atar')
          : t('Büyük atan iki açılış zarını oynar'),
      ],
      [t('Çift zar'), t('Dört hamle')],
      [t('Kırılan pul'), t('Önce bardan girer')],
      [t('Puan'), t('Normal 1 · Mars 2')],
    ];
  },
  finishLabels: matchFinishLabels,
  HistoryDetail: TavlaHistory,
  historyResult: tavlaHistoryResult,
  create: tavlaCreate,
};
