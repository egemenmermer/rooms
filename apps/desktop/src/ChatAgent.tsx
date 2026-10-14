import { uiError } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, LoaderCircle, Send } from 'lucide-react';
import { Modal } from '@rooms/design';
import { useNavigate } from 'react-router-dom';
import type { ModelConnection } from '@rooms/agent-contracts';
import { useCommunity } from './community';

export function ChatAgentRequest(props: {
  roomId: string;
  prompt: string;
  onClose(): void;
  notify(message: string): void;
}) {
  const c = useCommunity();
  return (
    <ScopedRequest
      key={`${c.user?.id ?? ''}:${c.serverUrl}:${c.status}:${props.roomId}`}
      {...props}
    />
  );
}
function ScopedRequest({
  roomId,
  prompt,
  onClose,
  notify,
}: {
  roomId: string;
  prompt: string;
  onClose(): void;
  notify(message: string): void;
}) {
  const [models, setModels] = useState<ModelConnection[]>([]),
    [model, setModel] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [runAt, setRunAt] = useState('');
  const alive = useRef(true),
    locked = useRef(false),
    navigate = useNavigate();
  const scope = useCommunity.getState(),
    identity = scope.user?.id,
    serverUrl = scope.serverUrl;
  const current = () =>
    alive.current &&
    useCommunity.getState().user?.id === identity &&
    useCommunity.getState().serverUrl === serverUrl;
  const fixture = import.meta.env.DEV && new URLSearchParams(location.search).has('fixture');
  useEffect(() => {
    alive.current = true;
    if (fixture || !window.rooms?.agent) {
      setLoading(false);
      return () => {
        alive.current = false;
      };
    }
    void window.rooms.agent
      .status()
      .then(async (status) => {
        if (!current()) return;
        if (!status.connected || status.userId !== identity)
          throw new Error('Kişisel asistan bağlantısı kullanılamıyor.');
        const items = await window.rooms!.agent.connections();
        if (current())
          setModels(
            items.filter((item) => item.ownerId === identity && item.status === 'connected'),
          );
      })
      .catch((failure) => {
        if (current()) setError(uiError(failure));
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
    return () => {
      alive.current = false;
    };
  }, []);
  const submit = async () => {
    if (
      fixture ||
      locked.current ||
      !current() ||
      !window.rooms?.agent ||
      !models.some((item) => item.id === model && item.ownerId === identity)
    )
      return;
    setError('');
    let date: string | undefined;
    if (runAt) {
      const parsed = Date.parse(runAt);
      if (
        !Number.isFinite(parsed) ||
        parsed <= Date.now() ||
        parsed > Date.now() + 365 * 86400000
      ) {
        setError('Bir yıl içinde, gelecekte bir tarih ve saat seç.');
        return;
      }
      date = new Date(parsed).toISOString();
    }
    locked.current = true;
    setBusy(true);
    try {
      const task = await window.rooms.agent.submit({
        roomId,
        prompt,
        modelConnectionId: model,
        ...(date ? { runAt: date } : {}),
      });
      if (current()) {
        notify('Görev oluşturuldu.');
        onClose();
        navigate(`/agent?task=${encodeURIComponent(task.id)}`);
      }
    } catch (failure) {
      if (current()) setError(uiError(failure));
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  };
  return (
    <Modal
      title="Asistan isteği"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="agent-mention-prompt">
        <Bot size={19} />
        <p>{prompt}</p>
      </div>
      {loading ? (
        <div className="inline-empty" role="status">
          <LoaderCircle size={22} className="spin" />
          Model bağlantıları yükleniyor…
        </div>
      ) : models.length ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="field-label">
            Kişisel model
            <select
              required
              value={model}
              disabled={busy}
              onChange={(event) => setModel(event.target.value)}
            >
              <option value="" disabled>
                Model seç
              </option>
              {models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} · {item.model}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Bir kez çalıştır · boşsa hemen
            <input
              type="datetime-local"
              disabled={busy}
              value={runAt}
              onChange={(event) => setRunAt(event.target.value)}
            />
          </label>
          <button className="button primary full" disabled={busy || !model}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}Görevi başlat
          </button>
        </form>
      ) : (
        <div className="inline-empty">
          <p>
            {fixture
              ? 'Yerel örnekte asistan işlemleri kapalı.'
              : 'Kullanılabilir kişisel model bağlantısı yok.'}
          </p>
          <button
            className="button secondary"
            onClick={() => {
              onClose();
              navigate('/settings?tab=agent');
            }}
          >
            Modelini bağla
            <ArrowRight size={15} />
          </button>
        </div>
      )}
      {error && (
        <div className="error-pane" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
