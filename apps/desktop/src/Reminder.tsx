import { useCallback, useEffect, useState } from 'react';
import { Clock3, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { Modal } from '@rooms/design';
import type { AgentStatus } from '../../../packages/agent-contracts/src';
import type { CommunityMessage } from './community';
import { tr, uiError } from './i18n';
const localTime = (milliseconds: number) =>
  new Date(milliseconds).toLocaleString('sv-SE').replace(' ', 'T').slice(0, 16);
export function MessageReminder({
  message,
  roomId,
  channelName,
  onClose,
  notify,
}: {
  message: CommunityMessage;
  roomId: string;
  channelName: string;
  onClose(): void;
  notify(message: string): void;
}) {
  const [text, setText] = useState(message.content.slice(0, 1700)),
    [runAt, setRunAt] = useState(localTime(Date.now() + 10 * 60000));
  const [status, setStatus] = useState<AgentStatus | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!window.rooms?.agent) throw new Error(tr('Hatırlatmalar için masaüstü uygulamasını aç.'));
      setStatus(await window.rooms.agent.status());
    } catch (e) {
      setStatus(null);
      setError(uiError(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const available = !!status?.connected && status.capabilities.includes('stoat-reminders');
  const reason = !status?.connected
    ? tr('Hatırlatma için ayrı Agent sunucusuna bağlanmalısın.')
    : tr(
        'Kaynak sohbete hatırlatma göndermek için sunucuda Stoat botu ve oda eşlemesi yapılandırılmalı.',
      );
  const scheduledTime = Date.parse(runAt),
    validTime =
      Number.isFinite(scheduledTime) &&
      scheduledTime > Date.now() &&
      scheduledTime <= Date.now() + 365 * 86400000;
  return (
    <Modal title={tr('Bunu sonra hatırlat.')} onClose={onClose} className="reminder-modal">
      <p className="modal-description">
        {tr(
          'Seçtiğin not, belirlediğin zamanda bu sohbete bir kez gönderilir. Model bağlantısı gerekmez.',
        )}
      </p>
      <div className="reminder-source">
        <span className="eyebrow">
          {tr('KAYNAK MESAJ')} · #{channelName}
        </span>
        <strong>{message.author.displayName || message.author.username}</strong>
        <blockquote>{message.content || tr('Ek içeren mesaj')}</blockquote>
        <time>{new Date(message.timestamp).toLocaleString('tr-TR')}</time>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!available || !text.trim() || !validTime || busy) return;
          setBusy(true);
          setError('');
          void window
            .rooms!.agent.remind({
              roomId,
              channelId: message.channelId,
              sourceMessageId: message.id,
              text: text.trim(),
              runAt: new Date(runAt).toISOString(),
            })
            .then(() => {
              notify(
                tr(
                  'Hatırlatma zamanlandı. Agent bölümünden takip edebilir veya iptal edebilirsin.',
                ),
              );
              onClose();
            })
            .catch((e) => setError(uiError(e)))
            .finally(() => setBusy(false));
        }}
      >
        <label className="field-label">
          {tr('GÖNDERİLECEK NOT')}
          <textarea
            aria-label={tr('Hatırlatma notu')}
            rows={3}
            maxLength={1700}
            value={text}
            onChange={(event) => setText(event.target.value)}
            required
          />
        </label>
        <label className="field-label">
          {tr('BİR KEZ HATIRLAT')}
          <input
            aria-label={tr('Hatırlatma zamanı')}
            type="datetime-local"
            value={runAt}
            min={localTime(Date.now() + 60000)}
            max={localTime(Date.now() + 365 * 86400000)}
            onChange={(event) => setRunAt(event.target.value)}
            required
          />
          <span className="inline-help">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
        </label>
        {loading ? (
          <p className="inline-help">
            <LoaderCircle size={14} className="spin" />
            {tr('Hatırlatma bağlantısı denetleniyor…')}
          </p>
        ) : (
          !available && (
            <div className="settings-note">
              <ShieldCheck size={18} />
              <p>
                {reason}
                <button type="button" className="text-button" onClick={() => void refresh()}>
                  <RefreshCw size={13} />
                  {tr('Yeniden dene')}
                </button>
              </p>
            </div>
          )
        )}
        <button
          className="button primary full"
          disabled={loading || busy || !available || !text.trim() || !validTime}
          title={!available ? reason : !validTime ? tr('Gelecekte bir zaman seç.') : undefined}
        >
          {busy ? <LoaderCircle size={16} className="spin" /> : <Clock3 size={16} />}{' '}
          {tr('Hatırlatmayı zamanla')}
        </button>
      </form>
      {error && (
        <div className="error-pane" role="alert">
          {error}
        </div>
      )}
      <p className="modal-footnote">
        <ShieldCheck size={13} />
        {tr('Bu işlem normal mesajı Agent hafızasına kaydetmez.')}
      </p>
    </Modal>
  );
}
