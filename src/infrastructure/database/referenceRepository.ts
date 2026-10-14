import type { Airport, AirportType, Frequency, Navaid, NavaidType, Runway } from '@/domain/models/aviation';
import { insertRows } from './batch';
import { bool, fromBool, type SqlDatabase, type SqlValue } from './sql';

export interface ReferenceDataset {
  airports: Airport[];
  runways: Runway[];
  navaids: Navaid[];
}

export type Bounds = [west: number, south: number, east: number, north: number];

const AIRPORT_COLS = [
  'id', 'source_id', 'source_record_id', 'origin', 'retrieved_at', 'ident', 'icao', 'iata', 'local_code',
  'name', 'type', 'lat', 'lon', 'elevation_ft', 'country', 'region', 'municipality', 'frequencies',
];
const RUNWAY_COLS = [
  'id', 'airport_id', 'source_id', 'source_record_id', 'retrieved_at', 'length_ft', 'width_ft', 'surface',
  'lighted', 'closed', 'le_ident', 'le_lat', 'le_lon', 'le_elevation_ft', 'le_heading_true', 'le_displaced_ft',
  'he_ident', 'he_lat', 'he_lon', 'he_elevation_ft', 'he_heading_true', 'he_displaced_ft',
];
const NAVAID_COLS = [
  'id', 'source_id', 'source_record_id', 'origin', 'retrieved_at', 'ident', 'name', 'type', 'source_type',
  'lat', 'lon', 'frequency_khz', 'dme_channel', 'dme_frequency_khz', 'elevation_ft', 'country',
  'magnetic_variation_deg', 'usage', 'power', 'associated_airport',
];

function airportRow(a: Airport): SqlValue[] {
  const p = a.provenance;
  return [
    a.id, p.sourceId, p.sourceRecordId, p.origin, p.retrievedAt, a.ident, a.icao, a.iata, a.localCode,
    a.name, a.type, a.position.lat, a.position.lon, a.elevationFt, a.country, a.region, a.municipality,
    JSON.stringify(a.frequencies),
  ];
}

function runwayRow(r: Runway): SqlValue[] {
  const p = r.provenance;
  return [
    r.id, r.airportId, p.sourceId, p.sourceRecordId, p.retrievedAt, r.lengthFt, r.widthFt, r.surface,
    bool(r.lighted), bool(r.closed),
    r.le.ident, r.le.position?.lat ?? null, r.le.position?.lon ?? null, r.le.elevationFt, r.le.headingTrueDeg,
    r.le.displacedThresholdFt,
    r.he.ident, r.he.position?.lat ?? null, r.he.position?.lon ?? null, r.he.elevationFt, r.he.headingTrueDeg,
    r.he.displacedThresholdFt,
  ];
}

function navaidRow(n: Navaid): SqlValue[] {
  const p = n.provenance;
  return [
    n.id, p.sourceId, p.sourceRecordId, p.origin, p.retrievedAt, n.ident, n.name, n.type, n.sourceType,
    n.position.lat, n.position.lon, n.frequencyKhz, n.dmeChannel, n.dmeFrequencyKhz, n.elevationFt, n.country,
    n.magneticVariationDeg, n.usage, n.power, n.associatedAirport,
  ];
}

/**
 * Atomically replaces all reference data of one source. If anything fails the
 * transaction rolls back and the previous dataset stays intact.
 */
export async function replaceSourceDataset(db: SqlDatabase, sourceId: string, data: ReferenceDataset): Promise<number> {
  let stored = 0;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM runways WHERE source_id = ?', [sourceId]);
    await db.runAsync('DELETE FROM airports WHERE source_id = ?', [sourceId]);
    await db.runAsync('DELETE FROM navaids WHERE source_id = ?', [sourceId]);
    stored += await insertRows(db, 'airports', AIRPORT_COLS, data.airports.map(airportRow));
    stored += await insertRows(db, 'runways', RUNWAY_COLS, data.runways.map(runwayRow));
    stored += await insertRows(db, 'navaids', NAVAID_COLS, data.navaids.map(navaidRow));
  });
  return stored;
}

