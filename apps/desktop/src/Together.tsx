import { openActivity } from './activity-route';
import './reference-together.css';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Film,
  LockKeyhole,
  Plus,
  RefreshCw,
  Users,
  Vote,
  X,
} from 'lucide-react';
import { Avatar, IconButton, Modal } from '@rooms/design';
import { useActivityRoom } from './activity';
import Whiteboard from './Whiteboard';
import { useCurrentRoom } from './Agent';
import { useCommunity } from './community';
import { t } from './i18n';
import type { ActivityCommand, Poll } from '../../../packages/activity-protocol/src';

export default function Together() {
  const roomId = useCurrentRoom(),
    activity = useActivityRoom(roomId),
    community = useCommunity(),
    navigate = useNavigate();
  const [params, setParams] = useSearchParams(),
    board = params.get('tab') === 'board';
  const [create, setCreate] = useState(false),
    [question, setQuestion] = useState(''),
    [options, setOptions] = useState(['', '']),
    [closing, setClosing] = useState<string | null>(null),
    [pending, setPending] = useState(false);
  const lock = useRef(false),
    scope = useRef(`${roomId}:${community.user?.id}`);
  scope.current = `${roomId}:${community.user?.id}`;
  const fixture = import.meta.env.DEV && new URLSearchParams(location.search).has('fixture'),
    connected = activity.status === 'connected';
  const busy = activity.busy || pending,
    reason = fixture
      ? t('Yerel görsel örnekte hesap işlemleri kapalı')
      : !connected
        ? t('Oda bağlantısı bekleniyor')
        : '';
  const participant = activity.room?.participants.find(
      (person) => person.userId === community.user?.id,
    ),
    canControl = participant?.canControl === true;
  // A viewer who has not joined yet (fresh room, or pruned after idling) has no participant
  // record; send() joins first and the service still enforces canCreate on poll.create.
  const createReason =
    reason || (participant?.canCreate === false ? t('Bu odada anket oluşturma yetkin yok.') : '');
  const roomName = community.channels.find((channel) => channel.id === roomId)?.name ?? t('Oda');
  const send = async (command: ActivityCommand) => {
    if (fixture || !connected || activity.busy || lock.current) return false;
    lock.current = true;
    setPending(true);
    const current = scope.current;
    try {
      await activity.send(command);
      return current === scope.current;
    } catch {
      return false;
    } finally {
      lock.current = false;
      setPending(false);
    }
  };
  useEffect(() => {
    setCreate(false);
    setClosing(null);
    setQuestion('');
    setOptions(['', '']);
  }, [roomId, community.user?.id]);
  const polls = activity.room?.polls ?? [],
    closePoll = polls.find((poll) => poll.id === closing);
  useEffect(() => {
    let active = true;
    if (import.meta.env.DEV) {
      const query = new URLSearchParams(location.search);
      if (query.get('fixture') === 'S53')
        void import('./dev/games-fixture').then((f) => {
          if (!active) return;
          const meta = f.getGamesFixtureMetadata('S53', query.get('variant') || 'default');
          if (meta.ui.modal === 'poll-create') {
            setCreate(true);
            setQuestion('Filmden sonra ne oynayalım?'); // i18n-ignore: development fixture
            setOptions(['Hold’em', '101 Okey', 'Batak']);
          }
          if (meta.ui.modal === 'poll-close' && activity.room?.polls[0])
            setClosing(activity.room.polls[0].id);
        });
    }
    return () => {
      active = false;
    };
  }, [roomId, community.user?.id, activity.room?.roomId]);
  const owner = (poll: Poll) => poll.createdBy === community.user?.id || canControl;
  const actualName = (id: string) =>
    activity.room?.participants.find((person) => person.userId === id)?.displayName ??
    t('Katılımcı');
  const counts = (poll: Poll) =>
    poll.options.map((option) => ({
      ...option,
      count: Object.values(poll.votes).filter((value) => value === option.id).length,
    }));
  const winner = (poll: Poll) => {
    const values = counts(poll),
      max = Math.max(0, ...values.map((option) => option.count));
    return max
      ? values
          .filter((option) => option.count === max)
          .map((option) => t('{label} · {count} oy', { label: option.label, count: option.count }))
          .join(' / ')
      : t('Henüz oy yok');
  };
  const primary = activity.room?.primary;
  const guardedActivity = {
    ...activity,
    send: async (command: ActivityCommand) => {
      if (fixture) throw new Error(t('Yerel görsel örnekte hesap işlemleri kapalı'));
      return activity.send(command);
    },
  };
  return (
    <div className={`rt-page ${board ? 'rt-board-page' : ''}`}>
      {!board && (
        <header className="rt-heading">
          <div>
            <h1>{t('Anketler')}</h1>
            <p>
              {roomName} · {t('Yan etkinlik')}
            </p>
          </div>
          <div>
            <button className="button secondary" onClick={() => setParams({ tab: 'board' })}>
              {t('Beyaz tahta')}
            </button>
            {!board && (
              <button
                className="button secondary"
                disabled={busy || !!createReason}
                title={createReason || undefined}
                onClick={() => setCreate(true)}
              >
                <Plus size={16} />
                {t('Yeni anket')}
              </button>
            )}
            <IconButton label={t('Odayı yenile')} onClick={() => void activity.refresh()}>
              <RefreshCw size={17} />
            </IconButton>
          </div>
        </header>
      )}
      {!connected && !(board && roomId) && (
        <div className="rt-banner warning" role="status">
          {activity.status === 'loading'
            ? t('Oda getiriliyor…')
            : !roomId
              ? t('Bir oda seç.')
              : t('Bağlantı bekleniyor. Son alınan görünüm korunuyor; işlemler kapalı.')}
          <button
            onClick={() =>
              roomId ? void activity.refresh() : navigate('/settings?tab=connections')
            }
          >
            {roomId ? t('Yeniden dene') : t('Topluluğa bağlan')}
          </button>
        </div>
      )}
      {board ? (
        roomId ? (
          <Whiteboard
            key={`${roomId}:${community.user?.id}`}
            roomId={roomId}
            userId={community.user?.id ?? ''}
            roomName={roomName}
            activity={guardedActivity}
            onPolls={() => setParams({})}
          />
        ) : (
          <section className="rt-empty">
            <Users size={30} />
            <h2>{t('Tahta için bir oda seç.')}</h2>
          </section>
        )
      ) : (
        <>
          <div className="rt-poll-layout">
            <section className="rt-context">
              <div className="rt-activity-card">
                <Film size={38} />
                <span>{primary ? t('ODANIN ETKİNLİĞİ') : t('ODA')}</span>
                <h2>{primary?.title ?? roomName}</h2>
                <p>
                  {primary ? t('Anket ana etkinliği değiştirmez.') : t('Açık ana etkinlik yok.')}
                </p>
                {primary && (
                  <button
                    className="button secondary"
                    onClick={() => openActivity(primary.activity, navigate)}
                  >
                    {t('Etkinliği aç')}
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
              <div className="rt-room-card">
                <h3>{roomName}</h3>
                <div className="rt-people">
                  {activity.room?.participants.map((person) => (
                    <span key={person.userId} title={person.displayName}>
                      <Avatar name={person.displayName} />
                    </span>
                  ))}
                  <span>
                    {t('{count} oda katılımcısı', {
                      count: activity.room?.participants.length ?? 0,
                    })}
                  </span>
                </div>
                <p>{t('Oda anketleri oyun veya medya etkinliğinden bağımsızdır.')}</p>
              </div>
            </section>
            <section className="rt-polls">
              {polls.length ? (
                polls.map((poll) => {
                  const votes = Object.values(poll.votes),
                    voted = poll.votes[community.user?.id ?? ''];
                  return (
                    <article className={`rt-poll ${poll.closed ? 'closed' : ''}`} key={poll.id}>
                      <header>
                        <span>{t('ODA ANKETİ')}</span>
                        <small>{poll.closed ? t('Kapalı') : t('Oylama açık')}</small>
                      </header>
                      <h2>{poll.question}</h2>
                      <p>{t('{name} oluşturdu', { name: actualName(poll.createdBy) })}</p>
                      <div className="rt-options">
                        {counts(poll).map((option) => {
                          const percentage = votes.length
                            ? Math.round((option.count / votes.length) * 100)
                            : 0;
                          return (
                            <button
                              type="button"
                              key={option.id}
                              className={voted === option.id ? 'voted' : ''}
                              disabled={poll.closed || busy || !!reason}
                              title={poll.closed ? t('Oylama kapalı') : reason || undefined}
                              aria-pressed={voted === option.id}
                              onClick={() =>
                                void send({
                                  type: 'poll.vote',
                                  pollId: poll.id,
                                  optionId: option.id,
                                })
                              }
                            >
                              <i style={{ width: `${percentage}%` }} />
                              <span>
                                {voted === option.id && <Check size={14} />} {option.label}
                              </span>
                              <small>
                                {t('{count} oy', { count: option.count })}
                                {votes.length ? ` · ${percentage}%` : ''}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                      <div className="rt-voters">
                        <span>
                          {votes.length
                            ? t('{count} kişi oy verdi', { count: votes.length })
                            : t('Henüz oy yok')}
                        </span>
                        <div>
                          {Object.keys(poll.votes)
                            .filter((id) =>
                              activity.room?.participants.some((person) => person.userId === id),
                            )
                            .slice(0, 5)
                            .map((id) => (
                              <Avatar key={id} name={actualName(id)} />
                            ))}
                        </div>
                      </div>
                      <p>
                        {poll.closed
                          ? t('Sonuç: {result}', { result: winner(poll) })
                          : voted
                            ? t('Seçimini istediğin zaman değiştirebilirsin.')
                            : t('İlk oyu sen ver.')}
                      </p>
                      {poll.closed ? (
                        <button
                          className="button secondary full"
                          onClick={() => navigate('/games')}
                        >
                          {t('Oyun alanını aç')}
                        </button>
                      ) : owner(poll) ? (
                        <button
                          className="rt-close"
                          disabled={busy || !!reason}
                          title={reason || undefined}
                          onClick={() => setClosing(poll.id)}
                        >
                          <LockKeyhole size={16} />
                          {t('Anketi kapat')}
                        </button>
                      ) : (
                        <p className="rt-permission">
                          {t('Bu anketi sahibi veya oda yöneticileri kapatabilir.')}
                        </p>
                      )}
                    </article>
                  );
                })
              ) : (
                <article className="rt-poll rt-empty">
                  <Vote size={31} />
                  <h2>{connected ? t('Henüz anket yok.') : t('Anket bağlantısı bekleniyor.')}</h2>
                  <button
                    className="button primary"
                    disabled={busy || !!createReason}
                    title={createReason || undefined}
                    onClick={() => setCreate(true)}
                  >
                    <Plus size={15} />
                    {t('Yeni anket')}
                  </button>
                </article>
              )}
            </section>
          </div>
          <p className="rt-footer">{t('Anket sonucu ana etkinliği değiştirmez.')}</p>
        </>
      )}
      {activity.error && (
        <div className="rt-banner error" role="alert">
          {activity.error}
        </div>
      )}
      {create && (
        <Modal
          title={t('Odaya bir soru sor')}
          className="rt-modal"
          onClose={() => setCreate(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (createReason || !question.trim() || options.some((value) => !value.trim()))
                return;
              void send({
                type: 'poll.create',
                pollId: crypto.randomUUID(),
                question: question.trim(),
                options: options.map((label) => ({ id: crypto.randomUUID(), label: label.trim() })),
              }).then((ok) => {
                if (ok) {
                  setCreate(false);
                  setQuestion('');
                  setOptions(['', '']);
                }
              });
            }}
          >
            <div className="rt-modal-body">
              <p>{t('Anket {room} odasında açılır.', { room: roomName })}</p>
              <label>
                {t('Soru')}
                <input
                  autoFocus
                  required
                  maxLength={240}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                />
              </label>
              {options.map((value, index) => (
                <label key={index}>
                  {t('Seçenek {number}', { number: index + 1 })}
                  <div className="rt-option-input">
                    <input
                      required
                      maxLength={240}
                      value={value}
                      onChange={(event) =>
                        setOptions((values) =>
                          values.map((item, i) => (i === index ? event.target.value : item)),
                        )
                      }
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        aria-label={t('Seçenek {number} kaldır', { number: index + 1 })}
                        onClick={() => setOptions((values) => values.filter((_, i) => i !== index))}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </label>
              ))}
              {options.length < 12 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setOptions((values) => [...values, ''])}
                >
                  <Plus size={15} />
                  {t('Seçenek ekle')}
                </button>
              )}
              <div className="rt-modal-summary">
                <span>{t('Oy düzeni')}</span>
                <strong>{t('Kişi başına tek seçim')}</strong>
              </div>
              <p>{t('Herkes oyunu değiştirebilir. Sen kapatana kadar oylama açık kalır.')}</p>
              {activity.error && (
                <p className="rt-form-error" role="alert">
                  {activity.error}
                </p>
              )}
            </div>
            <footer>
              <button type="button" className="button secondary" onClick={() => setCreate(false)}>
                {t('Vazgeç')}
              </button>
              <button
                className="button primary"
                disabled={
                  busy ||
                  !!createReason ||
                  !question.trim() ||
                  options.some((value) => !value.trim())
                }
                title={createReason || undefined}
              >
                {t('Anketi başlat')}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {closePoll && (
        <Modal title={t('Oylamayı kapat?')} className="rt-modal" onClose={() => setClosing(null)}>
          <div className="rt-modal-body">
            <h3>{closePoll.question}</h3>
            <p>
              {t(
                '{count} kişi oy verdi. Kapatınca yeni oy alınmaz; sonuç odada görünmeye devam eder.',
                { count: Object.keys(closePoll.votes).length },
              )}
            </p>
            <div className="rt-modal-summary">
              <span>{t('Şu an önde')}</span>
              <strong>{winner(closePoll)}</strong>
            </div>
            {activity.error && (
              <p className="rt-form-error" role="alert">
                {activity.error}
              </p>
            )}
          </div>
          <footer>
            <button className="button secondary" onClick={() => setClosing(null)}>
              {t('Oylama sürsün')}
            </button>
            <button
              className="button primary"
              disabled={busy || !!reason || closePoll.closed || !owner(closePoll)}
              onClick={() =>
                void send({ type: 'poll.close', pollId: closePoll.id }).then((ok) => {
                  if (ok) setClosing(null);
                })
              }
            >
              {t('Anketi kapat')}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
