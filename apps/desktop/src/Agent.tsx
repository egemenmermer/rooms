import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownToLine, ArrowRight, Bot, Check, CheckCheck, Clock3, FileText, KeyRound, Link2, LoaderCircle, Plus, RefreshCw, Send, ShieldCheck, Sparkles, Square, Trash2, X } from 'lucide-react';
import { EmptyState, IconButton, Modal, Toggle } from '@rooms/design';
import type { AgentMemory, AgentProvider, AgentStatus, AgentTask, ModelConnection } from '../../../packages/agent-contracts/src';
import { useCommunity } from './community';
import { useRealtime } from './realtime';
import { tr, uiError } from './i18n';
const taskNames: Record<AgentTask['state'], string> = { scheduled: tr("Zamanland\u0131"), queued: tr("S\u0131rada"), running: tr("\u00C7al\u0131\u015F\u0131yor"), 'awaiting-approval': 'Onay bekliyor', completed: tr("Tamamland\u0131"), failed: tr("Ba\u015Far\u0131s\u0131z"), cancelled: tr("\u0130ptal edildi"), interrupted: 'Kesildi' };
const date = (value: string) => new Date(value).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const reason = uiError;
export function useCurrentRoom() { const c = useCommunity(); const r = useRealtime(); return c.user ? (r.channelId ?? c.activeChannelId) : null; }
export function AgentSettings({ notify }: {
    notify(message: string): void;
}) {
    const [status, setStatus] = useState<AgentStatus | null>(null), [models, setModels] = useState<ModelConnection[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [url, setUrl] = useState(''), [token, setToken] = useState(''), [show, setShow] = useState(false), [provider, setProvider] = useState<AgentProvider>('openrouter'), [label, setLabel] = useState(''), [model, setModel] = useState(''), [key, setKey] = useState('');
    const refresh = useCallback(async () => {
        if (!window.rooms?.agent)
            return;
        try {
            const s = await window.rooms.agent.status();
            setStatus(s);
            setModels(s.connected ? await window.rooms.agent.connections() : []);
        }
        catch (e) {
            setError(reason(e));
        }
    }, []);
    useEffect(() => { void refresh(); }, [refresh]);
    const run = async (work: () => Promise<unknown>) => {
        setBusy(true);
        setError('');
        try {
            await work();
            await refresh();
        }
        catch (e) {
            setError(reason(e));
        }
        finally {
            setBusy(false);
        }
    };
    return <div className="agent-settings"><h3>{"Agent"}</h3><div className="service-status"><span className={`service-orb ${status?.connected ? 'online' : ''}`}><Bot size={24}/></span><div><strong>{status?.connected ? tr("Ayr\u0131 sunucuya ba\u011Fl\u0131") : tr("Agent sunucusu ba\u011Fl\u0131 de\u011Fil")}</strong><p>{(status?.reason ? uiError(status.reason) : undefined) ?? tr("G\u00F6revler yaln\u0131zca ayr\u0131 sunucuda \u00E7al\u0131\u015F\u0131r.")}</p></div><IconButton label="Durumu yenile" onClick={() => void refresh()}><RefreshCw size={16}/></IconButton></div>
 <form className="service-form" onSubmit={e => { e.preventDefault(); void run(async () => { await window.rooms?.agent.configure({ url: url.trim(), token }); setUrl(''); setToken(''); notify(tr("Agent sunucusu kaydedildi. Ba\u011Flant\u0131 do\u011Frulan\u0131yor.")); }); }}><label className="field-label">{tr("AGENT SUNUCUSU")}<input type="url" required placeholder="https://agent.example.com" value={url} onChange={e => setUrl(e.target.value)} autoComplete="off"/></label><label className="field-label">{tr("K\u0130\u015E\u0130SEL AGENT ER\u0130\u015E\u0130M ANAHTARI")}<input type="password" required value={token} onChange={e => setToken(e.target.value)} autoComplete="new-password" placeholder={tr("Sunucudan ald\u0131\u011F\u0131n eri\u015Fim anahtar\u0131")}/></label><button className="button secondary" disabled={busy || !window.rooms || !url.trim() || !token}><Link2 size={15}/>{tr("Sunucuya ba\u011Flan")}</button></form>
 <div className="section-heading"><div><h3>{"Model ba\u011Flant\u0131s\u0131"}</h3><span>{""}</span></div><button className="text-button" disabled={!status?.connected || busy} title={!status?.connected ? tr("\u00D6nce agent sunucusuna ba\u011Flan") : ''} onClick={() => setShow(true)}><Plus size={15}/>{tr("Ba\u011Flant\u0131 ekle")}</button></div>
 <div className="model-list">{models.map(m => <div className="model-row" key={m.id}><span className={`model-mark ${m.provider}`}>{m.provider === 'openrouter' ? <Sparkles size={18}/> : <Bot size={18}/>}</span><div><strong>{m.label}</strong><small>{m.provider === 'codex' ? 'Codex' : m.provider === 'claude' ? 'Claude' : 'OpenRouter'} · {m.model}</small><p>{(m.reason ? uiError(m.reason) : undefined) ?? (m.status === 'connected' ? tr("Ba\u011Flant\u0131 kaydedildi. Model eri\u015Fimi g\u00F6rev s\u0131ras\u0131nda do\u011Frulan\u0131r.") : m.status === 'login-required' ? tr("Ayr\u0131 sunucuda resm\u00EE oturum a\u00E7\u0131lmas\u0131 gerekiyor.") : tr("\u015Eu anda kullan\u0131lam\u0131yor."))}</p></div><span className={`small-tag ${m.status === 'connected' ? 'real-tag' : ''}`}>{m.status === 'connected' ? 'HAZIR' : m.status === 'login-required' ? tr("G\u0130R\u0130\u015E GEREKL\u0130") : 'KULLANILAMIYOR'}</span><IconButton label={`${m.label} bağlantısını kaldır`} disabled={busy} onClick={() => void run(() => window.rooms!.agent.disconnectModel(m.id))}><Trash2 size={15}/></IconButton></div>)}{!models.length && <div className="inline-empty"><KeyRound size={25}/><p>{tr("Hen\u00FCz ki\u015Fisel model ba\u011Flant\u0131n yok.")}</p><span>{tr("OpenRouter anahtar\u0131nla veya sunucudaki Codex / Claude oturumunla ba\u011Flan.")}</span></div>}</div>
 <div className="settings-row"><div><h4>{tr("YOLO \u00B7 sunucu genelinde")}</h4><p>{tr("Yetkili y\u00F6neticiler de\u011Fi\u015Ftirebilir. Sunucudaki yetkili g\u00F6revler, mevcut izinleri i\u00E7inde onay beklemeden devam eder. Ek eri\u015Fim vermez.")}</p></div><Toggle label="Sunucu genelinde YOLO" value={status?.yolo ?? false} onChange={v => {
            if (status?.connected)
                void run(() => window.rooms!.agent.yolo(v));
            else
                setError(tr("\u00D6nce agent sunucusuna ba\u011Flan."));
        }}/></div><div className="settings-note"><ShieldCheck size={20}/><p>{tr("Agent bilgisayar\u0131nda \u00E7al\u0131\u015Fmaz. Model ba\u011Flant\u0131lar\u0131n oda \u00FCyelerine a\u00E7\u0131lmaz. Codex ve Claude i\u00E7in resm\u00EE giri\u015Fin ayr\u0131 sunucuda tamamlanmas\u0131 gerekir.")}</p></div>{error && <div className="error-pane" role="alert">{error}</div>}
 {show && <Modal title="Kendi modelini getir." onClose={() => { setShow(false); setKey(''); }}><form onSubmit={e => { e.preventDefault(); void run(async () => { await window.rooms!.agent.connectModel({ provider, label: label.trim() || provider, model: model.trim(), ...(provider === 'openrouter' ? { apiKey: key } : {}) }); setShow(false); setKey(''); setModel(''); setLabel(''); }); }}><div className="segmented">{(['openrouter', 'codex', 'claude'] as const).map(p => <button type="button" key={p} className={provider === p ? 'selected' : ''} onClick={() => { setProvider(p); setKey(''); }}>{p === 'openrouter' ? 'OpenRouter' : p === 'codex' ? 'Codex' : 'Claude'}</button>)}</div><label className="field-label">{tr("BA\u011ELANTI ADI")}<input value={label} onChange={e => setLabel(e.target.value)} placeholder={tr("Ki\u015Fisel modelim")} maxLength={80}/></label><label className="field-label">{tr("MODEL")}<input value={model} onChange={e => setModel(e.target.value)} placeholder={provider === 'openrouter' ? tr("sa\u011Flay\u0131c\u0131/model") : tr("Sunucudaki resm\u00EE model ad\u0131")} required maxLength={120}/></label>{provider === 'openrouter' ? <label className="field-label">{tr("K\u0130\u015E\u0130SEL API ANAHTARI")}<input type="password" autoComplete="new-password" required value={key} onChange={e => setKey(e.target.value)} placeholder={tr("Anahtar\u0131n\u0131 yap\u0131\u015Ft\u0131r")}/></label> : <div className="settings-note"><KeyRound size={19}/><p>{provider === 'codex' ? 'Codex' : 'Claude'}{tr("ba\u011Flant\u0131s\u0131 ayr\u0131 sunucudaki resm\u00EE CLI oturumunu kullan\u0131r. ROOMS, ChatGPT veya Claude parolan\u0131 istemez.")}</p></div>}<button className="button primary full" disabled={busy || !model.trim() || (provider === 'openrouter' && !key)}>{busy ? <LoaderCircle size={16} className="spin"/> : <Plus size={16}/>}{tr("Ba\u011Flant\u0131y\u0131 ekle")}</button></form></Modal>}
 </div>;
}
export default function AgentWorkspace({ notify }: {
    notify(message: string): void;
}) {
    const roomId = useCurrentRoom(), navigate = useNavigate();
    const [status, setStatus] = useState<AgentStatus | null>(null), [tasks, setTasks] = useState<AgentTask[]>([]), [models, setModels] = useState<ModelConnection[]>([]), [memories, setMemories] = useState<AgentMemory[]>([]), [selected, setSelected] = useState<string | null>(null), [tab, setTab] = useState<'tasks' | 'memory'>('tasks'), [prompt, setPrompt] = useState(''), [modelId, setModelId] = useState(''), [scheduled, setScheduled] = useState(false), [runAt, setRunAt] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [memory, setMemory] = useState(''), [verifiedResult, setVerifiedResult] = useState(''), [notApplied, setNotApplied] = useState(false);
    const refresh = useCallback(async () => {
        if (!window.rooms?.agent)
            return;
        try {
            const next = await window.rooms.agent.status();
            setStatus(next);
            if (!next.connected || !roomId) {
                setTasks([]);
                setMemories([]);
                return;
            }
            const [jobs, connections, notes] = await Promise.all([window.rooms.agent.tasks(roomId), window.rooms.agent.connections(), window.rooms.agent.memory(roomId)]);
            setTasks(jobs);
            setModels(connections);
            setMemories(notes);
            setModelId(id => connections.some(m => m.id === id) ? id : connections.find(m => m.status === 'connected')?.id ?? '');
            setSelected(id => id ?? jobs[0]?.id ?? null);
        }
        catch (e) {
            setError(reason(e));
        }
    }, [roomId]);
    useEffect(() => {
        setError('');
        void refresh();
        const timer = setInterval(() => {
            if (!document.hidden)
                void refresh();
        }, 4000);
        return () => clearInterval(timer);
    }, [refresh]);
    const run = async (work: () => Promise<unknown>) => {
        setBusy(true);
        setError('');
        try {
            await work();
            await refresh();
        }
        catch (e) {
            setError(reason(e));
        }
        finally {
            setBusy(false);
        }
    };
    useEffect(() => { setVerifiedResult(''); setNotApplied(false); }, [selected]);
    const active = tasks.find(t => t.id === selected);
    const ready = !!roomId && !!status?.connected;
    const connectedModels = models.filter(m => m.status === 'connected');
    return <div className="agent-page page-enter"><div className="page-intro"><h2>Agent</h2><button className="button secondary small" onClick={() => navigate('/settings?tab=agent')}><Bot size={16}/>{tr("Agent ayarlar\u0131")}</button></div>
 {!ready ? <div className="agent-unavailable"><EmptyState icon={<Bot size={34}/>} title={!roomId ? tr("\u00D6nce bir odana kat\u0131l.") : "Oda se\u00E7"}>{!roomId ? tr("Agent g\u00F6revleri bir topluluk odas\u0131na aittir. Giri\u015F yap ve sohbet ya da ses odas\u0131 se\u00E7.") : (status?.reason ? uiError(status.reason) : undefined) ?? tr("Ayr\u0131 agent sunucusuna ba\u011Fland\u0131ktan sonra burada ger\u00E7ek g\u00F6revler olu\u015Fturabilirsin.")}<button className="button primary" onClick={() => navigate(!roomId ? '/settings?tab=connections' : '/settings?tab=agent')}>{!roomId ? tr("Toplulu\u011Fa ba\u011Flan") : tr("Agent ba\u011Flant\u0131s\u0131n\u0131 kur")}<ArrowRight size={16}/></button></EmptyState></div> : <>
 <div className="agent-workbench"><form className="agent-composer" onSubmit={e => {
                e.preventDefault();
                if (!roomId || !modelId)
                    return;
                void run(async () => { const t = await window.rooms!.agent.submit({ roomId, prompt: prompt.trim(), modelConnectionId: modelId, ...(scheduled ? { runAt: new Date(runAt).toISOString() } : {}) }); setSelected(t.id); setPrompt(''); setRunAt(''); setScheduled(false); setTab('tasks'); });
            }}><label htmlFor="agent-prompt" className="eyebrow">{"G\u00D6REV"}</label><textarea id="agent-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={16000} rows={3} placeholder={"G\u00F6rev yaz\u2026"} required/><div className="agent-composer-controls"><select aria-label={tr("G\u00F6rev modeli")} required value={modelId} onChange={e => setModelId(e.target.value)}><option value="">{tr("Model se\u00E7")}</option>{connectedModels.map(m => <option key={m.id} value={m.id}>{m.label} · {m.model}</option>)}</select><button type="button" className={`button subtle small ${scheduled ? 'selected' : ''}`} onClick={() => setScheduled(v => !v)}><Clock3 size={15}/>{scheduled ? tr("Zamanlanm\u0131\u015F") : 'Daha sonra'}</button><button className="button primary small" disabled={busy || !prompt.trim() || !modelId || (scheduled && !runAt)}>{busy ? <LoaderCircle size={15} className="spin"/> : <Send size={15}/>}{tr("G\u00F6revi g\u00F6nder")}</button></div>{scheduled && <label className="schedule-row">{tr("Bir kez \u00E7al\u0131\u015Ft\u0131r")}<input type="datetime-local" required min={new Date(Date.now() + 60000).toLocaleString('sv-SE').replace(' ', 'T').slice(0, 16)} value={runAt} onChange={e => setRunAt(e.target.value)}/><span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span></label>}{!connectedModels.length && <p className="inline-help">{tr("Haz\u0131r model yok.")}<button type="button" className="text-button" onClick={() => navigate('/settings?tab=agent')}>{tr("Kendi modelini ba\u011Fla")}</button></p>}</form>
 <div className="agent-subnav"><div className="segmented small"><button className={tab === 'tasks' ? 'selected' : ''} onClick={() => setTab('tasks')}>{tr("G\u00F6revler")}<span>{tasks.length}</span></button><button className={tab === 'memory' ? 'selected' : ''} onClick={() => setTab('memory')}>{tr("Oda haf\u0131zas\u0131")}<span>{memories.length}</span></button></div><IconButton label={tr("G\u00F6revleri yenile")} disabled={busy} onClick={() => void refresh()}><RefreshCw size={16}/></IconButton></div>
 {tab === 'tasks' ? tasks.length ? <div className="agent-task-layout"><div className="task-list">{tasks.map(task => <button className={`task-item ${selected === task.id ? 'selected' : ''}`} key={task.id} onClick={() => setSelected(task.id)}><span className={`task-status-icon ${task.state}`}>{task.state === 'completed' ? <CheckCheck size={17}/> : task.state === 'running' ? <LoaderCircle size={17} className="spin"/> : task.state === 'scheduled' ? <Clock3 size={17}/> : <Bot size={17}/>}</span><div><strong>{task.prompt}</strong><small>{task.kind === 'reminder' ? tr("Hatırlatma") + ' · ' : ''}{taskNames[task.state]} · {date(task.runAt ?? task.createdAt)}</small></div><ArrowRight size={14}/></button>)}</div>{active && <article className="task-detail"><div className="task-detail-heading"><span className={`task-state ${active.state}`}>{taskNames[active.state]}</span><span>{date(active.createdAt)}</span></div><h3>{active.prompt}</h3>{active.kind === 'reminder' && <p className="inline-help"><Clock3 size={14}/>{tr("Kaynak sohbete tek seferlik hatırlatma. Model bağlantısı gerektirmez.")}</p>}{active.progress.length > 0 && <ol className="task-progress">{active.progress.map((p, i) => <li key={i}><span />{p}</li>)}</ol>}{active.result && <div className="task-result"><span className="eyebrow">{tr("SONU\u00C7")}</span><p>{active.result}</p></div>}{active.error && <div className="error-pane">{uiError(active.error)}</div>}{active.artifacts.map(a => <button className="artifact-item" key={a.id} onClick={() => void run(async () => notify(await window.rooms!.agent.downloadArtifact(active.id, a.id) ? 'Dosya kaydedildi.' : 'Kaydetme iptal edildi.'))}><FileText size={20}/><span><strong>{a.name}</strong><small>{(a.size / 1024).toFixed(1)}{tr("KB")}</small></span><ArrowDownToLine size={18}/></button>)}{active.state === 'interrupted' && active.uncertainOperation && <div className="approval-preview"><span className="eyebrow">{tr('İŞLEM SONUCU BELİRSİZ')}</span><h4>{active.uncertainOperation.description}</h4><small>{active.uncertainOperation.tool}</small><pre>{active.uncertainOperation.preview}</pre><p>{tr('İşlem dış hizmette uygulanmış olabilir. Devam etmeden önce ilgili hizmetten sonucu kontrol et.')}</p><label className="field-label">{tr('DOĞRULADIĞIN SONUÇ')}<textarea value={verifiedResult} onChange={e => setVerifiedResult(e.target.value)} maxLength={12000} placeholder={tr('Dış hizmette gördüğün sonucu buraya yaz…')}/></label><button className="button secondary small" disabled={busy || !verifiedResult.trim()} onClick={() => void run(() => window.rooms!.agent.resolveOperation(active.id, { operationId: active.uncertainOperation!.operationId, resolution: 'record-result', result: verifiedResult.trim() }))}>{tr('Doğrulanmış sonuçla devam et')}</button><label className="recovery-confirm"><input type="checkbox" checked={notApplied} onChange={e => setNotApplied(e.target.checked)}/>{tr('Dış hizmeti kontrol ettim; bu işlem uygulanmadı.')}</label><button className="button secondary small" disabled={busy || !notApplied} onClick={() => void run(() => window.rooms!.agent.resolveOperation(active.id, { operationId: active.uncertainOperation!.operationId, resolution: 'confirm-not-applied' }))}>{tr('Uygulanmadığını onayla ve devam et')}</button></div>}<div className="button-row">{active.state === 'awaiting-approval' && active.pendingApproval && <div className="approval-preview"><span className="eyebrow">{tr("ONAYIN BEKLEN\u0130YOR")}</span><h4>{active.pendingApproval.description}</h4><small>{active.pendingApproval.tool}</small><pre>{typeof active.pendingApproval.preview === 'string' ? active.pendingApproval.preview : JSON.stringify(active.pendingApproval.preview, null, 2)}</pre><p>{tr("Devam etti\u011Finde yukar\u0131daki somut i\u015Flem, mevcut sunucu izinleriyle \u00E7al\u0131\u015Ft\u0131r\u0131l\u0131r.")}</p></div>}{active.state === 'awaiting-approval' && <button className="button primary small" disabled={busy} onClick={() => void run(() => window.rooms!.agent.approve(active.id))}><Check size={15}/>{tr("G\u00F6reve devam et")}</button>}{['queued', 'scheduled', 'running', 'awaiting-approval', 'interrupted'].includes(active.state) && <button className="button secondary small" disabled={busy} onClick={() => void run(() => window.rooms!.agent.cancel(active.id))}><Square size={13}/>{active.kind === 'reminder' ? tr("Hatırlatmayı iptal et") : tr("G\u00F6revi iptal et")}</button>}</div></article>}</div> : <div className="inline-empty"><Sparkles size={28}/><h3>{"G\u00F6rev yok"}</h3></div> : <div className="memory-view"><div className="settings-note"><ShieldCheck size={19}/><p>{tr("Normal sohbetler otomatik olarak haf\u0131zaya al\u0131nmaz. Yaln\u0131zca \u00F6zellikle kaydettiklerin burada g\u00F6r\u00FCn\u00FCr.")}</p></div><form className="memory-composer" onSubmit={e => { e.preventDefault(); void run(async () => { await window.rooms!.agent.saveMemory({ roomId: roomId!, text: memory.trim() }); setMemory(''); }); }}><input value={memory} onChange={e => setMemory(e.target.value)} maxLength={6000} placeholder={tr("Bu oda i\u00E7in hat\u0131rlanacak bir not\u2026")} aria-label={tr("Oda haf\u0131zas\u0131 notu")} required/><button className="button secondary small" disabled={busy || !memory.trim()}><Plus size={15}/>{tr("Kaydet")}</button></form>{memories.map(note => <div className="memory-note" key={note.id}><FileText size={17}/><div><p>{note.text}</p><small>{date(note.createdAt)}</small></div><IconButton label={tr("Bu haf\u0131za notunu sil")} disabled={busy} onClick={() => void run(() => window.rooms!.agent.deleteMemory(note.id))}><Trash2 size={15}/></IconButton></div>)}{!memories.length && <div className="inline-empty"><p>{tr("Hen\u00FCz kaydedilmi\u015F bir not yok.")}</p></div>}</div>}</div></>}{error && <div className="error-pane" role="alert">{error}</div>}</div>;
}
