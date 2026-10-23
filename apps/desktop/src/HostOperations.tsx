import { useEffect, useRef, useState } from 'react';
import { RefreshCw, TerminalSquare, ShieldCheck, X, Plus } from 'lucide-react';
import { useCommunity } from './community';
import { locale, t } from './i18n';
import type {
  HostOpsBridge,
  OpsHost,
  OpsSnapshot,
  OpsTerminal,
  HostSample,
  OpsGrant,
  OpsThresholds,
} from '../../../packages/shared-contracts/src/hostops';
import './host-operations.css';
const bytes = (n: number | null | undefined) =>
  n == null
    ? t('Veri yok')
    : n >= 1024 ** 3
      ? `${(n / 1024 ** 3).toFixed(1)} GB`
      : n >= 1024 ** 2
        ? `${(n / 1024 ** 2).toFixed(0)} MB`
        : `${Math.round(n / 1024)} KB`;
const errorText = (e: unknown) =>
  e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
    : t('Sunucu işlemi tamamlanamadı.');
function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="ops-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
function History({ samples }: { samples: HostSample[] }) {
  const valid = samples.filter((s) => s.cpuPercent !== null);
  const first = samples[0]?.at ?? 0,
    last = samples.at(-1)?.at ?? first;
  return (
    <div className="ops-history">
      <svg viewBox="0 0 720 110" role="img" aria-label={t('İşlemci kullanım geçmişi')}>
        <path d="M0 10H720 M0 60H720 M0 110H720" stroke="currentColor" opacity=".12" />
        {valid.length > 1 && (
          <polyline
            fill="none"
            stroke="var(--accent, #9787ff)"
            strokeWidth="2"
            points={valid
              .map(
                (s) =>
                  `${(720 * (s.at - first)) / Math.max(1, last - first)},${110 - s.cpuPercent!}`,
              )
              .join(' ')}
          />
        )}
      </svg>
      {!valid.length && <p>{t('Bu aralıkta ölçüm yok.')}</p>}
      <small>
        {t('{from} — {to} · CPU %', {
          from: first ? new Date(first).toLocaleString(locale) : '',
          to: last ? new Date(last).toLocaleString(locale) : '',
        })}
      </small>
    </div>
  );
}
function HostTerminal({
  api,
  host,
  session,
  onSession,
  onClose,
}: {
  api: HostOpsBridge;
  host: OpsHost;
  session: OpsTerminal;
  onSession: (value: OpsTerminal) => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    sequence = useRef(0);
  const [error, setError] = useState(''),
    [reconnect, setReconnect] = useState(0),
    [connected, setConnected] = useState(false);
  const [target, setTarget] = useState(''),
    [shareAccess, setShareAccess] = useState<'view' | 'control' | 'none'>('view');
  const userId = useCommunity((s) => s.user?.id);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const actionIdentity = useRef('');
  actionIdentity.current = `${host.id}:${session.id}:${userId}`;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    let stopped = false,
      dispose = () => {},
      unsubscribe = () => {};
    setConnected(false);
    setError('');
    sequence.current = 0;
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      await import('@xterm/xterm/css/xterm.css');
      if (stopped || !root.current) return;
      const term = new Terminal({
        fontSize: 14,
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
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
      const resize = () => {
        try {
          fit.fit();
          if (sessionRef.current.writer === userId && sessionRef.current.writable !== false)
            void api
              .send({
                type: 'resize',
                cols: Math.max(20, Math.min(300, term.cols)),
                rows: Math.max(5, Math.min(150, term.rows)),
              })
              .catch(() => {});
        } catch {
          /* Hidden panel; resize when visible. */
        }
      };
      const observer = new ResizeObserver(resize);
      observer.observe(root.current);
      const input = term.onData((data) => {
        if (sessionRef.current.writer !== userId || sessionRef.current.writable === false) return;
        void api.send({ type: 'input', sequence: sequence.current++, data }).catch((e) => {
          if (!stopped) setError(errorText(e));
        });
      });
      unsubscribe = api.onTerminal((event) => {
        if (stopped) return;
        if (event.type === 'output') {
          if (event.reset) term.reset();
          term.write(event.data);
        }
        if (event.type === 'state') {
          onSession(event.session);
          sessionRef.current = event.session;
          term.options.disableStdin =
            event.session.writer !== userId || event.session.writable === false;
        }
        if (event.type === 'error') {
          setError(event.message);
          setConnected(false);
          term.options.disableStdin = true;
        }
      });
      dispose = () => {
        observer.disconnect();
        input.dispose();
        term.dispose();
      };
      await api.attach(host.id, session.id);
      if (stopped) return;
      setConnected(true);
      resize();
    })().catch((e) => {
      if (!stopped) {
        setError(errorText(e));
      }
    });
    return () => {
      stopped = true;

      unsubscribe();
      dispose();
      void api.detach().catch(() => {});
    };
  }, [api, host.id, session.id, userId, reconnect]);
  const action = async (value: 'close' | 'take' | 'release' | 'share') => {
    const identity = actionIdentity.current;
    try {
      setError('');
      const next = await api.terminalAction(
        host.id,
        session.id,
        value,
        value === 'share' ? { userId: target.trim(), access: shareAccess } : undefined,
      );
      if (!alive.current || identity !== actionIdentity.current) return;
      onSession(next);
      if (value === 'close') onClose();
    } catch (e) {
      if (alive.current && identity === actionIdentity.current) setError(errorText(e));
    }
  };
  return (
    <section className="ops-terminal" aria-label={t('Yönetici terminali')}>
      <header>
        <div>
          <strong>
            {host.label} · {session.user}
          </strong>
          <small>
            {session.directory} · {connected ? t('Bağlı') : t('Bağlantı bekleniyor')} ·{' '}
            {session.writer === userId
              ? session.writable === false
                ? t('Kontrol başka pencerende')
                : t('Kontrol sende')
              : session.writer
                ? t('Başka operatör yazıyor')
                : t('Kontrol bırakıldı')}
          </small>
        </div>
        <button onClick={onClose} aria-label={t('Terminal panelini kapat')}>
          <X size={18} />
        </button>
      </header>
      <div className="ops-terminal-output" ref={root} />
      {error && (
        <p role="alert">
          {error} <button onClick={() => setReconnect((n) => n + 1)}>{t('Yeniden bağlan')}</button>
        </p>
      )}
      <div className="ops-actions">
        <button
          disabled={session.access === 'view'}
          onClick={() => void action(session.writer === userId ? 'release' : 'take')}
        >
          {session.writer === userId ? t('Kontrolü bırak') : t('Kontrolü al')}
        </button>
        {session.access === 'owner' && (
          <button onClick={() => void action('close')}>{t('Oturumu sonlandır')}</button>
        )}
        <small>{t('Paneli kapatmak çalışan oturumu sonlandırmaz.')}</small>
      </div>
      {session.access === 'owner' && (
        <details>
          <summary>{t('Oturumu bir operatörle paylaş')}</summary>
          <div className="ops-actions">
            <input
              aria-label={t('Terminali paylaşılacak kullanıcı kimliği')}
              placeholder={t('Kullanıcı kimliği')}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <select
              aria-label={t('Terminal paylaşım izni')}
              value={shareAccess}
              onChange={(e) => setShareAccess(e.target.value as typeof shareAccess)}
            >
              <option value="view">{t('Yalnızca izle')}</option>
              <option value="control">{t('Kontrol isteyebilir')}</option>
              <option value="none">{t('Erişimi kaldır')}</option>
            </select>
            <button disabled={!target.trim()} onClick={() => void action('share')}>
              {t('Uygula')}
            </button>
          </div>
        </details>
      )}
    </section>
  );
}
export function HostOperations() {
  const user = useCommunity((s) => s.user?.id),
    server = useCommunity((s) => s.serverUrl);
  return <HostOperationsScope key={`${server}:${user}`} />;
}
function HostOperationsScope() {
  const api = window.rooms?.hostOps,
    user = useCommunity((s) => s.user?.id),
    server = useCommunity((s) => s.serverUrl);
  const [hosts, setHosts] = useState<OpsHost[]>([]),
    [selected, setSelected] = useState(''),
    [snapshot, setSnapshot] = useState<OpsSnapshot | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const [range, setRange] = useState<'hour' | 'day' | 'week' | 'month'>('hour'),
    [history, setHistory] = useState<HostSample[]>([]),
    [sessions, setSessions] = useState<OpsTerminal[]>([]),
    [active, setActive] = useState<OpsTerminal | null>(null);
  const [operators, setOperators] = useState<OpsGrant[]>([]),
    [operatorId, setOperatorId] = useState(''),
    [profileId, setProfileId] = useState(''),
    [permissions, setPermissions] = useState<OpsGrant['permissions']>(['monitor']),
    [busy, setBusy] = useState(false),
    [thresholds, setThresholds] = useState<OpsThresholds | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSnapshot(null);
    setActive(null);
    setSessions([]);
    setHosts([]);
    setSelected('');
    setError('');
    setThresholds(null);
    setOperators([]);
    setOperatorId('');
    setProfileId('');
    setHistory([]);
    setBusy(false);
    if (!api) {
      setLoading(false);
      return;
    }
    void api
      .hosts()
      .then((list) => {
        if (cancelled) return;
        setHosts(list);
        setSelected(list[0]?.id ?? '');
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, user, server, retry]);
  const host = hosts.find((h) => h.id === selected);
  useEffect(() => {
    let cancelled = false,
      running = false;
    setSnapshot(null);
    setHistory([]);
    setSessions([]);
    setOperators([]);
    if (!api || !host) return;
    const refresh = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        if (host.permissions.includes('monitor')) {
          const next = await api.snapshot(host.id);
          if (cancelled) return;
          setSnapshot(next);
          setThresholds((v) => v ?? next.thresholds);
          const points = await api.history(host.id, range);
          if (cancelled) return;
          setHistory(points);
        }
        if (host.permissions.includes('terminal')) {
          const list = await api.terminals(host.id);
          if (cancelled) return;
          setSessions(list);
        }
        if (!cancelled) setError('');
      } catch (e) {
        if (!cancelled) setError(errorText(e));
      } finally {
        running = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [api, host, range, user, server]);
  useEffect(() => {
    setActive(null);
    setThresholds(null);
    setBusy(false);
  }, [selected, user, server]);
  useEffect(() => {
    if (!api || !snapshot) return;
    const pending = snapshot.alerts.filter((a) => a.delivery === 'pending');
    if (pending.length)
      void api
        .acknowledge(
          snapshot.host.id,
          pending.map((a) => a.id),
        )
        .catch(() => {});
  }, [api, snapshot]);
  const actionScope = useRef(0);
  useEffect(() => {
    actionScope.current++;
    return () => {
      actionScope.current++;
    };
  }, [selected]);
  const act = async (fn: (current: () => boolean) => Promise<void>) => {
    const scope = actionScope.current;
    const current = () => scope === actionScope.current;
    setBusy(true);
    setError('');
    try {
      await fn(current);
    } catch (e) {
      if (current()) setError(errorText(e));
    } finally {
      if (current()) setBusy(false);
    }
  };
  const sample = snapshot?.sample,
    stale = !!error || !sample || !!snapshot?.stale || Date.now() - sample.at > 15000;
  const changeSession = (next: OpsTerminal) => {
    setActive((previous) =>
      previous?.id === next.id && next.writable === undefined
        ? { ...next, writable: previous.writable }
        : next,
    );
    setSessions((list) => list.map((s) => (s.id === next.id ? next : s)));
  };
  return (
    <div className="ops-surface">
      <header className="ops-heading">
        <div>
          <p>{t('Sunucu durumu ve yönetim oturumları.')}</p>
        </div>
        <button aria-label={t('Sunucu bağlantısını yenile')} onClick={() => setRetry((n) => n + 1)}>
          <RefreshCw size={17} />
        </button>
      </header>
      {!api ? (
        <p>{t('Sunucu yönetimi için güncel masaüstü uygulamasını kullan.')}</p>
      ) : loading ? (
        <p role="status">{t('Sunucu erişimi kontrol ediliyor…')}</p>
      ) : !hosts.length && !error ? (
        <p>{t('Bu toplulukta sunucu yönetimi yetkin yok.')}</p>
      ) : null}
      {error && (
        <p className="ops-error" role="alert">
          {error}
        </p>
      )}
      {host && (
        <>
          <div className="ops-actions">
            <label>
              {t('Makine')}{' '}
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setThresholds(null);
                }}
              >
                {hosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label}
                  </option>
                ))}
              </select>
            </label>
            <small>
              {host.mode === 'shared'
                ? host.agentAvailable
                  ? t('Tayfa ve Agent aynı fiziksel makineyi kullanır.')
                  : t('Tayfa sunucusu · AI çalıştırıcısı henüz etkin değil.')
                : t('Ayrı çalışma makinesi.')}
            </small>
          </div>
          {host.permissions.includes('monitor') && (
            <>
              <p role="status">
                {stale
                  ? t('Güncel ölçüm alınamıyor.')
                  : t('Son ölçüm: {time}', {
                      time: new Date(sample!.at).toLocaleTimeString(locale),
                    })}
              </p>
              <div className="ops-metrics">
                <Metric
                  label={t('İşlemci')}
                  value={
                    sample?.cpuPercent == null ? t('Veri yok') : `%${sample.cpuPercent.toFixed(0)}`
                  }
                  note={
                    stale
                      ? t('{cores} çekirdek · Eski veri', { cores: sample?.cores ?? '—' })
                      : t('{cores} çekirdek', { cores: sample?.cores ?? '—' })
                  }
                />
                <Metric
                  label={t('Bellek')}
                  value={bytes(sample ? sample.memory.total - sample.memory.available : null)}
                  note={t('{amount} kullanılabilir', { amount: bytes(sample?.memory.available) })}
                />
                <Metric
                  label={t('Disk boşluğu')}
                  value={bytes(sample?.disk.free)}
                  note={t('{amount} toplam', { amount: bytes(sample?.disk.total) })}
                />
                <Metric
                  label={t('Ağ')}
                  value={
                    sample
                      ? t('↓ {amount}/sn', { amount: bytes(sample.network.receiveBps) })
                      : t('Veri yok')
                  }
                  note={
                    sample
                      ? t('↑ {amount}/sn', { amount: bytes(sample.network.sendBps) })
                      : undefined
                  }
                />
                <Metric
                  label={t('Yük')}
                  value={sample?.load.map((n) => n.toFixed(1)).join(' / ') ?? t('Veri yok')}
                  note={t('1 / 5 / 15 dakika')}
                />
                <Metric
                  label={t('Sıcaklık')}
                  value={
                    sample?.temperatureC == null
                      ? 'Desteklenmiyor'
                      : `${sample.temperatureC.toFixed(0)} °C`
                  }
                />
              </div>
              {!!snapshot?.alerts.filter((a) => !a.resolvedAt).length && (
                <ul className="ops-alerts" aria-label={t('Sunucu uyarıları')}>
                  {snapshot.alerts
                    .filter((a) => !a.resolvedAt)
                    .map((a) => (
                      <li key={a.id}>{a.message}</li>
                    ))}
                </ul>
              )}
              <section>
                <div className="ops-actions">
                  <h2>{t('Geçmiş')}</h2>
                  <select
                    aria-label={t('Ölçüm geçmişi aralığı')}
                    value={range}
                    onChange={(e) => setRange(e.target.value as typeof range)}
                  >
                    <option value="hour">{t('Son saat')}</option>
                    <option value="day">{t('Son gün')}</option>
                    <option value="week">{t('Son hafta')}</option>
                    <option value="month">{t('Son ay')}</option>
                  </select>
                </div>
                <History samples={history} />
              </section>
              <details>
                <summary>{t('Servisler ve ayrıntılar')}</summary>
                <div className="ops-metrics">
                  <Metric
                    label={t('Disk okuma / yazma')}
                    value={`${bytes(sample?.disk.readBps)} / ${bytes(sample?.disk.writeBps)}`}
                    note={t('Saniyede')}
                  />
                  <Metric
                    label={t('Çekirdekler')}
                    value={
                      sample?.perCorePercent
                        .map((n, i) => `${i + 1}: ${n === null ? '—' : `%${n.toFixed(0)}`}`)
                        .join(' · ') || t('Veri yok')
                    }
                  />
                  <Metric
                    label={t('Toplam ağ trafiği')}
                    value={t('{received} alınan / {sent} gönderilen', {
                      received: bytes(sample?.network.receivedBytes),
                      sent: bytes(sample?.network.sentBytes),
                    })}
                  />
                  <Metric label="Swap" value={bytes(sample?.memory.swapUsed)} />
                  <Metric
                    label={t('Odalar / katılımcılar / yayınlar')}
                    value={
                      sample
                        ? `${sample.media.rooms ?? '—'} / ${sample.media.participants ?? '—'} / ${sample.media.streams ?? '—'}`
                        : t('Veri yok')
                    }
                  />
                  <Metric
                    label={t('Son başarılı yedek')}
                    value={
                      sample?.lastBackupAt
                        ? new Date(sample.lastBackupAt).toLocaleString(locale)
                        : t('Doğrulanamadı')
                    }
                  />
                </div>
                {sample?.services.length ? (
                  <ul>
                    {sample.services.map((s) => (
                      <li key={s.name}>
                        {t('{name} · {state} · yeniden başlama: {count}', {
                          name: s.name,
                          state:
                            s.state === 'healthy'
                              ? t('Sağlıklı')
                              : s.state === 'unhealthy'
                                ? t('Sorun var')
                                : t('Veri yok'),
                          count: s.restarts ?? '—',
                        })}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t('Servis ölçümü yapılandırılmadı veya alınamadı.')}</p>
                )}
                {sample?.workloads.map((w) => (
                  <p key={w.id}>
                    {t('{id} · CPU {cpu} · {memory}', {
                      id: w.id,
                      cpu: w.cpuPercent == null ? '—' : `%${w.cpuPercent.toFixed(0)}`,
                      memory: bytes(w.memoryBytes),
                    })}
                  </p>
                ))}
                <p>
                  {t('RTT: {rtt} ms · Kayıp: {loss}% · Jitter: {jitter} ms', {
                    rtt: sample?.media.rttMs ?? '—',
                    loss: sample?.media.lossPercent ?? '—',
                    jitter: sample?.media.jitterMs ?? '—',
                  })}
                </p>
              </details>
            </>
          )}
          {host.permissions.includes('terminal') && (
            <section>
              <div className="ops-actions">
                <h2>
                  <TerminalSquare size={18} /> Terminal
                </h2>
                <button
                  disabled={busy || !host.terminalAvailable}
                  onClick={() =>
                    void act(async (current) => {
                      const session = await api!.createTerminal(host.id);
                      if (!current()) return;
                      setSessions((list) => [...list, session]);
                      setActive(session);
                    })
                  }
                >
                  <Plus size={15} /> {t('Terminal aç')}
                </button>
              </div>
              {!host.terminalAvailable && (
                <p>{t('Terminal kullanıcı profili bu makinede henüz yapılandırılmadı.')}</p>
              )}
              <div className="ops-actions">
                {sessions.map((session) => (
                  <button
                    aria-pressed={active?.id === session.id}
                    key={session.id}
                    onClick={() => setActive(session)}
                  >
                    {session.user} · {session.id.slice(0, 6)} ·{' '}
                    {session.state === 'detached' ? t('Açık oturum') : t('Bağlı')}
                  </button>
                ))}
              </div>
              {active && (
                <HostTerminal
                  key={active.id}
                  api={api!}
                  host={host}
                  session={active}
                  onSession={changeSession}
                  onClose={() => setActive(null)}
                />
              )}
            </section>
          )}
          {host.permissions.includes('agent') && !host.agentAvailable && (
            <p>
              {t(
                'AI çalışma ortamı henüz kurulup doğrulanmadı. Sunucu terminali AI’ya açık değildir.',
              )}
            </p>
          )}
          {host.owner && (
            <details>
              <summary>
                <ShieldCheck size={16} /> {t('Operatörler ve uyarı eşikleri')}
              </summary>
              <button
                disabled={busy}
                onClick={() =>
                  void act(async (current) => {
                    const list = await api!.operators(host.id);
                    if (current()) setOperators(list);
                  })
                }
              >
                {t('Operatörleri yükle')}
              </button>
              <ul>
                {operators.map((g) => (
                  <li key={g.userId}>
                    {g.userId} · {g.permissions.join(', ') || t('Erişim yok')}{' '}
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(async (current) => {
                          await api!.setOperator(host.id, { ...g, permissions: [] });
                          const list = await api!.operators(host.id);
                          if (current()) setOperators(list);
                        })
                      }
                    >
                      {t('Erişimi kaldır')}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="ops-actions">
                <input
                  aria-label={t('Operatör kullanıcı kimliği')}
                  value={operatorId}
                  onChange={(e) => setOperatorId(e.target.value)}
                  placeholder={t('Kullanıcı kimliği')}
                />
                <input
                  aria-label={t('Linux terminal profil kimliği')}
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  placeholder={t('Terminal profili (isteğe bağlı)')}
                />
                {(['monitor', 'terminal', 'agent'] as const).map((p) => (
                  <label key={p}>
                    <input
                      type="checkbox"
                      checked={permissions.includes(p)}
                      onChange={(e) =>
                        setPermissions((v) =>
                          e.target.checked ? [...v, p] : v.filter((x) => x !== p),
                        )
                      }
                    />
                    {p === 'monitor' ? t('İzleme') : p === 'terminal' ? 'Terminal' : 'AI'}
                  </label>
                ))}
                <button
                  disabled={busy || !operatorId.trim()}
                  onClick={() =>
                    void act(async (current) => {
                      await api!.setOperator(host.id, {
                        userId: operatorId.trim(),
                        permissions,
                        profileId: profileId.trim() || null,
                      });
                      const list = await api!.operators(host.id);
                      if (current()) setOperators(list);
                    })
                  }
                >
                  {t('Yetkiyi kaydet')}
                </button>
              </div>
              {thresholds && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(() => api!.thresholds(host.id, thresholds));
                  }}
                >
                  <div className="ops-actions">
                    {(
                      [
                        ['cpuPercent', t('CPU eşiği (%)')],
                        ['cpuSeconds', t('CPU süresi (sn)')],
                        ['diskFreePercent', t('Disk boşluk eşiği (%)')],
                        ['backupHours', t('Yedek süresi (saat)')],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          type="number"
                          required
                          value={thresholds[key]}
                          onChange={(e) =>
                            setThresholds({ ...thresholds, [key]: Number(e.target.value) })
                          }
                        />
                      </label>
                    ))}
                    <button disabled={busy}>{t('Eşikleri kaydet')}</button>
                  </div>
                </form>
              )}
            </details>
          )}
        </>
      )}
    </div>
  );
}
