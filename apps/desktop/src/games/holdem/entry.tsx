import { t } from '../../i18n';
import type { GameDefinition, RuleRow } from '../registry';
import { chipNet, object } from '../shared/model';
import { holdemCatalog } from './catalog';
import { holdemBuyIn } from './HoldemBuyIn';
import { HoldemHistory } from './HoldemHistory';
import { holdemTableRules } from './HoldemRulesForm';
import { HoldemTable } from './HoldemTable';
import { holdemViewRules } from './model';

const holdemRules = (game: Parameters<GameDefinition['ruleRows']>[0]): RuleRow[] => {
  const view = game.view,
    nativeRules = holdemViewRules(game);
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

/**
 * Seats the server can deal in: any stack above zero. A stack below the big blind posts all-in
 * for less (R-holdem H4), so it no longer blocks the deal.
 */
export const holdemStartBlocker: NonNullable<GameDefinition['startBlocker']> = (game) =>
  game.seats.filter((seat) => Number.isSafeInteger(seat.chips) && seat.chips > 0).length < 2
    ? t('En az iki oyuncunun fişi olmalı')
    : '';

export const holdemGame: GameDefinition = {
  catalog: holdemCatalog,
  // Late seating and buy-ins stay on the lobby page, so the lobby renders the table itself.
  tableInLobby: true,
  LobbyTable: HoldemTable,
  tableRules: holdemTableRules,
  buyIn: holdemBuyIn,
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
  startBlocker: holdemStartBlocker,
};
