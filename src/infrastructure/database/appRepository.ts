/** Settings, saved routes and offline map package metadata. */
import type { RoutePoint } from '@/domain/services/route';
import type { SqlDatabase } from './sql';

// ---- settings ---------------------------------------------------------------

export async function getSetting<T>(db: SqlDatabase, key: string, fallback: T): Promise<T> {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key]);
  if (!r) return fallback;
  try {
    return JSON.parse(r.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(db: SqlDatabase, key: string, value: unknown): Promise<void> {
  await db.runAsync(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)],
  );
}

// ---- routes -----------------------------------------------------------------

export interface SavedRoute {
  id: string;
  name: string;
  groundSpeedKt: number | null;
  variationDeg: number | null;
  createdAt: string;
  modifiedAt: string;
  points: RoutePoint[];
}

export async function saveRoute(db: SqlDatabase, r: SavedRoute): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO saved_routes (id, name, ground_speed_kt, variation_deg, created_at, modified_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, ground_speed_kt=excluded.ground_speed_kt,
         variation_deg=excluded.variation_deg, modified_at=excluded.modified_at`,
      [r.id, r.name, r.groundSpeedKt, r.variationDeg, r.createdAt, r.modifiedAt],
    );
    await db.runAsync('DELETE FROM route_waypoints WHERE route_id = ?', [r.id]);
    for (const [i, p] of r.points.entries()) {
      await db.runAsync(
        'INSERT INTO route_waypoints (route_id, seq, ident, name, kind, ref_id, lat, lon) VALUES (?,?,?,?,?,?,?,?)',
        [r.id, i, p.ident, p.name, p.kind, p.refId, p.position.lat, p.position.lon],
      );
    }
  });
}

export async function listRoutes(db: SqlDatabase): Promise<SavedRoute[]> {
  const routes = await db.getAllAsync<{
    id: string;
    name: string;
    ground_speed_kt: number | null;
    variation_deg: number | null;
    created_at: string;
    modified_at: string;
  }>('SELECT * FROM saved_routes ORDER BY modified_at DESC');
  const out: SavedRoute[] = [];
  for (const r of routes) {
    const pts = await db.getAllAsync<{
      seq: number;
      ident: string;
      name: string | null;
      kind: RoutePoint['kind'];
      ref_id: string | null;
      lat: number;
      lon: number;
    }>('SELECT * FROM route_waypoints WHERE route_id = ? ORDER BY seq', [r.id]);
    out.push({
      id: r.id,
      name: r.name,
      groundSpeedKt: r.ground_speed_kt,
      variationDeg: r.variation_deg,
      createdAt: r.created_at,
      modifiedAt: r.modified_at,
      points: pts.map((p) => ({
        id: `${r.id}:${p.seq}`,
        ident: p.ident,
        name: p.name,
        kind: p.kind,
        refId: p.ref_id,
        position: { lat: p.lat, lon: p.lon },
      })),
    });
  }
  return out;
}

export async function deleteRoute(db: SqlDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM saved_routes WHERE id = ?', [id]);
}

// ---- offline map packages ---------------------------------------------------

export interface MapPackageRecord {
  id: string;
  name: string;
  styleUrl: string;
  bounds: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  createdAt: string;
  state: 'inactive' | 'active' | 'complete' | 'error';
  completedBytes: number;
  percentage: number;
  lastError: string | null;
}

export async function upsertMapPackage(db: SqlDatabase, p: MapPackageRecord): Promise<void> {
  const [w, s, e, n] = p.bounds;
  await db.runAsync(
    `INSERT INTO map_packages (id, name, style_url, west, south, east, north, min_zoom, max_zoom, created_at, state,
       completed_bytes, percentage, last_error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET state=excluded.state, completed_bytes=excluded.completed_bytes,
       percentage=excluded.percentage, last_error=excluded.last_error`,
    [p.id, p.name, p.styleUrl, w, s, e, n, p.minZoom, p.maxZoom, p.createdAt, p.state, p.completedBytes, p.percentage, p.lastError],
  );
}

export async function listMapPackages(db: SqlDatabase): Promise<MapPackageRecord[]> {
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    style_url: string;
    west: number;
    south: number;
    east: number;
    north: number;
    min_zoom: number;
    max_zoom: number;
    created_at: string;
    state: MapPackageRecord['state'];
    completed_bytes: number;
    percentage: number;
    last_error: string | null;
  }>('SELECT * FROM map_packages ORDER BY created_at DESC');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    styleUrl: r.style_url,
    bounds: [r.west, r.south, r.east, r.north],
    minZoom: r.min_zoom,
    maxZoom: r.max_zoom,
    createdAt: r.created_at,
    state: r.state,
    completedBytes: r.completed_bytes,
    percentage: r.percentage,
    lastError: r.last_error,
  }));
}

export async function deleteMapPackage(db: SqlDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM map_packages WHERE id = ?', [id]);
}
