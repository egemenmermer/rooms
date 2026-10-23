import './community-cinema.css';
import { useEffect, useState } from 'react';
import {
  CalendarClock,
  Captions,
  Eye,
  EyeOff,
  LoaderCircle,
  Plug,
  RefreshCw,
  Trash2,
  Unplug,
} from 'lucide-react';
import { Modal } from '@rooms/design';
import type { CinemaSourceInput } from '../../../../packages/community-cinema/src/bridge';
import type { CinemaStatus } from '../../../../packages/community-cinema/src/types';
import { useActivityRoom } from '../activity';
import { useCommunity } from '../community';
import { acceptCinemaStatus, useCommunityCinema } from './cinema-status';
import { cinemaErrorText, getCinemaBridge } from './cinema-bridge';
import { CinemaViewerSettings } from './CinemaViewerSettings';
import { locale, t } from '../i18n';

const dateFormat = new Intl.DateTimeFormat(locale, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const count = (value: number) => value.toLocaleString(locale);

function ago(ms: number | null) {
  if (!ms) return t('henüz değil');
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return t('az önce');
  if (minutes < 60) return t('{minutes} dk önce', { minutes });
  const hours = Math.round(minutes / 60);
  return hours < 24 ? t('{hours} sa önce', { hours }) : dateFormat.format(ms);
}

const stepLabels: Record<NonNullable<CinemaStatus['importing']>['step'], string> = {
  connecting: t('Sağlayıcıya bağlanıyor'),
  live: t('Canlı kanallar alınıyor'),
  movies: t('Filmler alınıyor'),
  series: t('Diziler alınıyor'),
  guide: t('Yayın rehberi alınıyor'),
  completed: t('Katalog hazır'),
  failed: t('İçe aktarma durdu'),
};

/** Settings → Sinema: the owner picks the hall channel and connects the server's IPTV account. */
/** Xtream account states as panels report them. */
const accountStatus: Record<string, string> = {
  active: t('Etkin'),
  expired: t('Süresi dolmuş'),
  banned: t('Yasaklı'),
  disabled: t('Devre dışı'),
};

export function CinemaSettings({ notify }: { notify(message: string): void }) {
  const cinema = useCommunityCinema(15_000);
  const channels = useCommunity((s) => s.channels);
  const bridge = getCinemaBridge();
  const [busy, setBusy] = useState<
    'hall' | 'connect' | 'reload' | 'disconnect' | 'subtitles' | 'tmdb' | 'audio' | null
  >(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const status = cinema.status;
  const run = async (
    kind: NonNullable<typeof busy>,
    task: () => Promise<CinemaStatus>,
    done: string,
  ) => {
    setBusy(kind);
    setError('');
    try {
      acceptCinemaStatus(await task());
      notify(done);
      return true;
    } catch (reason) {
      setError(cinemaErrorText(reason));
      return false;
    } finally {
      setBusy(null);
    }
  };
  if (!bridge)
    return (
      <p className="cs-note">{t('Sinema salonu için güncel masaüstü uygulaması gerekiyor.')}</p>
    );
  if (cinema.loading || !cinema.communityId)
    return (
      <p className="cs-note" role="status">
        <LoaderCircle size={16} className="spin" /> {t('Sinema ayarları yükleniyor…')}
      </p>
    );
  if (!status)
    return (
      <p className="cs-note" role="alert">
        {cinema.error ?? t('Sinema hizmetine ulaşılamadı.')}
      </p>
    );
  const communityId = cinema.communityId;
  const owner = status.isOwner;
  return (
    <div className="cinema-settings">
      <header>
        <h1>{t('Sinema')}</h1>
        <p>
          {t(
            'Topluluğun kalıcı sinema salonu. Sunucunun IPTV hesabını bir kez bağla; salonu görebilen herkes kanalları, rehberi, filmleri ve dizileri birlikte açabilsin.',
          )}
        </p>
      </header>
      <CinemaViewerSettings />
      <hr />
      {!owner && (
        <p className="cs-note inline">
          {t('Sinema ayarlarını yalnızca topluluk sahibi değiştirebilir.')}
        </p>
      )}

      <section className="cs-section">
        <h2>{t('Salon kanalı')}</h2>
        <p>
          {t(
            'Salonun sohbeti bu kanalda kalır, kimin göreceğini kanal izinleri belirler. Kanal, sol menüde “Sinema” olarak görünür; bu yüzden yalnızca yazı kanalları seçilebilir.',
          )}
        </p>
        <select
          className="cs-select"
          value={status.hallChannelId ?? ''}
          disabled={!owner || !!busy}
          aria-label={t('Salon kanalı')}
          onChange={(event) =>
            void run(
              'hall',
              () => bridge.setHall(communityId, event.target.value || null),
              event.target.value ? t('Salon kanalı seçildi.') : t('Salon kanalı kaldırıldı.'),
            )
          }
        >
          <option value="">{t('Kanal seç…')}</option>
          {channels
            // A voice channel would vanish from Odalar once it becomes the hall.
            .filter((channel) => channel.type === 0)
            .map((channel) => (
              <option key={channel.id} value={channel.id}>
                # {channel.name}
              </option>
            ))}
        </select>
      </section>

      <hr />
      {status.connected && (status.source || !owner) ? (
        <ConnectedCard
          status={status}
          owner={owner}
          busy={busy}
          onReload={(scope) =>
            void run(
              'reload',
              () => bridge.reload(communityId, scope),
              scope === 'guide'
                ? t('Rehber yeniden yükleniyor.')
                : t('Katalog yeniden yükleniyor.'),
            )
          }
          onDisconnect={() => setConfirm(true)}
        />
      ) : (
        <ConnectForm
          owner={owner}
          busy={busy === 'connect'}
          onConnect={(source) =>
            run(
              'connect',
              () => bridge.connect(communityId, source),
              t('IPTV hesabı bağlandı. Katalog yükleniyor.'),
            )
          }
        />
      )}
      <hr />
      <section className="cs-section">
        <h2>{t('Ses dili')}</h2>
        <p>
          {t(
            'Bir filmin birden fazla ses dili varsa salon onunla başlar. Kumanda kimdeyse film oynarken sesi herkes için değiştirebilir.',
          )}
        </p>
        <div
          className="cs-choices"
          role="radiogroup"
          aria-label={t('Filmler hangi sesle başlasın')}
        >
          {(
            [
              ['turkish', t('Türkçe dublaj'), t('Varsa Türkçe ses, yoksa filmin kendi dili')],
              [
                'original',
                t('Orijinal'),
                t('Her zaman filmin kendi dili; Türkçe altyazı kendiliğinden açılır'),
              ],
            ] as const
          ).map(([value, label, detail]) => (
            <label key={value} className="cs-choice">
              <input
                type="radio"
                name="cinema-audio-default"
                checked={(status.audioDefault ?? 'turkish') === value}
                disabled={!owner || !!busy}
                onChange={() =>
                  void run(
                    'audio',
                    () => bridge.setAudioDefault(communityId, value),
                    value === 'original'
                      ? t('Filmler artık kendi dilinde başlar.')
                      : t('Filmler artık varsa Türkçe dublajla başlar.'),
                  )
                }
              />
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
            </label>
          ))}
        </div>
      </section>
      <hr />
      <SubtitleSection
        enabled={status.subtitleSearch}
        owner={owner}
        busy={busy === 'subtitles'}
        disabled={!!busy}
        onSave={(key) =>
          run(
            'subtitles',
            () => bridge.setSubtitleKey(communityId, key),
            key ? t('SubDL anahtarı doğrulandı ve kaydedildi.') : t('SubDL anahtarı kaldırıldı.'),
          )
        }
      />
      <hr />
      <MetadataSection
        enabled={!!status.tmdb}
        owner={owner}
        busy={busy === 'tmdb'}
        disabled={!!busy}
        onSave={(key) =>
          run(
            'tmdb',
            () => bridge.setTmdbKey(communityId, key),
            key ? t('TMDB anahtarı doğrulandı ve kaydedildi.') : t('TMDB anahtarı kaldırıldı.'),
          )
        }
      />
      {error && (
        <p className="cs-error" role="alert">
          {error}
        </p>
      )}
      {confirm && (
        <DisconnectConfirm
          hallId={status.hallChannelId}
          busy={busy === 'disconnect'}
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            if (
              await run(
                'disconnect',
                () => bridge.disconnect(communityId),
                t('IPTV bağlantısı kaldırıldı.'),
              )
            )
              setConfirm(false);
          }}
        />
      )}
    </div>
  );
}

