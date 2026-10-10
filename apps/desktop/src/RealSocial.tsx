import { tr, uiError } from './i18n';
import { MessageReminder } from './Reminder';
import { ChatAgentRequest } from './ChatAgent';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, AudioLines, BookmarkPlus, Bot, Clock3, Paperclip, ThumbsUp, FileText, Check, Copy, Edit3, Hash, Headphones, Link, MessageCircle, Mic, MicOff, MonitorUp, PhoneOff, Plus, RefreshCw, Send, Settings, ShieldCheck, Square, Trash2, Users, Video, VideoOff, Volume2, X } from 'lucide-react';
import { Avatar, EmptyState, IconButton, Modal } from '@rooms/design';
import type { SocialUser, SocialAttachment } from '@rooms/social';
import { useCommunity, type CommunityMessage } from './community';
import { useRealtime, joinVoice, leaveVoice, toggleMic, toggleDeafen, toggleCamera, startScreen, stopScreen, setParticipantVolume, startRoomAudio, attachMediaTrack } from './realtime';
const report = (operation: Promise<unknown>, notify: (message: string) => void) => { void operation.catch(e => notify(uiError(e))); };
export function CommunityChat({ notify }: {
    notify(message: string): void;
}) {
    const c = useCommunity();
    const [selectedAuthor, setSelectedAuthor] = useState<SocialUser | null>(null);
    const [confirmRemoval, setConfirmRemoval] = useState(false);
    const [memberBusy, setMemberBusy] = useState(false);
    const [memberError, setMemberError] = useState('');
    const closeAuthor = useCallback(() => { setSelectedAuthor(null); setConfirmRemoval(false); setMemberError(''); }, []);
    useEffect(() => { const acknowledge = () => { const current=useCommunity.getState(), last=current.messages.at(-1); if(current.activeChannelId&&last&&!last.id.startsWith('pending-')&&document.hasFocus())void current.markRead(current.activeChannelId,last.id); }; acknowledge(); window.addEventListener('focus',acknowledge); return()=>window.removeEventListener('focus',acknowledge); }, [c.activeChannelId]);
    const [draft, setDraft] = useState('');
    const [attachments, setAttachments] = useState<SocialAttachment[]>([]), [uploading, setUploading] = useState(false);
    const attach = async () => { if (!c.activeChannelId || !window.rooms)
        return; const channelId = c.activeChannelId; setUploading(true); try {
        const item = await window.rooms.social.chooseAttachment(channelId);
        if (item && useCommunity.getState().activeChannelId === channelId)
            setAttachments(items => [...items, item].slice(0, 5));
        else if (item) await window.rooms.social.discardAttachment(item.id);
    }
    catch (error) {
        notify(uiError(error));
    }
    finally {
        setUploading(false);
    } };
    const react = async (message: CommunityMessage) => { if (!c.activeChannelId || !window.rooms)
        return; try {
        await window.rooms.social.react(c.activeChannelId, message.id, '1f44d', message.reactions?.['1f44d']?.includes(c.user?.id ?? ''));
        const updated = await window.rooms.social.messages(c.activeChannelId);
        if (c.activeChannelId === useCommunity.getState().activeChannelId)
            useCommunity.setState({ messages: updated });
    }
    catch (error) {
        notify(uiError(error));
    } };
    const [reminder, setReminder] = useState<CommunityMessage | null>(null);
    const closeReminder = useCallback(() => setReminder(null), []);
    const [agentPrompt, setAgentPrompt] = useState<string | null>(null);
    const closeAgent = useCallback(() => setAgentPrompt(null), []);
    const saveMemory = (message: CommunityMessage) => { if (!c.activeChannelId || !window.rooms?.agent)
        return; report(window.rooms.agent.saveMemory({ roomId: c.activeChannelId, text: message.content, sourceMessageId: message.id }).then(() => notify(tr("Mesaj oda haf\u0131zas\u0131na kaydedildi."))), notify); };
    const [editing, setEditing] = useState<CommunityMessage | null>(null);
    const [edit, setEdit] = useState('');
    const [deleting, setDeleting] = useState<string | null>(null);
    const log = useRef<HTMLDivElement>(null);
    const nearBottom = useRef(true);
    const [unseen, setUnseen] = useState(false);
    const channel = c.channels.find(ch => ch.id === c.activeChannelId) ?? c.dms.find(ch => ch.id === c.activeChannelId);
    const closeEdit = useCallback(() => setEditing(null), []);
    const closeDelete = useCallback(() => setDeleting(null), []);
    useEffect(() => {
        if (nearBottom.current && log.current)
            log.current.scrollTop = log.current.scrollHeight;
        else
            setUnseen(true);
    }, [c.messages.length]);
    useEffect(() => { nearBottom.current = true; setUnseen(false); setAttachments([]); }, [c.activeChannelId]);
    const send = () => {
        if (!draft.trim() && !attachments.length)
            return;
        const content = draft.trim();
        report(c.send(content, attachments).then(async () => { if (!/^@agent(?:\s|$)/i.test(content))
            return; const capabilities = (await window.rooms?.agent.status().catch(() => null))?.capabilities ?? []; if (!capabilities.includes('stoat-mentions') && /^@agent(?:\s|$)/i.test(content) && content.replace(/^@agent\s*/i, '').trim())
            setAgentPrompt(content.replace(/^@agent\s*/i, '').trim()); }), notify);
        setDraft('');
        setAttachments([]);
        nearBottom.current = true;
    };
    return <div className="chat-page page-enter"><div className="chat-heading"><span className="channel-symbol"><Hash size={24}/></span><div><h2>{channel?.name ?? tr("Your conversations")}</h2><p>{channel?.topic || tr("The everyday conversations, with your people.")}</p></div><span className="small-tag real-tag">{c.status === 'connected' ? tr("PRIVATE COMMUNITY") : c.status.toUpperCase()}</span></div><div ref={log} className="chat-transcript" role="log" aria-label={tr("Community messages")} onScroll={() => {
            const el = log.current;
            if (el) {
                nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                if (nearBottom.current)
                    setUnseen(false);
            }
        }}>{c.hasOlder && c.messages.length > 0 && <button className="text-button load-older" disabled={c.loadingMessages} onClick={() => {
                const el = log.current;
                const previousHeight = el?.scrollHeight ?? 0;
                void c.loadOlder().then(() => requestAnimationFrame(() => {
                    if (el)
                        el.scrollTop = el.scrollHeight - previousHeight;
                }));
            }}><RefreshCw size={12}/>{c.loadingMessages ? tr("Loading\u2026") : tr("Earlier messages")}</button>}{!c.messages.length && !c.loadingMessages && <div className="chat-welcome"><span className="eyebrow">{tr("A PLACE FOR YOUR PEOPLE")}</span><h3>{channel ? tr("A conversation starts here.") : tr("Find your corner.")}</h3><p>{channel ? tr("Send the first hello.") : tr("Select a channel or join a private space with an invitation.")}</p></div>}{c.loadingMessages && c.messages.length === 0 && <div className="message-loading" role="status">{tr("Opening the conversation\u2026")}</div>}{c.messages.map(m => <article key={m.id} className={`message ${m.author.id === c.user?.id ? 'own' : ''}`}><Avatar name={m.author.displayName || m.author.username}/><div className="message-body"><div className="message-byline"><button className="message-author" title={m.author.id === c.user?.id ? tr("You") : tr("Open member actions")} disabled={m.author.id === c.user?.id} onClick={() => setSelectedAuthor(m.author)}><strong>{m.author.displayName || m.author.username}</strong></button>{m.author.id === c.user?.id && <span>{tr("you")}</span>}<time dateTime={m.timestamp}>{new Date(m.timestamp).toLocaleTimeString('tr-TR', { hour: 'numeric', minute: '2-digit' })}</time>{m.editedTimestamp && <span>{tr("edited")}</span>}</div><p>{m.content}</p>{!!m.attachments?.length && <div className="message-attachments">{m.attachments.map(file => <a key={file.id} className="message-attachment" href={file.url} target="_blank" rel="noreferrer" aria-disabled={!file.url} onClick={e => { if (!file.url) {
        e.preventDefault();
        notify(tr("Dosya ba\u011Flant\u0131s\u0131 hen\u00FCz haz\u0131r de\u011Fil."));
    } }}><FileText size={19}/><span><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)}{tr("KB")}</small></span><ArrowRight size={13}/></a>)}</div>}{!!m.reactions?.['1f44d']?.length && <button className={`message-reaction ${m.reactions['1f44d'].includes(c.user?.id ?? '') ? 'selected' : ''}`} onClick={() => void react(m)}><ThumbsUp size={12}/>{m.reactions['1f44d'].length}</button>}{m.delivery === 'pending' && <span className="message-state">{tr("Sending\u2026")}</span>}{m.delivery === 'failed' && <span className="message-state failed">{tr("Not sent") + " "}<button onClick={() => report(c.retryMessage(m.id), notify)}>{tr("Retry")}</button></span>}</div>{m.delivery !== 'pending' && m.delivery !== 'failed' && <div className="message-actions"><IconButton label={tr("Mesaja be\u011Feni tepkisi ver")} onClick={() => void react(m)}><ThumbsUp size={14}/></IconButton><IconButton label={tr("Mesaj\u0131 agent g\u00F6revi olarak g\u00F6nder")} onClick={() => setAgentPrompt(m.content)}><Bot size={14}/></IconButton><IconButton label={tr('Bu mesajı sonra hatırlat')} onClick={() => setReminder(m)}><Clock3 size={13}/></IconButton><IconButton label={tr("Mesaj\u0131 oda haf\u0131zas\u0131na kaydet")} onClick={() => saveMemory(m)}><BookmarkPlus size={14}/></IconButton>{m.author.id === c.user?.id && <><IconButton label={tr("Edit your message")} onClick={() => { setEditing(m); setEdit(m.content); }}><Edit3 size={14}/></IconButton><IconButton label={tr("Delete your message")} onClick={() => setDeleting(m.id)}><Trash2 size={14}/></IconButton></>}</div>}</article>)}</div>{unseen && <button className="new-messages" onClick={() => {
                if (log.current)
                    log.current.scrollTop = log.current.scrollHeight;
                nearBottom.current = true;
                setUnseen(false);
            }}>{tr("New messages \u2193")}</button>}<div className="composer-wrap">{attachments.length > 0 && <div className="pending-attachments">{attachments.map(file => <span key={file.id}><Paperclip size={13}/>{file.name}<IconButton label={tr("Eki kald\u0131r")} onClick={() => void window.rooms?.social.discardAttachment(file.id).then(() => setAttachments(items => items.filter(f => f.id !== file.id))).catch(e => notify(uiError(e)))}><X size={12}/></IconButton></span>)}</div>}<form className="chat-composer" onSubmit={e => { e.preventDefault(); send(); }}><IconButton label={uploading ? tr("Dosya y\u00FCkleniyor") : "Dosya ekle"} disabled={!c.activeChannelId || uploading || attachments.length >= 5} onClick={() => void attach()}><Paperclip size={17}/></IconButton><textarea aria-label={tr("Community message composer")} rows={1} value={draft} maxLength={4000} disabled={!c.activeChannelId} placeholder={channel ? `#${channel.name} kanalına yaz · görev için @agent` : tr("Choose a channel to begin")} onChange={e => setDraft(e.target.value)} onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
            }
        }}/><button type="submit" className="send-button" aria-label={tr("Send community message")} disabled={(!draft.trim() && !attachments.length) || !c.activeChannelId || uploading}><Send size={17}/></button></form><div className="composer-foot"><span><ShieldCheck size={10}/>{tr("Private community \u00B7") + " "}{c.status === 'connected' ? tr("Connected") : c.status}</span><span>{tr("Enter to send \u00B7 Shift + Enter for a new line")}</span></div></div>{reminder && c.activeChannelId && <MessageReminder message={reminder} roomId={reminder.channelId} channelName={channel?.name ?? tr('Sohbet')} onClose={closeReminder} notify={notify}/>}{agentPrompt && c.activeChannelId && <ChatAgentRequest roomId={c.activeChannelId} prompt={agentPrompt} onClose={closeAgent} notify={notify}/>} {selectedAuthor && <Modal title={confirmRemoval ? tr("Remove this member?") : selectedAuthor.displayName || selectedAuthor.username} onClose={closeAuthor}><div className="profile-preview"><Avatar name={selectedAuthor.displayName || selectedAuthor.username} size="large"/><div><h3>{selectedAuthor.displayName || selectedAuthor.username}</h3><span className="small-tag">{tr("PRIVATE COMMUNITY MEMBER")}</span></div></div>{confirmRemoval ? <><p className="modal-description">{tr("Remove") + " "}{selectedAuthor.displayName || selectedAuthor.username}{" " + tr("from") + " "}{c.spaces.find(s => s.id === c.activeSpaceId)?.name}{tr("? They will need a new invitation to return. The server verifies your permission.")}</p><div className="button-row"><button className="button secondary" disabled={memberBusy} onClick={() => setConfirmRemoval(false)}>{tr("Keep member")}</button><button className="button danger" disabled={memberBusy} onClick={() => { setMemberBusy(true); void window.rooms!.social.removeMember(c.activeSpaceId!, selectedAuthor.id).then(() => { notify(tr("Member removed from this private space.")); closeAuthor(); }).catch(e => setMemberError(uiError(e))).finally(() => setMemberBusy(false)); }}>{memberBusy ? tr("Removing\u2026") : tr("Remove member")}</button></div></> : <><button className="button primary full" disabled={memberBusy} onClick={() => { setMemberBusy(true); void c.createDM(selectedAuthor.id).then(closeAuthor).catch(e => setMemberError(uiError(e))).finally(() => setMemberBusy(false)); }}><MessageCircle size={16}/>{tr("Open direct message")}</button><div className="member-actions"><button className="button secondary small" disabled={memberBusy} onClick={() => { setMemberBusy(true); void window.rooms!.social.blockUser(selectedAuthor.id).then(() => notify(tr("Member blocked. Your server applies the relationship."))).catch(e => setMemberError(uiError(e))).finally(() => setMemberBusy(false)); }}>{tr("Block member")}</button><button className="button secondary small" disabled={memberBusy} onClick={() => { setMemberBusy(true); void window.rooms!.social.unblockUser(selectedAuthor.id).then(() => notify(tr("Member unblocked."))).catch(e => setMemberError(uiError(e))).finally(() => setMemberBusy(false)); }}>{tr("Unblock member")}</button></div>{c.spaces.find(s => s.id === c.activeSpaceId)?.ownerId === c.user?.id && <button className="button secondary full destructive" disabled={memberBusy} onClick={() => setConfirmRemoval(true)}><Trash2 size={15}/>{tr("Remove from this space")}</button>}</>}{memberError && <div className="error-pane" role="alert"><p>{memberError}</p></div>}</Modal>}{editing && <Modal title={tr("A second thought.")} onClose={closeEdit}><textarea className="edit-textarea" aria-label={tr("Edit community message")} value={edit} onChange={e => setEdit(e.target.value)} maxLength={4000}/><button className="button primary full" disabled={!edit.trim()} onClick={() => { void c.editMessage(editing.id, edit).then(closeEdit).catch(e => notify(uiError(e))); }}>{tr("Save changes")}<Check size={16}/></button></Modal>}{deleting && <Modal title={tr("Delete this message?")} onClose={closeDelete}><p className="modal-description">{tr("This removes the message from your private community.")}</p><div className="button-row"><button className="button secondary" onClick={closeDelete}>{tr("Keep it")}</button><button className="button danger" onClick={() => { void c.deleteMessage(deleting).then(closeDelete).catch(e => notify(uiError(e))); }}>{tr("Delete message")}</button></div></Modal>}</div>;
}
export function CommunitySpaces({ notify }: {
    notify(message: string): void;
}) {
    const c = useCommunity();
    const navigate = useNavigate();
    const [code, setCode] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const close = useCallback(() => setShow(false), []);
    return <div className="spaces-page page-enter"><div className="page-intro"><div><span className="eyebrow">{tr("YOUR PRIVATE COMMUNITY")}</span><h2>{tr("A place to belong.")}</h2><p>{tr("The people you know. A corner of your own.")}</p></div><button className="button secondary" onClick={() => setShow(true)}><Link size={16}/>{tr("Join with an invite")}</button></div>{c.spaces.length ? <div className="spaces-grid">{c.spaces.map(s => <button key={s.id} className="space-card real-space-card" onClick={() => { void c.openSpace(s.id); navigate('/chat'); }}><div className="space-card-art"><span className="space-monogram">{s.name.slice(0, 1)}<span>.</span></span><span className="space-card-label">{tr("YOUR PRIVATE SPACE")}</span></div><div className="space-card-copy"><h3>{s.name}<ArrowRight size={17}/></h3><p>{tr("Open the conversation.")}</p></div></button>)}</div> : <EmptyState icon={<Users size={32}/>} title={tr("Your circle starts here.")}>{tr("Join your friends with an invitation from your private server.")}</EmptyState>}<div className="space-bottom-note"><ShieldCheck size={22}/><div><h4>{tr("Only the people you invite.")}</h4><p>{tr("Your server controls space membership and channel access.")}</p></div></div>{show && <Modal title={tr("Come on in.")} onClose={close}><p className="modal-description">{tr("Paste an invitation code from someone in your circle.")}</p><form onSubmit={e => { e.preventDefault(); setBusy(true); void c.acceptInvite(code.trim()).then(() => { setCode(''); close(); }).catch(e => notify(uiError(e))).finally(() => setBusy(false)); }}><label className="field-label">{tr("INVITATION CODE")}<input aria-label={tr("Join invitation code")} required value={code} onChange={e => setCode(e.target.value)} maxLength={128}/></label><button type="submit" className="button primary full" disabled={!code.trim() || busy}>{busy ? tr("Joining\u2026") : tr("Join private space")}<ArrowRight size={16}/></button></form></Modal>}</div>;
}
export function MediaStage({ id, label, className = 'screen-stage' }: {
    id: string;
    label: string;
    className?: string;
}) {
    const ref = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        try {
            if (ref.current)
                return attachMediaTrack(id, ref.current);
        }
        catch {
            setError(tr("This stream has ended."));
        }
    }, [id]);
    return error ? <p className="muted">{error}</p> : <video ref={ref} aria-label={label} autoPlay playsInline muted className={className}/>;
}
export function CommunityVoice({ openLauncher, notify }: {
    openLauncher(): void;
    notify(message: string): void;
}) {
    const c = useCommunity();
    const r = useRealtime();
    const navigate = useNavigate();
    const [member, setMember] = useState<string | null>(null);
    const close = useCallback(() => setMember(null), []);
    const person = r.participants.find(p => p.id === member);
    const screens = r.tracks.filter(t => t.source === 'screen_share' && t.kind === 'video' && !t.muted);
    const channels = c.channels.filter(ch => ch.type === 2);
    const cameras = r.tracks.filter(t => t.source === 'camera' && t.kind === 'video' && !t.muted);
    return <div className="voice-page page-enter"><div className="page-intro"><div><span className="eyebrow">{tr("YOUR PEOPLE / VOICE")}</span><h2>{tr("Just being here is enough.")}</h2><p>{r.roomName ? r.status === 'connected' ? `${r.roomName} odasındasın.` : `${r.roomName} bağlantısı şu anda kapalı.` : tr("Choose a room. Settle in.")}</p></div><span className={`small-tag ${r.status === 'connected' ? 'real-tag' : ''}`}>{r.status === 'connected' ? tr("CONNECTED") : r.busy ? tr("CONNECTING") : r.status === 'reconnecting' ? tr("RECONNECTING") : r.status === 'error' ? 'BAĞLANTI KESİLDİ' : tr("READY WHEN YOU ARE")}</span></div><div className="real-voice-channels">{channels.map(ch => <button className={r.channelId === ch.id ? 'selected' : ''} disabled={r.busy} key={ch.id} onClick={() => {
                if (r.channelId !== ch.id || r.status !== 'connected')
                    report(joinVoice(ch.id, ch.name), notify);
            }}><AudioLines size={16}/>{ch.name}{r.channelId === ch.id && <Check size={13}/>}</button>)}</div>{!channels.length && !r.channelId && <EmptyState icon={<Headphones size={32}/>} title={tr("A quiet corner.")}>{tr("This space has no visible voice channels. Choose another space or ask its owner to create one.")}</EmptyState>}{r.channelId && <section className="voice-stage"><div className="voice-stage-header"><span className="pill"><AudioLines size={14}/>{r.roomName}</span><span className="preview-status">{r.status === 'connected' ? `${r.participants.length} kişi odada` : r.busy ? tr("Connecting securely\u2026") : r.status === 'reconnecting' ? tr('Reconnecting…') : 'Bağlantı kesildi'}</span></div>{screens.map(t => <div className="shared-stage-wrap" key={t.id}><MediaStage id={t.id} label={`${r.participants.find(p => p.id === t.participantId)?.name ?? tr("Participant")} ekran paylaşımı`}/><p>{t.local ? tr("Your screen is being shared") : tr("Shared screen")}{" " + tr("\u00B7 System audio is off") + ""}</p></div>)}<div className="real-voice-roster">{!r.participants.length && <p className="voice-roster-empty">{r.status === 'connected' ? 'Yeriniz hazır.' : 'Oda bağlantısı kapalı. Yeniden bağlanınca burada buluşalım.'}</p>}{r.participants.map(p => <button className={`real-voice-member ${p.speaking ? 'speaking' : ''}`} key={p.id} onClick={() => setMember(p.id)}>{cameras.find(t => t.participantId === p.id) ? <MediaStage id={cameras.find(t => t.participantId === p.id)!.id} label={`${p.name} kamerası`} className="camera-tile"/> : <Avatar name={p.name} size="large"/>}<strong>{p.name}{p.local ? tr(" \u00B7 you") : ''}</strong><small>{p.muted ? <MicOff size={12}/> : <Mic size={12}/>} {p.muted ? tr("Mic off") : p.speaking ? tr("Speaking") : tr("Listening")}</small></button>)}</div><div className="voice-stage-bottom"><Headphones size={20}/><span>{r.status !== 'connected' ? 'Ses iletimi kapalı.' : r.muted ? tr("Your mic is off. Unmute when you\u2019re ready.") : tr("Your microphone is on.")}<small>{r.status === 'connected' ? tr("Voice stays connected when you move between activities.") : 'Oda erişimini yeniden doğrulayarak bağlanabilirsin.'}</small></span><button className="button secondary small" onClick={() => report(leaveVoice(), notify)}><PhoneOff size={14}/>{tr("Leave room")}</button></div></section>}{r.error && <div className="error-pane" role="alert"><strong>{tr("Let\u2019s get you connected.")}</strong><p>{r.error}</p>{r.channelId && r.status !== 'connected' && <button className="text-button" onClick={() => report(joinVoice(r.channelId!, r.roomName ?? tr("Voice room")), notify)}><RefreshCw size={13}/>{tr("Retry connection")}</button>}</div>}<div className="voice-actions"><button onClick={openLauncher}><span className="voice-action-icon"><Plus size={21}/></span><div><h4>{tr("Do something together")}</h4><p>{tr("Keep the conversation going.")}</p></div><ArrowRight size={15}/></button><button onClick={() => navigate('/settings?tab=audio')}><span className="voice-action-icon"><Settings size={21}/></span><div><h4>{tr("Sound like yourself")}</h4><p>{tr("Choose devices and test your microphone.")}</p></div><ArrowRight size={15}/></button></div>{person && <Modal title={person.name} onClose={close}><div className="profile-preview"><Avatar name={person.name} size="large"/><div><h3>{person.local ? tr("Your audio") : tr("In the room")}</h3><span className="small-tag">{tr("CONNECTION \u00B7") + " "}{person.quality}</span></div></div>{!person.local ? <label className="field-label">{tr("VOLUME FOR YOU \u00B7") + " "}{Math.round(person.volume * 100)}%<input type="range" aria-label={tr("Participant volume")} min={0} max={1} step={.01} value={person.volume} onChange={e => setParticipantVolume(person.id, Number(e.target.value))}/></label> : <p className="modal-description">{tr("Use the room control bar to mute your mic, deafen, or leave.")}</p>}</Modal>}</div>;
}
export function RealVoiceDock({ openLauncher, notify }: {
    openLauncher(): void;
    notify(message: string): void;
}) {
    const r = useRealtime();
    const navigate = useNavigate();
    const [picker, setPicker] = useState(false);
    const [sources, setSources] = useState<{
        id: string;
        name: string;
        thumbnail: string;
    }[]>([]);
    const [selected, setSelected] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const close = useCallback(() => { setPicker(false); setSelected(''); setError(''); }, []);
    const choose = async () => {
        setPicker(true);
        setBusy(true);
        setError('');
        try {
            setSources(await window.rooms!.media.captureSources());
        }
        catch (e) {
            setError(e instanceof Error ? e.message : tr("Screen sources are unavailable. Check macOS Screen Recording permission."));
        }
        finally {
            setBusy(false);
        }
    };
    if (!r.channelId)
        return null;
    return <><div className={`voice-dock real-voice-dock glass ${r.sharing ? 'is-sharing' : ''}`}><button className="dock-context" onClick={() => navigate('/voice')}><AudioLines size={19}/><div><strong>{r.roomName}</strong><small>{r.busy ? tr("Connecting\u2026") : r.status === 'connected' ? `${r.participants.length} kişi odada · ${r.muted ? tr("mic off") : tr("mic on")}` : r.status === 'reconnecting' ? tr("Reconnecting\u2026") : tr("Connection interrupted")}</small></div></button><div className="dock-divider"/><IconButton disabled={r.status !== 'connected'} label={r.muted ? tr("Unmute microphone") : tr("Mute microphone")} className={r.muted ? 'muted-control' : ''} onClick={() => report(toggleMic(), notify)}>{r.muted ? <MicOff size={18}/> : <Mic size={18}/>}</IconButton><IconButton disabled={r.status !== 'connected'} label={r.deafened ? tr("Undeafen audio") : tr("Deafen audio")} className={r.deafened ? 'muted-control' : ''} onClick={() => report(toggleDeafen(), notify)}><Headphones size={18}/></IconButton><IconButton disabled={r.status !== 'connected'} label={r.camera ? tr("Turn camera off") : tr("Turn camera on")} onClick={() => report(toggleCamera(), notify)}>{r.camera ? <Video size={18}/> : <VideoOff size={18}/>}</IconButton>{r.sharing ? <button className="stop-sharing" onClick={() => report(stopScreen(), notify)}><Square size={12} fill="currentColor"/>{tr("Stop sharing")}</button> : <IconButton label={tr("Share a screen or window")} disabled={r.status !== 'connected'} onClick={() => void choose()}><MonitorUp size={18}/></IconButton>}<IconButton label={tr("Voice device settings")} onClick={() => navigate('/settings?tab=audio')}><Settings size={16}/></IconButton><IconButton label={tr("Start an activity")} onClick={openLauncher}><Plus size={18}/></IconButton><IconButton label={tr("Leave voice room")} className="leave-control" onClick={() => report(leaveVoice(), notify)}><PhoneOff size={18}/></IconButton>{r.audioBlocked && <button className="button small secondary" onClick={() => report(startRoomAudio(), notify)}><Volume2 size={14}/>{tr("Enable sound")}</button>}</div>{r.error && <div className="voice-error-notice" role="alert"><span>{r.error}</span><button onClick={() => navigate('/voice')}>{tr("Open room")}</button></div>}{picker && <Modal title={tr("A window into your world.")} onClose={close} className="capture-modal"><p className="modal-description">{tr("Choose exactly what your room can see. Capture starts only after you press Share. System audio is off on this macOS build.")}</p>{busy ? <div className="message-loading">{tr("Finding screens and windows\u2026")}</div> : <div className="capture-grid">{sources.map(s => <button key={s.id} className={selected === s.id ? 'selected' : ''} aria-pressed={selected === s.id} onClick={() => setSelected(s.id)}><img src={s.thumbnail} alt={`${s.name} önizlemesi`}/><span>{s.name}{selected === s.id && <Check size={13}/>}</span></button>)}</div>}{!sources.length && !busy && !error && <p className="modal-description">{tr("No capture sources are available. Allow ROOMS in System Settings \u2192 Privacy & Security \u2192 Screen & System Audio Recording, then retry.")}</p>}{error && <div className="error-pane" role="alert"><p>{error}</p></div>}<div className="button-row"><button className="button secondary" onClick={close}>{tr("Cancel")}</button><button className="button primary" disabled={!selected || busy} onClick={() => { setBusy(true); void startScreen(selected).then(close).catch(e => setError(uiError(e))).finally(() => setBusy(false)); }}><MonitorUp size={16}/>{busy ? tr("Starting\u2026") : tr("Share selected source")}</button></div></Modal>}</>;
}
export function CommunityInvite({ onClose, notify }: {
    onClose(): void;
    notify(message: string): void;
}) { const c = useCommunity(); const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const channel = c.activeChannelId ?? c.channels.find(ch => ch.type === 0)?.id; return <Modal title={tr("Make room for a friend.")} onClose={onClose}><div className="invitation-art"><Users size={38}/></div><p className="modal-description">{tr("Create an invitation to this private space. It can be used once and expires after 24 hours. Your server checks invitation permissions.")}</p>{code ? <><label className="field-label">{tr("INVITATION CODE")}<input aria-label={tr("Created invitation code")} readOnly value={code}/></label><button className="button primary full" onClick={() => { void navigator.clipboard.writeText(code).then(() => notify(tr("Invitation code copied."))).catch(() => setError(tr("Clipboard is unavailable. Select and copy the code above."))); }}><Copy size={16}/>{tr("Copy invitation code")}</button><button className="button secondary full" onClick={() => { const link = `rooms://invite?server=${encodeURIComponent(c.serverUrl)}&code=${encodeURIComponent(code)}`; void navigator.clipboard.writeText(link).then(() => notify(tr("Davet ba\u011Flant\u0131s\u0131 kopyaland\u0131."))).catch(() => setError(tr("Panoya eri\u015Filemiyor. Davet kodunu kopyala."))); }}><Link size={16}/>{tr("Davet ba\u011Flant\u0131s\u0131n\u0131 kopyala")}</button></> : <button className="button primary full" disabled={!channel || busy} onClick={() => { setBusy(true); setError(''); void c.createInvite(channel!).then(i => setCode(i.code)).catch(e => setError(uiError(e))).finally(() => setBusy(false)); }}>{busy ? tr("Creating\u2026") : tr("Create invitation")}<ArrowRight size={15}/></button>}{!channel && <p className="modal-description">{tr("Open a space with a text channel first.")}</p>}{error && <div className="error-pane" role="alert"><p>{error}</p></div>}</Modal>; }
