import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Toggle } from '@rooms/design';
import type {
  AgentAuthoritySnapshot,
  AgentAuditSnapshot,
} from '../../../packages/agent-contracts/src';
import { useCurrentRoom } from './Agent';
import { useCommunity } from './community';
import { ReferenceIcon } from './ReferenceIcon';
import { VoiceAvatar } from './VoiceAvatar';
import { uiError } from './i18n';
import './reference-agent-management.css';

const scopeLabels = {
  room: 'Oda',
  workspace: 'Çalışma alanı',
  github: 'GitHub',
  drive: 'Google Drive',
  research: 'Araştırma',
  browser: 'Tarayıcı',
};
const scopeIcons = {
  room: 'message-circle',
  workspace: 'folder',
  github: 'github',
  drive: 'folder',
  research: 'search',
  browser: 'globe',
};
export const auditActionLabels: Record<string, string> = {
  'model-connected': 'Model bağlandı',
  'model-disconnected': 'Model bağlantısı kaldırıldı',
  'yolo-enabled': 'YOLO açıldı',
  'yolo-disabled': 'YOLO kapatıldı',
  'yolo-task-resumed': 'Görev YOLO ile sürdü',
  'task-created': 'Görev başlatıldı',
  'task-interrupted': 'Görev yarıda kaldı',
  'reminder-created': 'Hatırlatıcı kuruldu',
  'operation-awaiting-approval': 'İşlem onay bekliyor',
  'operation-record-result': 'İşlem sonucu elle kaydedildi',
  'operation-confirm-not-applied': 'İşlemin uygulanmadığı onaylandı',
  'mention-ingested': 'Sohbetten görev alındı',
  'task-completed': 'Görev tamamlandı',
  'task-failed': 'Görev başarısız',
  'task-cancelled': 'Görev iptal edildi',
  'task-approved': 'Görev onaylandı',
  'operation-approved': 'İşlem onaylandı',
  'memory-deleted': 'Hafıza silindi',
  'memory-saved': 'Hafıza kaydedildi',
};

