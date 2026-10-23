import { useEffect, useRef, useState } from 'react';
import { t } from './i18n';
import type { AgentTask, AgentWorkspaceBridge } from '@rooms/agent-contracts';
import type { OpsTerminal } from '../../../packages/shared-contracts/src/hostops';
import './host-operations.css';

export default function AgentWorkspace({
  api,
  task,
  userId,
  refresh,
}: {
  api: AgentWorkspaceBridge;
  task: AgentTask;
  userId: string;
  refresh(): void;
}) {
  const [session, setSession] = useState<OpsTerminal | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const root = useRef<HTMLDivElement>(null),
    alive = useRef(true),
    currentSession = useRef(session),
    sequence = useRef(0);
  currentSession.current = session;
  useEffect(() => {
    alive.current = true;
    void api
      .terminals(task.id)
      .then((items) => {
        if (alive.current) setSession(items[0] ?? null);
      })
      .catch(() => {
        if (alive.current) setError(t('Bu sunucuda izole çalışma terminali henüz kullanılamıyor.'));
      });
    return () => {
      alive.current = false;
      void api.detach().catch(() => {});
    };
  }, [api, task.id]);
  useEffect(() => {
    if (!session || !root.current) return;
    let disposed = false,
      cleanup = () => {};
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      await import('@xterm/xterm/css/xterm.css');
      if (disposed || !root.current) return;
      const term = new Terminal({
        fontSize: 14,
        scrollback: 1000,
        cursorBlink: true,
        disableStdin: true,
        theme: { background: '#101116', foreground: '#e4e2eb' },
        linkHandler: { activate: () => {} },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(root.current);
      fit.fit();
      sequence.current = 0;
      const writable = () =>
        currentSession.current?.writer === userId && currentSession.current?.writable === true;
      const resize = () => {
        if (disposed) return;
        try {
          fit.fit();
          if (writable())
            void api
              .send({
                type: 'resize',
                cols: Math.max(20, Math.min(300, term.cols)),
                rows: Math.max(5, Math.min(150, term.rows)),
              })
              .catch(() => {});
        } catch {
          /* Hidden view. */
        }
      };
      const observer = new ResizeObserver(resize);
      observer.observe(root.current);
      const keys = term.onData((data) => {
        if (writable())
          void api.send({ type: 'input', data, sequence: sequence.current++ }).catch(() => {
            if (!disposed) setError(t('Terminal girdisi gönderilemedi. Yeniden bağlan.'));
          });
      });
      const unsubscribe = api.onTerminal((event) => {
        if (disposed) return;
        if (event.type === 'output') {
          if (event.reset) term.reset();
          term.write(event.data);
        } else if (event.type === 'state') {
          currentSession.current = event.session;
          setSession(event.session.state === 'closed' ? null : event.session);
          term.options.disableStdin = !writable();
          resize();
        } else {
          term.options.disableStdin = true;
          setError(event.message);
        }
      });
      cleanup = () => {
        observer.disconnect();
        keys.dispose();
        unsubscribe();
        term.dispose();
      };
      try {
        await api.attach(task.id, session.id);
        if (!disposed) {
          resize();
          term.focus();
        }
      } catch {
        if (!disposed) setError(t('Çalışma terminali bağlantısı kurulamadı.'));
      }
    })();
    return () => {
      disposed = true;
      cleanup();
      void api.detach().catch(() => {});
    };
  }, [api, task.id, session?.id, userId, revision]);
  const action = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      if (alive.current) refresh();
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
            : t('Çalışma terminali işlemi tamamlanamadı.'),
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section className="ops-terminal" aria-label={t('İzole görev terminali')}>
      <p>
        {t(
          'Bu terminal yalnızca görevin çalışma dosyalarına erişir. Kontrolü aldığında AI durur; insan kabuğu ayrı bir süreçte açılır. Paneli kapatmak kabuğu sonlandırmaz.',
        )}
      </p>
      {task.execution && (
        <p>
          {task.execution.hostId} · {task.execution.modelProvider} ·{' '}
          {t('Sınırlar: {cpu} CPU / {memory} MB / {minutes} dk', {
            cpu: task.execution.limits.cpu,
            memory: task.execution.limits.memoryMiB,
            minutes: task.execution.limits.minutes,
          })}
        </p>
      )}
      <div className="ops-actions">
        {!session ? (
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const value = await api.take(task.id);
                if (alive.current) setSession(value);
              })
            }
          >
            {t('AI’yi durdur ve kontrolü al')}
          </button>
        ) : (
          <>
            <button disabled={busy} onClick={() => setRevision((n) => n + 1)}>
              {t('Yeniden bağlan')}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await api.close(task.id, session.id);
                  if (alive.current) setSession(null);
                })
              }
            >
              {t('Kabuğu sonlandır')}
            </button>
            <span>
              {session.writable
                ? t('Kontrol sende')
                : t('Salt okunur · kontrol diğer pencerende olabilir')}
            </span>
          </>
        )}
        {!session && task.state === 'interrupted' && !task.uncertainOperation && (
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await api.resume(task.id);
              })
            }
          >
            {t('AI devam onayına dön')}
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {session && <div className="ops-console" ref={root} style={{ height: 340, minWidth: 0 }} />}
    </section>
  );
}
