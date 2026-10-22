import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RefreshCw, UserPlus, X } from 'lucide-react';
import { Modal } from '@rooms/design';
import type {
  SocialCommunityManagement,
  SocialSignupRequest,
  SocialSignupRequests,
} from '@rooms/social';
import { uiError } from './i18n';

export interface CommunitySignupRequestsBridge {
  signupRequests(spaceId: string): Promise<SocialSignupRequests>;
  decideSignupRequest(
    spaceId: string,
    userId: string,
    decision: 'approve' | 'reject',
  ): Promise<void>;
}

const formatDate = (iso: string) => new Date(iso).toLocaleString('tr-TR');

/**
 * Owner/admin view of approved sign-up requests (people who signed up without an invitation
 * link). Approving lets the person join on their next check; rejecting tells them plainly.
 */
export function CommunitySignupRequestsTab({
  spaceId,
  capability,
  bridge,
  disabledReason,
}: {
  spaceId: string;
  /** The same owner/admin gate as invitation links. */
  capability: SocialCommunityManagement['invites'];
  bridge: CommunitySignupRequestsBridge | null;
  disabledReason?: string;
}) {
  const [value, setValue] = useState<SocialSignupRequests | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deciding, setDeciding] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<SocialSignupRequest | null>(null);
  const request = useRef(0);
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;
  const supported = capability.managementSupported && !disabledReason && !!bridge;
  const load = useCallback(async () => {
    if (!supported) return;
    const epoch = ++request.current;
    setLoading(true);
    setError('');
    try {
      const next = await bridgeRef.current!.signupRequests(spaceId);
      if (epoch === request.current) setValue(next);
    } catch (failure) {
      if (epoch === request.current) setError(uiError(failure));
    } finally {
      if (epoch === request.current) setLoading(false);
    }
  }, [spaceId, supported]);
  useEffect(() => {
    setValue(null);
    void load();
    return () => {
      request.current++;
    };
  }, [load]);
  const decide = async (item: SocialSignupRequest, decision: 'approve' | 'reject') => {
    if (deciding || !bridge) return;
    setDeciding(item.userId);
    setError('');
    try {
      await bridge.decideSignupRequest(spaceId, item.userId, decision);
      setConfirm(null);
      await load();
    } catch (failure) {
      setError(uiError(failure));
    } finally {
      setDeciding(null);
    }
  };
  if (!supported)
    return (
      <div className="rcm-invites">
        <h2>Kayıt istekleri</h2>
        <div className="rcm-unavailable">
          <UserPlus size={24} />
          <div>
            <strong>Kayıt isteklerini burada yönetemezsin</strong>
            <p>
              {disabledReason ||
                'Davetsiz kayıt isteklerini yalnızca topluluk sahibi ve yöneticiler görebilir ve onaylayabilir.'}
            </p>
          </div>
        </div>
      </div>
    );
  return (
    <div className="rcm-invites">
      <div className="rcm-invites-heading">
        <h2>Kayıt istekleri</h2>
        <button
          className="rcm-refresh"
          aria-label="Kayıt isteklerini yenile"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <p className="rcm-invites-note">
        Davet bağlantısı olmadan kayıt olanlar burada bekler. Onayladığın kişi uygulamayı açınca
        topluluğa katılır; reddettiğin kişiye bu söylenir.
      </p>
      {error && !confirm && (
        <p className="rcm-invites-error" role="alert">
          {error}
        </p>
      )}
      {value === null ? (
        <p className="rcm-no-members" role="status">
          {loading ? 'Kayıt istekleri yükleniyor…' : 'Kayıt istekleri alınamadı.'}
        </p>
      ) : !value.enabled ? (
        <div className="rcm-unavailable">
          <UserPlus size={24} />
          <div>
            <strong>Bu topluluk için davetsiz kayıt kapalı</strong>
            <p>
              Sunucu yöneticisi erişim servisinde ROOMS_SIGNUP_SPACE_ID ayarını bu topluluğa verince
              istekler burada görünür.
            </p>
          </div>
        </div>
      ) : value.requests.length ? (
        <ul className="rcm-invite-list" aria-label="Bekleyen kayıt istekleri">
          {value.requests.map((item) => (
            <li key={item.userId}>
              <div>
                <strong>{item.username}</strong>
                <span
                  className={`rcm-invite-state ${item.state === 'approved' ? 'full' : 'active'}`}
                >
                  {item.state === 'approved' ? 'Onaylandı' : 'Bekliyor'}
                </span>
                <small>
                  İstek: {formatDate(item.createdAt)}
                  {item.state === 'approved' && ' · Uygulamayı açınca katılacak'}
                </small>
              </div>
              <div className="rcm-signup-actions">
                <button
                  className="button primary"
                  disabled={!!deciding}
                  onClick={() => void decide(item, 'approve')}
                >
                  <Check size={15} />
                  {item.state === 'approved' ? 'Yeniden onayla' : 'Onayla'}
                </button>
                <button
                  className="button secondary"
                  disabled={!!deciding}
                  onClick={() => setConfirm(item)}
                >
                  <X size={15} />
                  Reddet
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rcm-no-members">Bekleyen kayıt isteği yok.</p>
      )}
      {confirm && (
        <Modal
          title={`${confirm.username} reddedilsin mi?`}
          onClose={() => {
            if (!deciding) setConfirm(null);
          }}
        >
          <p className="modal-description">
            Bu kişi topluluğa katılamaz ve isteğinin reddedildiğini görür. Hesabı silinmez.
          </p>
          <div className="rcm-invite-actions">
            <button
              className="button secondary"
              disabled={!!deciding}
              onClick={() => setConfirm(null)}
            >
              Vazgeç
            </button>
            <button
              className="button primary"
              disabled={!!deciding}
              onClick={() => void decide(confirm, 'reject')}
            >
              {deciding ? 'Reddediliyor…' : 'İsteği reddet'}
            </button>
          </div>
          {error && (
            <p className="rcm-invites-error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
