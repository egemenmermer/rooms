import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Modal, Toggle } from '@rooms/design';
import { ReferenceIcon } from './ReferenceIcon';
import { useRealtime } from './realtime';
import { uiError } from './i18n';
import './reference-about.css';

type UpdateStatus = Awaited<ReturnType<NonNullable<Window['rooms']>['updates']['status']>>;
type ApplicationInfo = Awaited<ReturnType<NonNullable<Window['rooms']>['applicationInfo']>>;
const stateNames: Record<UpdateStatus['state'], string> = {
  unavailable: 'Dağıtım bekleniyor',
  idle: 'Kontrol edilebilir',
  checking: 'Kontrol ediliyor',
  available: 'Güncelleme var',
  downloading: 'İndiriliyor',
  verifying: 'İmza doğrulanıyor',
  ready: 'Yeniden başlatmaya hazır',
  error: 'Güncelleme başarısız',
};

/** Update actions remain native, opt-in and signature-gated; fixtures never invoke them. */
export function About({ notify }: { notify(message: string): void }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null),
    [info, setInfo] = useState<ApplicationInfo | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [modal, setModal] = useState<'logs' | 'licenses' | 'restart' | null>(null),
    [content, setContent] = useState(''),
    [contentBusy, setContentBusy] = useState(false);
  const [fixture, setFixture] = useState(false);
  const voice = useRealtime();
  const [params, setParams] = useSearchParams();
  const contentEpoch = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      contentEpoch.current++;
    };
  }, []);
  const closeModal = () => {
    contentEpoch.current++;
    setContentBusy(false);
    setModal(null);
  };
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const query = new URLSearchParams(location.search);
    if (import.meta.env.DEV && query.get('fixture') === 'S71') {
      setFixture(true);
      void import('./dev/reference-fixtures').then((f) => {
        const data = f.getReferenceAbout();
        if (active && data) {
          setInfo(data.info);
          setStatus(data.status);
          setModal(data.modal);
          setContent(data.content);
        }
      });
    } else if (window.rooms) {
      const update = async () => {
        try {
          const data = await window.rooms!.updates.status();
          if (active) setStatus(data);
        } catch (e) {
          if (active) setError(uiError(e));
        }
      };
      void window.rooms
        .applicationInfo()
        .then((data) => {
          if (active) setInfo(data);
        })
        .catch((e) => {
          if (active) setError(uiError(e));
        });
      void update();
      timer = setInterval(() => void update(), 2500);
    }
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, []);
  const installable = status?.state === 'ready' || status?.state === 'available';
  // The sidebar update notice links here with install=1 and expects the restart prompt at once.
  useEffect(() => {
    if (!params.has('install') || !status) return;
    if (installable) setModal('restart');
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('install');
        return next;
      },
      { replace: true },
    );
  }, [params, setParams, status, installable]);
  const native = !!window.rooms && !fixture;
  const configured = native && !!status?.configured,
    enabled = configured && !!status?.enabled;
  const reason = fixture
    ? 'Yerel örnek durum; güncelleme işlemleri kapalı.'
    : !native
      ? 'Masaüstü uygulamasında kullanılabilir.'
      : !configured
        ? 'İmzalı dağıtım ve HTTPS güncelleme adresi yapılandırılmalı.'
        : !status?.enabled
          ? 'Önce imzalı güncellemeleri etkinleştir.'
          : '';
  const run = async (action: () => Promise<unknown>, download = false) => {
    if (!native) return;
    setBusy(true);
    setError('');
    try {
      await action();
      setStatus(await window.rooms!.updates.status());
    } catch (e) {
      const current = await window.rooms!.updates.status().catch(() => null);
      if (current) setStatus(current);
      if (!(download && current?.state === 'idle')) setError(uiError(e));
    } finally {
      setBusy(false);
    }
  };
  const preview = async (kind: 'logs' | 'licenses') => {
    const ticket = ++contentEpoch.current;
    setModal(kind);
    setContent('');
    setError('');
    if (!native) {
      setContent(
        fixture ? 'DEMO · Yerel örnek durum.' : 'Bu içerik masaüstü uygulamasında okunabilir.',
      );
      return;
    }
    setContentBusy(true);
    try {
      const value = await (kind === 'logs'
        ? window.rooms!.diagnosticsPreview()
        : window.rooms!.thirdPartyNotices());
      if (mounted.current && contentEpoch.current === ticket) setContent(value);
    } catch (e) {
      if (mounted.current && contentEpoch.current === ticket) setError(uiError(e));
    } finally {
      if (mounted.current && contentEpoch.current === ticket) setContentBusy(false);
    }
  };
  const working = busy || ['checking', 'downloading', 'verifying'].includes(status?.state ?? '');
  const platform =
    info?.platform === 'darwin'
      ? 'macOS'
      : info?.platform === 'win32'
        ? 'Windows'
        : (info?.platform ?? '—');
  return (
    <div className="reference-about">
      <div className="ref-settings-heading">
        <span>UYGULAMA</span>
        <h1>Güncelleme ve hakkında</h1>
        {fixture && <p>Tayfa’yı güncel tut ve destek bilgilerini yönet.</p>}
      </div>
      <div className="about-hero">
        <img src="./reference-brand/app-icons/app-icon-128.png" alt="" />
        <div>
          <h1>Tayfa</h1>
          {fixture && <p>Arkadaşlarınla aynı yerde.</p>}
          <small>
            Sürüm {info?.version ?? '—'} · {platform}
            {info?.arch ? ` · ${info.arch === 'arm64' ? 'Apple Silicon' : info.arch}` : ''}
          </small>
        </div>
        <span className={`about-state state-${status?.state ?? 'unavailable'}`}>
          {stateNames[status?.state ?? 'unavailable']}
        </span>
      </div>
      <section className="about-update">
        <div className="about-section-title">
          <h2>{status?.version ? `Tayfa ${status.version}` : 'Uygulama güncellemeleri'}</h2>
          {status?.version && <small>Yeni sürüm</small>}
        </div>
        {!!status?.releaseNotes?.length && (
          <ul className="about-changelog">
            {status.releaseNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        )}
        {status?.state === 'downloading' ? (
          <>
            <progress
              max={100}
              value={status.progress}
              aria-label="Güncelleme indirme ilerlemesi"
            />
            <div className="about-progress-label">
              <span>Güncelleme indiriliyor</span>
              <strong>%{Math.round(status.progress)}</strong>
            </div>
            <button
              className="button secondary"
              disabled={!native}
              onClick={() => {
                void window
                  .rooms!.updates.cancel()
                  .then(setStatus)
                  .catch((e) => setError(uiError(e)));
              }}
            >
              İndirmeyi iptal et
            </button>
          </>
        ) : status?.state === 'ready' ? (
          <>
            <div className="about-callout warning">
              <ReferenceIcon name="refresh-cw" size={19} />
              <span>Güncelleme hazır. Yeniden başlatma açık görüşmeleri sonlandırır.</span>
            </div>
            <div className="button-row">
              <button
                className="button secondary"
                onClick={() => notify('Güncelleme hazır; istediğinde yeniden başlatabilirsin.')}
              >
                Şimdi değil
              </button>
              <button
                className="button primary"
                disabled={!enabled || busy}
                title={reason}
                onClick={() => setModal('restart')}
              >
                <ReferenceIcon name="refresh-cw" size={18} />
                Yeniden başlat ve güncelle
              </button>
            </div>
          </>
        ) : (
          <>
            {status?.state === 'error' && (
              <div className="about-callout error">
                <ReferenceIcon name="alert-circle" size={19} />
                <span>Güncelleme tamamlanamadı. Mevcut sürümle devam edebilirsin.</span>
              </div>
            )}
            {!fixture && reason && <p className="about-reason">{reason}</p>}
            <div className="button-row">
              {status?.state === 'available' && (
                <button
                  className="button primary"
                  disabled={!enabled || working}
                  title={reason}
                  onClick={() => void run(() => window.rooms!.updates.download(), true)}
                >
                  <ReferenceIcon name="download" size={18} />
                  Güncellemeyi indir
                </button>
              )}
              <button
                className="button secondary"
                disabled={!enabled || working}
                title={reason}
                onClick={() => void run(() => window.rooms!.updates.check())}
              >
                <ReferenceIcon name="refresh-cw" size={18} />
                {status?.state === 'checking' ? 'Kontrol ediliyor…' : 'Güncellemeleri kontrol et'}
              </button>
            </div>
          </>
        )}
        {!status?.enabled && (
          <div className="about-setting">
            <div>
              <strong>İmzalı güncellemeler</strong>
              <p>İndirme ve yeniden başlatma isteğinle başlar.</p>
            </div>
            <Toggle
              label="İmzalı güncellemeleri etkinleştir"
              disabled={!configured || working}
              value={status?.enabled ?? false}
              onChange={(value) => void run(() => window.rooms!.updates.setOptIn(value))}
            />
          </div>
        )}
      </section>
      <section className="about-support">
        <h2>Destek ve gizlilik</h2>
        <div className="about-setting">
          <div>
            <strong>Çökme raporlarını paylaş</strong>
            <p>Rapor gönderimi henüz yapılandırılmadı.</p>
          </div>
          <Toggle
            label="Çökme raporları: gönderim yapılandırılmadı"
            value={false}
            disabled
            onChange={() => {}}
          />
        </div>
        <div className="about-setting">
          <div>
            <strong>Destek kaydı</strong>
            <p>Mesaj içerikleri, hesap anahtarları ve kişisel dosya yolları dahil edilmez.</p>
          </div>
          <button className="button secondary" onClick={() => void preview('logs')}>
            <ReferenceIcon name="file" size={18} />
            Önizle ve indir
          </button>
        </div>
        <div className="about-setting">
          <div>
            <strong>Açık kaynak lisansları</strong>
            <p>Yazı tipi, ikon ve kullanılan bileşenler.</p>
          </div>
          <button className="button subtle" onClick={() => void preview('licenses')}>
            <ReferenceIcon name="arrow-right" size={18} />
            Lisansları aç
          </button>
        </div>
      </section>
      {error && (
        <p className="about-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <img src="./reference-brand/brand/logo-symbol-lilac.svg" alt="" />
        Tayfa{fixture && ' · Özel arkadaş toplulukları için'}
      </footer>
      {modal && (
        <Modal
          title={
            modal === 'logs'
              ? 'Destek kaydını paylaşmadan önce'
              : modal === 'licenses'
                ? 'Açık kaynak ve lisanslar'
                : 'Yeniden başlat ve güncelle'
          }
          className={`about-modal about-modal-${modal}`}
          onClose={() => {
            if (!busy) closeModal();
          }}
        >
          <div className="about-modal-body">
            {modal === 'restart' ? (
              <p>
                {status?.version ? `Tayfa ${status.version} hazır. ` : ''}
                {voice.channelId
                  ? 'Ses bağlantın ve açık görüşmeler kapanacak.'
                  : 'Uygulama kapanıp yeniden açılacak.'}{' '}
                İmzalı güncellemeyi şimdi kurmak istiyor musun?
              </p>
            ) : (
              <>
                <p>
                  {modal === 'logs'
                    ? 'Dosyayı indirip inceleyebilir, sonra kendin paylaşabilirsin.'
                    : 'Bu derlemede kullanılan yazılım ve varlık lisansları.'}
                </p>
                <pre aria-busy={contentBusy}>{contentBusy ? 'Yükleniyor…' : content}</pre>
                {modal === 'logs' && (
                  <div className="about-callout">
                    <ReferenceIcon name="lock" size={18} />
                    Dosya cihazına kaydedilir; otomatik gönderilmez.
                  </div>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="about-error">
                {error}
              </p>
            )}
          </div>
          <div className="about-modal-footer">
            <button className="button secondary" disabled={busy} onClick={closeModal}>
              Kapat
            </button>
            {modal === 'logs' && (
              <button
                className="button primary"
                disabled={!native || contentBusy || !!error}
                onClick={async () => {
                  try {
                    notify(
                      (await window.rooms!.exportDiagnostics())
                        ? 'Destek kaydı kaydedildi.'
                        : 'Kaydetme iptal edildi.',
                    );
                  } catch (e) {
                    setError(uiError(e));
                  }
                }}
              >
                <ReferenceIcon name="download" size={18} />
                Kayıt dosyasını indir
              </button>
            )}
            {modal === 'restart' && (
              <button
                className="button primary"
                disabled={!enabled || busy || !installable}
                onClick={() => void run(() => window.rooms!.updates.install())}
              >
                Yeniden başlat ve güncelle
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
