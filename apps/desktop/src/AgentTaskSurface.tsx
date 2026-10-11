import './reference-agent-task.css';
import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, Clock3, FileText, LockKeyhole, RefreshCw, ShieldCheck, Square } from 'lucide-react';
import { Modal } from '@rooms/design';
import type { AgentArtifactPreview, AgentBridge, AgentTask, ModelConnection } from '@rooms/agent-contracts';
import { uiError } from './i18n';

export interface AgentTaskSurfaceProps {
  task: AgentTask; models: ModelConnection[]; userId: string; roomName: string;
  notify(message: string): void; onReturn(): void; onRefresh(): void | Promise<void>; bridge: AgentBridge;
  view?: 'task' | 'result'; connected?: boolean; canManage?: boolean;
  onManageConnection?(): void; onHistory?(): void;
  fixture?: boolean; fixturePreview?: AgentArtifactPreview;
  initialModal?: 'approval' | 'uncertain'; initialTab?: 'sources';
  /** Root supplies account/server/access epoch so authority invalidation remounts the entire scope. */
  scopeKey?: string;
}
const stateNames: Record<AgentTask['state'], string> = { scheduled: 'Zamanlandı', queued: 'Sırada bekliyor', running: 'Çalışıyor', 'awaiting-approval': 'Onay bekliyor', completed: 'Tamamlandı', failed: 'Başarısız', cancelled: 'Durduruldu', interrupted: 'Kesildi' };
const time = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'Zaman bilgisi yok';

