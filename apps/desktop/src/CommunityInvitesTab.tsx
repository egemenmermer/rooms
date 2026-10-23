import { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, Plus, RefreshCw } from 'lucide-react';
import { Modal } from '@rooms/design';
import type {
  SocialCommunityManagement,
  SocialInviteLinkSummary,
  SocialManagedMember,
} from '@rooms/social';
import { locale, t, uiError } from './i18n';

export interface CommunityInvitesBridge {
  listInvites(spaceId: string): Promise<SocialInviteLinkSummary[]>;
  revokeInvite(spaceId: string, inviteId: string): Promise<void>;
}

const OWNER_ONLY = 'Only the community owner or an admin can manage invitation links.';
const formatDate = (iso: string) => new Date(iso).toLocaleString(locale);

/**
 * Owner view of the community's active invitation links. Links themselves are never listed:
 * the server keeps only their digest, so they can be copied only when created.
 */
export function CommunityInvitesTab({
  spaceId,
  capability,
  members,
  bridge,
  disabledReason,
  onCreateInvite,
}: {
  spaceId: string;
  capability: SocialCommunityManagement['invites'];
  members: SocialManagedMember[];
  bridge: CommunityInvitesBridge | null;
  /** Set for fixtures and disconnected sessions; the list is not requested then. */
  disabledReason?: string;
  onCreateInvite?(): void;
}) {
  const [invites, setInvites] = useState<SocialInviteLinkSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<SocialInviteLinkSummary | null>(null);
  const [revoking, setRevoking] = useState(false);
  const request = useRef(0);
  // Callers may pass a fresh store object every render; only availability should refetch.
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;
  const supported = capability.managementSupported && !disabledReason && !!bridge;
  const load = useCallback(async () => {
    if (!supported) return;
    const epoch = ++request.current;
    setLoading(true);
    setError('');
    try {
      const value = await bridgeRef.current!.listInvites(spaceId);
      if (epoch === request.current) setInvites(value);
    } catch (failure) {
      if (epoch === request.current) setError(uiError(failure));
    } finally {
      if (epoch === request.current) setLoading(false);
    }
  }, [spaceId, supported]);
  useEffect(() => {
    setInvites(null);
    void load();
    return () => {
      request.current++;
    };
  }, [load]);
  const creator = (invite: SocialInviteLinkSummary) => {
    if (!invite.createdBy)
      return invite.source === 'script' || invite.source === 'admin' ? t('Sunucu') : '—';
    const member = members.find((item) => item.user.id === invite.createdBy);
    return member ? member.user.displayName || member.user.username : t('Eski üye');
  };
  const revoke = async () => {
    if (!confirm || revoking || !bridge) return;
    setRevoking(true);
    setError('');
    try {
      await bridge.revokeInvite(spaceId, confirm.id);
      setConfirm(null);
      await load();
    } catch (failure) {
      setError(uiError(failure));
    } finally {
      setRevoking(false);
    }
  };
  if (!capability.managementSupported || disabledReason || !bridge)
    return (
      <div className="rcm-invites">
        <h2>{t('Davet bağlantıları')}</h2>
        <div className="rcm-unavailable">
          <Link2 size={24} />
          <div>
            <strong>{t('Davetleri burada yönetemezsin')}</strong>
            <p>
              {disabledReason ||
                (!capability.managementSupported && capability.reason === OWNER_ONLY
                  ? t(
                      'Davet bağlantılarını yalnızca topluluk sahibi ve yöneticiler görebilir ve iptal edebilir.',
                    )
                  : t('Bu sunucu davet bağlantılarını listelemiyor.'))}
            </p>
          </div>
        </div>
      </div>
    );
  return (
    <div className="rcm-invites">
      <div className="rcm-invites-heading">
        <h2>{t('Davet bağlantıları')}</h2>
        <button
          className="rcm-refresh"
          aria-label={t('Davetleri yenile')}
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <p className="rcm-invites-note">
        {t(
          'Bağlantılar yalnızca oluşturulurken kopyalanabilir. Kaybettiysen yenisini oluştur, eskisini iptal et.',
        )}
      </p>
      {error && !confirm && (
        <p className="rcm-invites-error" role="alert">
          {error}
        </p>
      )}
      {invites === null ? (
        <p className="rcm-no-members" role="status">
          {loading ? t('Davetler yükleniyor…') : t('Davetler alınamadı.')}
        </p>
      ) : invites.length ? (
        <ul className="rcm-invite-list" aria-label={t('Etkin davet bağlantıları')}>
          {invites.map((invite) => (
            <li key={invite.id}>
              <div>
                <strong>
                  {t('{uses}/{max} kişi', { uses: invite.uses, max: invite.maxUses })}
                </strong>
                <span className={`rcm-invite-state ${invite.state}`}>
                  {invite.state === 'full' ? t('Dolu') : t('Etkin')}
                </span>
                <small>
                  {t('Oluşturan: {creator} · Son geçerlilik: {date}', {
                    creator: creator(invite),
                    date: formatDate(invite.expiresAt),
                  })}
                  {invite.pending > 0 &&
                    ` · ${t('{pending} kayıt sürüyor', { pending: invite.pending })}`}
                </small>
              </div>
              <button className="button secondary" onClick={() => setConfirm(invite)}>
                {t('İptal et')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rcm-no-members">{t('Etkin davet bağlantısı yok.')}</p>
      )}
      {onCreateInvite && (
        <div className="rcm-invite-actions">
          <button className="button secondary" onClick={onCreateInvite}>
            <Plus size={15} />
            {t('Yeni davet bağlantısı')}
          </button>
        </div>
      )}
      {confirm && (
        <Modal
          title={t('Davet bağlantısı iptal edilsin mi?')}
          onClose={() => {
            if (!revoking) setConfirm(null);
          }}
        >
          <p className="modal-description">
            {t(
              'Bu bağlantıyla artık kimse kayıt olamaz ya da katılamaz. Bağlantıyla katılmış olanlar toplulukta kalır.',
            )}
          </p>
          <div className="rcm-invite-actions">
            <button
              className="button secondary"
              disabled={revoking}
              onClick={() => setConfirm(null)}
            >
              {t('Vazgeç')}
            </button>
            <button className="button primary" disabled={revoking} onClick={() => void revoke()}>
              {revoking ? t('İptal ediliyor…') : t('Bağlantıyı iptal et')}
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
