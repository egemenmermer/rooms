import { Notice } from '@rooms/design';
import { t } from './i18n';
import { cancelVoiceRejoin, dismissVoiceRejoin, joinVoice, useVoiceRejoin } from './realtime';

/**
 * The automatic return to a voice room after a drop: attempts with a way out, then a clear
 * message once it gives up. Renders nothing while no rejoin is running or pending a reply.
 */
export function VoiceRejoinNotice() {
  const rejoin = useVoiceRejoin((state) => state.rejoin);
  if (!rejoin) return null;
  if (rejoin.phase === 'failed')
    return (
      <Notice
        kind="error"
        className="voice-rejoin-notice"
        title={t('Ses bağlantısı geri gelmedi')}
        action={
          <>
            <button
              type="button"
              className="button secondary small"
              onClick={() => void joinVoice(rejoin.channelId, rejoin.roomName).catch(() => {})}
            >
              {t('Tekrar dene')}
            </button>
            <button type="button" className="button secondary small" onClick={dismissVoiceRejoin}>
              {t('Kapat')}
            </button>
          </>
        }
      >
        {t(
          '{room} odasına {count} denemede yeniden bağlanılamadı. İnternet bağlantını kontrol edip tekrar dene.',
          {
            room: rejoin.roomName,
            count: rejoin.maxAttempts,
          },
        )}
      </Notice>
    );
  return (
    <Notice
      kind="warning"
      className="voice-rejoin-notice"
      title={t('Yeniden bağlanılıyor…')}
      action={
        <button
          type="button"
          className="button secondary small"
          onClick={() => void cancelVoiceRejoin().catch(() => {})}
        >
          {t('Vazgeç ve ayrıl')}
        </button>
      }
    >
      {t('{room} odasıyla bağlantı koptu. Deneme {attempt}/{max}. Mikrofonun kapalı kalır.', {
        room: rejoin.roomName,
        attempt: rejoin.attempt,
        max: rejoin.maxAttempts,
      })}
    </Notice>
  );
}
