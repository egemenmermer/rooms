import { tr, uiError } from './i18n';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Globe, LoaderCircle, ShieldCheck, Users } from 'lucide-react';
import { Modal } from '@rooms/design';
import type { SocialInvite } from '@rooms/social';
import { useCommunity } from './community';
export function InviteLanding({ invite, onClose, notify }: {
    invite: {
        serverUrl: string;
        code: string;
    };
    onClose(): void;
    notify(message: string): void;
}) {
    const c = useCommunity(), navigate = useNavigate();
    const [preview, setPreview] = useState<SocialInvite | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
    const sameServer = c.serverUrl.replace(/\/$/, '') === invite.serverUrl.replace(/\/$/, '');
    useEffect(() => { let stale = false; void window.rooms?.social.inspectInvite(invite.serverUrl, invite.code).then(value => { if (!stale)
        setPreview(value); }).catch(e => { if (!stale)
        setError(uiError(e)); }).finally(() => { if (!stale)
        setLoading(false); }); return () => { stale = true; }; }, [invite.serverUrl, invite.code]);
    return <Modal title={tr("Dostlar\u0131n seni bekliyor.")} onClose={onClose}><div className="invitation-art"><Users size={38}/></div>{loading ? <p className="modal-description"><LoaderCircle size={15} className="spin"/>{tr("Davet do\u011Frulan\u0131yor\u2026")}</p> : <><h3>{preview?.space?.name ?? tr("\u00D6zel topluluk daveti")}</h3><p className="modal-description">{preview?.channel?.name ? `${preview.channel.name} kanalına davet edildin.` : tr("Bu davet, \u00F6zel bir toplulu\u011Fa kat\u0131lmak i\u00E7in.")}</p></>}<div className="connection-info"><Globe size={15}/>{new URL(invite.serverUrl).host}</div>{preview?.expiresAt && <p className="modal-footnote">{tr("Son kullan\u0131m:")}{new Date(preview.expiresAt).toLocaleString('tr-TR')}</p>}{c.user && !sameServer ? <div className="settings-note"><ShieldCheck size={19}/><p>{tr("\u015Eu anda farkl\u0131 bir sunucuya ba\u011Fl\u0131s\u0131n. Bu daveti kullanmak i\u00E7in Ayarlar'dan mevcut hesab\u0131ndan \u00E7\u0131k\u0131\u015F yap\u0131p davetin sunucusunda giri\u015F yap.")}</p></div> : null}{error && <div className="error-pane" role="alert">{error}</div>}<button className="button primary full" disabled={loading || busy || !!error || (!!c.user && !sameServer)} onClick={() => { if (c.user) {
        setBusy(true);
        void c.acceptInvite(invite.code).then(() => { notify(tr("Davet kabul edildi. Toplulu\u011Funa ho\u015F geldin.")); onClose(); navigate('/spaces'); }).catch(e => setError(uiError(e))).finally(() => setBusy(false));
    }
    else {
        navigate(`/settings?tab=connections&server=${encodeURIComponent(invite.serverUrl)}&invite=${encodeURIComponent(invite.code)}`);
        onClose();
    } }}>{c.user ? 'Daveti kabul et' : tr("Hesab\u0131nla kat\u0131l")}<ArrowRight size={16}/></button>{c.user && !sameServer && <button className="button secondary full" onClick={() => { navigate(`/settings?tab=connections&server=${encodeURIComponent(invite.serverUrl)}&invite=${encodeURIComponent(invite.code)}`); onClose(); }}>{tr("Ba\u011Flant\u0131 ayarlar\u0131n\u0131 a\u00E7")}</button>}</Modal>;
}
