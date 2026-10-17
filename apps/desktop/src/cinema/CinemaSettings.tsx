import './community-cinema.css';
import { useEffect, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, Plug, RefreshCw, Trash2, Unplug } from 'lucide-react';
import { Modal } from '@rooms/design';
import type { CinemaSourceInput } from '../../../../packages/community-cinema/src/bridge';
import type { CinemaStatus } from '../../../../packages/community-cinema/src/types';
import { useActivityRoom } from '../activity';
import { useCommunity } from '../community';
import { acceptCinemaStatus, useCommunityCinema } from './cinema-status';
import { cinemaErrorText, getCinemaBridge } from './cinema-bridge';

const dateFormat = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const count = (value: number) => value.toLocaleString('tr-TR');

function ago(ms: number | null) {
  if (!ms) return 'henüz değil';
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} sa önce` : dateFormat.format(ms);
}

const stepLabels: Record<NonNullable<CinemaStatus['importing']>['step'], string> = {
  connecting: 'Sağlayıcıya bağlanıyor',
  live: 'Canlı kanallar alınıyor',
  movies: 'Filmler alınıyor',
  series: 'Diziler alınıyor',
  guide: 'Yayın rehberi alınıyor',
  completed: 'Katalog hazır',
  failed: 'İçe aktarma durdu',
};

/** Settings → Sinema: the owner picks the hall channel and connects the server's IPTV account. */
export function CinemaSettings({ notify }: { notify(message: string): void }) {
  const cinema = useCommunityCinema(15_000);
  const channels = useCommunity((s) => s.channels);
  const bridge = getCinemaBridge();
  const [busy, setBusy] = useState<'hall' | 'connect' | 'reload' | 'disconnect' | null>(null);
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
    return <p className="cs-note">Sinema salonu için güncel masaüstü uygulaması gerekiyor.</p>;
  if (cinema.loading || !cinema.communityId)
    return (
      <p className="cs-note" role="status">
        <LoaderCircle size={16} className="spin" /> Sinema ayarları yükleniyor…
      </p>
    );
  if (!status)
    return (
      <p className="cs-note" role="alert">
        {cinema.error ?? 'Sinema hizmetine ulaşılamadı.'}
      </p>
    );
  const communityId = cinema.communityId;
  const owner = status.isOwner;
  return (
    <div className="cinema-settings">
      <header>
        <h1>Sinema</h1>
        <p>
          Topluluğun kalıcı sinema salonu. Sunucunun IPTV hesabını bir kez bağla; salonu görebilen
          herkes kanalları, rehberi, filmleri ve dizileri birlikte açabilsin.
        </p>
      </header>
      {!owner && (
        <p className="cs-note inline">Sinema ayarlarını yalnızca topluluk sahibi değiştirebilir.</p>
      )}

      <section className="cs-section">
        <h2>Salon kanalı</h2>
        <p>
          Salonun sohbeti bu kanalda kalır, kimin göreceğini kanal izinleri belirler. Kanal, sol
          menüde “Sinema” olarak görünür.
        </p>
        <select
          className="cs-select"
          value={status.hallChannelId ?? ''}
          disabled={!owner || !!busy}
          aria-label="Salon kanalı"
          onChange={(event) =>
            void run(
              'hall',
              () => bridge.setHall(communityId, event.target.value || null),
              event.target.value ? 'Salon kanalı seçildi.' : 'Salon kanalı kaldırıldı.',
            )
          }
        >
          <option value="">Kanal seç…</option>
          {channels
            .filter((channel) => channel.type === 0 || channel.type === 2)
            .map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.type === 2 ? '🔊 ' : '# '}
                {channel.name}
              </option>
            ))}
        </select>
      </section>

      <hr />
      {status.connected && status.source ? (
        <ConnectedCard
          status={status}
          owner={owner}
          busy={busy}
          onReload={(scope) =>
            void run(
              'reload',
              () => bridge.reload(communityId, scope),
              scope === 'guide' ? 'Rehber yeniden yükleniyor.' : 'Katalog yeniden yükleniyor.',
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
              'IPTV hesabı bağlandı. Katalog yükleniyor.',
            )
          }
        />
      )}
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
                'IPTV bağlantısı kaldırıldı.',
              )
            )
              setConfirm(false);
          }}
        />
      )}
    </div>
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
      <h2>Sunucu IPTV’si</h2>
      <div className="cs-card">
        <div className="cs-card-head">
          <span className="cs-state connected">
            <i /> Bağlı
          </span>
          <strong>{status.source?.kind === 'xtream' ? 'Xtream Codes' : 'M3U listesi'}</strong>
          {status.source?.label && <code>{status.source.label}</code>}
        </div>
        <dl className="cs-facts">
          <div>
            <dt>Bağlantı hakkı</dt>
            <dd>
              {account?.maxConnections ? `${account.maxConnections} eşzamanlı` : 'Bilinmiyor'} ·
              salon {status.relaySlots} yayın açar
            </dd>
          </div>
          <div>
            <dt>Hesap</dt>
            <dd>
              {account?.expiresAt
                ? `${dateFormat.format(account.expiresAt)} tarihine kadar`
                : (account?.status ?? 'Süre bilgisi yok')}
            </dd>
          </div>
          <div>
            <dt>Katalog</dt>
            <dd>
              {count(status.catalog.live)} kanal · {count(status.catalog.movies)} film ·{' '}
              {count(status.catalog.series)} dizi
            </dd>
          </div>
          <div>
            <dt>Rehber</dt>
            <dd>
              {status.catalog.programmes
                ? `${count(status.catalog.programmes)} program · ${ago(status.catalog.guideImportedAt)}`
                : 'Rehber yok'}
              {status.source?.hasCustomGuide ? ' · özel XMLTV' : ''}
            </dd>
          </div>
        </dl>
        {importing && (
          <div className="cs-import" role="status">
            <LoaderCircle size={15} className="spin" />
            <span>
              {stepLabels[importing.step]} · {count(importing.counts.live)} kanal ·{' '}
              {count(importing.counts.movies)} film · {count(importing.counts.series)} dizi
            </span>
          </div>
        )}
        {failed && (
          <p className="cs-error" role="alert">
            Son içe aktarma tamamlanmadı{failed.error ? `: ${cinemaErrorText(failed.error)}` : '.'}
          </p>
        )}
        <div className="cs-actions">
          <button
            className="button secondary small"
            disabled={!owner || !!busy || !!importing}
            onClick={() => onReload('all')}
          >
            <RefreshCw size={15} />
            Kataloğu yenile
          </button>
          <button
            className="button secondary small"
            disabled={!owner || !!busy || !!importing}
            onClick={() => onReload('guide')}
          >
            Rehberi yenile
          </button>
          <span className="cs-grow" />
          <button
            className="button subtle small danger-text"
            disabled={!owner || !!busy}
            onClick={onDisconnect}
          >
            <Unplug size={15} />
            Bağlantıyı kaldır
          </button>
        </div>
        <small className="cs-foot">
          Son katalog: {ago(status.catalog.importedAt)}. Şifre sunucuda şifreli saklanır; hiçbir
          üyeye gönderilmez.
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
      setLocal('Adres http:// ya da https:// ile başlamalı.');
      return;
    }
    if (kind === 'xtream' && (!username.trim() || !password)) {
      setLocal('Kullanıcı adı ve şifre gerekli.');
      return;
    }
    if (guide === 'custom' && !valid(guideUrl)) {
      setLocal('Rehber adresi http:// ya da https:// ile başlamalı.');
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
      <h2>Sunucu IPTV’sini bağla</h2>
      <p>
        Hesap sunucuda şifreli kalır ve kaldırana kadar salonda herkes kullanır. Sunucu sağlayıcıya
        tek bağlantı açar ve yayını salondakilere kendisi iletir.
      </p>
      <div className="cs-segment" role="radiogroup" aria-label="Kaynak türü">
        {(
          [
            ['xtream', 'Xtream Codes'],
            ['m3u', 'M3U bağlantısı'],
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
              <span>Sunucu adresi</span>
              <input
                value={server}
                placeholder="https://sunucu.ornek:8080"
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                onChange={(event) => setServer(event.target.value)}
              />
            </label>
            <div className="cs-pair">
              <label className="cs-field">
                <span>Kullanıcı adı</span>
                <input
                  value={username}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={disabled}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <label className="cs-field">
                <span>Şifre</span>
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
                    aria-label={reveal ? 'Şifreyi gizle' : 'Şifreyi göster'}
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
            <span>M3U adresi</span>
            <input
              type="password"
              value={url}
              placeholder="https://…/playlist.m3u"
              autoComplete="off"
              disabled={disabled}
              onChange={(event) => setUrl(event.target.value)}
            />
            <small>Bağlantı çoğu zaman hesap bilgisini içerir; bu yüzden gizli tutulur.</small>
          </label>
        )}
        <fieldset className="cs-guide" disabled={disabled}>
          <legend>Yayın rehberi</legend>
          {(
            [
              ['provider', 'Sağlayıcının rehberi'],
              ['custom', 'Özel XMLTV adresi'],
              ['none', 'Rehber kullanma'],
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
              aria-label="XMLTV adresi"
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
          {busy ? 'Hesap doğrulanıyor…' : 'Bağla ve kataloğu yükle'}
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
    <Modal title="IPTV bağlantısı kaldırılsın mı?" onClose={onCancel}>
      <div className="cs-confirm">
        <p>
          Hesap bilgileri sunucudan silinir, katalog ve rehber temizlenir. Salon yalnızca YouTube
          ile kullanılabilir kalır.
        </p>
        {playing && (
          <p className="cs-warning" role="alert">
            Salonda şu an bir yayın açık{viewers ? ` ve ${viewers} kişi izliyor` : ''}. Bağlantıyı
            kaldırınca yayın herkes için durur.
          </p>
        )}
        <div className="cs-actions">
          <button className="button secondary" onClick={onCancel}>
            Vazgeç
          </button>
          <button className="button primary danger" disabled={busy} onClick={onConfirm}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
            Bağlantıyı kaldır
          </button>
        </div>
      </div>
    </Modal>
  );
}