/** Online subtitles for films without their own: the owner's SubDL key, kept on the server. */
function SubtitleSection({
  enabled,
  owner,
  busy,
  disabled,
  onSave,
}: {
  enabled: boolean;
  owner: boolean;
  busy: boolean;
  disabled: boolean;
  onSave(key: string | null): Promise<boolean>;
}) {
  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const valid = /^[A-Za-z0-9_-]{8,128}$/.test(key.trim());
  return (
    <section className="cs-section">
      <h2>{t('Altyazılar')}</h2>
      <p>
        {t(
          "Kendi altyazısı olmayan filmler ve bölümler için salon, SubDL'de Türkçe ve İngilizce altyazı arar. Herkes altyazısını kendisi seçer; dilerse kendi dosyasını da yükler.",
        )}
      </p>
      <p className="cs-note inline">
        <Captions size={15} />
        {enabled ? t('Çevrimiçi altyazı araması açık.') : t('Çevrimiçi altyazı araması kapalı.')}
      </p>
      {owner && (
        <form
          className="cs-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) void onSave(key.trim()).then((ok) => ok && setKey(''));
          }}
        >
          <label className="cs-field">
            <span>{enabled ? t('Yeni SubDL API anahtarı') : t('SubDL API anahtarı')}</span>
            <span className="cs-password">
              <input
                type={reveal ? 'text' : 'password'}
                value={key}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                onChange={(event) => setKey(event.target.value)}
              />
              <button
                type="button"
                aria-label={reveal ? t('Anahtarı gizle') : t('Anahtarı göster')}
                disabled={disabled}
                onClick={() => setReveal(!reveal)}
              >
                {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
            <small>
              {t('Anahtarı')}{' '}
              <a href="https://subdl.com/api-doc" target="_blank" rel="noreferrer noopener">
                {t('SubDL’in API sayfasından')}
              </a>{' '}
              {t(
                'ücretsiz alabilirsin. Anahtar sunucuda şifreli saklanır, kimseye gösterilmez; aramalar senin hesabının günlük sınırını kullanır.',
              )}
            </small>
          </label>
          <div className="cs-actions">
            <button className="button primary" disabled={disabled || !valid}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Captions size={16} />}
              {busy ? t('Doğrulanıyor…') : t('Doğrula ve kaydet')}
            </button>
            {enabled && (
              <button
                type="button"
                className="button secondary"
                disabled={disabled}
                onClick={() => void onSave(null)}
              >
                <Trash2 size={16} />
                {t('Anahtarı kaldır')}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

/** Air dates of next episodes and IMDb ids from TMDB, with the owner's own key. */
function MetadataSection({
  enabled,
  owner,
  busy,
  disabled,
  onSave,
}: {
  enabled: boolean;
  owner: boolean;
  busy: boolean;
  disabled: boolean;
  onSave(key: string | null): Promise<boolean>;
}) {
  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const valid = /^[A-Za-z0-9._-]{20,1024}$/.test(key.trim());
  return (
    <section className="cs-section">
      <h2>{t('Yapım bilgileri')}</h2>
      <p>
        {t(
          "Bir dizinin sıradaki bölümü sağlayıcıda henüz yoksa Filmler ve Diziler'deki “Devam et” satırı yayın tarihini TMDB'den alır (“Yakında · 08.12.2026”). IMDb bağlantıları anahtarsız da çalışır; anahtar varsa önce TMDB'ye bakılır.",
        )}
      </p>
      <p className="cs-note inline">
        <CalendarClock size={15} />
        {enabled
          ? t('TMDB bağlı: yayın tarihleri görünüyor.')
          : t('TMDB bağlı değil: yalnızca sağlayıcının listelediği tarihler görünür.')}
      </p>
      {owner && (
        <form
          className="cs-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) void onSave(key.trim()).then((ok) => ok && setKey(''));
          }}
        >
          <label className="cs-field">
            <span>
              {enabled ? t('Yeni TMDB API anahtarı') : t('TMDB API anahtarı veya okuma jetonu')}
            </span>
            <span className="cs-password">
              <input
                type={reveal ? 'text' : 'password'}
                value={key}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                onChange={(event) => setKey(event.target.value)}
              />
              <button
                type="button"
                aria-label={reveal ? t('Anahtarı gizle') : t('Anahtarı göster')}
                disabled={disabled}
                onClick={() => setReveal(!reveal)}
              >
                {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
            <small>
              {t('Anahtarı')}{' '}
              <a
                href="https://www.themoviedb.org/settings/api"
                target="_blank"
                rel="noreferrer noopener"
              >
                {t('TMDB hesabının API sayfasından')}
              </a>{' '}
              {t('ücretsiz alabilirsin. Anahtar sunucuda şifreli saklanır, kimseye gösterilmez.')}
            </small>
          </label>
          <div className="cs-actions">
            <button className="button primary" disabled={disabled || !valid}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <CalendarClock size={16} />}
              {busy ? t('Doğrulanıyor…') : t('Doğrula ve kaydet')}
            </button>
            {enabled && (
              <button
                type="button"
                className="button secondary"
                disabled={disabled}
                onClick={() => void onSave(null)}
              >
                <Trash2 size={16} />
                {t('Anahtarı kaldır')}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function ConnectedCard({
  status,
  owner,
  busy,
  onReload,
  onDisconnect,
}: {
  status: CinemaStatus;
  owner: boolean;
  busy: string | null;
  onReload(scope: 'all' | 'guide'): void;
  onDisconnect(): void;
}) {
  const importing = status.importing && !status.importing.finishedAt ? status.importing : null;
  const failed = status.importing?.step === 'failed' ? status.importing : null;
  const account = status.account;
  return (
    <section className="cs-section">
      <h2>{t('Sunucu IPTV’si')}</h2>
      <div className="cs-card">
        <div className="cs-card-head">
          <span className="cs-state connected">
            <i /> {t('Bağlı')}
          </span>
          <strong>
            {!status.source
              ? t('Topluluk sahibi bağladı')
              : status.source.kind === 'xtream'
                ? 'Xtream Codes'
                : t('M3U listesi')}
          </strong>
          {status.source?.label && <code>{status.source.label}</code>}
        </div>
        <dl className="cs-facts">
          {owner && (
            <>
              <div>
                <dt>{t('Bağlantı hakkı')}</dt>
                <dd>
                  {account?.maxConnections
                    ? t('{count} eşzamanlı', { count: account.maxConnections })
                    : t('Bilinmiyor')}{' '}
                  · {t('salon {count} yayın açar', { count: status.relaySlots })}
                </dd>
              </div>
              <div>
                <dt>{t('Hesap')}</dt>
                <dd>
                  {account?.expiresAt
                    ? t('{date} tarihine kadar', { date: dateFormat.format(account.expiresAt) })
                    : account?.status
                      ? (accountStatus[account.status.toLowerCase()] ?? account.status)
                      : t('Süre bilgisi yok')}
                </dd>
              </div>
            </>
          )}
          <div>
            <dt>{t('Katalog')}</dt>
            <dd>
              {t('{count} kanal', { count: count(status.catalog.live) })} ·{' '}
              {t('{count} film', { count: count(status.catalog.movies) })} ·{' '}
              {t('{count} dizi', { count: count(status.catalog.series) })}
            </dd>
          </div>
          <div>
            <dt>{t('Rehber')}</dt>
            <dd>
              {status.catalog.programmes
                ? t('{count} program · {ago}', {
                    count: count(status.catalog.programmes),
                    ago: ago(status.catalog.guideImportedAt),
                  })
                : t('Rehber yok')}
              {status.source?.hasCustomGuide ? ` · ${t('özel XMLTV')}` : ''}
            </dd>
          </div>
        </dl>
        {importing && (
          <div className="cs-import" role="status">
            <LoaderCircle size={15} className="spin" />
            <span>
              {stepLabels[importing.step]} ·{' '}
              {t('{count} kanal', { count: count(importing.counts.live) })} ·{' '}
              {t('{count} film', { count: count(importing.counts.movies) })} ·{' '}
              {t('{count} dizi', { count: count(importing.counts.series) })}
            </span>
          </div>
        )}
        {failed && (
          <p className="cs-error" role="alert">
            {failed.error
              ? t('Son içe aktarma tamamlanmadı: {error}', { error: cinemaErrorText(failed.error) })
              : t('Son içe aktarma tamamlanmadı.')}
          </p>
        )}
        <div className="cs-actions">
          <button
            className="button secondary small"
            disabled={!owner || !!busy || !!importing}
            onClick={() => onReload('all')}
          >
            <RefreshCw size={15} />
            {t('Kataloğu yenile')}
          </button>
          <button
            className="button secondary small"
            disabled={!owner || !!busy || !!importing}
            onClick={() => onReload('guide')}
          >
            {t('Rehberi yenile')}
          </button>
          <span className="cs-grow" />
          <button
            className="button subtle small danger-text"
            disabled={!owner || !!busy}
            onClick={onDisconnect}
          >
            <Unplug size={15} />
            {t('Bağlantıyı kaldır')}
          </button>
        </div>
        <small className="cs-foot">
          {t('Son katalog: {ago}. Şifre sunucuda şifreli saklanır; hiçbir üyeye gönderilmez.', {
            ago: ago(status.catalog.importedAt),
          })}
        </small>
      </div>
    </section>
  );
}

function ConnectForm({
  owner,
  busy,
  onConnect,
}: {
  owner: boolean;
  busy: boolean;
  onConnect(source: CinemaSourceInput): Promise<boolean>;
}) {
  const [kind, setKind] = useState<'xtream' | 'm3u'>('xtream');
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [url, setUrl] = useState('');
  const [guide, setGuide] = useState<'provider' | 'custom' | 'none'>('provider');
  const [guideUrl, setGuideUrl] = useState('');
  const [local, setLocal] = useState('');
  const disabled = !owner || busy;
  const valid = (value: string) => /^https?:\/\/[^\s/]+/i.test(value.trim());
  const submit = async () => {
    setLocal('');
    const target = kind === 'xtream' ? server : url;
    if (!valid(target)) {
      setLocal(t('Adres http:// ya da https:// ile başlamalı.'));
      return;
    }
    if (kind === 'xtream' && (!username.trim() || !password)) {
      setLocal(t('Kullanıcı adı ve şifre gerekli.'));
      return;
    }
    if (guide === 'custom' && !valid(guideUrl)) {
      setLocal(t('Rehber adresi http:// ya da https:// ile başlamalı.'));
      return;
    }
    const guideValue = guide === 'provider' ? null : guide === 'none' ? '' : guideUrl.trim();
    const ok = await onConnect(
      kind === 'xtream'
        ? {
            kind,
            server: server.trim().replace(/\/+$/, ''),
            username: username.trim(),
            password,
            guideUrl: guideValue,
          }
        : { kind, url: url.trim(), guideUrl: guideValue },
    );
    if (ok) setPassword('');
  };
  useEffect(() => setLocal(''), [kind]);
  return (
    <section className="cs-section">
      <h2>{t('Sunucu IPTV’sini bağla')}</h2>
      <p>
        {t(
          'Hesap sunucuda şifreli kalır ve kaldırana kadar salonda herkes kullanır. Sunucu sağlayıcıya tek bağlantı açar ve yayını salondakilere kendisi iletir.',
        )}
      </p>
      <div className="cs-segment" role="radiogroup" aria-label={t('Kaynak türü')}>
        {(
          [
            ['xtream', 'Xtream Codes'],
            ['m3u', t('M3U bağlantısı')],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="radio"
            aria-checked={kind === value}
            className={kind === value ? 'selected' : ''}
            disabled={disabled}
            onClick={() => setKind(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="cs-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {kind === 'xtream' ? (
          <>
            <label className="cs-field">
              <span>{t('Sunucu adresi')}</span>
              <input
                value={server}
                placeholder={t('https://sunucu.ornek:8080')}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                onChange={(event) => setServer(event.target.value)}
              />
            </label>
            <div className="cs-pair">
              <label className="cs-field">
                <span>{t('Kullanıcı adı')}</span>
                <input
                  value={username}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={disabled}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <label className="cs-field">
                <span>{t('Şifre')}</span>
                <span className="cs-password">
                  <input
                    type={reveal ? 'text' : 'password'}
                    value={password}
                    autoComplete="new-password"
                    disabled={disabled}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={reveal ? t('Şifreyi gizle') : t('Şifreyi göster')}
                    disabled={disabled}
                    onClick={() => setReveal(!reveal)}
                  >
                    {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </span>
              </label>
            </div>
          </>
        ) : (
          <label className="cs-field">
            <span>{t('M3U adresi')}</span>
            <input
              type="password"
              value={url}
              placeholder="https://…/playlist.m3u"
              autoComplete="off"
              disabled={disabled}
              onChange={(event) => setUrl(event.target.value)}
            />
            <small>
              {t('Bağlantı çoğu zaman hesap bilgisini içerir; bu yüzden gizli tutulur.')}
            </small>
          </label>
        )}
        <fieldset className="cs-guide" disabled={disabled}>
          <legend>{t('Yayın rehberi')}</legend>
          {(
            [
              ['provider', t('Sağlayıcının rehberi')],
              ['custom', t('Özel XMLTV adresi')],
              ['none', t('Rehber kullanma')],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="cs-radio">
              <input
                type="radio"
                name="cinema-guide"
                checked={guide === value}
                onChange={() => setGuide(value)}
              />
              {label}
            </label>
          ))}
          {guide === 'custom' && (
            <input
              className="cs-input"
              value={guideUrl}
              placeholder="https://…/guide.xml.gz"
              aria-label={t('XMLTV adresi')}
              onChange={(event) => setGuideUrl(event.target.value)}
            />
          )}
        </fieldset>
        {local && (
          <p className="cs-error" role="alert">
            {local}
          </p>
        )}
        <button className="button primary" disabled={disabled}>
          {busy ? <LoaderCircle size={16} className="spin" /> : <Plug size={16} />}
          {busy ? t('Hesap doğrulanıyor…') : t('Bağla ve kataloğu yükle')}
        </button>
      </form>
    </section>
  );
}

function DisconnectConfirm({
  hallId,
  busy,
  onCancel,
  onConfirm,
}: {
  hallId: string | null;
  busy: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  const activity = useActivityRoom(hallId);
  const playing = !!activity.room?.primary && !!activity.room.timeline.itemId;
  const viewers = activity.room?.participants.length ?? 0;
  return (
    <Modal title={t('IPTV bağlantısı kaldırılsın mı?')} onClose={onCancel}>
      <div className="cs-confirm">
        <p>
          {t(
            'Hesap bilgileri sunucudan silinir, katalog ve rehber temizlenir. Salon yalnızca YouTube ile kullanılabilir kalır.',
          )}
        </p>
        {playing && (
          <p className="cs-warning" role="alert">
            {viewers
              ? t(
                  'Salonda şu an bir yayın açık ve {count} kişi izliyor. Bağlantıyı kaldırınca yayın herkes için durur.',
                  { count: viewers },
                )
              : t('Salonda şu an bir yayın açık. Bağlantıyı kaldırınca yayın herkes için durur.')}
          </p>
        )}
        <div className="cs-actions">
          <button className="button secondary" onClick={onCancel}>
            {t('Vazgeç')}
          </button>
          <button className="button primary danger" disabled={busy} onClick={onConfirm}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
            {t('Bağlantıyı kaldır')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
