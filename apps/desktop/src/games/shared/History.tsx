import { locale, t } from '../../i18n';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, History, RefreshCw } from 'lucide-react';
import { IconButton, Modal } from '@rooms/design';
import { useActivityRoom } from '../../activity';
import { useCommunity } from '../../community';
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { scoreHistoryResult } from '../card-history/CardHistory';
import { isOfferedGame, offeredGames } from '../catalog';
import { gameDefinition } from '../registry';
import { useGameFixtureMetadata } from './fixture';
import { array, names, object } from './model';
import { ActionLog } from '../card-history/ActionLog';

type HistoryTable = {
  kind: string;
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
  const [filter, setFilter] = useState<string>('all'),
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
            .filter((table) => isOfferedGame(String(table.kind)))
            .map((table) => ({
              kind: String(table.kind),
              history: array<GamePublicState['history'][number]>(table.history),
              statistics: object(table.statistics),
              seats: [],
              label: names[String(table.kind)] ?? String(table.kind),
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
  ) =>
    (gameDefinition(table.kind).historyResult ?? scoreHistoryResult)(
      result,
      entry,
      community.user?.id,
    );
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
              {offeredGames.map(({ kind, name }) => (
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
            <HistoryDetail kind={detail.table.kind} entry={detail.hand} />
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

function HistoryDetail({
  kind,
  entry,
}: {
  kind: string;
  entry: GamePublicState['history'][number];
}) {
  const Detail = gameDefinition(kind).HistoryDetail;
  return (
    <>
      <Detail entry={entry} />
      <ActionLog entry={entry} />
    </>
  );
}
