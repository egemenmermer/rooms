import { t } from '../../i18n';
import type { GameDefinition, RuleRow } from '../registry';
import { chipNet, object } from '../shared/model';
import { holdemCatalog } from './catalog';
import { HoldemHistory } from './HoldemHistory';

const holdemRules = (game: Parameters<GameDefinition['ruleRows']>[0]): RuleRow[] => {
  const view = game.view,
    nativeRules = view.rules;
  return [
    [
      'Blind',
      t('{small} / {big} sanal fiş', {
        small: nativeRules?.smallBlind ?? '—',
        big: nativeRules?.bigBlind ?? String(view.bigBlind ?? '—'),
      }),
    ],
    [t('Giriş'), `${nativeRules?.minBuyIn ?? '—'} – ${nativeRules?.maxBuyIn ?? '—'}`],
    [t('İzleyici'), nativeRules?.spectatorsAllowed ? t('Açık') : t('Kapalı')],
  ];
};

export const holdemGame: GameDefinition = {
  catalog: holdemCatalog,
  // The table, raise and buy-in dialogs still live in shared/Lobby.tsx (phase B moves them here).
  tableInLobby: true,
  ruleRows: holdemRules,
  lobbyRuleRows: holdemRules,
  HistoryDetail: HoldemHistory,
  historyResult: (result, _entry, userId) => {
    const net = chipNet(result, userId);
    if (net) return net;
    const paid = object(result.payouts)[userId ?? ''];
    return paid !== undefined ? t('{amount} fiş ödendi', { amount: Number(paid) }) : t('Ödeme yok');
  },
  minSeats: 2,
  startBlocker: (game) =>
    game.seats.some(
      (seat) => seat.chips < Number(game.view.rules?.bigBlind ?? game.view.bigBlind ?? 20),
    )
      ? t('Bir oyuncunun fişi blind için yetersiz')
      : '',
};
