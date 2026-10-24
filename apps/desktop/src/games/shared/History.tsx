import { locale, t, tr } from '../../i18n';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, History, RefreshCw } from 'lucide-react';
import { IconButton, Modal } from '@rooms/design';
import { useActivityRoom } from '../../activity';
import { useCommunity } from '../../community';
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { HistoryDetails } from '../card-history/CardHistory';
import { useGameFixtureMetadata } from './fixture';
import { array, names, object, type GameKind } from './model';

type HistoryTable = {
  kind: GameKind;
  history: GamePublicState['history'];
  statistics: Record<string, unknown>;
  seats: GamePublicState['seats'];
  label: string;
};
export function ReferenceGameHistory({
  activity,
  game,
}: {
  activity: ReturnType<typeof useActivityRoom>;
  game: GamePublicState | null;
}) {
  const fixtureMetadata = useGameFixtureMetadata(),
    navigate = useNavigate(),
    community = useCommunity();
  const [filter, setFilter] = useState<'all' | GameKind>('all'),
    [detail, setDetail] = useState<{
      table: HistoryTable;
      hand: GamePublicState['history'][number];
    } | null>(null);
  const access =
    !!game &&
    (game.seats.some((seat) => seat.userId === community.user?.id) || game.view.watching === true);
  const tables: HistoryTable[] =
    access && game
      ? [
          {
            kind: game.kind,
            history: game.history,
            statistics: object(game.view.statistics),
            seats: game.seats,
            label: game.view.tableName ?? names[game.kind],
          },
          ...array<Record<string, unknown>>(game.view.previousTables)
            .filter((table) => ['holdem', 'blackjack', 'batak', '101'].includes(String(table.kind)))
            .map((table) => ({
              kind: table.kind as GameKind,
              history: array<GamePublicState['history'][number]>(table.history),
              statistics: object(table.statistics),
              seats: [],
              label: names[table.kind as GameKind],
            })),
        ]
      : [];
  const filtered = tables.filter((table) => filter === 'all' || table.kind === filter),
    rows = filtered
      .flatMap((table, index) =>
        table.history.map((hand) => ({
          table,
          hand,
          key: `${index}:${hand.hand}:${hand.endedAt}`,
        })),
      )
      .sort((a, b) => b.hand.endedAt - a.hand.endedAt);
  const stats = filtered.map((table) => object(table.statistics[community.user?.id ?? ''])),
    hands = stats.reduce((sum, item) => sum + Number(item.hands ?? 0), 0),
    wins = stats.reduce((sum, item) => sum + Number(item.wins ?? 0), 0);

  const ownResult = (
    table: HistoryTable,
    result: Record<string, unknown>,
    entry: GamePublicState['history'][number],
  ) => {
    const player = array<Record<string, unknown>>(result.players).find(
      (item) => item.userId === community.user?.id,
    );
    if (player && ['holdem', 'blackjack'].includes(table.kind) && typeof player.net === 'number')
      return t('{net} fiş', { net: `${player.net > 0 ? '+' : ''}${player.net}` });
    if (table.kind === 'holdem') {
      const paid = object(result.payouts)[community.user?.id ?? ''];
      return paid !== undefined
        ? t('{amount} fiş ödendi', { amount: Number(paid) })
        : t('Ödeme yok');
    }
    if (table.kind === 'blackjack') {
      const own = array<Record<string, unknown>>(result.results).filter(
        (item) => item.userId === community.user?.id,
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
    }
    const own = entry.seats?.find((seat) => seat.userId === community.user?.id);
    const scores = array<number>(result.scores);
    return own && scores[own.position] !== undefined
      ? t('{score} puan', { score: scores[own.position] })
      : t('Koltuk puanları');
  };
  useEffect(() => setDetail(null), [activity.room?.roomId, community.user?.id]);
  useEffect(() => {
    const kind = fixtureMetadata?.ui.historyKind;
    if (!kind) return;
    const table = tables.find((item) => item.kind === kind),
      hand = table?.history.at(-1);
    if (table && hand) setDetail({ table, hand });
  }, [fixtureMetadata, game]);
  return (
    <div className="rg-page rh-history">
      <header className="rg-heading">
        <div>
          <h1>{t('Masa geçmişi')}</h1>
          <p>{t('Tamamlanan eller ve sunucuda kaydedilen sonuçlar.')}</p>
        </div>
        <div>
          <button onClick={() => navigate('/games')}>
            <ArrowRight size={16} />
            {t('Oyun alanı')}
          </button>
          <IconButton label={t('Geçmişi yenile')} onClick={() => void activity.refresh()}>
            <RefreshCw size={17} />
          </IconButton>
        </div>
      </header>
      <div className="rh-stats">
        {[
          [t('Oynanan el'), String(hands)],
          [t('Kazanılan el'), String(wins)],
          [t('Kazanma oranı'), hands ? `${Math.round((wins / hands) * 100)}%` : '—'],
          [t('Geçmiş kaydı'), String(rows.length)],
        ].map(([label, value]) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <section className="rh-history-panel">
        <header>
          <h3>{t('Tamamlanan eller')}</h3>
          <label>
            {t('Oyun')}
            <select
              aria-label={t('Geçmiş oyun filtresi')}
              value={filter}
              onChange={(event) => setFilter(event.target.value as typeof filter)}
            >
              <option value="all">{t('Tüm oyunlar')}</option>
              {Object.entries(names).map(([kind, name]) => (
                <option value={kind} key={kind}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </header>
        {activity.status === 'loading' ? (
          <div className="rh-empty">
            <RefreshCw size={28} />
            <h3>{t('Geçmiş getiriliyor…')}</h3>
          </div>
        ) : activity.error ? (
          <div className="rh-empty rh-error">
            <h3>{t('Geçmiş alınamadı')}</h3>
            <p>{activity.error}</p>
            <button className="button secondary" onClick={() => void activity.refresh()}>
              {t('Yeniden dene')}
            </button>
          </div>
        ) : !access ? (
          <div className="rh-empty">
            <History size={30} />
            <h3>{game ? t('Önce masaya katıl.') : t('Açık masa yok.')}</h3>
            <p>
              {game
                ? t('Geçmiş için koltuk veya izleyici erişimi gerekir.')
                : t('Arşivli masa erişimi bu bağlantıda henüz uygulanmadı.')}
            </p>
            <button className="button secondary" onClick={() => navigate('/games')}>
              {t('Oyun alanına dön')}
            </button>
          </div>
        ) : rows.length ? (
          <table className="rh-history-table">
            <thead>
              <tr>
                <th>{t('Masa')}</th>
                <th>{t('El')}</th>
                <th>{t('Tarih')}</th>
                <th>{t('Sonucun')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ table, hand, key }) => (
                <tr key={key}>
                  <td>
                    <strong>{hand.tableName ?? names[table.kind]}</strong>
                    <small>{names[table.kind]}</small>
                  </td>
                  <td>{hand.hand}</td>
                  <td>{new Date(hand.endedAt).toLocaleString(locale)}</td>
                  <td>{ownResult(table, hand.result, hand)}</td>
                  <td>
                    <button onClick={() => setDetail({ table, hand })}>
                      {t('Ayrıntılar')}
                      <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="rh-empty">
            <History size={30} />
            <h3>{t('Henüz tamamlanan el yok.')}</h3>
            <button className="button secondary" onClick={() => navigate('/games')}>
              {t('Masalara dön')}
            </button>
          </div>
        )}
      </section>
      <p className="rh-history-note">
        {t('Puan ve sanal fiş farklıdır; toplam kazanç birleştirilmez.')}
      </p>
      {detail && (
        <Modal
          title={t('{game} · El {hand}', {
            game: names[detail.table.kind],
            hand: detail.hand.hand,
          })}
          className="rg-modal rh-detail"
          onClose={() => setDetail(null)}
        >
          <div className="rg-modal-body">
            <p>{new Date(detail.hand.endedAt).toLocaleString(locale)}</p>
            <HistoryDetails kind={detail.table.kind} entry={detail.hand} />
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setDetail(null)}>
              {t('Geçmişe dön')}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
