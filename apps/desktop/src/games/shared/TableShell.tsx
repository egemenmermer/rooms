import { locale, t } from '../../i18n';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, Eye, History, RefreshCw, ShieldCheck, Trophy } from 'lucide-react';
import { IconButton, Modal } from '@rooms/design';
import { useActivityRoom } from '../../activity';
import { useCommunity } from '../../community';
import type {
  ActivityCommand,
  GamePublicState,
} from '../../../../../packages/activity-protocol/src';
import { gameDefinition } from '../registry';
import { useGameFixtureMetadata } from './fixture';
import { GameRecovery } from './GameRecovery';
import { GameResults } from './GameResults';
import { array } from './model';
import { SeatControlsContext, seatRemovable, type SeatControls } from './SeatAvatar';
import type { TableUI } from './table-ui';

/** Blackjack: a stack below the smallest bet (2) may buy back up to the 1000 cap. */
const REBUY_BELOW = 2,
  REBUY_STACK = 1000;

export function ReferenceOtherGame({
  activity,
  game,
}: {
  activity: ReturnType<typeof useActivityRoom>;
  game: GamePublicState;
}) {
  const fixtureMetadata = useGameFixtureMetadata(),
    navigate = useNavigate(),
    c = useCommunity(),
    own = game.seats.find((seat) => seat.userId === c.user?.id),
    owner = game.ownerId === c.user?.id,
    definition = gameDefinition(game.kind),
    Table = definition.Table;
  const fixture = import.meta.env.DEV && new URLSearchParams(location.search).has('fixture');
  const [rules, setRules] = useState(false),
    [history, setHistory] = useState(false),
    [end, setEnd] = useState(false),
    [now, setNow] = useState(Date.now()),
    [pending, setPending] = useState(false);
  const lock = useRef(false),
    scope = `${game.kind}:${game.history.length}:${c.user?.id}:${own?.seat}`,
    generation = useRef(scope);
  generation.current = scope;
  const ready = activity.status === 'connected',
    view = game.view,
    legal = array<string>(view.legalActions),
    busy = activity.busy || pending;
  const access = !!own || view.watching === true;
  // The server's legalActions decide who may deal ('start' for the owner, or for any present
  // player while the owner is away) and which moves are open on the viewer's turn.
  const betweenHands = (name: string) =>
    game.status !== 'playing' && definition.betweenHandActions?.includes(name) === true;
  const can = (name: string) =>
    !fixture &&
    ready &&
    !busy &&
    !!own &&
    (legal.includes(name) || betweenHands(name)) &&
    (name === 'start' || definition.betweenHandActions?.includes(name) || own.seat === game.turn);
  const send = async (command: ActivityCommand) => {
    if (fixture || !ready || activity.busy || lock.current) return false;
    lock.current = true;
    setPending(true);
    const current = generation.current;
    try {
      await activity.send(command);
      return current === generation.current;
    } catch {
      return false;
    } finally {
      lock.current = false;
      setPending(false);
    }
  };
  const action: TableUI['action'] = (name, extra = {}) =>
    can(name) ? send({ type: 'game.action', action: name, ...extra }) : Promise.resolve(false);
  const deadline = Number(view.turnDeadline ?? 0);
  useEffect(() => {
    setNow(Date.now());
    if (!deadline || game.status !== 'playing') return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [deadline, game.status]);
  useEffect(() => {
    setRules(false);
    setHistory(false);
    setEnd(false);
  }, [scope]);
  useEffect(() => {
    if (fixtureMetadata) setRules(fixtureMetadata.ui.modal === 'rules');
  }, [fixtureMetadata]);
  const timer =
    deadline > 0 && game.status === 'playing'
      ? Math.max(0, Math.ceil((deadline - now - activity.serverOffsetMs) / 1000))
      : null;
  const roomHostId = activity.room?.primary?.hostUserId;
  const seatControls: SeatControls = {
    canRemove: (seat) => !fixture && ready && !busy && seatRemovable(game, seat, c.user?.id, roomHostId),
    remove: (seat) => send({ type: 'game.seat.remove', seat }),
  };
  // A chip table (Blackjack) buys back in between hands once the stack cannot cover the smallest
  // bet; the server caps the stack at 1000.
  const rebuyable =
    !!own &&
    definition.catalog.scoring === 'chips' &&
    !definition.tableInLobby &&
    game.status !== 'playing' &&
    own.chips < REBUY_BELOW;
  const rebuy = () =>
    own ? send({ type: 'game.sit', seat: own.seat, buyIn: REBUY_STACK - own.chips }) : Promise.resolve(false);
  const ui: TableUI = {
    game,
    userId: c.user?.id,
    can,
    action,
    timer,
    busy,
    canRemoveSeat: seatControls.canRemove,
    removeSeat: seatControls.remove,
    canRebuy: rebuyable && !fixture && ready && !busy,
    rebuy,
  };
  const roomName =
    c.channels.find((channel) => channel.id === activity.room?.roomId)?.name ?? t('Oda');
  const ruleRows = definition.ruleRows(game);
  return (
    <div className={`rg-page rx-game rx-${game.kind}`}>
      <header className="rg-heading">
        <div>
          <div className="rg-title">
            <h1>{game.status === 'finished' ? t('El tamamlandı') : definition.catalog.name}</h1>
            <span>{t('Kurallar kilitli')}</span>
          </div>
          <p>
            {roomName} · {definition.catalog.name} ·{' '}
            {definition.catalog.scoring === 'chips' ? t('Sanal fiş') : t('Sanal puan')}
          </p>
        </div>
        <div>
          <button onClick={() => setRules(true)}>
            <ShieldCheck size={16} />
            {t('Masa kuralları')}
          </button>
          <button
            disabled={!access}
            title={!access ? t('Geçmiş için izleyici olarak katıl') : undefined}
            onClick={() => navigate('/games?tab=history')}
          >
            <History size={16} />
            {t('Geçmiş')}
          </button>
          <IconButton label={t('Masayı yenile')} onClick={() => void activity.refresh()}>
            <RefreshCw size={16} />
          </IconButton>
          {own && (
            <button
              disabled={fixture || !ready || busy}
              onClick={() => void send({ type: 'game.leave' })}
            >
              {t('Masadan kalk')}
            </button>
          )}
        </div>
      </header>
      <GameRecovery activity={activity} game={game} />
      {activity.error && (
        <div className="rg-banner error" role="alert">
          <span>{activity.error}</span>
          <button onClick={() => void activity.refresh()}>{t('Yeniden dene')}</button>
        </div>
      )}
      {!ready && !activity.error && (
        <div className="rg-banner" role="status">
          <span>{t('Masa bağlantısı bekleniyor.')}</span>
          <button onClick={() => void activity.refresh()}>{t('Yeniden dene')}</button>
        </div>
      )}
      {!access ? (
        <section className="rx-watch">
          <Eye size={32} />
          <h2>{t('Masayı izle')}</h2>
          <p>
            {view.rules?.spectatorsAllowed === false
              ? t('Bu masada izleyici erişimi kapalı.')
              : t('Masaya izleyici olarak katıl.')}
          </p>
          <button
            className="button primary"
            disabled={fixture || !ready || busy || view.rules?.spectatorsAllowed === false}
            title={
              fixture
                ? t('Yerel örnekte hesap işlemleri kapalı')
                : view.rules?.spectatorsAllowed === false
                  ? t('Masa izleyici kabul etmiyor')
                  : undefined
            }
            onClick={() => void send({ type: 'game.watch', watching: true })}
          >
            {t('İzle')}
          </button>
        </section>
      ) : (
        <>
          {!own && (
            <div className="rg-banner">
              <Eye size={17} />
              {t('İzleyici · Gizli eller gösterilmez.')}
              <button
                disabled={fixture || !ready || busy}
                onClick={() => void send({ type: 'game.watch', watching: false })}
              >
                {t('İzlemeyi bırak')}
              </button>
            </div>
          )}
          {Table && (
            <SeatControlsContext.Provider value={seatControls}>
              <Table {...ui} />
            </SeatControlsContext.Provider>
          )}
        </>
      )}

      {game.status === 'finished' && own && (
        <div className="rg-hand-strip result">
          <div>
            <h3>
              <Trophy size={19} />
              {t('El tamamlandı')}
            </h3>
            <p>
              {legal.includes('start')
                ? t('Yeni el başlatabilirsin.')
                : t('Masa sahibi bekleniyor.')}
            </p>
          </div>
          {rebuyable && (
            <button
              className="button secondary"
              disabled={!ui.canRebuy}
              title={t('Fişin en küçük bahsi karşılamıyor.')}
              onClick={() => void rebuy()}
            >
              <Coins size={16} />
              {t('Para al')}
            </button>
          )}
          <button
            className="button primary"
            disabled={!can('start')}
            onClick={() => void action('start')}
          >
            {t('Sonraki el')}
          </button>
        </div>
      )}
      {owner && (
        <button
          className="rg-end"
          disabled={fixture || busy || !ready}
          onClick={() => setEnd(true)}
        >
          {t('Masayı kapat')}
        </button>
      )}
      {rules && (
        <Modal title={t('Masa kuralları')} className="rg-modal" onClose={() => setRules(false)}>
          <div className="rg-modal-body rg-rules">
            {ruleRows.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {history && access && (
        <Modal title={t('Masa geçmişi')} className="rg-modal" onClose={() => setHistory(false)}>
          <div className="rg-modal-body">
            {game.history.length ? (
              game.history.map((hand) => (
                <div className="rg-history-row" key={hand.hand}>
                  <Trophy size={16} />
                  <strong>{t('El {hand}', { hand: hand.hand })}</strong>
                  <small>{new Date(hand.endedAt).toLocaleString(locale)}</small>
                  <GameResults game={game} result={hand.result} />
                </div>
              ))
            ) : (
              <p>{t('Tamamlanmış el yok.')}</p>
            )}
          </div>
        </Modal>
      )}
      {end && (
        <Modal title={t('Masayı kapat?')} className="rg-modal" onClose={() => setEnd(false)}>
          <div className="rg-modal-body">
            <p>{t('Oyun etkinliği biter. Ses bağlantısı açık kalır.')}</p>
            {activity.error && <p role="alert">{activity.error}</p>}
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setEnd(false)}>
              {t('Vazgeç')}
            </button>
            <button
              className="button danger"
              disabled={fixture || !ready || busy}
              onClick={() =>
                void send({ type: 'end' }).then((ok) => {
                  if (ok) setEnd(false);
                })
              }
            >
              {t('Masayı kapat')}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
