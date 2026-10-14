import type { DataSourceDescriptor, SyncRun, SyncStatus } from '@/domain/models/provenance';
import type { SqlDatabase } from './sql';

export interface DataSourceState {
  id: string;
  name: string;
  configured: boolean;
  enabled: boolean;
  config: Record<string, unknown> | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastAttemptFailed: boolean;
  lastError: string | null;
  dataVersion: string | null;
}

/** Registers descriptors (idempotent). Runtime state columns are preserved. */
export async function registerSources(db: SqlDatabase, sources: DataSourceDescriptor[]): Promise<void> {
  for (const s of sources) {
    await db.runAsync(
      `INSERT INTO data_sources (id, name, documentation_url, categories, access, license, attribution, verification)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, documentation_url=excluded.documentation_url,
         categories=excluded.categories, access=excluded.access, license=excluded.license,
         attribution=excluded.attribution, verification=excluded.verification`,
      [s.id, s.name, s.documentationUrl, JSON.stringify(s.categories), s.access, s.license, s.attribution, s.verification],
    );
  }
}

interface Row {
  id: string;
  name: string;
  configured: number;
  enabled: number;
  config: string | null;
  last_success_at: string | null;
  last_attempt_at: string | null;
  last_attempt_failed: number;
  last_error: string | null;
  data_version: string | null;
}

function toState(r: Row): DataSourceState {
  return {
    id: r.id,
    name: r.name,
    configured: r.configured === 1,
    enabled: r.enabled === 1,
    config: r.config ? (JSON.parse(r.config) as Record<string, unknown>) : null,
    lastSuccessAt: r.last_success_at,
    lastAttemptAt: r.last_attempt_at,
    lastAttemptFailed: r.last_attempt_failed === 1,
    lastError: r.last_error,
    dataVersion: r.data_version,
  };
}

export async function getSourceState(db: SqlDatabase, id: string): Promise<DataSourceState | null> {
  const r = await db.getFirstAsync<Row>('SELECT * FROM data_sources WHERE id = ?', [id]);
  return r ? toState(r) : null;
}

export async function listSourceStates(db: SqlDatabase): Promise<DataSourceState[]> {
  return (await db.getAllAsync<Row>('SELECT * FROM data_sources ORDER BY name')).map(toState);
}

export async function setSourceConfig(
  db: SqlDatabase,
  id: string,
  configured: boolean,
  config: Record<string, unknown> | null,
): Promise<void> {
  await db.runAsync('UPDATE data_sources SET configured = ?, config = ? WHERE id = ?', [
    configured ? 1 : 0,
    config ? JSON.stringify(config) : null,
    id,
  ]);
}

export async function startSyncRun(db: SqlDatabase, run: Pick<SyncRun, 'id' | 'sourceId' | 'startedAt'>): Promise<void> {
  await db.runAsync(
    `INSERT INTO synchronization_runs (id, source_id, started_at, status) VALUES (?,?,?, 'running')`,
    [run.id, run.sourceId, run.startedAt],
  );
  await db.runAsync('UPDATE data_sources SET last_attempt_at = ? WHERE id = ?', [run.startedAt, run.sourceId]);
}

export async function finishSyncRun(
  db: SqlDatabase,
  runId: string,
  sourceId: string,
  outcome: {
    status: Exclude<SyncStatus, 'running'>;
    finishedAt: string;
    received: number;
    stored: number;
    errorKind?: string | null;
    errorMessage?: string | null;
    dataVersion?: string | null;
  },
): Promise<void> {
  await db.runAsync(
    `UPDATE synchronization_runs SET finished_at=?, status=?, records_received=?, records_stored=?, error_kind=?, error_message=?
     WHERE id = ?`,
    [outcome.finishedAt, outcome.status, outcome.received, outcome.stored, outcome.errorKind ?? null, outcome.errorMessage ?? null, runId],
  );
  // A partial run stored data (some records rejected) — the dataset was still refreshed.
  if (outcome.status === 'success' || outcome.status === 'partial') {
    await db.runAsync(
      `UPDATE data_sources SET last_success_at=?, last_attempt_failed=0, last_error=NULL, data_version=COALESCE(?, data_version)
       WHERE id = ?`,
      [outcome.finishedAt, outcome.dataVersion ?? null, sourceId],
    );
  } else {
    await db.runAsync('UPDATE data_sources SET last_attempt_failed=1, last_error=? WHERE id = ?', [
      outcome.errorMessage ?? outcome.status,
      sourceId,
    ]);
  }
}

export async function recentSyncRuns(db: SqlDatabase, sourceId: string, limit = 10): Promise<SyncRun[]> {
  const rows = await db.getAllAsync<{
    id: string;
    source_id: string;
    started_at: string;
    finished_at: string | null;
    status: SyncStatus;
    records_received: number;
    records_stored: number;
    error_kind: string | null;
    error_message: string | null;
  }>('SELECT * FROM synchronization_runs WHERE source_id = ? ORDER BY started_at DESC LIMIT ?', [sourceId, limit]);
  return rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    recordsReceived: r.records_received,
    recordsStored: r.records_stored,
    errorKind: r.error_kind,
    errorMessage: r.error_message,
  }));
}

/** Marks runs left in "running" state (e.g. app killed mid-sync) as failed on startup. */
export async function recoverInterruptedRuns(db: SqlDatabase, now: string): Promise<number> {
  const res = await db.runAsync(
    `UPDATE synchronization_runs SET status='failed', finished_at=?, error_kind='interrupted',
     error_message='Senkronizasyon yarıda kesildi' WHERE status='running'`,
    [now],
  );
  return res.changes;
}