/** Displays actual server grants; administrative mutations require a server capability. */
export function AssistantManagement() {
  const c = useCommunity(),
    roomId = useCurrentRoom(),
    navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'permissions' | 'history' | 'discord'>(
    params.get('view') === 'history' ? 'history' : 'permissions',
  );
  useEffect(() => {
    if (params.get('view') === 'history') setTab('history');
  }, [params]);
  const [data, setData] = useState<{
    key: string;
    authority: AgentAuthoritySnapshot;
    audit: AgentAuditSnapshot;
    names: Record<string, string>;
  } | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [actor, setActor] = useState(''),
    [action, setAction] = useState('');
  const epoch = useRef(0),
    key = `${c.serverUrl}|${c.user?.id ?? ''}|${roomId ?? ''}`,
    current = useRef(key);
  current.current = key;
  const projection = data?.key === key ? data : null;
  useEffect(() => {
    const ticket = ++epoch.current;
    setData(null);
    setError('');
    setActor('');
    setAction('');
    const live = () => ticket === epoch.current && current.current === key;
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('fixture') === 'S70') {
      setBusy(true);
      void import('./dev/reference-fixtures')
        .then((f) => {
          const fixture = f.getReferenceAuthority();
          if (live() && fixture) {
            setData({
              key,
              authority: fixture.authority,
              audit: fixture.audit,
              names: fixture.names,
            });
            setTab(fixture.tab);
            setBusy(false);
          }
        })
        .catch((e) => {
          if (live()) {
            setError(uiError(e));
            setBusy(false);
          }
        });
      return () => {
        epoch.current++;
      };
    }
    if (!window.rooms?.agent || !c.user || !roomId) {
      setBusy(false);
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        const status = await window.rooms!.agent.status();
        if (!live()) return;
        if (!status.connected) throw new Error(status.reason || 'Agent sunucusu bağlı değil.');
        // The room's history is for managers; everyone else reads their own, and sees the
        // "yetkin yok" view for the permissions instead of an error.
        const authority = await window.rooms!.agent.authority(roomId);
        if (!live()) return;
        const audit = authority.canManage
          ? await window.rooms!.agent.audit(roomId)
          : await window.rooms!.agent.audit();
        if (!live()) return;
        const names: Record<string, string> = { [c.user!.id]: c.user!.displayName };
        if (c.activeSpaceId) {
          const members = await window.rooms!.social.members(c.activeSpaceId).catch(() => []);
          if (!live()) return;
          for (const member of members) names[member.user.id] = member.user.displayName;
        }
        setData({ key, authority, audit, names });
      } catch (e) {
        if (live()) setError(uiError(e));
      } finally {
        if (live()) setBusy(false);
      }
    })();
    return () => {
      epoch.current++;
    };
  }, [key, c.activeSpaceId, revision]);
  const a = projection?.authority,
    audit = projection?.audit,
    name = (id: string) => projection?.names[id] ?? id;
  const space = c.spaces.find((s) => s.id === c.activeSpaceId),
    channel = c.channels.find((ch) => ch.id === roomId);
  const saveReason =
    'Kişi ve araç izinleri sunucu yöneticisi tarafından yapılandırılır; uygulamadan değiştirme desteklenmiyor.';
  const entries =
    audit?.entries.filter(
      (e) => (!actor || e.userId === actor) && (!action || e.action === action),
    ) ?? [];
  const auditGroups = entries.reduce<Map<string, typeof entries>>((groups, entry) => {
    const date = new Date(entry.at);
    const label = Number.isNaN(date.getTime())
      ? 'Tarih bilinmiyor'
      : date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    groups.set(label, [...(groups.get(label) ?? []), entry]);
    return groups;
  }, new Map());
  const auditBadge = (action: string) =>
    action === 'yolo-enabled'
      ? ['YOLO', 'warning']
      : action === 'task-failed'
        ? ['Kontrol gerekiyor', 'warning']
        : action.endsWith('approved')
          ? ['Onaylandı', 'success']
          : action === 'task-completed'
            ? ['Tamamlandı', 'success']
            : action === 'task-cancelled'
              ? ['İptal edildi', 'muted']
              : null;
  return (
    <div className="reference-agent-management">
      <div className="ref-settings-heading">
        <span>{space?.name ?? 'ODA'}</span>
        <h1>Asistan yönetimi</h1>
        <p>Kimlerin ne yapabildiğini, bağlı alanları ve yapılan işlemleri gör.</p>
      </div>
      <div className="agent-management-tabs" role="tablist" aria-label="Asistan yönetimi">
        {(
          [
            ['permissions', 'Yetkiler'],
            ['history', 'İşlem geçmişi'],
            ['discord', 'Discord botu'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
        <button
          className="agent-management-refresh"
          disabled={busy}
          onClick={() => setRevision((v) => v + 1)}
          aria-label="Asistan bilgilerini yenile"
        >
          <ReferenceIcon name="refresh-cw" size={18} />
        </button>
      </div>
      {busy && <p role="status">Yükleniyor…</p>}
      {error && (
        <div className="agent-management-callout error" role="alert">
          {error}
          <button className="text-button" onClick={() => navigate('/settings?tab=agent')}>
            Model bağlantıları
          </button>
        </div>
      )}
      {!busy && !error && !a && (
        <p>
          {!c.user
            ? 'Önce giriş yap.'
            : !roomId
              ? 'Bir oda seç.'
              : 'Asistan bilgileri masaüstü uygulamasında kullanılabilir.'}
        </p>
      )}
      {a && (
        <>
          {tab === 'permissions' && !a.canManage ? (
            <div className="agent-management-denied">
              <ReferenceIcon name="shield" size={42} />
              <h1>Bu ayarı yönetme yetkin yok</h1>
              <p>
                Asistanın kişi, araç ve çalışma alanı izinlerini yalnızca yetkilendirilmiş
                yöneticiler değiştirebilir.
              </p>
              <button className="button primary" onClick={() => navigate('/agent')}>
                Oda asistanına dön
              </button>
            </div>
          ) : tab === 'permissions' ? (
            <>
              <div className="agent-management-title">
                <h2>Kişiler ve işlemler</h2>
                <button
                  className="text-button"
                  onClick={() => navigate('/settings?tab=automation')}
                >
                  <ReferenceIcon name="sparkles" size={17} />
                  Otomasyon modu
                </button>
              </div>
              <table className="agent-management-table">
                <thead>
                  <tr>
                    <th>Kişi</th>
                    <th>İstek başlatma</th>
                    <th>Dış değişiklik</th>
                    <th>Yönetim</th>
                  </tr>
                </thead>
                <tbody>
                  {a.principals.map((p) => (
                    <tr key={p.userId}>
                      <td>
                        <div className="agent-management-person">
                          <VoiceAvatar id={p.userId} name={name(p.userId)} />
                          <strong>{name(p.userId)}</strong>
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            p.canStart ? 'agent-management-check' : 'agent-management-closed'
                          }
                        >
                          {p.canStart ? '✓' : '—'}
                        </span>{' '}
                        {p.canStart ? 'İzinli' : 'Kapalı'}
                      </td>
                      <td>
                        <span className="agent-management-badge">
                          {a.yolo ? 'Kapsam içinde YOLO' : 'Onayla'}
                        </span>
                      </td>
                      <td>{p.canManage ? 'İzinli' : 'Kapalı'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <section>
                <div className="agent-management-title">
                  <h2>Araç ve çalışma alanı kapsamı</h2>
                  <button
                    className="text-button"
                    onClick={() => navigate('/settings?tab=connections')}
                  >
                    <ReferenceIcon name="arrow-right" size={17} />
                    Bağlantıları düzenle
                  </button>
                </div>
                {a.scopes.map((s, i) => (
                  <div className="agent-management-scope" key={`${s.kind}-${i}`}>
                    <span>
                      <ReferenceIcon name={scopeIcons[s.kind]} size={18} />
                      {scopeLabels[s.kind]}
                    </span>
                    <strong>
                      {s.resources.join(', ') ||
                        (s.kind === 'room'
                          ? (channel?.name ?? roomId)
                          : 'Sunucunun izin verdiği kapsam')}
                    </strong>
                    <span className="agent-management-badge">
                      {[s.read ? 'Okuma' : '', s.write ? 'Değişiklik' : '']
                        .filter(Boolean)
                        .join(' + ') || 'Kapalı'}
                    </span>
                  </div>
                ))}
              </section>
              <div className="agent-management-callout">
                <ReferenceIcon name="shield" size={19} />
                <span>
                  Her görev, başlatanın seçtiği kişisel bağlantıyla çalışır. YOLO yalnızca izin
                  verilen işlemlerde onay adımını kaldırır.
                </span>
              </div>
              <div className="agent-management-bottom">
                <small>{saveReason}</small>
                <button className="button primary" disabled title={saveReason}>
                  Yetkileri kaydet
                </button>
              </div>
            </>
          ) : tab === 'history' ? (
            <>
              <div className="agent-management-filters">
                <select
                  aria-label="Kişi filtresi"
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                >
                  <option value="">Tüm kişiler</option>
                  {[...new Set(audit?.entries.map((e) => e.userId))].map((id) => (
                    <option key={id} value={id}>
                      {name(id)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="İşlem türü"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                >
                  <option value="">Tüm işlemler</option>
                  {[...new Set(audit?.entries.map((e) => e.action))].map((id) => (
                    <option key={id} value={id}>
                      {auditActionLabels[id] ?? id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="agent-management-title">
                <h2>{audit?.scope === 'room' ? 'Oda işlem geçmişi' : 'Kendi işlem geçmişin'}</h2>
                <small>
                  {entries.length} kayıt{audit?.limited ? ' · son kayıtlar' : ''}
                </small>
              </div>
              {!entries.length && <p>İşlem kaydı yok.</p>}
              {[...auditGroups].map(([date, group]) => (
                <section className="agent-management-audit-day" key={date}>
                  <h3>{date}</h3>
                  {group.map((entry, i) => {
                    const badge = auditBadge(entry.action),
                      at = new Date(entry.at);
                    return (
                      <div className="agent-management-log" key={`${entry.at}-${i}`}>
                        <time dateTime={entry.at}>
                          {Number.isNaN(at.getTime())
                            ? '—'
                            : at.toLocaleTimeString('tr-TR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                        </time>
                        <div>
                          {name(entry.userId)} · {auditActionLabels[entry.action] ?? entry.action}
                          <small>{channel?.name ?? 'Oda'} · işlem kaydı</small>
                        </div>
                        {badge && (
                          <span className={`agent-management-badge ${badge[1]}`}>{badge[0]}</span>
                        )}
                        {entry.taskId && (
                          <button
                            className="text-button"
                            onClick={() =>
                              navigate(`/agent?task=${encodeURIComponent(entry.taskId!)}`)
                            }
                          >
                            İncele
                          </button>
                        )}
                      </div>
                    );
                  })}
                </section>
              ))}
              <div className="agent-management-callout">
                <ReferenceIcon name="lock" size={19} />
                İşlem geçmişinde hesap anahtarları, kişisel medya adresleri ve özel dosya yolları
                gösterilmez.
              </div>
            </>
          ) : (
            <>
              <div className="agent-management-provider">
                <ReferenceIcon name="bot" size={32} />
                <div>
                  <div className="agent-management-title">
                    <h2>Resmi Discord bot bağlantısı</h2>
                    <span className="agent-management-badge">
                      {a.discord.state === 'configured'
                        ? 'Yapılandırıldı'
                        : a.discord.state === 'not-configured'
                          ? 'Bağlı değil'
                          : 'Durum bilinmiyor'}
                    </span>
                  </div>
                  <p>Canlı Discord bağlantısı bu durum bilgisiyle doğrulanmaz.</p>
                  <div className="agent-management-title">
                    <strong>Tayfa asistanı</strong>
                    <button
                      className="button secondary"
                      disabled
                      title="Resmi bot bağlantısı sunucu yöneticisi tarafından yapılandırılır."
                    >
                      Bağlantıyı yönet
                    </button>
                  </div>
                </div>
              </div>
              <section>
                <h2>İzin verilen alan</h2>
                <div className="agent-management-scope">
                  <span>Hesap türü</span>
                  <strong>Resmi bot hesabı</strong>
                </div>
                <div className="agent-management-title">
                  <div>
                    <h3>Yalnızca etiketlenince yanıt ver</h3>
                    <p>Asistan normal sohbeti kendiliğinden bölmez.</p>
                  </div>
                  <Toggle
                    label="Yalnızca etiketlenince yanıt ver"
                    value={a.discord.mentionOnly}
                    disabled
                    onChange={() => {}}
                  />
                </div>
              </section>
              <div className="agent-management-callout">
                <ReferenceIcon name="shield" size={19} />
                Discord görevi, başlatanın eşleştirilmiş kişisel bağlantısını kullanır.
              </div>
              <section>
                <h2>Eşleştirilmiş kişiler</h2>
                {!a.discord.mappings.length && <p>Eşleştirme yok.</p>}
                {a.discord.mappings.map((m, i) => (
                  <div className="agent-management-scope" key={`${m.userId}-${m.channelId}-${i}`}>
                    <span>{name(m.userId)}</span>
                    <strong>{m.channelId}</strong>
                    <span className="agent-management-badge">
                      {m.personalModel === 'selected'
                        ? 'Kişisel bağlantı seçilmiş'
                        : m.personalModel === 'missing'
                          ? 'Bağlantı gerekli'
                          : 'Kişisel bağlantı gizli'}
                    </span>
                  </div>
                ))}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