/** Remount on identity/room/task/operation changes, synchronously discarding old drafts and previews. */
export default function AgentTaskSurface(props: AgentTaskSurfaceProps) {
  return <TaskScope key={`${props.scopeKey ?? ''}:${props.connected ?? true}:${props.userId}:${props.task.roomId}:${props.task.id}:${props.task.pendingApproval?.operationId ?? ''}:${props.task.uncertainOperation?.operationId ?? ''}`} {...props}/>;
}
function TaskScope({ task, models, userId, roomName, notify, onReturn, onRefresh, bridge, connected = true, canManage = false, fixture, fixturePreview, view: initialView = 'task', initialModal, initialTab, onManageConnection, onHistory }: AgentTaskSurfaceProps) {
  // Any explicit local fixture URL blocks privileged calls, including accidentally omitted fixture props.
  const demo = import.meta.env.DEV && (!!fixture || new URLSearchParams(location.search).has('fixture'));
  const [view, setView] = useState(initialView), [tab, setTab] = useState<'result' | 'sources'>(initialTab ?? 'result');
  const [modal, setModal] = useState<'approval' | 'uncertain' | 'cancel' | null>(initialModal ?? null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [verified, setVerified] = useState(''), [notApplied, setNotApplied] = useState(false);
  const [selected, setSelected] = useState<string | null>(initialView === 'result' ? task.artifacts[0]?.id ?? null : null);
  const [preview, setPreview] = useState<AgentArtifactPreview | null>(null), [previewError, setPreviewError] = useState(''), [previewLoading, setPreviewLoading] = useState(false), [revision, setRevision] = useState(0);
  const alive = useRef(true), epoch = useRef(0), lock = useRef(false), invalid = useRef(false);
  const latest = useRef({ userId, task, connected, bridge }); latest.current = { userId, task, connected, bridge };
  const owner = task.ownerId === userId, authorized = owner || canManage;
  const disabledReason = invalid.current ? 'Görev erişimi yeniden doğrulanmalı.' : demo ? 'Yerel örnekte hesap ve dosya işlemleri kapalı.' : !connected ? 'Agent bağlantısı doğrulanmalı.' : !authorized ? 'Görev sahibi veya yetkili Agent yöneticisi gerekli.' : '';
  const cancellable = ['queued', 'scheduled', 'running', 'awaiting-approval'].includes(task.state);
  const model = models.find(item => item.id === task.modelConnectionId && item.ownerId === userId && owner);
  const ownerLabel = owner ? 'Sen' : task.ownerId;
  useEffect(() => { setView(initialView); }, [initialView]);
  useEffect(() => {
    alive.current = true;
    const invalidate = () => { invalid.current = true; epoch.current++; setPreview(null); setSelected(null); setModal(null); setVerified(''); setNotApplied(false); setError('Görev erişimi yeniden doğrulanmalı.'); };
    window.addEventListener('rooms:community-management-invalidated', invalidate);
    window.addEventListener('rooms:channel-access-invalidated', invalidate);
    return () => { alive.current = false; epoch.current++; window.removeEventListener('rooms:community-management-invalidated', invalidate); window.removeEventListener('rooms:channel-access-invalidated', invalidate); };
  }, []);
  useEffect(() => {
    const request = ++epoch.current; let active = true;
    setPreview(null); setPreviewError(''); setPreviewLoading(false);
    if (!selected || !task.artifacts.some(item => item.id === selected)) return;
    if (demo) {
      if (fixturePreview?.taskId === task.id && (!fixturePreview.artifact || fixturePreview.artifact.id === selected)) setPreview(fixturePreview);
      else setPreviewError('Yerel dosya önizlemesi sağlanmadı.');
      return;
    }
    if (!connected || invalid.current) { setPreviewError('Dosya erişimi yeniden doğrulanmalı.'); return; }
    setPreviewLoading(true);
    void bridge.previewArtifact(task.id, selected).then(value => {
      if (active && alive.current && epoch.current === request && value.taskId === task.id && (!value.artifact || value.artifact.id === selected)) setPreview(value);
    }).catch(failure => { if (active && alive.current && epoch.current === request) setPreviewError(uiError(failure)); }).finally(() => { if (active && alive.current && epoch.current === request) setPreviewLoading(false); });
    return () => { active = false; };
  }, [selected, task.id, task.artifacts, bridge, connected, demo, fixturePreview, revision]);
  async function run(action: () => Promise<unknown>, mutate = true) {
    if (demo || !connected || invalid.current || lock.current || mutate && !authorized) return;
    const request = epoch.current, captured = latest.current; lock.current = true; setBusy(true); setError('');
    try {
      await action();
      if (alive.current && epoch.current === request && latest.current.userId === captured.userId && latest.current.task.id === captured.task.id && latest.current.bridge === captured.bridge) { setModal(null); await onRefresh(); }
    } catch (failure) { if (alive.current && epoch.current === request) setError(uiError(failure)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const openResult = () => { setView('result'); setSelected(task.artifacts[0]?.id ?? null); setTab('result'); };
  const download = (id: string) => void run(async () => {
    const captured = latest.current;
    const saved = await bridge.downloadArtifact(task.id, id);
    if (alive.current && !invalid.current && latest.current.connected && latest.current.bridge === captured.bridge && latest.current.userId === captured.userId) notify(saved ? 'Dosya kaydedildi.' : 'Kaydetme iptal edildi.');
  }, false);
  const previewReason = preview?.state === 'too-large' ? 'Metin önizlemesi 256 KiB ile sınırlı.' : preview?.state === 'unsupported' ? 'Bu dosya türü düz metin olarak önizlenemiyor.' : preview?.state === 'unavailable' ? 'Dosyaya ulaşılamıyor.' : previewError;
  const operation = modal === 'uncertain' ? task.uncertainOperation : task.pendingApproval;
  const resultTitle=task.artifacts[0]?.name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ')||task.prompt;
  return <div className={`rat-layout rat-view-${view}`}><main className="rat-main"><header className="rat-heading"><div><span className="rat-kicker">{view === 'result' ? stateNames[task.state].toLocaleUpperCase('tr-TR') : 'ODA GÖREVİ'}</span><h1>{view==='result'?resultTitle.charAt(0).toLocaleUpperCase('tr-TR')+resultTitle.slice(1):task.prompt}</h1><p>{view === 'result' ? time(task.createdAt) : roomName}</p></div>{view === 'result' ? <button className="rat-ghost" onClick={() => setView('task')}><ArrowLeft size={16}/>Göreve dön</button> : cancellable ? <button className="rat-stop" disabled={busy || !!disabledReason || invalid.current} title={disabledReason || undefined} onClick={() => setModal('cancel')}><Square size={14}/>Durdur</button> : <button className="rat-ghost" onClick={onReturn}><ArrowLeft size={16}/>Sohbete dön</button>}</header>
    {demo && <p className="rat-demo">DEMO · Yerel görev görünümü · Gerçek işlem yapılmaz</p>}
    {view === 'task' ? <><section className="rat-status"><div><Clock3 size={18}/><strong>{connected ? stateNames[task.state] : 'Bağlantı bekleniyor'}</strong><span>{task.progress.length} ilerleme kaydı</span></div><div className="rat-status-line"/><small>Toplam aşama ve tamamlanma yüzdesi sunulmuyor.</small></section>
      {!connected && <p className="rat-callout">Bağlantı kesildi. Görevin son durumu yeniden doğrulanmalı.</p>}
      {task.state === 'awaiting-approval' && <p className="rat-callout">{task.pendingApproval?.description ?? 'Görev yürütülmeden önce onay bekleniyor.'}</p>}
      {task.error && <p className="rat-callout error">{uiError(task.error)}</p>}
      {task.state === 'cancelled' && <p className="rat-callout">Görev durduruldu. Tamamlanmış dış işlemler geri alınmaz.</p>}
      <span className="rat-label">İSTEK</span><blockquote className="rat-prompt">{task.prompt}</blockquote>
      <ol className="rat-timeline">{task.progress.map((item, index) => <li key={`${index}:${item}`}><span><FileText size={12}/></span><p>{item}</p></li>)}</ol>{!task.progress.length && <p className="rat-muted">Henüz ilerleme kaydı yok.</p>}
      {task.result && <p className="rat-prompt">{task.result}</p>}
      {task.artifacts.map(artifact => <div className="rat-file" key={artifact.id}><FileText size={26}/><div><strong>{artifact.name}</strong><small>{(artifact.size / 1024).toFixed(1)} KB · {artifact.mime}</small></div><button onClick={() => { setView('result'); setSelected(artifact.id); }}>Aç</button><button disabled={demo || busy || !connected || invalid.current} title={disabledReason || undefined} onClick={() => download(artifact.id)}><ArrowDownToLine size={16}/>İndir</button></div>)}
      <div className="rat-actions">{task.state === 'awaiting-approval' && <button className="button primary" onClick={() => setModal('approval')}><ShieldCheck size={16}/>Değişikliği incele</button>}{task.uncertainOperation && task.state === 'interrupted' && <button className="button primary" onClick={() => setModal('uncertain')}>Belirsiz işlemi incele</button>}{task.state === 'completed' && <button className="button primary" onClick={openResult}><ArrowRight size={16}/>Sonuç ve dosyaları aç</button>}{!connected && <button className="button secondary" disabled={demo || busy} onClick={() => void onRefresh()}><RefreshCw size={16}/>Durumu yeniden kontrol et</button>}</div>
    </> : <><div className="rat-tabs" role="tablist"><button role="tab" aria-selected={tab === 'result'} onClick={() => setTab('result')}>Sonuç</button><button role="tab" aria-selected={tab === 'sources'} onClick={() => setTab('sources')}>Kaynaklar</button></div>{tab === 'sources' ? <div className="rat-empty"><LockKeyhole size={28}/><h2>Kaynak mesaj listesi sunulmuyor</h2><p>Bu görev sözleşmesinde kaynak mesaj kimlikleri veya doğrulanmış kaynak sayısı yok.</p></div> : <>{task.result && !task.artifacts.length && <p className="rat-prompt">{task.result}</p>}{task.artifacts.length ? <><div className={`rat-artifacts ${task.artifacts.length===1?'single':''}`}>{task.artifacts.map(item => <button key={item.id} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}><FileText size={15}/>{item.name}</button>)}</div><section className="rat-document"><header><FileText size={14}/>{task.artifacts.find(item => item.id === selected)?.name ?? 'Dosya önizlemesi'}<span>Düz metin</span></header>{previewLoading ? <div className="rat-empty" role="status">Önizleme açılıyor…</div> : preview?.state === 'text' ? <pre>{preview.text}</pre> : <div className="rat-empty"><FileText size={32}/><h2>Önizleme açılamadı</h2><p>{previewReason || 'Bir dosya seç.'}</p><button className="button secondary" disabled={demo || !connected || !selected || invalid.current} onClick={() => setRevision(value => value + 1)}>Yeniden dene</button></div>}</section><div className="rat-result-footer"><span>{stateNames[task.state]}</span><button className="button primary" disabled={demo || !connected || busy || !selected || invalid.current} title={disabledReason || undefined} onClick={() => selected && download(selected)}><ArrowDownToLine size={16}/>Dosyayı indir</button></div></> : <div className="rat-empty"><FileText size={32}/><h2>Bu görev dosya oluşturmadı</h2><button className="button primary" onClick={onReturn}>Sohbete dön</button></div>}</>}</>}
    {error && <p className="rat-callout error" role="alert">{error}</p>}
  </main><aside className="rat-rail"><h2>{view === 'result' ? 'Sonuç bilgileri' : 'Görev bilgileri'}</h2><dl><dt>Başlatan</dt><dd>{ownerLabel}</dd><dt>Oda</dt><dd>{roomName}</dd><dt>Kişisel bağlantı</dt><dd>{model?.label ?? (task.kind === 'reminder' ? 'Model gerektirmez' : 'Başlatanın kişisel bağlantısı')}</dd>{model && <><dt>Model profili</dt><dd>{model.model}</dd></>}<dt>Durum</dt><dd>{stateNames[task.state]}</dd><dt>Başlangıç</dt><dd>{time(task.createdAt)}</dd>{task.runAt && <><dt>Planlanan zaman</dt><dd>{time(task.runAt)}</dd></>}</dl><p>Görev başlatanın seçtiği bağlantıyla çalışır.</p><button disabled={!owner || !onManageConnection} title={!onManageConnection ? 'Bağlantı yönetimi bu görünümde bağlı değil.' : !owner ? 'Başka bir üyenin kişisel bağlantısı açılamaz.' : undefined} onClick={onManageConnection}>Bağlantıyı yönet</button><button disabled={!onHistory} title={!onHistory ? 'İşlem geçmişi bu görünümde bağlı değil.' : undefined} onClick={onHistory}>İşlem geçmişi</button><p>Kaynak mesaj listesi ve dış işlem makbuzu bu görev görünümünde sunulmuyor.</p></aside>
  {modal && <Modal title={modal === 'cancel' ? 'Görevi durdur?' : modal === 'uncertain' ? 'İşlemin sonucu doğrulanamadı' : 'İşlemi onayla?'} className="rat-modal" onClose={() => { if (!busy) { setModal(null); setError(''); } }}><div className="rat-modal-body">{modal === 'cancel' ? <p>Görevin devamı durdurulur. Tamamlanmış dış işlemler geri alınmaz.</p> : <><p>{operation?.description ?? 'Bu görev çalıştırılmayı bekliyor.'}</p><dl className="rat-scope"><div><dt>İşlem</dt><dd>{operation?.tool ?? 'Görev yürütme'}</dd></div><div><dt>Başlatan</dt><dd>{ownerLabel}</dd></div><div><dt>Kapsam</dt><dd>{roomName}</dd></div></dl>{operation && <pre className="rat-operation">{operation.preview}</pre>}{modal === 'uncertain' ? <><p className="rat-callout">İşlem dış hizmette uygulanmış olabilir. Aynı işlemi tekrar göndermeden önce sonucu ilgili hizmetten kontrol et.</p><label className="rat-field">Doğruladığın sonuç<textarea value={verified} onChange={event => setVerified(event.target.value)} maxLength={12000}/></label><button className="button secondary" disabled={busy || !!disabledReason || !verified.trim() || invalid.current} onClick={() => task.uncertainOperation && void run(() => bridge.resolveOperation(task.id, { operationId: task.uncertainOperation!.operationId, resolution: 'record-result', result: verified.trim() }))}>Doğrulanmış sonuçla devam et</button><label className="rat-confirm"><input type="checkbox" checked={notApplied} onChange={event => setNotApplied(event.target.checked)}/>Dış hizmeti kontrol ettim; işlem uygulanmadı.</label><button className="button secondary" disabled={busy || !!disabledReason || !notApplied || invalid.current} onClick={() => task.uncertainOperation && void run(() => bridge.resolveOperation(task.id, { operationId: task.uncertainOperation!.operationId, resolution: 'confirm-not-applied' }))}>Uygulanmadığını onayla ve devam et</button></> : <p className="rat-muted">Onay mevcut sunucu izinlerini genişletmez. İşlem yetkisini Agent sunucusu yeniden doğrular.</p>}</>}{disabledReason && <p className="rat-callout">{disabledReason}</p>}{error && <p className="rat-callout error" role="alert">{error}</p>}</div><footer><button className="button secondary" disabled={busy} onClick={() => setModal(null)}>Vazgeç</button>{modal === 'cancel' && <button className="button danger" disabled={busy || !!disabledReason || !cancellable || invalid.current} onClick={() => void run(() => bridge.cancel(task.id))}>Durdur</button>}{modal === 'approval' && <button className="button primary" disabled={busy || !!disabledReason || task.state !== 'awaiting-approval' || invalid.current} onClick={() => void run(() => bridge.approve(task.id))}><Check size={16}/>Onayla ve devam et</button>}</footer></Modal>}
  </div>;
}
export { AgentTaskSurface };
