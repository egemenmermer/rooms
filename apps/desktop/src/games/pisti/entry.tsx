import { t } from '../../i18n';
import type { GameDefinition } from '../registry';
import { object } from '../shared/model';
import { pistiCatalog } from './catalog';
import { pistiCreate } from './create';
import { PistiHistory, pistiHistoryResult } from './PistiHistory';
import { PistiTable } from './PistiTable';

export const pistiGame: GameDefinition = {
  catalog: pistiCatalog,
  Table: PistiTable,
  ruleRows: (game) => {
    const view = object(game.view),
      players = typeof view.seats === 'number' ? view.seats : game.seats.length;
    return [
      [t('Oyuncu'), players === 4 ? t('4 · Eşler karşılıklı') : String(players)],
      [t('Maç'), view.target ? t('{target} puan', { target: Number(view.target) }) : '—'],
      [t('Alma'), t('Aynı değerdeki kart ya da vale yerdeki bütün kartları alır')],
      [t('Pişti'), t('Yerde tek kart varken aynısıyla almak 10 · Valeyle vale 20')],
      [t('Kart puanı'), t('As 1 · Vale 1 · ♣2 2 · ♦10 3')],
      [t('En çok kart'), t('3 puan · Eşitlikte kimse almaz')],
      [t('Son kartlar'), t('Yerde kalanları son alan alır')],
    ];
  },
  lobbyRuleRows: () => [[t('Oyuncu'), t('2 ya da 4 · Dörtte eşler karşılıklı')]],
  HistoryDetail: PistiHistory,
  historyResult: pistiHistoryResult,
  create: pistiCreate,
  minSeats: 2,
  startBlocker: (game) =>
    game.seats.length === 3 ? t('Pişti 2 ya da 4 kişiyle oynanır: bir oyuncu daha otursun ya da biri kalksın.') : '',
};
