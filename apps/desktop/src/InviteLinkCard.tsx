import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import {
  INVITE_LINK_DAYS,
  INVITE_LINK_MAX_USES,
  inviteAppLink,
  inviteShareLink,
  type SocialInvite,
} from '@rooms/social';
import { locale, t } from './i18n';
import './onboarding.css';

/** The https link friends open; servers without the Tayfa broker fall back to the app link. */
export function inviteLinkFor(serverUrl: string, code: string) {
  return inviteShareLink(serverUrl, code) ?? inviteAppLink(serverUrl, code) ?? code;
}

/** A freshly created invitation: the one moment its link can still be copied. */
export function InviteLinkCard({
  serverUrl,
  invite,
  autoFocus = false,
}: {
  serverUrl: string;
  invite: Pick<SocialInvite, 'code' | 'expiresAt' | 'maxUses'>;
  autoFocus?: boolean;
}) {
  const link = inviteLinkFor(serverUrl, invite.code);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const expires = invite.expiresAt ? new Date(invite.expiresAt) : null;
  const maxUses = invite.maxUses ?? INVITE_LINK_MAX_USES;
  const days = expires
    ? Math.max(1, Math.round((expires.getTime() - Date.now()) / 86_400_000))
    : INVITE_LINK_DAYS;
  return (
    <div className="invite-link-card">
      <label className="field-label">
        {t('Davet bağlantısı')}
        <input
          readOnly
          autoFocus={autoFocus}
          value={link}
          onFocus={(event) => event.target.select()}
        />
      </label>
      <button
        type="button"
        className="button primary full"
        onClick={() => {
          setError('');
          void navigator.clipboard
            .writeText(link)
            .then(() => setCopied(true))
            .catch(() => {
              setCopied(false);
              setError(t('Panoya erişilemiyor. Bağlantıyı seçip kopyala.'));
            });
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? t('Kopyalandı') : t('Bağlantıyı kopyala')}
      </button>
      <p className="invite-link-meta">
        {t('{count} gün', { count: days })} · {t('{count} kişi', { count: maxUses })}
        {expires && !Number.isNaN(expires.getTime()) && (
          <>
            {' · '}
            {t('Son geçerlilik: {date}', { date: expires.toLocaleString(locale) })}
          </>
        )}
      </p>
      <p className="invite-link-meta">
        {t(
          'Bağlantıyı yalnızca katılmasını istediğin kişilerle paylaş. Bu pencere kapanınca bağlantı yeniden gösterilmez; gerekirse yenisini oluştur.',
        )}
      </p>
      {copied && (
        <p className="invite-link-live" role="status">
          {t('Davet bağlantısı kopyalandı.')}
        </p>
      )}
      {error && (
        <div className="error-pane" role="alert">
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
