/**
 * Versioned, forward-only schema migrations. Each migration runs inside a
 * transaction; `PRAGMA user_version` records the applied version.
 *
 * Rules:
 *  - never edit a released migration; add a new one;
 *  - never drop user tables (documents, routes, settings) in a migration;
 *  - reference data tables may be rebuilt because they are re-downloadable.
 */
import type { SqlDatabase } from './sql';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
CREATE TABLE data_sources (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  documentation_url TEXT NOT NULL,
  categories TEXT NOT NULL,          -- JSON array
  access TEXT NOT NULL,
  license TEXT NOT NULL,
  attribution TEXT NOT NULL,
  verification TEXT NOT NULL,
  configured INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT,                        -- JSON, never secrets
  last_success_at TEXT,
  last_attempt_at TEXT,
  last_attempt_failed INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  data_version TEXT
);

CREATE TABLE synchronization_runs (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  records_received INTEGER NOT NULL DEFAULT 0,
  records_stored INTEGER NOT NULL DEFAULT 0,
  error_kind TEXT,
  error_message TEXT
);
CREATE INDEX idx_sync_runs_source ON synchronization_runs(source_id, started_at DESC);

CREATE TABLE airports (
  id TEXT PRIMARY KEY NOT NULL,       -- source_id:source_record_id
  source_id TEXT NOT NULL,
  source_record_id TEXT,
  origin TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  ident TEXT NOT NULL,
  icao TEXT,
  iata TEXT,
  local_code TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  elevation_ft REAL,
  country TEXT,
  region TEXT,
  municipality TEXT,
  frequencies TEXT NOT NULL DEFAULT '[]'  -- JSON
);
CREATE INDEX idx_airports_ident ON airports(ident);
CREATE INDEX idx_airports_icao ON airports(icao);
CREATE INDEX idx_airports_latlon ON airports(lat, lon);
CREATE INDEX idx_airports_country ON airports(country);

