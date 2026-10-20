import { uiError } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Globe, LoaderCircle, ShieldCheck, Users } from 'lucide-react';
import { Modal } from '@rooms/design';
import type { SocialInvite } from '@rooms/social';
import { useCommunity } from './community';
import { sameInviteServer } from './ConnectionPane';
import './onboarding.css';

export function InviteLanding({
  invite,
  onClose,
  notify,
}: {
  invite: { serverUrl: string; code: string };
  onClose(): void;
  notify(message: string): void;
}) {
  const c = useCommunity(),
    navigate = useNavigate();
  const [preview, setPreview] = useState<SocialInvite | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);
  const sameServer = sameInviteServer(c.serverUrl, invite.serverUrl);
  let host = invite.serverUrl;
  try {
    host = new URL(invite.serverUrl).host;
  } catch {
    /* Native validation rejects malformed invitation URLs. */
  }

  useEffect(() => {
    let stale = false;
    setLoading(true);
    setError('');
    setPreview(null);
    const inspect = async () => {
      try {
        if (!window.rooms?.social)
          throw new Error('Daveti açmak için Tayfa masaüstü uygulamasını kullan.');
        const value = await window.rooms.social.inspectInvite(invite.serverUrl, invite.code);
        if (!stale) setPreview(value);
      } catch (err) {
        if (!stale) setError(uiError(err));
      } finally {
        if (!stale) setLoading(false);
      }
    };
    void inspect();
    return () => {
      stale = true;
    };
  }, [invite.serverUrl, invite.code, attempt]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  // Signing out keeps this invitation pending; the app then opens Kayıt ol with it pre-filled.
  const switchServer = async () => {
    setBusy(true);
    try {
      await c.logout();
    } catch (err) {
      setError(uiError(err));
    } finally {
      setBusy(false);
    }
  };
  const accept = async () => {
    if (busy || loading || !preview) return;
    setBusy(true);
    setError('');
    try {
      await c.acceptInvite(invite.code);
      notify('Davet kabul edildi. Topluluğuna hoş geldin.');
      onClose();
      navigate('/spaces');
    } catch (err) {
      setError(uiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Topluluk daveti" onClose={onClose} className="rooms-invitation">
      <div className="invitation-art" aria-hidden="true">
        <Users size={29} />
      </div>
      {loading ? (
        <p className="modal-description invitation-loading" role="status">
          <LoaderCircle size={16} className="spin" />
          Davet kontrol ediliyor…
        </p>
      ) : (
        <div className="invitation-copy">
          <h3>{preview?.space?.name ?? (error ? 'Davet açılamadı.' : 'Özel topluluk daveti')}</h3>
          {preview && (
            <p className="modal-description">
              {preview.channel?.name
                ? `${preview.channel.name} kanalına davetlisin.`
                : 'Dostlarının topluluğuna katılmak için davet edildin.'}
            </p>
          )}
        </div>
      )}
      <div className="connection-info">
        <Globe size={14} />
        <span>{host}</span>
      </div>
      {preview?.expiresAt && (
        <p className="modal-footnote">
          Son kullanım: {new Date(preview.expiresAt).toLocaleString('tr-TR')}
        </p>
      )}
      {!sameServer && (
        <div className="settings-note">
          <ShieldCheck size={18} />
          <p>
            Farklı bir sunucuda oturumun açık. Bu davete katılmak için çıkış yap; ardından davetle
            kayıt olabilir ya da o sunucudaki hesabınla giriş yapabilirsin.
          </p>
        </div>
      )}
      {error && (
        <div className="error-pane onboarding-error" ref={errorRef} tabIndex={-1} role="alert">
          <p>{error}</p>
          <button
            className="text-button invitation-retry"
            disabled={busy || loading}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Daveti yeniden kontrol et
            <ArrowRight size={13} />
          </button>
        </div>
      )}
      <button
        className="button primary full"
        disabled={loading || busy || !preview || !sameServer}
        onClick={() => void accept()}
      >
        {busy ? (
          <>
            <LoaderCircle size={16} className="spin" />
            Katılınıyor…
          </>
        ) : (
          <>
            Daveti kabul et
            <ArrowRight size={16} />
          </>
        )}
      </button>
      {!sameServer && (
        <button
          className="button secondary full"
          disabled={busy}
          onClick={() => void switchServer()}
        >
          Çıkış yap ve davetle devam et
          <ArrowRight size={15} />
        </button>
      )}
    </Modal>
  );
}
