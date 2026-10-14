/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NEW_RWY_CLOSED,
  POLYGON_AREA,
  REPLACE_RWY,
  SYNTHETIC_SOURCE,
} from '@/test/fixtures/notams.synthetic';
import { createTestDatabase } from '@/test/nodeSqlite';
import { parseNotam } from '@/domain/notam/parser';
import { normalizeOurAirports } from '@/providers/aviation/ourairports';
import { ALL_SOURCES } from '@/providers/registry';
import { getSetting, listRoutes, saveRoute, setSetting } from './appRepository';
import { findByChecksum, insertDocument, listDocuments, updateDocumentMeta } from './documentRepository';
import { getSchemaVersion, LATEST_VERSION, migrate, MIGRATIONS } from './migrations';
import { getNotam, listNotams, purgeExpiredNotams, upsertNotams } from './notamRepository';
import {
  airportsInBounds,
  getAirport,
  navaidsInBounds,
  referenceCounts,
  replaceSourceDataset,
  searchAirports,
  searchNavaids,
} from './referenceRepository';
import { listSourceStates, recoverInterruptedRuns, registerSources, startSyncRun } from './sourceRepository';

const FIX = join(__dirname, '../../test/fixtures/ourairports');
const csv = {
  airports: readFileSync(join(FIX, 'airports.csv'), 'utf8'),
  runways: readFileSync(join(FIX, 'runways.csv'), 'utf8'),
  frequencies: readFileSync(join(FIX, 'airport-frequencies.csv'), 'utf8'),
  navaids: readFileSync(join(FIX, 'navaids.csv'), 'utf8'),
};

async function freshDb() {
  const db = createTestDatabase();
  await migrate(db);
  return db;
}