CREATE TABLE runways (
  id TEXT PRIMARY KEY NOT NULL,
  airport_id TEXT NOT NULL REFERENCES airports(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  source_record_id TEXT,
  retrieved_at TEXT NOT NULL,
  length_ft REAL,
  width_ft REAL,
  surface TEXT,
  lighted INTEGER,
  closed INTEGER,
  le_ident TEXT, le_lat REAL, le_lon REAL, le_elevation_ft REAL, le_heading_true REAL, le_displaced_ft REAL,
  he_ident TEXT, he_lat REAL, he_lon REAL, he_elevation_ft REAL, he_heading_true REAL, he_displaced_ft REAL
);
CREATE INDEX idx_runways_airport ON runways(airport_id);

CREATE TABLE navaids (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  source_record_id TEXT,
  origin TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  ident TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  frequency_khz REAL,
  dme_channel TEXT,
  dme_frequency_khz REAL,
  elevation_ft REAL,
  country TEXT,
  magnetic_variation_deg REAL,
  usage TEXT,
  power TEXT,
  associated_airport TEXT
);
CREATE INDEX idx_navaids_ident ON navaids(ident);
CREATE INDEX idx_navaids_latlon ON navaids(lat, lon);

CREATE TABLE waypoints (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  source_record_id TEXT,
  origin TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  ident TEXT NOT NULL,
  region TEXT,
  type TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  UNIQUE (source_id, ident, region)
);
CREATE INDEX idx_waypoints_latlon ON waypoints(lat, lon);

CREATE TABLE airspaces (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  source_record_id TEXT,
  origin TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  name TEXT NOT NULL,
  classification TEXT NOT NULL,
  geometry TEXT NOT NULL,             -- GeoJSON
  lower_limit TEXT NOT NULL,          -- JSON VerticalLimit
  upper_limit TEXT NOT NULL,
  frequencies TEXT NOT NULL DEFAULT '[]',
  effective TEXT,
  min_lat REAL, min_lon REAL, max_lat REAL, max_lon REAL
);
CREATE INDEX idx_airspaces_bbox ON airspaces(min_lat, max_lat, min_lon, max_lon);

CREATE TABLE airways (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  source_record_id TEXT,
  origin TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  ident TEXT NOT NULL,
  segments TEXT NOT NULL,             -- JSON AirwaySegment[]
  effective_from TEXT,
  effective_to TEXT,
  data_version TEXT
);

CREATE TABLE notams (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  provider_id TEXT,
  origin TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  last_verified_at TEXT,
  display_id TEXT,
  series TEXT,
  number INTEGER,
  year INTEGER,
  type TEXT NOT NULL,
  referenced_id TEXT,
  fir TEXT,
  q_code TEXT,
  q_line TEXT,                        -- JSON QLine
  locations TEXT NOT NULL,            -- JSON array
  valid_from TEXT,
  valid_to TEXT,
  valid_to_permanent INTEGER NOT NULL DEFAULT 0,
  valid_to_estimated INTEGER NOT NULL DEFAULT 0,
  valid_from_raw TEXT,
  valid_to_raw TEXT,
  schedule TEXT,
  text TEXT NOT NULL,
  lower_limit TEXT,
  upper_limit TEXT,
  raw TEXT NOT NULL,
  parse_status TEXT NOT NULL,
  quality_flags TEXT NOT NULL         -- JSON array
);
CREATE INDEX idx_notams_fir ON notams(fir);
CREATE INDEX idx_notams_valid ON notams(valid_from, valid_to);
CREATE INDEX idx_notams_ref ON notams(referenced_id);

CREATE TABLE notam_geometries (
  notam_id TEXT PRIMARY KEY NOT NULL REFERENCES notams(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  geometry TEXT NOT NULL,             -- GeoJSON [lon, lat]
  centre_lat REAL,
  centre_lon REAL,
  radius_nm REAL,
  confidence TEXT NOT NULL,
  origin TEXT NOT NULL
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  relative_path TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  checksum TEXT,
  imported_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  source TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  last_opened_at TEXT,
  last_page INTEGER
);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_checksum ON documents(checksum);

CREATE TABLE document_tags (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (document_id, tag)
);

CREATE TABLE document_bookmarks (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_bookmarks_doc ON document_bookmarks(document_id);

CREATE TABLE saved_routes (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  ground_speed_kt REAL,
  variation_deg REAL,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL
);

CREATE TABLE route_waypoints (
  route_id TEXT NOT NULL REFERENCES saved_routes(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  ident TEXT NOT NULL,
  name TEXT,
  kind TEXT NOT NULL,
  ref_id TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  PRIMARY KEY (route_id, seq)
);

CREATE TABLE map_packages (
  id TEXT PRIMARY KEY NOT NULL,       -- MapLibre offline pack id
  name TEXT NOT NULL,
  style_url TEXT NOT NULL,
  west REAL NOT NULL, south REAL NOT NULL, east REAL NOT NULL, north REAL NOT NULL,
  min_zoom REAL NOT NULL,
  max_zoom REAL NOT NULL,
  created_at TEXT NOT NULL,
  state TEXT NOT NULL,
  completed_bytes INTEGER NOT NULL DEFAULT 0,
  percentage REAL NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL                 -- JSON
);
`,
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

export async function getSchemaVersion(db: SqlDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Applies pending migrations. If the database is newer than this app build
 * (downgrade), it refuses to touch it rather than risk data loss.
 */
export async function migrate(db: SqlDatabase, migrations: Migration[] = MIGRATIONS): Promise<number> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const current = await getSchemaVersion(db);
  const latest = migrations[migrations.length - 1]?.version ?? 0;
  if (current > latest) {
    throw new Error(
      `Veritabanı şeması (${current}) bu uygulama sürümünden (${latest}) daha yeni. Veri korunması için işlem durduruldu.`,
    );
  }
  for (const m of migrations) {
    if (m.version <= current) continue;
    await db.withTransactionAsync(async () => {
      await db.execAsync(m.sql);
      await db.execAsync(`PRAGMA user_version = ${m.version}`);
    });
  }
  return getSchemaVersion(db);
}
