import { useEffect, useState } from 'react';
import { ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import type { SocialSpaceProfile } from '@rooms/social';
import { useCommunity } from './community';
import { locale, t, uiError } from './i18n';
import './server-profile.css';

/**
 * Discord-style server profile: name, description, icon and banner with a live preview card.
 * Only someone with Manage Server can save; the server checks it again.
 */
export function ServerProfile({ notify }: { notify(message: string): void }) {
  const spaceId = useCommunity((s) => s.activeSpaceId),
    userId = useCommunity((s) => s.user?.id),
    space = useCommunity((s) => s.spaces.find((item) => item.id === s.activeSpaceId));
  const social = window.rooms?.social;
  const [profile, setProfile] = useState<SocialSpaceProfile | null>(null),
    [canEdit, setCanEdit] = useState(false),
    [members, setMembers] = useState<{ total: number; online: number } | null>(null),
    [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState<'save' | 'icon' | 'banner' | null>(null),
    [error, setError] = useState('');
  const accept = (value: SocialSpaceProfile) => {
    setProfile(value);
    setName(value.name);
    setDescription(value.description);
  };
  useEffect(() => {
    let active = true;
    setProfile(null);
    setError('');
    if (!spaceId || !social?.spaceProfile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void Promise.all([
      social.spaceProfile(spaceId),
      social.communityCapabilities?.(spaceId).catch(() => null) ?? null,
      social.members(spaceId).catch(() => null),
    ])
      .then(([value, rights, list]) => {
        if (!active) return;
        accept(value);
        setCanEdit(value.ownerId === userId || !!rights?.manageServer);
        setMembers(
          list && {
            total: list.length,
            online: list.filter((member) => !['invisible', 'unknown'].includes(member.status))
              .length,
          },
        );
      })
      .catch((e) => active && setError(uiError(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [spaceId, userId, social]);
  const dirty = !!profile && (name.trim() !== profile.name || description !== profile.description);
  const run = async (
    kind: 'save' | 'icon' | 'banner',
    task: () => Promise<SocialSpaceProfile | null>,
    done: string,
  ) => {
    setBusy(kind);
    setError('');
    try {
      const value = await task();
      if (value) {
        accept(value);
        notify(done);
      }
    } catch (e) {
      setError(uiError(e));
    } finally {
      setBusy(null);
    }
  };
  if (!spaceId) return <p className="sp-note">{t('Önce bir topluluk seç.')}</p>;
  if (!social?.spaceProfile)
    return (
      <p className="sp-note">{t('Sunucu profili için güncel masaüstü uygulaması gerekiyor.')}</p>
    );
  if (loading)
    return (
      <p className="sp-note" role="status">
        <LoaderCircle size={16} className="spin" /> {t('Sunucu profili yükleniyor…')}
      </p>
    );
  if (!profile)
    return (
      <p className="sp-note" role="alert">
        {error || t('Sunucu profili okunamadı.')}
      </p>
    );
  const image = (kind: 'icon' | 'banner') => (
    <div className="sp-image-actions">
      <button
        className="button primary"
        disabled={!canEdit || !!busy}
        onClick={() =>
          void run(
            kind,
            () => social.chooseSpaceImage!(spaceId, kind),
            kind === 'icon' ? t('Sunucu ikonu güncellendi.') : t('Sunucu afişi güncellendi.'),
          )
        }
      >
        {busy === kind ? <LoaderCircle size={16} className="spin" /> : <ImagePlus size={16} />}
        {kind === 'icon' ? t('İkonu değiştir') : t('Afişi değiştir')}
      </button>
      {profile[kind] && (
        <button
          className="button subtle danger-text"
          disabled={!canEdit || !!busy}
          onClick={() =>
            void run(
              kind,
              () => social.removeSpaceImage!(spaceId, kind),
              kind === 'icon' ? t('Sunucu ikonu kaldırıldı.') : t('Sunucu afişi kaldırıldı.'),
            )
          }
        >
          <Trash2 size={15} />
          {t('Kaldır')}
        </button>
      )}
    </div>
  );
  const initials = (name.trim() || profile.name)
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase(locale))
    .join('');
  return (
    <div className="server-profile">
      <div className="sp-form">
        <header>
          <h1>{t('Sunucu profili')}</h1>
          <p>{t('Sunucunun davetlerde ve uygulamada nasıl görüneceğini ayarla.')}</p>
        </header>
        {!canEdit && (
          <p className="sp-note inline">
            {t(
              'Profili yalnızca topluluk sahibi veya “Sunucuyu yönet” izni olanlar değiştirebilir.',
            )}
          </p>
        )}
        <label className="sp-field">
          <span>Ad</span>
          <input
            value={name}
            maxLength={32}
            disabled={!canEdit || !!busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="sp-field">
          <span>{t('Açıklama')}</span>
          <textarea
            value={description}
            maxLength={1024}
            rows={3}
            placeholder={t('Bu topluluk ne için? Davet edilenler burada okur.')}
            disabled={!canEdit || !!busy}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <hr />
        <section className="sp-section">
          <h2>{t('İkon')}</h2>
          <p>
            {t(
              'En az 512×512 kare bir görsel önerilir. PNG, JPEG, WebP ya da GIF; en fazla 2,5 MB.',
            )}
          </p>
          {image('icon')}
        </section>
        <hr />
        <section className="sp-section">
          <h2>{t('Afiş')}</h2>
          <p>{t('Profil kartının üstünde görünür. Geniş bir görsel seç; en fazla 6 MB.')}</p>
          {image('banner')}
        </section>
        {error && (
          <p className="sp-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <aside className="sp-preview" aria-label={t('Önizleme')}>
        <div
          className="sp-banner"
          style={profile.banner ? { backgroundImage: `url("${profile.banner}")` } : undefined}
        />
        <div className="sp-card-body">
          <span className="sp-icon">
            {profile.icon ? <img src={profile.icon} alt="" /> : initials || 'R'}
          </span>
          <strong>{name.trim() || profile.name}</strong>
          {description.trim() && <p>{description.trim()}</p>}
          {members && (
            <small>
              <i className="online" /> {t('{count} çevrimiçi', { count: members.online })} <i />{' '}
              {t('{count} üye', { count: members.total })}
            </small>
          )}
          {space?.ownerId === userId && <small className="sp-owner">{t('Sahibi sensin')}</small>}
        </div>
      </aside>
      {dirty && canEdit && (
        <div className="sp-savebar" role="region" aria-label={t('Kaydedilmemiş değişiklikler')}>
          <span>{t('Dikkat, kaydedilmemiş değişikliklerin var.')}</span>
          <button
            className="button subtle"
            disabled={!!busy}
            onClick={() => {
              setName(profile.name);
              setDescription(profile.description);
            }}
          >
            {t('Sıfırla')}
          </button>
          <button
            className="button primary"
            disabled={!!busy || !name.trim()}
            onClick={() =>
              void run(
                'save',
                () => social.updateSpaceProfile!({ spaceId, name: name.trim(), description }),
                t('Sunucu profili kaydedildi.'),
              )
            }
          >
            {busy === 'save' ? t('Kaydediliyor…') : t('Değişiklikleri kaydet')}
          </button>
        </div>
      )}
    </div>
  );
}
