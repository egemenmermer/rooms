import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  hostSampleSchema,
  opsThresholdsSchema,
  opsGrantSchema,
  type HostSample,
  type OpsGrant,
  type OpsThresholds,
  type OpsAlert,
} from '../../../packages/shared-contracts/src/hostops';
const ranges = { hour: 3600000, day: 86400000, week: 7 * 86400000, month: 30 * 86400000 };
export class HostOpsStore {
  private db: DatabaseSync;
  private highCPU = new Map<string, number>();
  constructor(
    path: string,
    private now = () => Date.now(),
  ) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS samples(host TEXT,t INTEGER,level TEXT,payload TEXT,PRIMARY KEY(host,t,level));
      CREATE TABLE IF NOT EXISTS grants(host TEXT,user TEXT,payload TEXT,PRIMARY KEY(host,user));
      CREATE TABLE IF NOT EXISTS settings(host TEXT PRIMARY KEY,payload TEXT);
      CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY,host TEXT,kind TEXT,payload TEXT,resolved INTEGER);
      CREATE TABLE IF NOT EXISTS deliveries(alert TEXT,user TEXT,PRIMARY KEY(alert,user));
      CREATE TABLE IF NOT EXISTS audit(t INTEGER,user TEXT,host TEXT,action TEXT,target TEXT);`);
  }
  close() {
    this.db.close();
  }
  audit(user: string, host: string, action: string, target: string) {
    // Metadata only. Never raw commands, output, prompts or credentials.
    this.db
      .prepare('INSERT INTO audit VALUES(?,?,?,?,?)')
      .run(this.now(), user, host, action, target);
  }
  grants(host: string): OpsGrant[] {
    return (
      this.db.prepare('SELECT payload FROM grants WHERE host=?').all(host) as { payload: string }[]
    ).map((r) => opsGrantSchema.parse(JSON.parse(r.payload)));
  }
  grant(host: string, user: string) {
    return this.grants(host).find((g) => g.userId === user);
  }
  setGrant(host: string, value: OpsGrant) {
    const g = opsGrantSchema.parse(value);
    this.db
      .prepare('INSERT OR REPLACE INTO grants VALUES(?,?,?)')
      .run(host, g.userId, JSON.stringify(g));
  }
  thresholds(host: string): OpsThresholds {
    const r = this.db.prepare('SELECT payload FROM settings WHERE host=?').get(host) as
      { payload: string } | undefined;
    return opsThresholdsSchema.parse(r ? JSON.parse(r.payload) : {});
  }
  setThresholds(host: string, value: OpsThresholds) {
    this.db
      .prepare('INSERT OR REPLACE INTO settings VALUES(?,?)')
      .run(host, JSON.stringify(opsThresholdsSchema.parse(value)));
  }
  sample(value: HostSample) {
    const s = hostSampleSchema.parse(value),
      insert = this.db.prepare('INSERT OR REPLACE INTO samples VALUES(?,?,?,?)');
    insert.run(s.hostId, s.at, 'raw', JSON.stringify(s));
    // Each aggregate bucket is continuously updated from its source bucket, using CPU means and the latest other measurements.
    for (const [level, interval] of [
      ['minute', 60000],
      ['hour', 3600000],
    ] as const) {
      const t = Math.floor(s.at / interval) * interval;
      const source = level === 'minute' ? 'raw' : 'minute';
      const rows = this.db
        .prepare('SELECT payload FROM samples WHERE host=? AND level=? AND t>=? AND t<? ORDER BY t')
        .all(s.hostId, source, t, t + interval) as { payload: string }[];
      const samples = rows.map((r) => JSON.parse(r.payload) as HostSample);
      const values = samples.flatMap((x) => (x.cpuPercent === null ? [] : [x.cpuPercent]));
      insert.run(
        s.hostId,
        t,
        level,
        JSON.stringify({
          ...s,
          at: t,
          cpuPercent: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
        }),
      );
    }
    const threshold = this.thresholds(s.hostId);
    if (s.cpuPercent !== null && s.cpuPercent > threshold.cpuPercent) {
      if (!this.highCPU.has(s.hostId)) this.highCPU.set(s.hostId, s.at);
    } else this.highCPU.delete(s.hostId);
    this.alert(
      s.hostId,
      'cpu',
      this.highCPU.has(s.hostId) &&
        s.at - this.highCPU.get(s.hostId)! >= threshold.cpuSeconds * 1000,
      'Sunucu işlemci yükü yüksek.',
    );
    this.alert(
      s.hostId,
      'disk',
      s.disk.total > 0 && (100 * s.disk.free) / s.disk.total < threshold.diskFreePercent,
      'Sunucuda boş disk alanı azalıyor.',
    );
    this.alert(
      s.hostId,
      'backup',
      s.lastBackupAt === null || s.at - s.lastBackupAt > threshold.backupHours * 3600000,
      s.lastBackupAt === null
        ? 'Son başarılı yedek doğrulanamıyor.'
        : 'Son başarılı yedek gecikti.',
    );
    this.alert(
      s.hostId,
      'service',
      s.services.some((x) => x.state === 'unhealthy'),
      'Bir sunucu servisi sağlıksız.',
    );
    this.alert(s.hostId, 'collector', false, 'Sunucu ölçümleri alınamıyor.');
    this.prune();
  }
  collectorFailed(host: string) {
    this.highCPU.delete(host);
    this.alert(host, 'collector', true, 'Sunucu ölçümleri alınamıyor.');
  }
  latest(host: string): HostSample | null {
    const r = this.db
      .prepare("SELECT payload FROM samples WHERE host=? AND level='raw' ORDER BY t DESC LIMIT 1")
      .get(host) as { payload: string } | undefined;
    return r ? hostSampleSchema.parse(JSON.parse(r.payload)) : null;
  }
  history(host: string, range: keyof typeof ranges): HostSample[] {
    const level =
      range === 'hour' || range === 'day' ? 'raw' : range === 'week' ? 'minute' : 'hour';
    const rows = this.db
      .prepare(
        'SELECT payload FROM samples WHERE host=? AND level=? AND t>=? ORDER BY t DESC LIMIT 18000',
      )
      .all(host, level, this.now() - ranges[range]) as { payload: string }[];
    // Bound UI payloads to at most 720 points while retaining the latest point.
    const stride = Math.max(1, Math.ceil(rows.length / 720));
    return rows
      .filter((_, i) => i % stride === 0)
      .reverse()
      .map((r) => hostSampleSchema.parse(JSON.parse(r.payload)));
  }
  private alert(host: string, kind: OpsAlert['kind'], active: boolean, message: string) {
    const row = this.db
      .prepare('SELECT id,payload FROM alerts WHERE host=? AND kind=? AND resolved=0 LIMIT 1')
      .get(host, kind) as { id: string; payload: string } | undefined;
    if (!active && row) {
      const a = JSON.parse(row.payload);
      a.resolvedAt = this.now();
      a.updatedAt = this.now();
      this.db
        .prepare('UPDATE alerts SET payload=?,resolved=1 WHERE id=?')
        .run(JSON.stringify(a), row.id);
    }
    if (active && !row) {
      const a: OpsAlert = {
        id: randomUUID(),
        hostId: host,
        kind,
        message,
        createdAt: this.now(),
        updatedAt: this.now(),
        resolvedAt: null,
        delivery: 'pending',
      };
      this.db
        .prepare('INSERT INTO alerts VALUES(?,?,?,?,0)')
        .run(a.id, host, kind, JSON.stringify(a));
    }
  }
  alerts(host: string, user: string): OpsAlert[] {
    const rows = this.db
      .prepare(
        "SELECT a.payload,d.alert AS delivered FROM alerts a LEFT JOIN deliveries d ON d.alert=a.id AND d.user=? WHERE a.host=? ORDER BY json_extract(a.payload,'$.createdAt') DESC LIMIT 200",
      )
      .all(user, host) as { payload: string; delivered: string | null }[];
    return rows.map((r) => ({
      ...JSON.parse(r.payload),
      delivery: r.delivered ? 'delivered' : 'pending',
    }));
  }
  acknowledge(host: string, user: string, ids: string[]) {
    for (const id of ids)
      this.db
        .prepare('INSERT OR IGNORE INTO deliveries SELECT id,? FROM alerts WHERE id=? AND host=?')
        .run(user, id, host);
  }
  private prune() {
    const n = this.now();
    for (const [level, age] of [
      ['raw', ranges.day],
      ['minute', ranges.week],
      ['hour', ranges.month],
    ] as const)
      this.db.prepare('DELETE FROM samples WHERE level=? AND t<?').run(level, n - age);
    this.db
      .prepare("DELETE FROM alerts WHERE resolved=1 AND json_extract(payload,'$.resolvedAt')<?")
      .run(n - ranges.month);
    this.db.exec('DELETE FROM deliveries WHERE alert NOT IN (SELECT id FROM alerts)');
    this.db.prepare('DELETE FROM audit WHERE t<?').run(n - 90 * 86400000);
  }
}
