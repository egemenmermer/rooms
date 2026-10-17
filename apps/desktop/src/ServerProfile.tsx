import { useEffect, useState } from 'react';
import { ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import type { SocialSpaceProfile } from '@rooms/social';
import { useCommunity } from './community';
import { uiError } from './i18n';
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
  if (!spaceId) return <p className="sp-note">Önce bir topluluk seç.</p>;
  if (!social?.spaceProfile)
    return <p className="sp-note">Sunucu profili için güncel masaüstü uygulaması gerekiyor.</p>;
  if (loading)
    return (
      <p className="sp-note" role="status">
        <LoaderCircle size={16} className="spin" /> Sunucu profili yükleniyor…
      </p>
    );
  if (!profile)
    return (
      <p className="sp-note" role="alert">
        {error || 'Sunucu profili okunamadı.'}
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
            kind === 'icon' ? 'Sunucu ikonu güncellendi.' : 'Sunucu afişi güncellendi.',
          )
        }
      >
        {busy === kind ? <LoaderCircle size={16} className="spin" /> : <ImagePlus size={16} />}
        {kind === 'icon' ? 'İkonu değiştir' : 'Afişi değiştir'}
      </button>
      {profile[kind] && (
        <button
          className="button subtle danger-text"
          disabled={!canEdit || !!busy}
          onClick={() =>
            void run(
              kind,
              () => social.removeSpaceImage!(spaceId, kind),
              kind === 'icon' ? 'Sunucu ikonu kaldırıldı.' : 'Sunucu afişi kaldırıldı.',
            )
          }
        >
          <Trash2 size={15} />
          Kaldır
        </button>
      )}
    </div>
  );
  const initials = (name.trim() || profile.name)
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase('tr'))
    .join('');
  return (
    <div className="server-profile">
      <div className="sp-form">
        <header>
          <h1>Sunucu profili</h1>
          <p>Sunucunun davetlerde ve uygulamada nasıl görüneceğini ayarla.</p>
        </header>
        {!canEdit && (
          <p className="sp-note inline">
            Profili yalnızca topluluk sahibi veya “Sunucuyu yönet” izni olanlar değiştirebilir.
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
          <span>Açıklama</span>
          <textarea
            value={description}
            maxLength={1024}
            rows={3}
            placeholder="Bu topluluk ne için? Davet edilenler burada okur."
            disabled={!canEdit || !!busy}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <hr />
        <section className="sp-section">
          <h2>İkon</h2>
          <p>En az 512×512 kare bir görsel önerilir. PNG, JPEG, WebP ya da GIF; en fazla 2,5 MB.</p>
          {image('icon')}
        </section>
        <hr />
        <section className="sp-section">
          <h2>Afiş</h2>
          <p>Profil kartının üstünde görünür. Geniş bir görsel seç; en fazla 6 MB.</p>
          {image('banner')}
        </section>
        {error && (
          <p className="sp-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <aside className="sp-preview" aria-label="Önizleme">
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
              <i className="online" /> {members.online} çevrimiçi <i /> {members.total} üye
            </small>
          )}
          {space?.ownerId === userId && <small className="sp-owner">Sahibi sensin</small>}
        </div>
      </aside>
      {dirty && canEdit && (
        <div className="sp-savebar" role="region" aria-label="Kaydedilmemiş değişiklikler">
          <span>Dikkat, kaydedilmemiş değişikliklerin var.</span>
          <button
            className="button subtle"
            disabled={!!busy}
            onClick={() => {
              setName(profile.name);
              setDescription(profile.description);
            }}
          >
            Sıfırla
          </button>
          <button
            className="button primary"
            disabled={!!busy || !name.trim()}
            onClick={() =>
              void run(
                'save',
                () => social.updateSpaceProfile!({ spaceId, name: name.trim(), description }),
                'Sunucu profili kaydedildi.',
              )
            }
          >
            {busy === 'save' ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}
          </button>
        </div>
      )}
    </div>
  );
}
