import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@rooms/design';
import type {
  AgentAuthoritySnapshot,
  AgentAuditSnapshot,
  AgentStatus,
} from '@rooms/agent-contracts';
import { useCommunity } from './community';
import { useRealtime } from './realtime';
import { ReferenceIcon } from './ReferenceIcon';
import { locale, t, uiError } from './i18n';
import './reference-agent-automation.css';

const DevelopmentEntry = import.meta.env.DEV
  ? lazy(() => import('./dev/S63AutomationEntry'))
  : null;
const scopeLabels = {
  room: t('Oda'),
  workspace: t('Çalışma alanı'),
  github: 'GitHub',
  drive: 'Google Drive',
  research: t('Araştırma'),
  browser: t('Tarayıcı'),
};
/** Includes the visible grant, not a route-local approximation of server authority. */
export const automationGrantStamp = (authority: AgentAuthoritySnapshot) =>
  JSON.stringify({
    userId: authority.userId,
    roomId: authority.roomId,
    canManage: authority.canManage,
    yolo: authority.yolo,
    principals: authority.principals,
    scopes: authority.scopes,
  });

export interface AgentAutomationProps {
  userId: string;
  roomId: string;
  roomName: string;
  channelName: string;
  actorName: string;
  names: Record<string, string>;
  status: AgentStatus | null;
  authority: AgentAuthoritySnapshot | null;
  audit: AgentAuditSnapshot | null;
  loading?: boolean;
  error?: string;
  auditError?: string;
  onRefresh(): Promise<void>;
  onChange?(value: boolean, reviewed: AgentAuthoritySnapshot): Promise<void>;
  fixture?: boolean;
  fixtureView?: 'default' | 'confirm' | 'enabled' | 'readonly';
}

