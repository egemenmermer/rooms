import './reference-cinema.css';
import { ReferenceIcon } from './ReferenceIcon';
import { VoiceAvatar } from './VoiceAvatar';
import { useCommunity } from './community';
import { useActivityRoom } from './activity';
import { useCurrentRoom } from './Agent';
import { CommunityInvite } from './RealSocial';
import { CinemaScreenStage } from './CinemaScreenStage';
import { useCinemaSession, chooseCinemaMedia } from './cinema-session';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IconButton, Modal } from '@rooms/design';
import { uiError } from './i18n';
import { useRealtime, stopScreen } from './realtime';
import { ScreenHandoffControls } from './screen-handoff';
import { activityBridge } from './runtime-sources';

export default function Cinema({ notify }: { notify(message: string): void }) {
  const navigate = useNavigate(),
    realtime = useRealtime(),
    location = useLocation(),
    community = useCommunity();
  const roomId = useCurrentRoom(),
    activity = useActivityRoom(roomId);
  const view = new URLSearchParams(location.search).get('view');
  const [sourcePicker, setSourcePicker] = useState(false),
    [inviting, setInviting] = useState(false),
    [queueTitle, setQueueTitle] = useState(''),
    [sourceTitle, setSourceTitle] = useState(''),
    [sourceBusy, setSourceBusy] = useState(false),
    [sourceError, setSourceError] = useState(''),
    [queueAnnouncement, setQueueAnnouncement] = useState(''),
    [queueKeyboard, setQueueKeyboard] = useState(false);
  const queueInput = useRef<HTMLInputElement>(null);
  const closeSource = useCallback(() => setSourcePicker(false), []),
    closeInvite = useCallback(() => setInviting(false), []);
  const screenTracks = realtime.tracks.filter(
    (t) => t.source === 'screen_share' && t.kind === 'video' && !t.muted,
  );
  const lastScreen = useRef(false),
    lastPrimary = useRef<string | null>(null),
    [activityEnded, setActivityEnded] = useState(false),
    [hostNotice, setHostNotice] = useState('');
  useEffect(() => {
    lastScreen.current = false;
    lastPrimary.current = null;
    setActivityEnded(false);
    setHostNotice('');
  }, [roomId]);
  useEffect(() => {
    if (screenTracks.length) lastScreen.current = true;
  }, [screenTracks.length]);
  useEffect(() => {
    if (activity.status !== 'connected') return;
    const primary = activity.room?.primary;
    if (lastPrimary.current && !primary) setActivityEnded(true);
    if (primary) {
      if (lastPrimary.current && lastPrimary.current !== primary.hostUserId)
        setHostNotice(
          `${activity.room?.participants.find((p) => p.userId === primary.hostUserId)?.displayName ?? 'Katılımcı'} oturumu düzenliyor.`,
        );
      lastPrimary.current = primary.hostUserId;
      setActivityEnded(false);
    }
  }, [activity.room, activity.status]);
  const sharedQueue = activity.room?.queue ?? [],
    activeItem = sharedQueue.find((q) => q.id === activity.room?.timeline.itemId);
  const self = activity.room?.participants.find((p) => p.userId === community.user?.id);
  const queueAllowed =
    activity.status === 'connected' &&
    ['cinema', 'youtube'].includes(activity.room?.primary?.activity ?? '') &&
    self?.canControl !== false;
  const queueReason = !roomId
    ? 'Önce oda seç.'
    : activity.status !== 'connected'
      ? 'Etkinlik sunucusuna bağlan.'
      : self?.canControl === false
        ? 'Bu odada etkinlik kontrol yetkin yok.'
        : 'Ortak kuyruk için Cinema veya YouTube etkinliği gerekli.';
  const command = (operation: Promise<unknown>) => {
    void operation.catch((e) => notify(uiError(e)));
  };
  const chooseScreen = () => window.dispatchEvent(new Event('rooms:choose-capture'));
  const setView = (next: string) => navigate(`/cinema?view=${next}`);
  const addTitle = async () => {
    const title = queueTitle.trim();
    if (!title || !queueAllowed || activity.room?.primary?.activity !== 'cinema') return;
    if (/:\/\/|^[\/\\]|^[A-Za-z]:[\/\\]/.test(title)) {
      notify('Yalnızca içerik adı gir. Kaynak adresi veya dosya yolu ekleme.');
      return;
    }
    try {
      await activity.send({
        type: 'queue.add',
        itemId: crypto.randomUUID(),
        media: { kind: 'independent-source', referenceId: crypto.randomUUID(), title },
      });
      setQueueTitle('');
    } catch (e) {
      notify(uiError(e));
    }
  };
  const moveItem = async (index: number, direction: number) => {
    const ids = sharedQueue.map((q) => q.id),
      other = index + direction;
    if (
      !queueAllowed ||
      activity.busy ||
      other < 0 ||
      other >= ids.length ||
      ids[index] === activeItem?.id ||
      ids[other] === activeItem?.id
    )
      return;
    [ids[index], ids[other]] = [ids[other]!, ids[index]!];
    try {
      await activity.send({ type: 'queue.reorder', itemIds: ids });
      setQueueAnnouncement(
        `${sharedQueue[index]?.media.title} sırada ${other + 1}. konuma taşındı.`,
      );
    } catch (e) {
      notify(uiError(e));
    }
  };
  const media = useCinemaSession((state) => state.media);
  const syncReason = !window.rooms
    ? 'Masaüstü uygulaması gerekli.'
    : !roomId
      ? 'Önce oda seç.'
      : activity.status !== 'connected'
        ? 'Etkinlik bağlantısı gerekli.'
        : activity.room?.primary && activity.room.primary.activity !== 'cinema'
          ? 'Önce Cinema etkinliği başlat.'
          : self?.canControl === false
            ? 'Etkinlik kontrol yetkin yok.'
            : !activity.room?.primary && self?.canCreate === false
              ? 'Etkinlik başlatma yetkin yok.'
              : null;
  const choose = async (shared = false) => {
    if (sourceBusy) return;
    setSourceBusy(true);
    setSourceError('');
    try {
      let binding: Parameters<typeof chooseCinemaMedia>[0];
      if (shared) {
        if (syncReason || !roomId) throw new Error(syncReason ?? 'Önce oda seç.');
        let snapshot = await activityBridge().snapshot(roomId);
        let selected = snapshot.room.queue.find(
          (item) => item.id === snapshot.room.timeline.itemId,
        );
        if (!selected) {
          const title = sourceTitle.trim();
          if (!title || /:\/\/|^[\/\\]|^[A-Za-z]:[\/\\]/.test(title))
            throw new Error('İçerik adı gir. Kaynak adresi veya dosya yolu ekleme.');
          if (!snapshot.room.primary)
            await activity.send({ type: 'start', activity: 'cinema', title });
          else if (snapshot.room.primary.activity !== 'cinema')
            throw new Error('Başka bir etkinlik devam ediyor.');
          const itemId = crypto.randomUUID();
          await activity.send({
            type: 'queue.add',
            itemId,
            media: { kind: 'independent-source', referenceId: crypto.randomUUID(), title },
          });
          await activity.send({ type: 'queue.select', itemId });
          snapshot = await activityBridge().snapshot(roomId);
          selected = snapshot.room.queue.find((item) => item.id === snapshot.room.timeline.itemId);
        }
        if (
          snapshot.room.primary?.activity !== 'cinema' ||
          selected?.media.kind !== 'independent-source'
        )
          throw new Error('Ortak içerik değişti. Kuyruğu kontrol et.');
        binding = {
          roomId,
          itemId: selected.id,
          referenceId: selected.media.referenceId,
          timelineEpoch: snapshot.room.timeline.epoch,
          title: selected.media.title,
        };
      }
      if (await chooseCinemaMedia(binding)) {
        setSourcePicker(false);
        setView('personal');
      }
    } catch (error) {
      const text = uiError(error);
      setSourceError(text);
      notify(text);
    } finally {
      setSourceBusy(false);
    }
  };
  const roster = (
    <div className="reference-cinema-roster">
      <div>
        <h3>Katılımcılar</h3>
        <span>{activity.room?.participants.length ?? realtime.participants.length} kişi</span>
      </div>
      {(
        activity.room?.participants ??
        realtime.participants.map((p) => ({
          userId: p.id,
          displayName: p.name,
          canControl: false,
          joinedAt: 0,
          lastSeenAt: 0,
        }))
      ).map((p) => {
        const voice = realtime.participants.find((v) => v.id === p.userId);
        const ready = activity.room?.cinema?.sources.some(
          (source) =>
            source.userId === p.userId &&
            source.ready &&
            Date.now() + activity.serverOffsetMs - source.updatedAt < 15000,
        );
        const details = [
          p.userId === activity.room?.primary?.hostUserId ? 'Oturumu düzenleyen' : '',
          voice?.screen
            ? 'Kaynak sahibi · paylaşıyor'
            : screenTracks.length
              ? 'İzleyici'
              : ready
                ? 'Kendi kaynağı · hazır'
                : 'Katılımcı',
          voice?.muted ? 'Mikrofon kapalı' : voice?.speaking ? 'Konuşuyor' : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <div className="reference-cinema-person" key={p.userId}>
            <VoiceAvatar id={p.userId} name={p.displayName} />
            <div>
              <strong>
                {p.displayName}
                {p.userId === community.user?.id ? ' (sen)' : ''}
              </strong>
              <small>{details}</small>
            </div>
            <ReferenceIcon
              name={
                voice?.screen
                  ? 'monitor'
                  : voice?.muted
                    ? 'mic-off'
                    : voice?.speaking
                      ? 'mic'
                      : ready
                        ? 'check'
                        : 'headphones'
              }
              size={15}
            />
          </div>
        );
      })}
      <button className="button secondary" onClick={() => setInviting(true)}>
        <ReferenceIcon name="plus" size={16} />
        Davet et
      </button>
    </div>
  );
  const footer = (
    <div className="reference-cinema-footer">
      <div className="reference-cinema-avatar-stack">
        {realtime.participants.slice(0, 6).map((p) => (
          <VoiceAvatar key={p.id} id={p.id} name={p.name} />
        ))}
      </div>
      <div>
        <strong>
          {realtime.status === 'connected'
            ? `${realtime.participants.length} kişi ses odasında`
            : 'Ses odası'}
        </strong>
        <small>
          {realtime.status === 'connected'
            ? `${realtime.roomName} · ses bağlantısı açık`
            : realtime.status === 'reconnecting'
              ? 'Ses yeniden bağlanıyor'
              : 'Ses bağlantısı yok'}
        </small>
      </div>
      <button className="button ghost" onClick={() => navigate('/voice')}>
        <ReferenceIcon name="headphones" size={16} />
        Salona dön
      </button>
    </div>
  );
  const overlays = (
    <>
      {sourcePicker && (
        <Modal
          title="Kendi kaynağını seç"
          onClose={closeSource}
          className="reference-cinema-source-modal"
        >
          {activeItem && (
            <div className="reference-cinema-source-summary">
              <ReferenceIcon name="film" size={26} />
              <div>
                <strong>{activeItem.media.title}</strong>
                <small>Ortak içerik adı · kişisel kaynak adresi yok</small>
              </div>
            </div>
          )}
          {!activeItem && (
            <label className="field-label cinema-source-title">
              İÇERİK ADI
              <input
                aria-label="Cinema içerik adı"
                value={sourceTitle}
                onChange={(event) => setSourceTitle(event.target.value)}
                maxLength={240}
                placeholder="İçerik adı"
              />
            </label>
          )}
          <div className="reference-source-options">
            <button
              disabled={
                !!syncReason || sourceBusy || activity.busy || (!activeItem && !sourceTitle.trim())
              }
              title={
                syncReason ?? (!activeItem && !sourceTitle.trim() ? 'İçerik adı gir.' : undefined)
              }
              onClick={() => void choose(true)}
            >
              <ReferenceIcon name="film" size={22} />
              <div>
                <strong>{sourceBusy ? 'Hazırlanıyor' : 'Kişisel senkron kaynak'}</strong>
                <small>{syncReason ?? 'Bu cihazdan kendi dosyanı seç.'}</small>
              </div>
            </button>
            <button
              disabled={!window.rooms}
              title={!window.rooms ? 'Masaüstü uygulaması gerekli' : undefined}
              onClick={() => void choose()}
            >
              <ReferenceIcon name="upload" size={22} />
              <div>
                <strong>Bu cihazdan bir dosya seç</strong>
                <small>Yalnızca bu cihazda oynatılır. Odayla eşitlenmez.</small>
              </div>
              <ReferenceIcon name="arrow-right" size={18} />
            </button>
          </div>
          <button
            className="button ghost"
            onClick={() => {
              closeSource();
              navigate('/settings?tab=connections');
            }}
          >
            <ReferenceIcon name="link" size={16} />
            Kişisel bağlantılarım
          </button>
          {sourceError && (
            <div className="reference-cinema-notice" role="alert">
              {sourceError}
            </div>
          )}
          <div className="reference-cinema-privacy">
            <ReferenceIcon name="lock" size={15} />
            Dosya yolu veya oynatma adresi ortak kuyruğa gönderilmez.
          </div>
          <div className="button-row">
            <button className="button secondary" onClick={closeSource}>
              Geri
            </button>
          </div>
        </Modal>
      )}
      {inviting && <CommunityInvite onClose={closeInvite} notify={notify} />}
    </>
  );
  if (view === 'queue')
    return (
      <div className="reference-cinema-page page-enter">
        <header className="reference-cinema-heading">
          <div>
            <h2>Ortak kuyruk</h2>
            <p>İçerik adları ve oda katılımcıları.</p>
          </div>
          <button
            className="button secondary"
            onClick={() => setView(screenTracks.length ? 'screen' : media ? 'personal' : 'start')}
          >
            <ReferenceIcon name="arrow-left" size={16} />
            Oynatıcıya dön
          </button>
        </header>
        <div
          className="reference-cinema-queue-layout"
          onKeyDown={(event) => {
            if (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ')
              setQueueKeyboard(true);
          }}
        >
          <div>
            <form
              className="reference-cinema-url-row"
              onSubmit={(e) => {
                e.preventDefault();
                void addTitle();
              }}
            >
              <label>
                <ReferenceIcon name="plus" size={16} />
                <input
                  ref={queueInput}
                  aria-label="Ortak kuyruğa eklenecek içerik adı"
                  placeholder="İçerik adı ekle"
                  value={queueTitle}
                  onChange={(e) => setQueueTitle(e.target.value)}
                  maxLength={240}
                />
              </label>
              <button
                className="button primary"
                disabled={
                  !queueAllowed ||
                  activity.room?.primary?.activity !== 'cinema' ||
                  activity.busy ||
                  !queueTitle.trim()
                }
                title={
                  !queueAllowed
                    ? queueReason
                    : activity.room?.primary?.activity !== 'cinema'
                      ? 'YouTube içeriğini YouTube Together ekranından ekle.'
                      : undefined
                }
              >
                Ekle
              </button>
            </form>
            {!queueAllowed && <p className="reference-cinema-reason">{queueReason}</p>}
            <p className="sr-only" role="status" aria-live="polite">
              {queueAnnouncement}
            </p>
            <div className="reference-cinema-queue-list">
              {sharedQueue.map((item, i) => (
                <div
                  className={`reference-cinema-queue-row ${activeItem?.id === item.id ? 'active' : ''}`}
                  key={item.id}
                >
                  <span>
                    {activeItem?.id === item.id ? <ReferenceIcon name="volume" size={15} /> : i + 1}
                  </span>
                  <span className="reference-cinema-item-mark">
                    <ReferenceIcon
                      name={item.media.kind === 'youtube' ? 'play' : 'film'}
                      size={25}
                    />
                  </span>
                  <div>
                    <strong>{item.media.title}</strong>
                    {item.id !== activeItem?.id && (
                      <button
                        className="button secondary small"
                        disabled={!queueAllowed || activity.busy}
                        title={
                          !queueAllowed ? queueReason : activity.busy ? 'İşlem sürüyor.' : undefined
                        }
                        onClick={() =>
                          command(activity.send({ type: 'queue.select', itemId: item.id }))
                        }
                      >
                        Oynatıcıya al
                      </button>
                    )}
                    <small>
                      {activeItem?.id === item.id
                        ? 'Güncel içerik'
                        : `${activity.room?.participants.find((p) => p.userId === item.addedBy)?.displayName ?? 'Katılımcı'} ekledi`}
                    </small>
                  </div>
                  <IconButton
                    label={`${item.media.title} yukarı taşı`}
                    title={
                      !queueAllowed
                        ? queueReason
                        : item.id === activeItem?.id || sharedQueue[i - 1]?.id === activeItem?.id
                          ? 'Güncel içerik yerinde kalır.'
                          : i === 0
                            ? 'Zaten ilk sırada.'
                            : activity.busy
                              ? 'İşlem sürüyor.'
                              : undefined
                    }
                    disabled={
                      !queueAllowed ||
                      activity.busy ||
                      i === 0 ||
                      item.id === activeItem?.id ||
                      sharedQueue[i - 1]?.id === activeItem?.id
                    }
                    onClick={() => void moveItem(i, -1)}
                  >
                    <ReferenceIcon name="arrow-up" size={16} />
                  </IconButton>
                  <IconButton
                    label={`${item.media.title} aşağı taşı`}
                    title={
                      !queueAllowed
                        ? queueReason
                        : item.id === activeItem?.id || sharedQueue[i + 1]?.id === activeItem?.id
                          ? 'Güncel içerik yerinde kalır.'
                          : i === sharedQueue.length - 1
                            ? 'Zaten son sırada.'
                            : activity.busy
                              ? 'İşlem sürüyor.'
                              : undefined
                    }
                    disabled={
                      !queueAllowed ||
                      activity.busy ||
                      i === sharedQueue.length - 1 ||
                      item.id === activeItem?.id ||
                      sharedQueue[i + 1]?.id === activeItem?.id
                    }
                    onClick={() => void moveItem(i, 1)}
                  >
                    <ReferenceIcon name="arrow-down" size={16} />
                  </IconButton>
                  <IconButton
                    label={`${item.media.title} sıradan kaldır`}
                    title={
                      !queueAllowed
                        ? queueReason
                        : item.id === activeItem?.id
                          ? 'Güncel içerik kaldırılamaz.'
                          : activity.busy
                            ? 'İşlem sürüyor.'
                            : undefined
                    }
                    disabled={!queueAllowed || activity.busy || item.id === activeItem?.id}
                    onClick={() =>
                      command(activity.send({ type: 'queue.remove', itemId: item.id }))
                    }
                  >
                    <ReferenceIcon name="x" size={16} />
                  </IconButton>
                </div>
              ))}
            </div>
            {!sharedQueue.length && (
              <div className="reference-cinema-empty queue-empty">
                <ReferenceIcon name="queue" size={34} />
                <h3>Kuyruk boş</h3>
                <button
                  className="button primary"
                  disabled={!queueAllowed}
                  title={!queueAllowed ? queueReason : undefined}
                  onClick={() => queueInput.current?.focus()}
                >
                  <ReferenceIcon name="plus" size={17} />
                  İçerik ekle
                </button>
              </div>
            )}
            {queueKeyboard && (
              <div className="reference-cinema-notice">
                <ReferenceIcon name="move" size={17} />
                Taşıma düğmelerine Tab ile geç, Enter ile sırala.
              </div>
            )}
            <p className="reference-cinema-privacy">
              <ReferenceIcon name="lock" size={15} />
              Yalnızca içerik adları paylaşılır; kişisel kaynak adresi ekleme.
            </p>
          </div>
          {roster}
        </div>
        {activity.error && (
          <div className="reference-cinema-notice" role="alert">
            {activity.error}
            <button className="button secondary small" onClick={() => void activity.refresh()}>
              Yeniden dene
            </button>
          </div>
        )}
        {overlays}
      </div>
    );
  if (view === 'status') {
    const primary = activity.room?.primary;
    const waiting = primary?.activity === 'screen' && !screenTracks.length;
    const closed = activity.status === 'connected' && !primary;
    const syncing = primary?.activity === 'cinema';
    return (
      <div className="reference-cinema-page page-enter">
        <header className="reference-cinema-heading">
          <div>
            <h2>{primary?.title ?? 'Cinema'}</h2>
            <p>Odadaki etkinliğin durumu</p>
          </div>
          {realtime.status === 'connected' && (
            <span className="reference-cinema-voice-pill">
              <ReferenceIcon name="headphones" size={14} />
              Ses bağlantısı açık
            </span>
          )}
        </header>
        <div className="reference-cinema-empty reference-cinema-transition">
          {activity.status === 'loading' ? (
            <span className="reference-cinema-spinner" />
          ) : (
            <ReferenceIcon
              name={waiting ? 'monitor' : closed ? 'film' : hostNotice ? 'users' : 'refresh'}
              size={40}
            />
          )}
          <h3>
            {activity.status === 'loading'
              ? 'Etkinlik bilgisi alınıyor'
              : activity.error
                ? 'Etkinlik bağlantısı kullanılamıyor'
                : waiting
                  ? lastScreen.current
                    ? 'Paylaşım kaynağı kullanılamıyor'
                    : 'Yeni kaynak bekleniyor'
                  : closed
                    ? activityEnded
                      ? 'Etkinlik sona erdi'
                      : 'Etkinlik yok'
                    : syncing
                      ? 'Kendi kaynağınla katıl'
                      : hostNotice || 'Etkinlik devam ediyor'}
          </h3>
          <p>
            {activity.error ??
              (waiting
                ? 'Yeni paylaşım bu cihazdan bir kaynak seçip onay vererek başlatılır.'
                : syncing
                  ? 'Ortak kuyruktan içerik seç ve bu cihazdaki kaynağını hazırla.'
                  : closed
                    ? 'Yeni etkinlik seçebilir veya sohbete dönebilirsin.'
                    : primary?.activity === 'youtube'
                      ? 'Resmî YouTube oynatıcısından devam et.'
                      : 'Etkinliği açabilirsin.')}
          </p>
          <div className="button-row">
            {activity.error ? (
              <button className="button secondary" onClick={() => void activity.refresh()}>
                Yeniden dene
              </button>
            ) : waiting ? (
              <button
                className="button primary"
                disabled={realtime.status !== 'connected'}
                title={realtime.status !== 'connected' ? 'Önce ses odasına katıl.' : undefined}
                onClick={chooseScreen}
              >
                Bir kaynak seç
              </button>
            ) : syncing ? (
              <>
                <button className="button primary" onClick={() => setSourcePicker(true)}>
                  Kişisel kaynak seç
                </button>
                <button className="button secondary" onClick={() => setView('queue')}>
                  Ortak kuyruk
                </button>
              </>
            ) : primary ? (
              <button
                className="button primary"
                onClick={() =>
                  primary.activity === 'youtube' ? navigate('/watch/youtube') : setView('screen')
                }
              >
                Etkinliğe dön
              </button>
            ) : (
              <button className="button primary" onClick={() => setView('start')}>
                Yeni etkinlik
              </button>
            )}
            <button className="button secondary" onClick={() => navigate('/chat')}>
              Sohbete dön
            </button>
          </div>
        </div>
        {hostNotice && <div className="reference-cinema-notice">{hostNotice}</div>}
        {footer}
        {overlays}
      </div>
    );
  }
  if (view === 'screen')
    return (
      <div className="reference-cinema-page reference-cinema-screen-page page-enter">
        <header className="reference-cinema-heading">
          <div>
            <h2>Ekran paylaşımı</h2>
            <p>
              {realtime.sharing
                ? 'Bu cihazdan paylaşıyorsun.'
                : screenTracks.length
                  ? 'Paylaşılan ekranı izliyorsun.'
                  : 'Paylaşım bekleniyor.'}
            </p>
          </div>
          {realtime.sharing && (
            <button
              className="button secondary"
              onClick={() => command(stopScreen().then(chooseScreen))}
            >
              <ReferenceIcon name="monitor" size={16} />
              Kaynağı değiştir
            </button>
          )}
        </header>
        <ScreenHandoffControls activeShare={screenTracks.length > 0} notify={notify} />
        {screenTracks.length > 0 && (
          <div className="reference-cinema-notice">
            <ReferenceIcon name="monitor" size={17} />
            <span>
              {realtime.sharing ? 'Ekran paylaşımın açık' : 'Paylaşılan ekran gösteriliyor'}
            </span>
            {realtime.sharing && (
              <button className="button danger small" onClick={() => command(stopScreen())}>
                Paylaşımı durdur
              </button>
            )}
          </div>
        )}
        {screenTracks.length ? (
          screenTracks.map((t) => (
            <CinemaScreenStage
              key={t.id}
              trackId={t.id}
              participantId={t.participantId}
              notify={notify}
            />
          ))
        ) : (
          <div className="reference-cinema-empty">
            <ReferenceIcon name="monitor" size={40} />
            <h3>
              {lastScreen.current ? 'Paylaşım kaynağı kullanılamıyor' : 'Yeni kaynak bekleniyor'}
            </h3>
            <p>Bir kaynak bu cihazdan seçilip onayla başlatılmalı.</p>
            <button
              className="button primary"
              disabled={realtime.status !== 'connected'}
              title={realtime.status !== 'connected' ? 'Önce ses odasına katıl.' : undefined}
              onClick={chooseScreen}
            >
              Bir kaynak seç
            </button>
          </div>
        )}
        {footer}
        {overlays}
      </div>
    );
  if (!media)
    return (
      <div className="reference-cinema-page reference-cinema-start page-enter">
        <header className="reference-cinema-heading">
          <div>
            <span className="reference-cinema-eyebrow">CINEMA</span>
            <h2>{activityEnded ? 'Etkinlik sona erdi' : 'Birlikte izle'}</h2>
            <p>
              {activity.room?.primary?.activity === 'cinema'
                ? 'Ortak içerik listesi açık. Kendi kaynağınla katıl.'
                : 'İzleme modunu seç.'}
            </p>
          </div>
          {realtime.status === 'connected' && (
            <span className="reference-cinema-voice-pill">
              <ReferenceIcon name="headphones" size={13} />
              {realtime.roomName} · {realtime.participants.length} kişi
            </span>
          )}
        </header>
        {hostNotice && <div className="reference-cinema-notice">{hostNotice}</div>}
        {activity.status === 'connected' && !activity.room?.primary && (
          <div className="reference-cinema-notice">
            <ReferenceIcon name="film" size={17} />
            Kaynak seçilmedi.
          </div>
        )}
        <div className="reference-cinema-mode-grid">
          <section className="reference-cinema-mode">
            <h3>YouTube</h3>
            <p>Aynı videoyu odanın ortak kuyruğu ve oynatma kontrolleriyle izle.</p>
            <button className="button primary" onClick={() => navigate('/watch/youtube')}>
              Birlikte YouTube aç
            </button>
          </section>
          <section className="reference-cinema-mode">
            <h3>IPTV ve kişisel medyam</h3>
            <p>
              Kendi bağlantını ekle, içeriği aç ve oynatıcıdaki “Odayla paylaş” düğmesinden
              pencereni seç.
            </p>
            <button className="button secondary" onClick={() => navigate('/media')}>
              Medyamı aç
            </button>
          </section>
          <section className="reference-cinema-mode">
            <h3>Stremio veya başka uygulama</h3>
            <p>İçeriği kendi uygulamanda aç. Ardından o pencereyi seçerek odadakilerle izle.</p>
            <button
              className="button secondary"
              disabled={realtime.status !== 'connected'}
              title={realtime.status !== 'connected' ? 'Önce ses odasına katıl.' : undefined}
              onClick={chooseScreen}
            >
              Uygulama penceresi seç
            </button>
          </section>
          <section className="reference-cinema-mode selected">
            <span className="reference-cinema-private-pill">
              <ReferenceIcon name="lock" size={13} />
              Kişisel kaynak
            </span>
            <span className="reference-cinema-mode-icon">
              <ReferenceIcon name="film" size={25} />
            </span>
            <h3>
              Kendi kaynağınla
              <br />
              senkron izle
            </h3>
            <p>Dosyan bu cihazda oynatılır. Cinema odasına kendi kaynağınla katılabilirsin.</p>
            <button className="button primary" onClick={() => setSourcePicker(true)}>
              <ReferenceIcon name="arrow-right" size={16} />
              Kaynağımı seç
            </button>
          </section>
          <section className="reference-cinema-mode">
            <span className="reference-cinema-mode-icon">
              <ReferenceIcon name="monitor" size={25} />
            </span>
            <h3>
              Ekran paylaşımıyla
              <br />
              birlikte izle
            </h3>
            <p>Seçtiğin pencere veya ekran ses odasında paylaşılır.</p>
            <button
              className="button secondary"
              disabled={realtime.status !== 'connected'}
              title={realtime.status !== 'connected' ? 'Önce gerçek ses odasına katıl.' : undefined}
              onClick={() => {
                setView('screen');
                if (!screenTracks.length) chooseScreen();
              }}
            >
              <ReferenceIcon name="monitor" size={16} />
              {screenTracks.length ? 'Paylaşımı izle' : 'Paylaşımı hazırla'}
            </button>
          </section>
        </div>
        <div className="reference-cinema-start-roster">
          <strong>{realtime.roomName ?? 'Ses odası'}</strong>
          <div className="reference-cinema-start-roster-row">
            <div className="reference-cinema-avatar-stack">
              {realtime.participants.map((p) => (
                <VoiceAvatar key={p.id} id={p.id} name={p.name} />
              ))}
            </div>
            <span>
              {realtime.participants.map((p) => p.name).join(', ') || 'Ses odasına bağlı değilsin.'}
            </span>
            <button className="button ghost" onClick={() => setInviting(true)}>
              <ReferenceIcon name="plus" size={16} />
              Davet et
            </button>
          </div>
        </div>
        <div className="reference-cinema-start-actions">
          <button className="button secondary" onClick={() => setView('status')}>
            Etkinlik durumu
          </button>
          <button className="button secondary" onClick={() => setView('queue')}>
            <ReferenceIcon name="queue" size={16} />
            Ortak kuyruk
          </button>
          <button className="button secondary" onClick={() => navigate('/watch/youtube')}>
            <ReferenceIcon name="play" size={16} />
            YouTube Together
          </button>
        </div>
        <p className="reference-cinema-privacy">
          <ReferenceIcon name="lock" size={15} />
          Kişisel bağlantıların, dosya yolların ve anahtarların diğer katılımcılara gösterilmez.
        </p>
        {overlays}
      </div>
    );
  return null; // The persistent CinemaPlayback host owns the personal video element.
}
