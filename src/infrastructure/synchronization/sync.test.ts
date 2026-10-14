/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BULLETIN, GARBAGE } from '@/test/fixtures/notams.synthetic';
import { createTestDatabase } from '@/test/nodeSqlite';
import { migrate } from '@/infrastructure/database/migrations';
import { listNotams } from '@/infrastructure/database/notamRepository';
import { referenceCounts } from '@/infrastructure/database/referenceRepository';
import { getSourceState, recentSyncRuns, registerSources } from '@/infrastructure/database/sourceRepository';
import { NetworkError, fetchText } from '@/infrastructure/networking/http';
import { ALL_SOURCES } from '@/providers/registry';
import { evaluateFreshness, DEFAULT_THRESHOLDS } from '@/domain/services/freshness';
import { importManualNotams, syncOurAirports } from './sync';

const FIX = join(__dirname, '../../test/fixtures/ourairports');
const bundle = {
  airports: readFileSync(join(FIX, 'airports.csv'), 'utf8'),
  runways: readFileSync(join(FIX, 'runways.csv'), 'utf8'),
  frequencies: readFileSync(join(FIX, 'airport-frequencies.csv'), 'utf8'),
  navaids: readFileSync(join(FIX, 'navaids.csv'), 'utf8'),
};

async function setup() {
  const db = createTestDatabase();
  await migrate(db);
  await registerSources(db, ALL_SOURCES);
  let t = Date.parse('2026-10-14T10:00:00Z');
  let i = 0;
  return { db, now: () => new Date((t += 1000)), newId: () => `id-${++i}` };
}

describe('syncOurAirports', () => {
  it('stores data and records a successful run', async () => {
    const deps = await setup();
    const res = await syncOurAirports(deps, async () => bundle, ['TR']);
    expect(res.ok).toBe(true);
    const state = await getSourceState(deps.db, 'ourairports');
    expect(state!.lastSuccessAt).not.toBeNull();
    expect(state!.lastAttemptFailed).toBe(false);
    expect((await referenceCounts(deps.db)).airports).toBeGreaterThan(0);
  });

  it('a network failure keeps local data and is reported as update-failed', async () => {
    const deps = await setup();
    await syncOurAirports(deps, async () => bundle, ['TR']);
    const before = await referenceCounts(deps.db);
    const res = await syncOurAirports(deps, async () => {
      throw new NetworkError('offline', 'Ağ bağlantısı yok');
    }, ['TR']);
    expect(res).toMatchObject({ ok: false, errorKind: 'offline' });
    expect(await referenceCounts(deps.db)).toEqual(before);
    const s = (await getSourceState(deps.db, 'ourairports'))!;
    expect(s.lastAttemptFailed).toBe(true);
    const fresh = evaluateFreshness(
      { configured: true, origin: 'provider', lastSuccessAt: s.lastSuccessAt, lastAttemptAt: s.lastAttemptAt, lastAttemptFailed: true, hasData: true },
      DEFAULT_THRESHOLDS.reference,
      deps.now(),
    );
    expect(fresh).toBe('update-failed');
    const runs = await recentSyncRuns(deps.db, 'ourairports');
    expect(runs.map((r) => r.status)).toEqual(['failed', 'success']);
  });

  it('refuses to replace data with a truncated/empty download', async () => {
    const deps = await setup();
    await syncOurAirports(deps, async () => bundle, ['TR']);
    const before = await referenceCounts(deps.db);
    const header = (s: string) => s.split('\n')[0] + '\n';
    const res = await syncOurAirports(
      deps,
      async () => ({ airports: header(bundle.airports), runways: header(bundle.runways), frequencies: header(bundle.frequencies), navaids: header(bundle.navaids) }),
      ['TR'],
    );
    expect(res.ok).toBe(false);
    expect(await referenceCounts(deps.db)).toEqual(before);
  });

  it('schema changes are reported as schema errors', async () => {
    const deps = await setup();
    const res = await syncOurAirports(deps, async () => ({ ...bundle, airports: 'foo,bar\n1,2' }), ['TR']);
    expect(res).toMatchObject({ ok: false, errorKind: 'schema' });
  });
});

describe('importManualNotams', () => {
  it('imports a bulletin labelled as manual import', async () => {
    const deps = await setup();
    const res = await importManualNotams(deps, `${BULLETIN}\n\n${GARBAGE}`);
    expect(res.ok).toBe(true);
    const stored = await listNotams(deps.db);
    expect(stored).toHaveLength(4);
    expect(stored.every((n) => n.provenance.origin === 'manual-import' && n.lastVerifiedAt === null)).toBe(true);
  });

  it('fails cleanly on empty input', async () => {
    const deps = await setup();
    expect((await importManualNotams(deps, '   ')).ok).toBe(false);
  });
});

describe('fetchText error classification', () => {
  const resp = (status: number) => async () => new Response('x', { status });
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limited'],
    [503, 'server'],
    [404, 'http'],
  ])('HTTP %i → %s', async (status, kind) => {
    await expect(fetchText('https://example.test/x', { fetchImpl: resp(status) })).rejects.toMatchObject({ kind });
  });
  it('offline and timeout', async () => {
    await expect(
      fetchText('https://example.test', { fetchImpl: async () => { throw new TypeError('Network request failed'); } }),
    ).rejects.toMatchObject({ kind: 'offline' });
    await expect(
      fetchText('https://example.test', {
        timeoutMs: 10,
        fetchImpl: (_u, init) => new Promise((_, rej) => init!.signal!.addEventListener('abort', () => rej(new Error('aborted')))),
      }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
  it('rejects non-HTTPS URLs', async () => {
    await expect(fetchText('http://example.test')).rejects.toMatchObject({ kind: 'http' });
  });
});
