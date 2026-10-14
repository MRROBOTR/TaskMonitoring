import type { VerticalLimit } from '@/domain/models/aviation';
import type { Notam, NotamGeometry, QLine } from '@/domain/models/notam';
import { bool, type SqlDatabase, type SqlValue } from './sql';

export interface NotamUpsertResult {
  inserted: number;
  updated: number;
  unchanged: number;
}

/**
 * Upserts NOTAMs keyed by their stable internal id. A record whose raw text
 * changed is updated (revision); identical records only refresh
 * last_verified_at. Nothing is deleted here — expiry is evaluated at read time.
 */
export async function upsertNotams(db: SqlDatabase, notams: Notam[]): Promise<NotamUpsertResult> {
  const result: NotamUpsertResult = { inserted: 0, updated: 0, unchanged: 0 };
  await db.withTransactionAsync(async () => {
    for (const n of notams) {
      const existing = await db.getFirstAsync<{ raw: string }>('SELECT raw FROM notams WHERE id = ?', [n.id]);
      if (existing && existing.raw === n.raw) {
        if (n.lastVerifiedAt) {
          await db.runAsync('UPDATE notams SET last_verified_at = ?, retrieved_at = ? WHERE id = ?', [
            n.lastVerifiedAt,
            n.provenance.retrievedAt,
            n.id,
          ]);
        }
        result.unchanged++;
        continue;
      }
      await db.runAsync(
        `INSERT OR REPLACE INTO notams (id, source_id, provider_id, origin, retrieved_at, last_verified_at, display_id,
          series, number, year, type, referenced_id, fir, q_code, q_line, locations, valid_from, valid_to,
          valid_to_permanent, valid_to_estimated, valid_from_raw, valid_to_raw, schedule, text, lower_limit,
          upper_limit, raw, parse_status, quality_flags)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        notamRow(n),
      );
      await db.runAsync('DELETE FROM notam_geometries WHERE notam_id = ?', [n.id]);
      if (n.geometry) {
        const g = n.geometry;
        await db.runAsync(
          `INSERT INTO notam_geometries (notam_id, kind, geometry, centre_lat, centre_lon, radius_nm, confidence, origin)
           VALUES (?,?,?,?,?,?,?,?)`,
          [n.id, g.kind, JSON.stringify(g.geometry), g.centre?.lat ?? null, g.centre?.lon ?? null, g.radiusNm, g.confidence, g.origin],
        );
      }
      if (existing) result.updated++;
      else result.inserted++;
    }
  });
  return result;
}

function notamRow(n: Notam): SqlValue[] {
  return [
    n.id, n.provenance.sourceId, n.providerId, n.provenance.origin, n.provenance.retrievedAt, n.lastVerifiedAt,
    n.displayId, n.series, n.number, n.year, n.type, n.referencedId, n.q?.fir ?? null, n.q?.code ?? null,
    n.q ? JSON.stringify(n.q) : null, JSON.stringify(n.locations), n.validFrom.iso, n.validTo.iso,
    bool(n.validTo.permanent), bool(n.validTo.estimated), n.validFrom.raw, n.validTo.raw, n.schedule, n.text,
    n.lower ? JSON.stringify(n.lower) : null, n.upper ? JSON.stringify(n.upper) : null, n.raw, n.parseStatus,
    JSON.stringify(n.qualityFlags),
  ];
}

interface NotamRecord {
  id: string;
  source_id: string;
  provider_id: string | null;
  origin: Notam['provenance']['origin'];
  retrieved_at: string;
  last_verified_at: string | null;
  display_id: string | null;
  series: string | null;
  number: number | null;
  year: number | null;
  type: Notam['type'];
  referenced_id: string | null;
  q_line: string | null;
  locations: string;
  valid_from: string | null;
  valid_to: string | null;
  valid_to_permanent: number;
  valid_to_estimated: number;
  valid_from_raw: string | null;
  valid_to_raw: string | null;
  schedule: string | null;
  text: string;
  lower_limit: string | null;
  upper_limit: string | null;
  raw: string;
  parse_status: Notam['parseStatus'];
  quality_flags: string;
  g_kind: NotamGeometry['kind'] | null;
  g_geometry: string | null;
  g_centre_lat: number | null;
  g_centre_lon: number | null;
  g_radius_nm: number | null;
  g_confidence: NotamGeometry['confidence'] | null;
  g_origin: NotamGeometry['origin'] | null;
}

function toNotam(r: NotamRecord): Notam {
  return {
    id: r.id,
    providerId: r.provider_id,
    series: r.series,
    number: r.number,
    year: r.year,
    displayId: r.display_id,
    type: r.type,
    referencedId: r.referenced_id,
    q: r.q_line ? (JSON.parse(r.q_line) as QLine) : null,
    locations: JSON.parse(r.locations) as string[],
    validFrom: { iso: r.valid_from, permanent: false, estimated: false, raw: r.valid_from_raw },
    validTo: { iso: r.valid_to, permanent: r.valid_to_permanent === 1, estimated: r.valid_to_estimated === 1, raw: r.valid_to_raw },
    schedule: r.schedule,
    text: r.text,
    lower: r.lower_limit ? (JSON.parse(r.lower_limit) as VerticalLimit) : null,
    upper: r.upper_limit ? (JSON.parse(r.upper_limit) as VerticalLimit) : null,
    raw: r.raw,
    parseStatus: r.parse_status,
    qualityFlags: JSON.parse(r.quality_flags) as string[],
    geometry:
      r.g_kind && r.g_geometry && r.g_confidence && r.g_origin
        ? {
            kind: r.g_kind,
            geometry: JSON.parse(r.g_geometry) as NotamGeometry['geometry'],
            centre: r.g_centre_lat !== null && r.g_centre_lon !== null ? { lat: r.g_centre_lat, lon: r.g_centre_lon } : null,
            radiusNm: r.g_radius_nm,
            confidence: r.g_confidence,
            origin: r.g_origin,
          }
        : null,
    provenance: { sourceId: r.source_id, sourceRecordId: r.provider_id, origin: r.origin, retrievedAt: r.retrieved_at },
    lastVerifiedAt: r.last_verified_at,
  };
}

const SELECT = `SELECT n.*, g.kind AS g_kind, g.geometry AS g_geometry, g.centre_lat AS g_centre_lat,
  g.centre_lon AS g_centre_lon, g.radius_nm AS g_radius_nm, g.confidence AS g_confidence, g.origin AS g_origin
  FROM notams n LEFT JOIN notam_geometries g ON g.notam_id = n.id`;

export async function listNotams(db: SqlDatabase): Promise<Notam[]> {
  const rows = await db.getAllAsync<NotamRecord>(`${SELECT} ORDER BY n.valid_from DESC`);
  return rows.map(toNotam);
}

export async function getNotam(db: SqlDatabase, id: string): Promise<Notam | null> {
  const row = await db.getFirstAsync<NotamRecord>(`${SELECT} WHERE n.id = ?`, [id]);
  return row ? toNotam(row) : null;
}

export async function deleteNotamsBySource(db: SqlDatabase, sourceId: string): Promise<void> {
  await db.runAsync('DELETE FROM notams WHERE source_id = ?', [sourceId]);
}

/** Removes NOTAMs whose validity ended more than `olderThanDays` ago (housekeeping, user-triggered). */
export async function purgeExpiredNotams(db: SqlDatabase, now: Date, olderThanDays: number): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanDays * 86_400_000).toISOString();
  const res = await db.runAsync(
    'DELETE FROM notams WHERE valid_to IS NOT NULL AND valid_to_permanent = 0 AND valid_to_estimated = 0 AND valid_to < ?',
    [cutoff],
  );
  return res.changes;
}