interface AirportRecord {
  id: string;
  source_id: string;
  source_record_id: string | null;
  origin: Airport['provenance']['origin'];
  retrieved_at: string;
  ident: string;
  icao: string | null;
  iata: string | null;
  local_code: string | null;
  name: string;
  type: string;
  lat: number;
  lon: number;
  elevation_ft: number | null;
  country: string | null;
  region: string | null;
  municipality: string | null;
  frequencies: string;
}

function toAirport(r: AirportRecord): Airport {
  return {
    id: r.id,
    ident: r.ident,
    icao: r.icao,
    iata: r.iata,
    localCode: r.local_code,
    name: r.name,
    type: r.type as AirportType,
    position: { lat: r.lat, lon: r.lon },
    elevationFt: r.elevation_ft,
    country: r.country,
    region: r.region,
    municipality: r.municipality,
    frequencies: JSON.parse(r.frequencies) as Frequency[],
    provenance: { sourceId: r.source_id, sourceRecordId: r.source_record_id, origin: r.origin, retrievedAt: r.retrieved_at },
  };
}

interface NavaidRecord {
  id: string;
  source_id: string;
  source_record_id: string | null;
  origin: Navaid['provenance']['origin'];
  retrieved_at: string;
  ident: string;
  name: string;
  type: string;
  source_type: string;
  lat: number;
  lon: number;
  frequency_khz: number | null;
  dme_channel: string | null;
  dme_frequency_khz: number | null;
  elevation_ft: number | null;
  country: string | null;
  magnetic_variation_deg: number | null;
  usage: string | null;
  power: string | null;
  associated_airport: string | null;
}

function toNavaid(r: NavaidRecord): Navaid {
  return {
    id: r.id,
    ident: r.ident,
    name: r.name,
    type: r.type as NavaidType,
    sourceType: r.source_type,
    position: { lat: r.lat, lon: r.lon },
    frequencyKhz: r.frequency_khz,
    dmeChannel: r.dme_channel,
    dmeFrequencyKhz: r.dme_frequency_khz,
    elevationFt: r.elevation_ft,
    country: r.country,
    magneticVariationDeg: r.magnetic_variation_deg,
    usage: r.usage,
    power: r.power,
    associatedAirport: r.associated_airport,
    provenance: { sourceId: r.source_id, sourceRecordId: r.source_record_id, origin: r.origin, retrievedAt: r.retrieved_at },
  };
}

interface RunwayRecord {
  id: string;
  airport_id: string;
  source_id: string;
  source_record_id: string | null;
  retrieved_at: string;
  length_ft: number | null;
  width_ft: number | null;
  surface: string | null;
  lighted: number | null;
  closed: number | null;
  le_ident: string | null; le_lat: number | null; le_lon: number | null; le_elevation_ft: number | null;
  le_heading_true: number | null; le_displaced_ft: number | null;
  he_ident: string | null; he_lat: number | null; he_lon: number | null; he_elevation_ft: number | null;
  he_heading_true: number | null; he_displaced_ft: number | null;
}

function toRunway(r: RunwayRecord): Runway {
  const pos = (lat: number | null, lon: number | null) => (lat !== null && lon !== null ? { lat, lon } : null);
  return {
    id: r.id,
    airportId: r.airport_id,
    lengthFt: r.length_ft,
    widthFt: r.width_ft,
    surface: r.surface,
    lighted: fromBool(r.lighted),
    closed: fromBool(r.closed),
    le: {
      ident: r.le_ident, position: pos(r.le_lat, r.le_lon), elevationFt: r.le_elevation_ft,
      headingTrueDeg: r.le_heading_true, displacedThresholdFt: r.le_displaced_ft,
    },
    he: {
      ident: r.he_ident, position: pos(r.he_lat, r.he_lon), elevationFt: r.he_elevation_ft,
      headingTrueDeg: r.he_heading_true, displacedThresholdFt: r.he_displaced_ft,
    },
    provenance: { sourceId: r.source_id, sourceRecordId: r.source_record_id, origin: 'provider', retrievedAt: r.retrieved_at },
  };
}

function boundsClause(b: Bounds): { sql: string; params: SqlValue[] } {
  const [w, s, e, n] = b;
  if (w <= e) return { sql: 'lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?', params: [s, n, w, e] };
  // Antimeridian crossing
  return { sql: 'lat BETWEEN ? AND ? AND (lon >= ? OR lon <= ?)', params: [s, n, w, e] };
}

