import { locale, t } from '../../i18n';
import { useEffect, useRef, useState } from 'react';
import { Bot, X } from 'lucide-react';
import { Modal } from '@rooms/design';
import { useActivityRoom } from '../../activity';
import { useCommunity } from '../../community';
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { useGameFixtureMetadata } from './fixture';

/** Recovery is projected only for the requesting user's real, nonpermanent seat. */
export function GameRecovery({
  activity,
  game,
}: {
  activity: ReturnType<typeof useActivityRoom>;
  game: GamePublicState;
}) {
  const fixtureMetadata = useGameFixtureMetadata(),
    community = useCommunity(),
    own = game.seats.find((seat) => seat.userId === community.user?.id),
    recovery = game.view.ownRecovery;
  const [now, setNow] = useState(Date.now()),
    [open, setOpen] = useState(false),
    [pending, setPending] = useState(false),
    [dismissed, setDismissed] = useState<string[]>([]);
  const lock = useRef(false);
  const fixture = import.meta.env.DEV && new URLSearchParams(location.search).has('fixture'),
    connected = activity.status === 'connected';
  useEffect(() => {
    if (!recovery?.takeoverAt || recovery.takeover) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    setNow(Date.now());
    return () => clearInterval(timer);
  }, [recovery?.takeoverAt, recovery?.takeover]);
  useEffect(() => {
    setOpen(!!own && !connected);
  }, [connected, own?.userId]);
  useEffect(() => {
    if (fixtureMetadata?.ui.modal === 'recovery') setOpen(true);
  }, [fixtureMetadata]);
  useEffect(() => {
    setDismissed([]);
  }, [community.user?.id, activity.room?.primary?.startedAt]);
  const event = [...(recovery?.events ?? [])]
    .filter((item) => !dismissed.includes(item.id))
    .sort((a, b) => b.at - a.at)[0];
  const current =
    !!recovery &&
    (recovery.disconnectedAt !== null || recovery.pendingReturn || recovery.takeover || !connected);
  if (!own || !recovery || (!current && !event)) return null;
  const seconds =
    recovery.takeoverAt !== null
      ? Math.max(0, Math.ceil((recovery.takeoverAt - now - activity.serverOffsetMs) / 1000))
      : null;
  const returning = recovery.pendingReturn,
    eventTitle =
      event?.type === 'turn-timeout'
        ? t('Hamle süresi doldu')
        : event?.type === 'control-returned'
          ? t('Kontrol sana döndü')
          : event?.type === 'return-requested'
            ? t('Masaya dönüş istendi')
            : t('Bot devraldı'),
    title =
      !current && event
        ? eventTitle
        : returning
          ? t('Masaya dönüş bekleniyor')
          : recovery.takeover
            ? t('Bot koltuğunu devraldı')
            : connected
              ? t('Koltuğuna geri dön')
              : t('Bağlantın kesildi');
  const reason = fixture
    ? t('Yerel örnekte gerçek oyun işlemi kapalı')
    : !connected
      ? t('Önce oda bağlantısı kurulmalı')
      : '';
  const reclaim = async () => {
    if (reason || activity.busy || lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      await activity.send({ type: 'game.sit', seat: own.seat });
      setOpen(false);
    } catch {
      /* The activity hook retains the actual native error. */
    } finally {
      lock.current = false;
      setPending(false);
    }
  };
  const eventText =
    event?.type === 'turn-timeout'
      ? event.action === 'fold'
        ? event.toCall !== undefined
          ? t('Sunucu eli bıraktı; karşılanacak bahis {amount} fişti.', { amount: event.toCall })
          : t('Sunucu eli bıraktı.')
        : event.action === 'check'
          ? t('Karşılanacak bahis yoktu; sunucu kontrol etti.')
          : t('Sunucu süre sonunda {action} uyguladı.', {
              action: event.action ?? t('izinli hamleyi'),
            })
      : event?.type === 'control-returned'
        ? t('Sunucu koltuğunun kontrolünü güvenli sırada sana döndürdü.')
        : event?.type === 'return-requested'
          ? t('Dönüş isteğin sunucuda kaydedildi.')
          : t('Sunucu bağlantı kesintisinden sonra bot kontrolünü başlattı.');
  const body = (
    <>
      <div className="rh-recovery-callout">
        <Bot size={24} />
        <div>
          <strong>{title}</strong>
          <p>
            {!current && event
              ? eventText
              : returning
                ? t('Bot mevcut hamleyi tamamlar; kontrol güvenli sırada sana döner.')
                : recovery.takeover
                  ? t('Oyun botla devam ediyor. Koltuğuna dönebilirsin.')
                  : seconds !== null
                    ? t(
                        '{seconds} saniye sonra bot devralabilir. Koltuğuna daha sonra da dönebilirsin.',
                        { seconds },
                      )
                    : t('Masadaki yerin korunuyor.')}
          </p>
        </div>
        {!recovery.takeover && seconds !== null && <b>{seconds}s</b>}
      </div>
      <div className="rh-recovery-steps">
        <span>{t('Bağlantı kesildi')}</span>
        <span>{t('Bot devralır')}</span>
        <span>{t('Güvenli sırada geri dön')}</span>
      </div>
      {event && (
        <div className="rh-recovery-record">
          <small>
            {t('El {hand}', { hand: event.hand })} · {new Date(event.at).toLocaleString(locale)}
          </small>
          <p>{eventText}</p>
        </div>
      )}
      {activity.error && (
        <p role="alert" className="rh-error">
          {activity.error}
        </p>
      )}
    </>
  );
  return (
    <>
      <div className="rg-banner">
        <Bot size={17} />
        <span>
          {title}
          {current && !recovery.takeover && seconds !== null
            ? ` · ${seconds}s`
            : event
              ? ` · ${t('El {hand}', { hand: event.hand })}`
              : ''}
        </span>
        <button onClick={() => setOpen(true)}>{t('Ayrıntılar')}</button>
        {current && !returning && (
          <button
            disabled={!!reason || pending || activity.busy}
            title={reason || undefined}
            onClick={() => void reclaim()}
          >
            {t('Masaya geri dön')}
          </button>
        )}
        {!current && event && (
          <button
            aria-label={t('Kayıt bildirimini kapat')}
            onClick={() => setDismissed((values) => [...values, event.id])}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open && (
        <Modal title={title} className="rg-modal rh-recovery" onClose={() => setOpen(false)}>
          <div className="rg-modal-body">{body}</div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setOpen(false)}>
              {t('Masayı göster')}
            </button>
            {!current ? null : !connected ? (
              <button className="button primary" onClick={() => void activity.refresh()}>
                {t('Yeniden bağlan')}
              </button>
            ) : (
              <button
                className="button primary"
                disabled={!!reason || pending || activity.busy || returning}
                title={reason || undefined}
                onClick={() => void reclaim()}
              >
                {returning ? t('Güvenli sıra bekleniyor') : t('Masaya geri dön')}
              </button>
            )}
          </footer>
        </Modal>
      )}
    </>
  );
}
