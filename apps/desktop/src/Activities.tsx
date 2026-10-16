import { useCommunityBranding } from './use-community-branding';
import { openRoomActivity } from './MusicDJ';
import './reference-voice.css';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@rooms/design';
import { ReferenceIcon } from './ReferenceIcon';
import { useCommunity } from './community';
import { useRealtime, stopScreen } from './realtime';
import { useActivityRoom } from './activity';
import { uiError } from './i18n';

export function ActivityLauncher({ onClose }: { onClose(): void }) {
  const community = useCommunity(),
    voice = useRealtime(),
    navigate = useNavigate();
  const branding = useCommunityBranding();
  const roomId = voice.channelId ?? community.activeChannelId;
  const activity = useActivityRoom(roomId);
  const [error, setError] = useState('');
  const primary = activity.room?.primary;
  const self = activity.room?.participants.find((p) => p.userId === community.user?.id);
  const forbidden = self?.canControl === false;
  const routeFor = (kind: string) =>
    kind === 'cinema'
      ? '/cinema'
      : kind === 'youtube'
        ? '/cinema'
        : kind === 'screen'
          ? '/voice?view=share'
          : '/games';
  const open = (path: string) => {
    openRoomActivity(path, navigate);
    onClose();
  };
  const position = Math.max(0, Math.floor(activity.room?.timeline.positionSec ?? 0));
  const positionLabel = `${Math.floor(position / 60)}:${String(position % 60).padStart(2, '0')}`;
  const roomCount = activity.room?.participants.length;
  const catalog = [
    {
      label: 'Birlikte izle',
      icon: 'film',
      description: 'YouTube, IPTV, Stremio veya kendi dosyan.',
      path: '/cinema',
    },
    {
      label: branding.name,
      icon: 'play',
      description: 'Ses odasına müzik botu çağır.',
      path: '/youtube',
    },
    {
      label: 'Kıraathane',
      icon: 'cards',
      description: 'Hold’em, Blackjack, Batak ve 101 Okey.',
      path: '/games',
    },
  ];
  return (
    <Modal
      title={
        forbidden
          ? 'Etkinlik başlatılamıyor'
          : primary
            ? primary.activity === 'cinema'
              ? 'Salonda Cinema devam ediyor'
              : 'Devam eden etkinlik'
            : 'Etkinlikler'
      }
      onClose={onClose}
      className={`launcher-modal reference-launcher-modal ${primary ? 'has-active-activity' : ''} ${forbidden ? 'is-forbidden' : ''}`}
    >
      {forbidden ? (
        <>
          <div className="reference-media-notice" role="alert">
            <ReferenceIcon name="lock" size={18} />
            <span>
              Bu odada etkinlik başlatma yetkin yok. Devam eden etkinliğe katılabilir veya bir oda
              yöneticisinden yardım isteyebilirsin.
            </span>
          </div>
          <p className="modal-description">
            Sesli sohbetin ve erişebildiğin kanallar çalışmaya devam eder.
          </p>
          {primary && (
            <div className="button-row">
              <button className="button primary" onClick={() => open('/voice')}>
                Salona dön
              </button>
            </div>
          )}
        </>
      ) : primary ? (
        <>
          <div className="reference-active-activity">
            <span className="reference-activity-mark">
              <ReferenceIcon
                name={
                  primary.activity === 'youtube'
                    ? 'play'
                    : primary.activity === 'cinema'
                      ? 'film'
                      : primary.activity === 'screen'
                        ? 'monitor'
                        : 'cards'
                }
                size={23}
              />
            </span>
            <div>
              <strong>{primary.title}</strong>
              <small>
                {primary.activity === 'cinema'
                  ? `Cinema · ${roomCount ?? 0} kişi odada · ${positionLabel}`
                  : primary.activity === 'youtube'
                    ? 'YouTube Together'
                    : primary.activity === 'screen'
                      ? 'Ekran paylaşımı'
                      : 'Oyun masası'}
              </small>
            </div>
            <span className="reference-live-pill">Etkin</span>
          </div>
          <div className="reference-media-notice">
            <ReferenceIcon name="alert-triangle" size={18} />
            <span>
              Yeni bir ana etkinlik için mevcut etkinliği herkes adına bitir. Sesli sohbet ve yan
              etkinlikler devam eder.
            </span>
          </div>
          <p className="modal-description">
            İstersen mevcut etkinliğe dön. Etkinliği kapatmak için tüm katılımcılara gösterilen açık
            aksiyonu kullan.
          </p>
          <div className="button-row">
            <button className="button secondary" onClick={() => open(routeFor(primary.activity))}>
              {primary.activity === 'cinema' && <ReferenceIcon name="film" size={16} />}
              {primary.activity === 'cinema' ? 'Cinema’ya dön' : 'Etkinliğe dön'}
            </button>
            <button
              className="button danger"
              disabled={activity.busy}
              onClick={() => {
                setError('');
                void (async () => {
                  if (primary.activity === 'screen' && voice.sharing) await stopScreen();
                  await activity.send({ type: 'end' });
                })().catch((e) => setError(uiError(e)));
              }}
            >
              <ReferenceIcon name="plus" size={16} />
              {activity.busy ? 'Bitiriliyor…' : 'Bitir ve etkinlik seç'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="modal-description">
            {voice.roomName ?? 'Oda'}
            {roomCount !== undefined ? ` · ${roomCount} kişi hazır` : ''}. Bir ana etkinlik seç;
            sohbet açık kalsın.
          </p>
          <div className="reference-activity-grid">
            {catalog.map((card) => (
              <button
                className="reference-activity-card"
                key={card.path}
                onClick={() => open(card.path)}
              >
                <ReferenceIcon name={card.icon} size={25} />
                <strong>{card.label}</strong>
                <small>{card.description}</small>
              </button>
            ))}
          </div>
          <button className="button secondary" onClick={() => open('/media')}>
            Medyam
          </button>
          <div className="reference-launcher-divider" />
          <h3 className="reference-launcher-label">Sohbetin yanında</h3>
          <div className="reference-side-activities">
            <button className="button secondary" onClick={() => open('/together?tab=polls')}>
              <ReferenceIcon name="poll" size={16} />
              Anket aç
            </button>
            <button className="button secondary" onClick={() => open('/together?tab=board')}>
              <ReferenceIcon name="whiteboard" size={16} />
              Whiteboard
            </button>
            <button className="button ghost" onClick={() => open('/agent')}>
              <ReferenceIcon name="bot" size={16} />
              Asistana yaz
            </button>
          </div>
        </>
      )}
      {(primary || forbidden) && (
        <button className="button secondary" onClick={() => open('/games')}>
          <ReferenceIcon name="cards" size={16} />
          Kıraathane
        </button>
      )}
      {error && (
        <div className="reference-media-notice" role="alert">
          {error}
        </div>
      )}
      {!primary && (
        <div className="button-row reference-launcher-footer">
          <button className="button secondary" onClick={onClose}>
            Kapat
          </button>
        </div>
      )}
    </Modal>
  );
}