/** The same surface is used by the native container and opt-in, bridge-free fixtures. */
export function AgentAutomationSurface(props: AgentAutomationProps) {
  const navigate = useNavigate(),
    [confirmed, setConfirmed] = useState<AgentAuthoritySnapshot | null>(
      props.fixture && props.fixtureView === 'confirm' ? props.authority : null,
    );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [invalidated, setInvalidated] = useState(false),
    [previewMode, setPreviewMode] = useState(props.status?.yolo ?? false);
  const epoch = useRef(0),
    locked = useRef(false),
    mounted = useRef(true),
    latest = useRef(props),
    invalidatedRef = useRef(false);
  latest.current = props;
  const identityKey = `${props.userId}:${props.roomId}`,
    identityRef = useRef(identityKey);
  identityRef.current = identityKey;
  const validated =
    !!props.userId &&
    !!props.roomId &&
    props.status?.connected === true &&
    props.status.userId === props.userId &&
    props.authority?.userId === props.userId &&
    props.authority.roomId === props.roomId &&
    props.status.yolo === props.authority.yolo;
  const authority = validated && !invalidated ? props.authority : null;
  const mode = props.fixture ? previewMode : (authority?.yolo ?? false);
  const canManage = !!authority && authority.canManage && props.status?.canManage === true;
  const editable = canManage && !busy && !props.loading && (props.fixture || !!props.onChange);
  const disabledReason = invalidated
    ? t('Erişim yeniden doğrulanmalı.')
    : !authority
      ? props.error || t('Agent bağlantısı ve oda yetkileri doğrulanmalı.')
      : !canManage
        ? t('Bu ayarı yalnızca yetkili asistan yöneticileri değiştirebilir.')
        : !props.onChange && !props.fixture
          ? t('Masaüstü Agent bağlantısı gerekli.')
          : t('İşlem tamamlanıyor.');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current++;
    };
  }, []);
  useEffect(() => {
    epoch.current++;
    locked.current = false;
    setBusy(false);
    setError('');
    setNotice('');
    if (!props.fixture) setConfirmed(null);
  }, [identityKey]);
  useEffect(() => {
    if (props.authority) {
      if (invalidatedRef.current) {
        locked.current = false;
        setBusy(false);
      }
      invalidatedRef.current = false;
      setInvalidated(false);
    }
  }, [props.authority]);
  useEffect(() => {
    const invalidate = () => {
      epoch.current++;
      invalidatedRef.current = true;
      setInvalidated(true);
      setConfirmed(null);
      setNotice('');
      setError('');
    };
    window.addEventListener('rooms:channel-access-invalidated', invalidate);
    window.addEventListener('rooms:community-management-invalidated', invalidate);
    return () => {
      window.removeEventListener('rooms:channel-access-invalidated', invalidate);
      window.removeEventListener('rooms:community-management-invalidated', invalidate);
    };
  }, []);
  useEffect(() => {
    if (!authority) setConfirmed(null);
    else if (
      confirmed &&
      !props.fixture &&
      automationGrantStamp(confirmed) !== automationGrantStamp(authority)
    ) {
      setConfirmed(null);
      setNotice(t('İzinler veya mod değişti. Kapsamı yeniden incele.'));
    }
  }, [authority, confirmed, props.fixture]);
  const change = async (value: boolean, reviewed: AgentAuthoritySnapshot) => {
    if (
      !editable ||
      locked.current ||
      !authority ||
      automationGrantStamp(reviewed) !== automationGrantStamp(authority)
    )
      return;
    if (props.fixture) {
      setPreviewMode(value);
      setConfirmed(null);
      setNotice(t('DEMO · Sunucu modu değiştirilmedi.'));
      return;
    }
    const ticket = epoch.current,
      key = identityKey;
    locked.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const currentScope = () =>
      mounted.current &&
      ticket === epoch.current &&
      identityRef.current === key &&
      !invalidatedRef.current;
    const current = () =>
      currentScope() &&
      latest.current.status?.connected === true &&
      latest.current.status.userId === latest.current.userId;
    try {
      await props.onChange!(value, reviewed);
      if (current()) {
        setConfirmed(null);
        setNotice(value ? t('YOLO açıldı.') : t('Normal mod etkin.'));
      }
    } catch (failure) {
      if (current()) setError(uiError(failure));
    } finally {
      if (currentScope()) {
        locked.current = false;
        setBusy(false);
      }
    }
  };
  const names = (id: string) => props.names[id] || id;
  const grantRows = authority
    ? [
        {
          label: t('Kişiler'),
          value:
            authority.principals.map((person) => names(person.userId)).join(', ') ||
            names(props.userId),
          detail: t('Her görev başlatanın kendi bağlantısıyla çalışır.'),
        },
        { label: t('Oda'), value: `${props.roomName} / #${props.channelName}` },
        ...authority.scopes
          .filter((scope) => scope.kind !== 'room' && (scope.read || scope.write))
          .map((scope) => ({
            label: scopeLabels[scope.kind],
            value: scope.resources.join(', ') || t('Kaynak ayrıntıları bu erişimde sunulmuyor'),
            detail: [scope.read ? t('Okuma') : '', scope.write ? t('Değişiklik') : '']
              .filter(Boolean)
              .join(' · '),
          })),
      ]
    : [];
  const history =
    authority && props.audit?.scope === 'own' && props.audit.roomId === null
      ? props.audit.entries.filter(
          (entry) =>
            entry.userId === props.userId &&
            ['yolo-enabled', 'yolo-disabled'].includes(entry.action),
        )
      : [];
  return (
    <section className="reference-agent-automation" aria-busy={props.loading || busy}>
      <header className="ref-settings-heading s63-heading">
        <span>{t('ASİSTAN YÖNETİMİ')}</span>
        <h1>{t('Otomasyon modu')}</h1>
        <p>{t('Agent sunucusunun onay modu. Mevcut erişim ve işlem kapsamını genişletmez.')}</p>
      </header>
      {props.fixture && (
        <span className="s63-demo-label">{t('DEMO · Yerel örnek. Sunucuya gönderilmez.')}</span>
      )}
      {props.loading && <p role="status">{t('Yetkiler yükleniyor…')}</p>}
      {(!authority || props.error) && !props.loading && (
        <div className="s63-callout warning" role="alert">
          <ReferenceIcon name="lock" size={18} />
          <span>{disabledReason}</span>
          <button className="text-button" onClick={() => navigate('/settings?tab=agent')}>
            {t('Agent bağlantısı')}
          </button>
        </div>
      )}
      {authority && (
        <>
          <div className="s63-status">
            <span>
              <ReferenceIcon name="shield" size={18} />
              <strong>
                {canManage
                  ? t('{actorName} · Asistan yöneticisi', { actorName: props.actorName })
                  : t('Görüntüleme erişimi')}
              </strong>
            </span>
            <span className={`s63-badge ${canManage ? 'purple' : 'amber'}`}>
              {canManage ? t('Yönetme yetkisi var') : t('Değiştiremez')}
            </span>
          </div>
          <div className="s63-mode-grid" role="group" aria-label={t('Sunucu genelinde onay modu')}>
            {([false, true] as const).map((value) => (
              <button
                className={`s63-mode ${mode === value ? 'selected' : ''}`}
                aria-pressed={mode === value}
                key={String(value)}
                disabled={!editable}
                title={!editable ? disabledReason : undefined}
                onClick={() => {
                  if (value) setConfirmed(authority);
                  else if (mode) void change(false, authority);
                }}
              >
                <span className="s63-radio" />
                <span>
                  <strong>
                    {value ? 'YOLO' : t('Normal')}{' '}
                    {mode === value && (
                      <span className={`s63-badge ${value ? 'amber' : 'purple'}`}>
                        {t('Etkin')}
                      </span>
                    )}
                  </strong>
                  <p>
                    {value
                      ? t(
                          'İzin verilen işlemler için işlem başına onay kaldırılır. Mevcut erişim ve kapsam sınırları aynen geçerlidir.',
                        )
                      : t(
                          'Dış sisteme yazma, silme ve yayınlama öncesinde somut işlem önizlemesi ve onay gösterilir.',
                        )}
                  </p>
                </span>
              </button>
            ))}
          </div>
          {(!canManage || mode) && (
            <div className="s63-callout warning" role="status">
              <ReferenceIcon name={canManage ? 'shield' : 'lock'} size={18} />
              {canManage
                ? t(
                    'YOLO sunucu genelinde açık. Tüm yetkili görevler mevcut izinleri içinde onay beklemeden devam edebilir.',
                  )
                : t('Bu ayarı yalnızca yetkili asistan yöneticileri değiştirebilir.')}
            </div>
          )}
          <section className="s63-section">
            <header>
              <h2>{t('Bu odada görülebilen kapsam')}</h2>
              <button
                className="text-button"
                onClick={() => navigate('/settings?tab=assistant-permissions')}
              >
                <ReferenceIcon name="arrow-right" size={16} />

                {t('Yetkileri incele')}
              </button>
            </header>
            <table className="s63-scope-table">
              <thead>
                <tr>
                  <th>{t('Alan')}</th>
                  <th>{t('İzin verilen')}</th>
                </tr>
              </thead>
              <tbody>
                {grantRows.map((row, index) => (
                  <tr key={`${row.label}:${index}`}>
                    <td>{row.label}</td>
                    <td>
                      {row.value}
                      {row.detail && <small>{row.detail}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="s63-section">
            <header>
              <h2>{t('Değişiklik kaydı')}</h2>
              <small>
                {props.audit?.limited
                  ? t('Kendi sunucu modu işlemlerin · Son kayıtlar')
                  : t('Kendi sunucu modu işlemlerin')}
              </small>
            </header>
            {history.map((entry, index) => {
              const at = new Date(entry.at),
                enabled = entry.action === 'yolo-enabled';
              return (
                <div className="s63-log" key={`${entry.at}:${index}`}>
                  <time dateTime={entry.at}>
                    {Number.isNaN(at.getTime()) ? (
                      t('Tarih bilinmiyor')
                    ) : (
                      <>
                        {at.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                        <br />
                        {at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      </>
                    )}
                  </time>
                  <div>
                    {names(entry.userId)} {enabled ? t('YOLO modunu açtı') : t('normal modu seçti')}
                    <small>
                      {enabled
                        ? t('Sunucu genelinde · Mevcut kapsam korundu')
                        : t('Sunucu genelinde · İşlem başına onay etkin')}
                    </small>
                  </div>
                  <span className={`s63-badge ${enabled ? 'amber' : 'purple'}`}>
                    {enabled ? 'YOLO' : t('Normal')}
                  </span>
                </div>
              );
            })}
            {!history.length && (
              <p className="s63-empty">
                {props.auditError ? t('Değişiklik kaydı alınamadı.') : t('Kayıt yok.')}
              </p>
            )}
            {props.auditError && <p role="alert">{props.auditError}</p>}
          </section>
        </>
      )}
      {notice && (
        <p role="status" className="s63-notice">
          {notice}
        </p>
      )}
      {error && !confirmed && (
        <div className="s63-callout error" role="alert">
          {error}
        </div>
      )}
      <button
        className="text-button s63-refresh"
        disabled={props.loading || busy || props.fixture}
        title={props.fixture ? t('Yerel demo: canlı sunucuya erişmez.') : undefined}
        onClick={() => void props.onRefresh()}
      >
        <ReferenceIcon name="refresh-cw" size={16} />

        {t('Durumu yenile')}
      </button>
      {confirmed && authority && canManage && (
        <Modal
          className="s63-modal"
          title={t('YOLO modunu aç?')}
          onClose={() => {
            if (!busy) setConfirmed(null);
          }}
        >
          <p>
            {t(
              'Sunucu genelindeki yetkili görevler, mevcut izinleri içinde onay beklemeden devam edebilir. Bekleyen onaylı işler de devam edebilir.',
            )}
          </p>
          <div className="s63-confirm-scope">
            <div>
              <span>{t('Görüntülenen oda')}</span>
              <strong>
                {props.roomName} / #{props.channelName}
              </strong>
            </div>
            {grantRows
              .filter((row) => row.label !== scopeLabels.room)
              .map((row, index) => (
                <div key={`${row.label}:${index}`}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
          </div>
          <div className="s63-callout warning">
            <ReferenceIcon name="shield" size={18} />

            {t(
              'Bu liste mevcut odanın kapsamıdır. Sunucu modu diğer yetkili odalara da uygulanır. Yeni kullanıcı, hesap veya kaynak izni vermez.',
            )}
          </div>
          <small className="s63-acknowledgement">
            {t('Bu değişiklik {actor} adına işlem geçmişine kaydedilir.', {
              actor: props.actorName,
            })}
          </small>
          <div className="button-row">
            <button className="button secondary" disabled={busy} onClick={() => setConfirmed(null)}>
              {t('Vazgeç')}
            </button>
            <button
              className="button primary"
              disabled={!editable}
              onClick={() => void change(true, confirmed)}
            >
              <ReferenceIcon name="check" size={16} />
              {busy ? t('Değiştiriliyor…') : t('Sunucu genelinde YOLO’yu aç')}
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
    </section>
  );
}

export default function AgentAutomation() {
  const c = useCommunity(),
    r = useRealtime(),
    roomId = c.user ? (r.channelId ?? c.activeChannelId) : null;
  if (DevelopmentEntry && new URLSearchParams(window.location.search).get('fixture') === 'S63')
    return (
      <Suspense fallback={<p role="status">{t('Yetkiler yükleniyor…')}</p>}>
        <DevelopmentEntry />
      </Suspense>
    );
  return (
    <AutomationScope key={`${c.serverUrl}:${c.user?.id}:${c.status}:${roomId}`} roomId={roomId} />
  );
}
function AutomationScope({ roomId }: { roomId: string | null }) {
  const c = useCommunity(),
    identity = c.user?.id || '',
    scopeKey = `${c.serverUrl}:${identity}:${roomId}`,
    scope = useRef(scopeKey);
  scope.current = scopeKey;
  const epoch = useRef(0),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [data, setData] = useState<{
    status: AgentStatus;
    authority: AgentAuthoritySnapshot;
    audit: AgentAuditSnapshot | null;
    auditError: string;
    names: Record<string, string>;
  } | null>(null);
  const live = (ticket: number) =>
    ticket === epoch.current &&
    scope.current === scopeKey &&
    useCommunity.getState().user?.id === identity &&
    useCommunity.getState().serverUrl === c.serverUrl;
  const refresh = useCallback(async () => {
    const ticket = ++epoch.current;
    setLoading(true);
    setData(null);
    setError('');
    try {
      const bridge = window.rooms?.agent;
      if (!bridge || !roomId || !identity)
        throw new Error(
          !identity
            ? t('Önce giriş yap.')
            : !roomId
              ? t('Bir oda seç.')
              : t('Masaüstü Agent bağlantısı gerekli.'),
        );
      const status = await bridge.status();
      if (!live(ticket)) return;
      if (!status.connected || status.userId !== identity)
        throw new Error(status.reason || t('Agent sunucusu bağlı değil.'));
      const authority = await bridge.authority(roomId);
      if (!live(ticket)) return;
      if (
        authority.userId !== identity ||
        authority.roomId !== roomId ||
        authority.yolo !== status.yolo
      )
        throw new Error(t('Yetkiler veya mod değişti. Yeniden doğrula.'));
      let audit: AgentAuditSnapshot | null = null,
        auditError = '';
      try {
        const value = await bridge.audit();
        if (value.scope !== 'own' || value.roomId !== null)
          throw new Error(t('İşlem kaydı bu hesaba ait değil.'));
        audit = value;
      } catch (failure) {
        auditError = uiError(failure);
      }
      if (!live(ticket)) return;
      const names: Record<string, string> = { [identity]: c.user!.displayName };
      if (c.activeSpaceId && window.rooms?.social) {
        const members = await window.rooms.social.members(c.activeSpaceId).catch(() => []);
        if (!live(ticket)) return;
        for (const member of members) names[member.user.id] = member.user.displayName;
      }
      setData({ status, authority, audit, auditError, names });
      return true;
    } catch (failure) {
      if (live(ticket)) setError(uiError(failure));
      return false;
    } finally {
      if (live(ticket)) setLoading(false);
    }
  }, [scopeKey, c.activeSpaceId]);
  useEffect(() => {
    void refresh();
    return () => {
      epoch.current++;
    };
  }, [refresh, revision]);
  useEffect(() => {
    const invalidate = () => {
      epoch.current++;
      setData(null);
      setError(t('Erişim yeniden doğrulanmalı.'));
      setRevision((value) => value + 1);
    };
    window.addEventListener('rooms:channel-access-invalidated', invalidate);
    window.addEventListener('rooms:community-management-invalidated', invalidate);
    return () => {
      window.removeEventListener('rooms:channel-access-invalidated', invalidate);
      window.removeEventListener('rooms:community-management-invalidated', invalidate);
    };
  }, []);
  const change = async (value: boolean, reviewed: AgentAuthoritySnapshot) => {
    const bridge = window.rooms?.agent,
      ticket = epoch.current;
    if (!bridge || !roomId || !data || !live(ticket))
      throw new Error(t('Erişim yeniden doğrulanmalı.'));
    const status = await bridge.status();
    if (!live(ticket)) return;
    const authority = await bridge.authority(roomId);
    if (!live(ticket)) return;
    if (
      status.userId !== identity ||
      !status.connected ||
      status.canManage !== true ||
      !authority.canManage ||
      authority.userId !== identity ||
      authority.roomId !== roomId
    ) {
      void refresh();
      throw new Error(t('Asistan yönetme yetkisi doğrulanamadı.'));
    }
    if (
      status.yolo !== reviewed.yolo ||
      automationGrantStamp(authority) !== automationGrantStamp(reviewed)
    ) {
      void refresh();
      throw new Error(t('İzinler veya mod değişti. Kapsamı yeniden incele.'));
    }
    const receipt = await bridge.yolo(value);
    if (!live(ticket)) return;
    if (
      !receipt.connected ||
      receipt.userId !== identity ||
      receipt.canManage !== true ||
      receipt.yolo !== value
    )
      throw new Error(t('Sunucunun mod değişikliği doğrulanamadı.'));
    if (!(await refresh())) throw new Error(t('Sunucu modu yeniden okunamadı. Durumu yenile.'));
  };
  return (
    <AgentAutomationSurface
      userId={identity}
      roomId={roomId || ''}
      roomName={c.spaces.find((space) => space.id === c.activeSpaceId)?.name || t('Topluluk')}
      channelName={c.channels.find((channel) => channel.id === roomId)?.name || t('Oda')}
      actorName={c.user?.displayName || identity}
      names={data?.names || {}}
      status={data?.status || null}
      authority={data?.authority || null}
      audit={data?.audit || null}
      auditError={data?.auditError}
      loading={loading}
      error={error}
      onRefresh={async () => {
        await refresh();
      }}
      onChange={change}
    />
  );
}
