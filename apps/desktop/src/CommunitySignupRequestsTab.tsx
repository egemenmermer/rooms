import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RefreshCw, UserPlus, X, XCircle } from 'lucide-react';
import { Modal } from '@rooms/design';
import type {
  SocialCommunityManagement,
  SocialSignupRequest,
  SocialSignupRequests,
} from '@rooms/social';
import { locale, t, uiError } from './i18n';

export interface CommunitySignupRequestsBridge {
  signupRequests(spaceId: string): Promise<SocialSignupRequests>;
  decideSignupRequest(
    spaceId: string,
    requestId: string,
    decision: 'approve' | 'reject',
  ): Promise<void>;
}

const formatDate = (iso: string) => new Date(iso).toLocaleString(locale);

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
  /** The waiting requests the admin was looking at when asking to reject them all. */
  const [bulk, setBulk] = useState<SocialSignupRequest[] | null>(null);
  const [bulkProgress, setBulkProgress] = useState(0);
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
    setDeciding(item.id);
    setError('');
    try {
      await bridge.decideSignupRequest(spaceId, item.id, decision);
      setConfirm(null);
      await load();
    } catch (failure) {
      setError(uiError(failure));
    } finally {
      setDeciding(null);
    }
  };
  // Rejects one by one (the service has no bulk call and rate-limits writes), always the list
  // that was confirmed, so requests arriving meanwhile are never rejected unseen.
  const rejectAll = async () => {
    if (deciding || !bridge || !bulk) return;
    const items = bulk;
    setDeciding('*');
    setBulkProgress(0);
    setError('');
    let failed = 0;
    let lastFailure: unknown = null;
    for (const item of items) {
      try {
        await bridge.decideSignupRequest(spaceId, item.id, 'reject');
      } catch (failure) {
        failed++;
        lastFailure = failure;
      }
      setBulkProgress((done) => done + 1);
    }
    setBulk(null);
    setDeciding(null);
    await load();
    if (failed)
      setError(
        t('{count} istek reddedilemedi: {reason}', {
          count: failed,
          reason: uiError(lastFailure),
        }),
      );
  };
  const waiting = value?.requests.filter((item) => item.state === 'pending') ?? [];
  if (!supported)
    return (
      <div className="rcm-invites">
        <h2>{t('Kayıt istekleri')}</h2>
        <div className="rcm-unavailable">
          <UserPlus size={24} />
          <div>
            <strong>{t('Kayıt isteklerini burada yönetemezsin')}</strong>
            <p>
              {disabledReason ||
                t(
                  'Davetsiz kayıt isteklerini yalnızca topluluk sahibi ve yöneticiler görebilir ve onaylayabilir.',
                )}
            </p>
          </div>
        </div>
      </div>
    );
  return (
    <div className="rcm-invites">
      <div className="rcm-invites-heading">
        <h2>{t('Kayıt istekleri')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {waiting.length > 1 && (
            <button
              className="button secondary"
              disabled={!!deciding}
              onClick={() => setBulk(waiting)}
            >
              <XCircle size={15} />
              {t('Hepsini reddet')}
            </button>
          )}
          <button
            className="rcm-refresh"
            aria-label={t('Kayıt isteklerini yenile')}
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
      <p className="rcm-invites-note">
        {t(
          'Davet bağlantısı olmadan kayıt isteği gönderenler burada bekler; henüz hesapları yok. Onayladığın kişiye tek kullanımlık bir kayıt bağlantısı verilir (Davetler listesinde görünür); hesabı o zaman oluşur ve topluluğa katılır. Reddettiğin kişiye bu söylenir.',
        )}
      </p>
      {error && !confirm && !bulk && (
        <p className="rcm-invites-error" role="alert">
          {error}
        </p>
      )}
      {value === null ? (
        <p className="rcm-no-members" role="status">
          {loading ? t('Kayıt istekleri yükleniyor…') : t('Kayıt istekleri alınamadı.')}
        </p>
      ) : !value.enabled ? (
        <div className="rcm-unavailable">
          <UserPlus size={24} />
          <div>
            <strong>{t('Bu topluluk için davetsiz kayıt kapalı')}</strong>
            <p>
              {t(
                'Sunucu yöneticisi erişim servisinde ROOMS_SIGNUP_SPACE_ID ayarını bu topluluğa verince istekler burada görünür.',
              )}
            </p>
          </div>
        </div>
      ) : value.requests.length ? (
        <ul className="rcm-invite-list" aria-label={t('Bekleyen kayıt istekleri')}>
          {value.requests.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.username}</strong>
                <span
                  className={`rcm-invite-state ${item.state === 'approved' ? 'full' : 'active'}`}
                >
                  {item.state === 'approved' ? t('Onaylandı') : t('Bekliyor')}
                </span>
                <small>
                  {t('İstek: {date}', { date: formatDate(item.createdAt) })}
                  {item.state === 'approved' && ` · ${t('Uygulamayı açınca hesabı oluşacak')}`}
                </small>
              </div>
              <div className="rcm-signup-actions">
                <button
                  className="button primary"
                  disabled={!!deciding}
                  onClick={() => void decide(item, 'approve')}
                >
                  <Check size={15} />
                  {item.state === 'approved' ? t('Yeniden onayla') : t('Onayla')}
                </button>
                <button
                  className="button secondary"
                  disabled={!!deciding}
                  onClick={() => setConfirm(item)}
                >
                  <X size={15} />
                  {t('Reddet')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rcm-no-members">{t('Bekleyen kayıt isteği yok.')}</p>
      )}
      {confirm && (
        <Modal
          title={t('{name} reddedilsin mi?', { name: confirm.username })}
          onClose={() => {
            if (!deciding) setConfirm(null);
          }}
        >
          <p className="modal-description">
            {t('Bu kişi için hesap oluşturulmaz ve isteğinin reddedildiğini görür.')}
          </p>
          <div className="rcm-invite-actions">
            <button
              className="button secondary"
              disabled={!!deciding}
              onClick={() => setConfirm(null)}
            >
              {t('Vazgeç')}
            </button>
            <button
              className="button primary"
              disabled={!!deciding}
              onClick={() => void decide(confirm, 'reject')}
            >
              {deciding ? t('Reddediliyor…') : t('İsteği reddet')}
            </button>
          </div>
          {error && (
            <p className="rcm-invites-error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
      {bulk && (
        <Modal
          title={t('{count} bekleyen istek reddedilsin mi?', { count: bulk.length })}
          onClose={() => {
            if (!deciding) setBulk(null);
          }}
        >
          <p className="modal-description">
            {t(
              'Hiçbiri için hesap oluşturulmaz ve kişiler isteklerinin reddedildiğini görür. Onayladıkların bundan etkilenmez. Sahte ya da istenmeyen istekleri toplu temizlemek için kullan.',
            )}
          </p>
          <div className="rcm-invite-actions">
            <button
              className="button secondary"
              disabled={!!deciding}
              onClick={() => setBulk(null)}
            >
              {t('Vazgeç')}
            </button>
            <button
              className="button primary"
              disabled={!!deciding}
              onClick={() => void rejectAll()}
            >
              {deciding
                ? t('Reddediliyor… {done}/{count}', { done: bulkProgress, count: bulk.length })
                : t('Hepsini reddet')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
