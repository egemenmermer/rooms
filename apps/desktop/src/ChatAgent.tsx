import { tr, uiError } from './i18n';
import { useEffect, useState } from 'react';
import { ArrowRight, Bot, Clock3, LoaderCircle, Send } from 'lucide-react';
import { Modal } from '@rooms/design';
import { useNavigate } from 'react-router-dom';
import type { ModelConnection } from '../../../packages/agent-contracts/src';
export function ChatAgentRequest({ roomId, prompt, onClose, notify }: {
    roomId: string;
    prompt: string;
    onClose(): void;
    notify(message: string): void;
}) {
    const [models, setModels] = useState<ModelConnection[]>([]), [model, setModel] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [runAt, setRunAt] = useState('');
    const navigate = useNavigate();
    useEffect(() => { let stale = false; void window.rooms?.agent.connections().then(items => { if (stale)
        return; setModels(items.filter(i => i.status === 'connected')); setModel(items.find(i => i.status === 'connected')?.id ?? ''); }).catch(e => { if (!stale)
        setError(uiError(e)); }).finally(() => { if (!stale)
        setLoading(false); }); return () => { stale = true; }; }, []);
    return <Modal title={tr("Odan\u0131n yard\u0131mc\u0131s\u0131na.")} onClose={onClose}><p className="modal-description">{tr("G\u00F6rev kendi modelinle ayr\u0131 sunucuda \u00E7al\u0131\u015F\u0131r. Sonu\u00E7lar\u0131n\u0131 Agent b\u00F6l\u00FCm\u00FCnde takip edebilirsin.")}</p><div className="agent-mention-prompt"><Bot size={19}/><p>{prompt}</p></div>{loading ? <div className="inline-empty"><LoaderCircle size={22} className="spin"/><p>{tr("Model ba\u011Flant\u0131lar\u0131n y\u00FCkleniyor\u2026")}</p></div> : models.length ? <form onSubmit={e => { e.preventDefault(); setBusy(true); setError(''); void window.rooms!.agent.submit({ roomId, prompt, modelConnectionId: model, ...(runAt ? { runAt: new Date(runAt).toISOString() } : {}) }).then(() => { notify(tr("Agent g\u00F6revi olu\u015Fturuldu. \u0130lerlemeyi Agent b\u00F6l\u00FCm\u00FCnden takip edebilirsin.")); onClose(); }).catch(e => setError(uiError(e))).finally(() => setBusy(false)); }}><label className="field-label">{tr("K\u0130\u015E\u0130SEL MODEL\u0130N")}<select value={model} onChange={e => setModel(e.target.value)}>{models.map(m => <option key={m.id} value={m.id}>{m.label} · {m.model}</option>)}</select></label><label className="field-label">{tr("B\u0130R KEZ \u00C7ALI\u015ETIR \u00B7 BO\u015ESA HEMEN")}<input type="datetime-local" value={runAt} onChange={e => setRunAt(e.target.value)} min={new Date(Date.now() + 60000).toLocaleString('sv-SE').replace(' ', 'T').slice(0, 16)}/></label><button className="button primary full" disabled={busy || !model}>{busy ? <LoaderCircle size={16} className="spin"/> : <Send size={16}/>}{tr("G\u00F6revi ba\u015Flat")}</button></form> : <div className="inline-empty"><p>{tr("Kullan\u0131labilir ki\u015Fisel model ba\u011Flant\u0131s\u0131 yok.")}</p><button className="button secondary" onClick={() => { onClose(); navigate('/settings?tab=agent'); }}>{tr("Modelini ba\u011Fla")}<ArrowRight size={15}/></button></div>}{error && <div className="error-pane" role="alert">{error}</div>}</Modal>;
}
