import { locale, t } from '../../i18n';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, History, RefreshCw, ShieldCheck, Trophy } from 'lucide-react';
import { IconButton, Modal } from '@rooms/design';
import { useActivityRoom } from '../../activity';
import { useCommunity } from '../../community';
import type { ActivityCommand, GamePublicState } from '../../../../../packages/activity-protocol/src';
import { ReferenceBatak } from '../batak/BatakTable';
import { ReferenceBlackjack } from '../blackjack/BlackjackTable';
import { ReferenceOkey } from '../okey101/OkeyTable';
import { useGameFixtureMetadata } from './fixture';
import { GameRecovery } from './GameRecovery';
import { GameResults } from './GameResults';
import { array, names, object, suits } from './model';
import type { TableUI } from './table-ui';

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
    owner = game.ownerId === c.user?.id;
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
  const can = (name: string) =>
    !fixture &&
    ready &&
    !busy &&
    !!own &&
    (legal.includes(name) ||
      (name === 'bet' && game.kind === 'blackjack' && game.status !== 'playing')) &&
    (name === 'start' || name === 'bet' ? name === 'bet' || owner : own.seat === game.turn);
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
  const ui: TableUI = { game, userId: c.user?.id, can, action, timer, busy };
  const roomName =
    c.channels.find((channel) => channel.id === activity.room?.roomId)?.name ?? t('Oda');
  const ruleRows: [string, string][] =
    game.kind === 'blackjack'
      ? [
          [t('Deste'), '6'],
          [t('Krupiye'), t('Soft 17’de durur (S17)')],
          ['Blackjack', '3:2'],
          ['Insurance', t('Kapalı')],
          ['Double', t('İlk iki kartta')],
          ['Split', t('Aynı puan değeri · En fazla 4 el')],
          [t('Split As'), t('Tek kart · yeniden ayırma kapalı')],
        ]
      : game.kind === 'batak'
        ? [
            [t('Tür'), String(view.variant ?? '—')],
            [t('Koz'), suits[String(view.trump)] ?? '—'],
            [t('Oyuncu'), String(game.seats.length)],
            [t('Gömmeli akışı'), t('İhale → koz → 4 kart gömme → oyun')],
          ]
        : [
            [t('Açılış'), '101'],
            [t('Çift açılışı'), t('5 çift')],
            [t('Katlamalı'), object(view.rules).folding ? t('Açık') : t('Kapalı')],
            [t('Eşli'), object(view.rules).teams ? t('Açık') : t('Kapalı')],
            [t('Bitirme'), t('Son taş atılır')],
          ];
  return (
    <div className={`rg-page rx-game rx-${game.kind}`}>
      <header className="rg-heading">
        <div>
          <div className="rg-title">
            <h1>{game.status === 'finished' ? t('El tamamlandı') : names[game.kind]}</h1>
            <span>{t('Kurallar kilitli')}</span>
          </div>
          <p>
            {roomName} · {names[game.kind]} ·{' '}
            {game.kind === 'blackjack' ? t('Sanal fiş') : t('Sanal puan')}
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
            {game.kind === 'holdem' && view.rules?.spectatorsAllowed === false
              ? t('Bu masada izleyici erişimi kapalı.')
              : t('Masaya izleyici olarak katıl.')}
          </p>
          <button
            className="button primary"
            disabled={
              fixture ||
              !ready ||
              busy ||
              (game?.kind === 'holdem' && view.rules?.spectatorsAllowed === false)
            }
            title={
              fixture
                ? t('Yerel örnekte hesap işlemleri kapalı')
                : game?.kind === 'holdem' && view.rules?.spectatorsAllowed === false
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
          {game.kind === 'blackjack' ? (
            <ReferenceBlackjack {...ui} />
          ) : game.kind === 'batak' ? (
            <ReferenceBatak {...ui} />
          ) : (
            <ReferenceOkey {...ui} />
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
            <p>{owner ? t('Yeni el başlatabilirsin.') : t('Masa sahibi bekleniyor.')}</p>
          </div>
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
