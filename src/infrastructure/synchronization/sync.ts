/**
 * Synchronisation orchestration. Every run is recorded in
 * synchronization_runs; failures never delete existing local data.
 */
import type { Notam } from '@/domain/models/notam';
import { NetworkError } from '@/infrastructure/networking/http';
import { replaceSourceDataset } from '@/infrastructure/database/referenceRepository';
import { upsertNotams, type NotamUpsertResult } from '@/infrastructure/database/notamRepository';
import { finishSyncRun, startSyncRun } from '@/infrastructure/database/sourceRepository';
import type { SqlDatabase } from '@/infrastructure/database/sql';
import {
  normalizeOurAirports,
  OURAIRPORTS_SOURCE_ID,
  type CsvBundle,
  type NormalizeStats,
} from '@/providers/aviation/ourairports';
import { MANUAL_NOTAM_SOURCE_ID, parseManualNotams } from '@/providers/notams/manualImport';

export interface SyncDeps {
  db: SqlDatabase;
  now: () => Date;
  newId: () => string;
}

export type SyncOutcome<T> =
  | { ok: true; runId: string; result: T }
  | { ok: false; runId: string; errorKind: string; message: string };

function errorInfo(e: unknown): { kind: string; message: string } {
  if (e instanceof NetworkError) return { kind: e.kind, message: e.message };
  if (e instanceof Error) return { kind: e.name === 'SchemaError' ? 'schema' : 'error', message: e.message };
  return { kind: 'error', message: String(e) };
}

/** Minimum plausible dataset size; protects against truncated downloads replacing good data. */
const MIN_AIRPORTS_PER_COUNTRY = 1;

export async function syncOurAirports(
  deps: SyncDeps,
  download: () => Promise<CsvBundle>,
  countries: string[],
): Promise<SyncOutcome<NormalizeStats & { stored: number }>> {
  const runId = deps.newId();
  const startedAt = deps.now().toISOString();
  await startSyncRun(deps.db, { id: runId, sourceId: OURAIRPORTS_SOURCE_ID, startedAt });
  try {
    const csv = await download();
    const { dataset, stats } = normalizeOurAirports(csv, startedAt, countries);
    if (dataset.airports.length < MIN_AIRPORTS_PER_COUNTRY * Math.max(1, countries.length)) {
      throw new Error('İndirilen veri beklenenden küçük; mevcut veri korunuyor');
    }
    const stored = await replaceSourceDataset(deps.db, OURAIRPORTS_SOURCE_ID, dataset);
    await finishSyncRun(deps.db, runId, OURAIRPORTS_SOURCE_ID, {
      status: stats.rejected.length > 0 ? 'partial' : 'success',
      finishedAt: deps.now().toISOString(),
      received: stats.airports + stats.runways + stats.navaids + stats.rejected.length,
      stored,
      dataVersion: startedAt.slice(0, 10),
    });
    return { ok: true, runId, result: { ...stats, stored } };
  } catch (e) {
    const { kind, message } = errorInfo(e);
    await finishSyncRun(deps.db, runId, OURAIRPORTS_SOURCE_ID, {
      status: 'failed',
      finishedAt: deps.now().toISOString(),
      received: 0,
      stored: 0,
      errorKind: kind,
      errorMessage: message,
    });
    return { ok: false, runId, errorKind: kind, message };
  }
}

export async function importManualNotams(
  deps: SyncDeps,
  text: string,
): Promise<SyncOutcome<{ upsert: NotamUpsertResult; notams: Notam[]; counts: Record<Notam['parseStatus'], number> }>> {
  const runId = deps.newId();
  const startedAt = deps.now().toISOString();
  await startSyncRun(deps.db, { id: runId, sourceId: MANUAL_NOTAM_SOURCE_ID, startedAt });
  try {
    const { notams, counts } = parseManualNotams(text, startedAt);
    if (notams.length === 0) throw new Error('Metinde NOTAM bulunamadı');
    const upsert = await upsertNotams(deps.db, notams);
    await finishSyncRun(deps.db, runId, MANUAL_NOTAM_SOURCE_ID, {
      status: counts.failed + counts['needs-review'] > 0 ? 'partial' : 'success',
      finishedAt: deps.now().toISOString(),
      received: notams.length,
      stored: upsert.inserted + upsert.updated,
    });
    return { ok: true, runId, result: { upsert, notams, counts } };
  } catch (e) {
    const { kind, message } = errorInfo(e);
    await finishSyncRun(deps.db, runId, MANUAL_NOTAM_SOURCE_ID, {
      status: 'failed',
      finishedAt: deps.now().toISOString(),
      received: 0,
      stored: 0,
      errorKind: kind,
      errorMessage: message,
    });
    return { ok: false, runId, errorKind: kind, message };
  }
}
