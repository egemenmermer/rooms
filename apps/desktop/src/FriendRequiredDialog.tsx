import { useState } from 'react';
import { create } from 'zustand';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@rooms/design';
import type { SocialUser } from '@rooms/social';
import { dmFriendRequired, t, uiError } from './i18n';

const useFriendOffer = create<{ user: SocialUser | null }>(() => ({ user: null }));

/**
 * Handles a failed private-message attempt. When upstream requires friendship, offers a friend
 * request instead of a dead-end error and returns true; otherwise reports the error.
 */
export function directMessageFailed(
  error: unknown,
  user: SocialUser,
  report: (message: string) => void,
): boolean {
  const message = uiError(error);
  if (message !== dmFriendRequired) {
    report(message);
    return false;
  }
  useFriendOffer.setState({ user });
  return true;
}

export function FriendRequiredDialog({ notify }: { notify(message: string): void }) {
  const user = useFriendOffer((s) => s.user),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (!user) return null;
  const close = () => {
    useFriendOffer.setState({ user: null });
    setError('');
  };
  const handle = user.discriminator ? `${user.username}#${user.discriminator}` : '';
  const send = () => {
    const social = window.rooms?.social;
    if (!social) {
      setError(t('Arkadaşlık isteği yalnızca masaüstü uygulamasında gönderilebilir.'));
      return;
    }
    setBusy(true);
    setError('');
    social
      .addFriend(handle)
      .then(() => {
        window.dispatchEvent(new Event('rooms:friends-changed'));
        close();
        notify(t('Arkadaşlık isteği gönderildi. Kabul edilince özel mesaj gönderebilirsin.'));
      })
      .catch((failure) => setError(uiError(failure)))
      .finally(() => setBusy(false));
  };
  return (
    <Modal title={t('Önce arkadaş olun')} onClose={close} className="reference-add-friend">
      <p>
        {dmFriendRequired}{' '}
        {t('{name} kabul edince özel mesaj gönderebilirsin.', { name: user.displayName })}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="button-row">
        <button className="button secondary" disabled={busy} onClick={close}>
          {t('Vazgeç')}
        </button>
        {handle ? (
          <button className="button primary" disabled={busy} onClick={send}>
            {t('Arkadaşlık isteği gönder')}
          </button>
        ) : (
          <button
            className="button primary"
            onClick={() => {
              close();
              navigate('/friends');
            }}
          >
            {t('Arkadaşlar sayfasını aç')}
          </button>
        )}
      </div>
    </Modal>
  );
}