export async function airportsInBounds(
  db: SqlDatabase,
  bounds: Bounds,
  types: AirportType[],
  limit = 3000,
): Promise<Airport[]> {
  if (types.length === 0) return [];
  const b = boundsClause(bounds);
  const rows = await db.getAllAsync<AirportRecord>(
    `SELECT * FROM airports WHERE ${b.sql} AND type IN (${types.map(() => '?').join(',')})
     ORDER BY CASE type WHEN 'large_airport' THEN 0 WHEN 'medium_airport' THEN 1 ELSE 2 END LIMIT ?`,
    [...b.params, ...types, limit],
  );
  return rows.map(toAirport);
}

export async function navaidsInBounds(db: SqlDatabase, bounds: Bounds, types: NavaidType[], limit = 3000): Promise<Navaid[]> {
  if (types.length === 0) return [];
  const b = boundsClause(bounds);
  const rows = await db.getAllAsync<NavaidRecord>(
    `SELECT * FROM navaids WHERE ${b.sql} AND type IN (${types.map(() => '?').join(',')}) LIMIT ?`,
    [...b.params, ...types, limit],
  );
  return rows.map(toNavaid);
}

function likeParam(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function searchAirports(db: SqlDatabase, query: string, limit = 50): Promise<Airport[]> {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const like = likeParam(q);
  const rows = await db.getAllAsync<AirportRecord>(
    `SELECT * FROM airports
     WHERE ident = ? OR icao = ? OR iata = ? OR UPPER(name) LIKE ? ESCAPE '\\' OR UPPER(municipality) LIKE ? ESCAPE '\\'
     ORDER BY CASE WHEN ident = ? OR icao = ? THEN 0 WHEN iata = ? THEN 1 ELSE 2 END,
              CASE type WHEN 'large_airport' THEN 0 WHEN 'medium_airport' THEN 1 ELSE 2 END, name
     LIMIT ?`,
    [q, q, q, like, like, q, q, q, limit],
  );
  return rows.map(toAirport);
}

export async function searchNavaids(db: SqlDatabase, query: string, limit = 50): Promise<Navaid[]> {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const rows = await db.getAllAsync<NavaidRecord>(
    `SELECT * FROM navaids WHERE ident = ? OR UPPER(name) LIKE ? ESCAPE '\\'
     ORDER BY CASE WHEN ident = ? THEN 0 ELSE 1 END, name LIMIT ?`,
    [q, likeParam(q), q, limit],
  );
  return rows.map(toNavaid);
}

export async function getAirport(db: SqlDatabase, id: string): Promise<{ airport: Airport; runways: Runway[] } | null> {
  const row = await db.getFirstAsync<AirportRecord>('SELECT * FROM airports WHERE id = ?', [id]);
  if (!row) return null;
  const runways = await db.getAllAsync<RunwayRecord>('SELECT * FROM runways WHERE airport_id = ? ORDER BY length_ft DESC', [id]);
  return { airport: toAirport(row), runways: runways.map(toRunway) };
}

export async function getNavaid(db: SqlDatabase, id: string): Promise<Navaid | null> {
  const row = await db.getFirstAsync<NavaidRecord>('SELECT * FROM navaids WHERE id = ?', [id]);
  return row ? toNavaid(row) : null;
}

export async function referenceCounts(db: SqlDatabase): Promise<{ airports: number; runways: number; navaids: number }> {
  const one = async (t: string) => (await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM ${t}`))?.c ?? 0;
  return { airports: await one('airports'), runways: await one('runways'), navaids: await one('navaids') };
}

export async function runwaysInBounds(db: SqlDatabase, bounds: Bounds, limit = 4000): Promise<Runway[]> {
  const [w, s, e, n] = bounds;
  const lonClause = w <= e ? 'r.le_lon BETWEEN ? AND ?' : '(r.le_lon >= ? OR r.le_lon <= ?)';
  const rows = await db.getAllAsync<RunwayRecord>(
    `SELECT r.* FROM runways r WHERE r.le_lat BETWEEN ? AND ? AND ${lonClause} AND r.he_lat IS NOT NULL LIMIT ?`,
    [s, n, w, e, limit],
  );
  return rows.map(toRunway);
}