describe('migrations', () => {
  it('migrates an empty database to the latest version and is idempotent', async () => {
    const db = createTestDatabase();
    expect(await getSchemaVersion(db)).toBe(0);
    expect(await migrate(db)).toBe(LATEST_VERSION);
    expect(await migrate(db)).toBe(LATEST_VERSION);
    const tables = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'");
    const names = tables.map((t) => t.name);
    for (const t of [
      'airports', 'runways', 'navaids', 'waypoints', 'airways', 'airspaces', 'notams', 'notam_geometries',
      'documents', 'document_tags', 'saved_routes', 'route_waypoints', 'map_packages', 'data_sources',
      'synchronization_runs', 'app_settings',
    ]) {
      expect(names).toContain(t);
    }
  });

  it('preserves user data when a later migration is applied', async () => {
    const db = createTestDatabase();
    await migrate(db);
    await setSetting(db, 'units', { distance: 'NM' });
    const next = [...MIGRATIONS, { version: LATEST_VERSION + 1, name: 'test add column', sql: 'ALTER TABLE documents ADD COLUMN notes TEXT;' }];
    expect(await migrate(db, next)).toBe(LATEST_VERSION + 1);
    expect(await getSetting(db, 'units', null)).toEqual({ distance: 'NM' });
  });

  it('rolls back a failing migration and keeps the previous version', async () => {
    const db = createTestDatabase();
    await migrate(db);
    await setSetting(db, 'k', 1);
    const broken = [...MIGRATIONS, { version: LATEST_VERSION + 1, name: 'broken', sql: 'CREATE TABLE x(a); INSERT INTO nope VALUES (1);' }];
    await expect(migrate(db, broken)).rejects.toThrow();
    expect(await getSchemaVersion(db)).toBe(LATEST_VERSION);
    expect(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name='x'")).toBeNull();
    expect(await getSetting(db, 'k', 0)).toBe(1);
  });

  it('refuses to open a database from a newer app version', async () => {
    const db = createTestDatabase();
    await db.execAsync(`PRAGMA user_version = ${LATEST_VERSION + 5}`);
    await expect(migrate(db)).rejects.toThrow(/daha yeni/);
  });
});

describe('OurAirports normalisation (recorded fixture)', () => {
  const { dataset, stats } = normalizeOurAirports(csv, '2026-10-14T00:00:00.000Z', ['TR']);

  it('keeps source identifiers, provenance and real values without inventing fields', () => {
    const ltfm = dataset.airports.find((a) => a.ident === 'LTFM')!;
    expect(ltfm).toBeDefined();
    expect(ltfm.id).toMatch(/^ourairports:apt:\d+$/);
    expect(ltfm.provenance).toMatchObject({ sourceId: 'ourairports', origin: 'provider' });
    expect(ltfm.position.lat).toBeGreaterThan(41);
    expect(ltfm.position.lon).toBeGreaterThan(28);
    expect(ltfm.type).toBe('large_airport');
    expect(stats.rejected).toEqual([]);
    expect(dataset.runways.length).toBeGreaterThan(5);
    expect(stats.frequencies).toBeGreaterThan(0);
  });

  it('classifies navaids from the source type and treats idents as non-unique', () => {
    const yaa = dataset.navaids.filter((n) => n.ident === 'YAA');
    expect(yaa.map((n) => n.type).sort()).toEqual(['NDB', 'VOR-DME']);
    expect(new Set(yaa.map((n) => n.id)).size).toBe(2);
    const ist = dataset.navaids.find((n) => n.ident === 'IST')!;
    expect(ist.type).toBe('VORTAC');
    expect(ist.frequencyKhz).toBe(112500);
  });

  it('filters by country', () => {
    expect(normalizeOurAirports(csv, 'x', ['DE']).dataset.airports).toHaveLength(0);
  });

  it('rejects rows with invalid coordinates instead of guessing', () => {
    const broken = { ...csv, airports: csv.airports.replace(/\n(\d+),LTFJ,large_airport,([^,]*),[-\d.]+,/, '\n$1,LTFJ,large_airport,$2,999,') };
    const r = normalizeOurAirports(broken, 'x', ['TR']);
    expect(r.stats.rejected.some((x) => x.reason === 'invalid-coordinates')).toBe(true);
    expect(r.dataset.airports.find((a) => a.ident === 'LTFJ')).toBeUndefined();
  });

  it('fails loudly on schema changes', () => {
    expect(() => normalizeOurAirports({ ...csv, navaids: 'id,ident\n1,ABC' }, 'x')).toThrow(/schema mismatch/);
  });
});

describe('reference repository', () => {
  it('persists, queries by bounds, searches and returns runways', async () => {
    const db = await freshDb();
    const { dataset } = normalizeOurAirports(csv, '2026-10-14T00:00:00.000Z', ['TR']);
    await replaceSourceDataset(db, 'ourairports', dataset);
    const counts = await referenceCounts(db);
    expect(counts.airports).toBe(dataset.airports.length);
    expect(counts.navaids).toBe(dataset.navaids.length);

    const istanbul = await airportsInBounds(db, [28, 40.5, 30, 41.5], ['large_airport']);
    expect(istanbul.map((a) => a.ident).sort()).toEqual(['LTBA', 'LTFJ', 'LTFM']);
    expect(await airportsInBounds(db, [28, 40.5, 30, 41.5], [])).toEqual([]);

    expect((await searchAirports(db, 'ltfm'))[0]!.ident).toBe('LTFM');
    expect((await searchAirports(db, 'sabiha'))[0]!.ident).toBe('LTFJ');
    expect(await searchAirports(db, '%')).toEqual([]); // LIKE wildcards escaped
    expect((await searchNavaids(db, 'IST'))[0]!.type).toBe('VORTAC');
    expect((await navaidsInBounds(db, [25, 35, 45, 43], ['NDB'])).every((n) => n.type === 'NDB')).toBe(true);

    const ltac = (await searchAirports(db, 'LTAC'))[0]!;
    const detail = await getAirport(db, ltac.id);
    expect(detail!.runways.length).toBeGreaterThan(0);
    expect(detail!.airport.frequencies.length).toBeGreaterThan(0);
  });

  it('a failed replacement keeps the previous dataset intact', async () => {
    const db = await freshDb();
    const { dataset } = normalizeOurAirports(csv, '2026-10-14T00:00:00.000Z', ['TR']);
    await replaceSourceDataset(db, 'ourairports', dataset);
    const before = await referenceCounts(db);
    const bad = { ...dataset, navaids: [{ ...dataset.navaids[0]!, name: null as unknown as string }] }; // NOT NULL violation
    await expect(replaceSourceDataset(db, 'ourairports', bad)).rejects.toThrow();
    expect(await referenceCounts(db)).toEqual(before);
  });
});

describe('NOTAM repository', () => {
  const ctx = { sourceId: SYNTHETIC_SOURCE, origin: 'synthetic' as const, retrievedAt: '2026-10-14T00:00:00.000Z' };

  it('round-trips NOTAMs including geometry and raw text', async () => {
    const db = await freshDb();
    const a = parseNotam(POLYGON_AREA, ctx);
    const r = await upsertNotams(db, [a, parseNotam(NEW_RWY_CLOSED, ctx)]);
    expect(r).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
    const back = await getNotam(db, a.id);
    expect(back).toEqual(a);
  });

  it('detects unchanged vs revised messages', async () => {
    const db = await freshDb();
    const a = parseNotam(NEW_RWY_CLOSED, ctx);
    await upsertNotams(db, [a]);
    expect(await upsertNotams(db, [a])).toEqual({ inserted: 0, updated: 0, unchanged: 1 });
    const revised = parseNotam(NEW_RWY_CLOSED.replace('MAINT.', 'WIP.'), ctx);
    expect(revised.id).toBe(a.id);
    expect(await upsertNotams(db, [revised])).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
    expect((await getNotam(db, a.id))!.text).toContain('WIP');
  });

  it('purges only definitively expired notices', async () => {
    const db = await freshDb();
    await upsertNotams(db, [parseNotam(NEW_RWY_CLOSED, ctx), parseNotam(REPLACE_RWY, ctx)]);
    const removed = await purgeExpiredNotams(db, new Date('2026-11-10T00:00:00Z'), 30);
    expect(removed).toBe(0);
    expect(await purgeExpiredNotams(db, new Date('2027-01-01T00:00:00Z'), 30)).toBe(2);
    expect(await listNotams(db)).toEqual([]);
  });
});

describe('documents, settings, routes, sources', () => {
  it('stores document metadata with tags and finds duplicates by checksum', async () => {
    const db = await freshDb();
    await insertDocument(db, {
      id: 'doc-00000001',
      title: 'Test AIP',
      category: 'aip',
      relativePath: 'documents/doc-00000001.pdf',
      originalFilename: 'aip.pdf',
      mimeType: 'application/pdf',
      fileSize: 1234,
      checksum: 'abc',
      importedAt: '2026-10-14T00:00:00Z',
      modifiedAt: '2026-10-14T00:00:00Z',
      source: null,
      tags: ['LTFM', 'AD2'],
      favorite: false,
      lastOpenedAt: null,
      lastPage: null,
    });
    expect((await findByChecksum(db, 'abc'))?.tags.sort()).toEqual(['AD2', 'LTFM']);
    await updateDocumentMeta(db, 'doc-00000001', { title: 'Renamed', favorite: true, category: 'charts' }, '2026-10-15T00:00:00Z');
    const [d] = await listDocuments(db, { category: 'charts' });
    expect(d).toMatchObject({ title: 'Renamed', favorite: true, modifiedAt: '2026-10-15T00:00:00Z' });
    expect(await listDocuments(db, { query: 'renam' })).toHaveLength(1);
    expect(await listDocuments(db, { category: 'qrh' })).toHaveLength(0);
  });

  it('saves and reloads routes in order', async () => {
    const db = await freshDb();
    await saveRoute(db, {
      id: 'r1',
      name: 'Test',
      groundSpeedKt: 110,
      variationDeg: null,
      createdAt: 'a',
      modifiedAt: 'b',
      points: [
        { id: 'x', ident: 'LTBA', name: null, kind: 'airport', refId: null, position: { lat: 40.97, lon: 28.81 } },
        { id: 'y', ident: 'USR1', name: null, kind: 'user', refId: null, position: { lat: 40.5, lon: 29.5 } },
      ],
    });
    const [r] = await listRoutes(db);
    expect(r!.points.map((p) => p.ident)).toEqual(['LTBA', 'USR1']);
    expect(r!.groundSpeedKt).toBe(110);
  });

  it('registers sources idempotently and recovers interrupted runs', async () => {
    const db = await freshDb();
    await registerSources(db, ALL_SOURCES);
    await registerSources(db, ALL_SOURCES);
    expect(await listSourceStates(db)).toHaveLength(ALL_SOURCES.length);
    await startSyncRun(db, { id: 'run1', sourceId: 'ourairports', startedAt: '2026-10-14T00:00:00Z' });
    expect(await recoverInterruptedRuns(db, '2026-10-14T01:00:00Z')).toBe(1);
  });
});
