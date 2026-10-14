/**
 * Map layer catalogue and GeoJSON feature builders. Pure functions so they
 * can be unit-tested; the renderer (MapScreen) has no provider logic.
 * GeoJSON coordinates are [lon, lat].
 */
import type { Airport, Navaid, NavaidType, Runway } from '@/domain/models/aviation';
import type { Notam, NotamLifecycle } from '@/domain/models/notam';
import { qCodeGroup, type NotamCategory } from '@/domain/notam/qcodes';
import { formatNavaidFrequency } from '@/domain/services/navaid';
import type { RoutePoint } from '@/domain/services/route';

export type LayerId =
  | 'airports'
  | 'heliports'
  | 'runways'
  | 'vor'
  | 'dme'
  | 'ndb'
  | 'notamAreas'
  | 'notamPoints'
  | 'route'
  | 'terrain'
  | 'waypoints'
  | 'reportingPoints'
  | 'airways'
  | 'airspaces'
  | 'restricted'
  | 'userMarkers';

export interface LayerDef {
  id: LayerId;
  label: string;
  group: 'Aerodromes' | 'Navaids' | 'NOTAM' | 'Airspace & routes' | 'Kullanıcı' | 'Arazi';
  /** null = available; otherwise the reason it is unavailable. */
  unavailableReason: string | null;
  legendColor: string;
}

const NO_SOURCE = 'Yetkili veri kaynağı yapılandırılmadı';

export const LAYERS: LayerDef[] = [
  { id: 'airports', label: 'Airports', group: 'Aerodromes', unavailableReason: null, legendColor: '#2F80ED' },
  { id: 'heliports', label: 'Heliports', group: 'Aerodromes', unavailableReason: null, legendColor: '#9B51E0' },
  { id: 'runways', label: 'Runways', group: 'Aerodromes', unavailableReason: null, legendColor: '#E0E0E0' },
  { id: 'vor', label: 'VOR · VOR/DME · VORTAC', group: 'Navaids', unavailableReason: null, legendColor: '#00B3A4' },
  { id: 'dme', label: 'DME · TACAN', group: 'Navaids', unavailableReason: null, legendColor: '#56CCF2' },
  { id: 'ndb', label: 'NDB · NDB/DME', group: 'Navaids', unavailableReason: null, legendColor: '#B5651D' },
  { id: 'notamAreas', label: 'NOTAM areas / circles', group: 'NOTAM', unavailableReason: null, legendColor: '#FF3B30' },
  { id: 'notamPoints', label: 'NOTAM points', group: 'NOTAM', unavailableReason: null, legendColor: '#FF9500' },
  { id: 'route', label: 'Aktif rota', group: 'Kullanıcı', unavailableReason: null, legendColor: '#FF00D4' },
  { id: 'waypoints', label: 'Waypoints', group: 'Airspace & routes', unavailableReason: NO_SOURCE, legendColor: '#888' },
  { id: 'reportingPoints', label: 'Reporting points', group: 'Airspace & routes', unavailableReason: NO_SOURCE, legendColor: '#888' },
  { id: 'airways', label: 'Airways', group: 'Airspace & routes', unavailableReason: NO_SOURCE, legendColor: '#888' },
  { id: 'airspaces', label: 'Airspace boundaries', group: 'Airspace & routes', unavailableReason: NO_SOURCE, legendColor: '#888' },
  { id: 'restricted', label: 'Restricted / Prohibited / Danger', group: 'Airspace & routes', unavailableReason: NO_SOURCE, legendColor: '#888' },
  { id: 'terrain', label: 'Terrain', group: 'Arazi', unavailableReason: 'Uygun arazi veri seti yapılandırılmadı', legendColor: '#888' },
  { id: 'userMarkers', label: 'Kullanıcı işaretleri', group: 'Kullanıcı', unavailableReason: 'Henüz uygulanmadı', legendColor: '#888' },
];

export const DEFAULT_LAYER_VISIBILITY: Record<LayerId, boolean> = {
  airports: true,
  heliports: false,
  runways: true,
  vor: true,
  dme: true,
  ndb: true,
  notamAreas: true,
  notamPoints: true,
  route: true,
  terrain: false,
  waypoints: false,
  reportingPoints: false,
  airways: false,
  airspaces: false,
  restricted: false,
  userMarkers: false,
};

export const NAVAID_LAYER_TYPES: Record<'vor' | 'dme' | 'ndb', NavaidType[]> = {
  vor: ['VOR', 'VOR-DME', 'VORTAC'],
  dme: ['DME', 'TACAN'],
  ndb: ['NDB', 'NDB-DME'],
};

export function visibleNavaidTypes(v: Record<LayerId, boolean>): NavaidType[] {
  return (['vor', 'dme', 'ndb'] as const).flatMap((k) => (v[k] ? NAVAID_LAYER_TYPES[k] : []));
}

type FC = GeoJSON.FeatureCollection;

export function airportFeatures(airports: Airport[]): FC {
  return {
    type: 'FeatureCollection',
    features: airports.map((a) => ({
      type: 'Feature',
      id: a.id,
      geometry: { type: 'Point', coordinates: [a.position.lon, a.position.lat] },
      properties: {
        kind: 'airport',
        id: a.id,
        ident: a.ident,
        name: a.name,
        apType: a.type,
        rank: a.type === 'large_airport' ? 3 : a.type === 'medium_airport' ? 2 : 1,
      },
    })),
  };
}

export function runwayFeatures(runways: Runway[]): FC {
  const features: GeoJSON.Feature[] = [];
  for (const r of runways) {
    if (!r.le.position || !r.he.position || r.closed) continue;
    features.push({
      type: 'Feature',
      id: r.id,
      geometry: {
        type: 'LineString',
        coordinates: [
          [r.le.position.lon, r.le.position.lat],
          [r.he.position.lon, r.he.position.lat],
        ],
      },
      properties: { kind: 'runway', id: r.id, airportId: r.airportId, label: `${r.le.ident ?? ''}/${r.he.ident ?? ''}` },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function navaidFeatures(navaids: Navaid[]): FC {
  return {
    type: 'FeatureCollection',
    features: navaids.map((n) => ({
      type: 'Feature',
      id: n.id,
      geometry: { type: 'Point', coordinates: [n.position.lon, n.position.lat] },
      properties: {
        kind: 'navaid',
        id: n.id,
        ident: n.ident,
        navType: n.type,
        label: `${n.ident} ${formatNavaidFrequency(n.type, n.frequencyKhz) ?? ''}`.trim(),
      },
    })),
  };
}

export interface NotamFeatureInput {
  notam: Notam;
  lifecycle: NotamLifecycle;
}

const MAP_STATES: NotamLifecycle[] = ['active', 'future', 'unknown'];

/**
 * Builds NOTAM map features. Only NOTAMs with geometry are mapped; cancelled,
 * replaced and expired notices are excluded unless `includeInactive`.
 */
export function notamFeatures(
  items: NotamFeatureInput[],
  includeInactive = false,
  categories?: Set<NotamCategory>,
): { areas: FC; points: FC; unmapped: number } {
  const areas: GeoJSON.Feature[] = [];
  const points: GeoJSON.Feature[] = [];
  let unmapped = 0;
  for (const { notam: n, lifecycle } of items) {
    if (n.type === 'CANCEL') continue;
    if (!includeInactive && !MAP_STATES.includes(lifecycle)) continue;
    const category = qCodeGroup(n.q?.code).category;
    if (categories && !categories.has(category)) continue;
    if (!n.geometry) {
      unmapped++;
      continue;
    }
    const props = {
      kind: 'notam',
      id: n.id,
      displayId: n.displayId ?? '?',
      confidence: n.geometry.confidence,
      lifecycle,
      category,
      origin: n.provenance.origin,
    };
    const f: GeoJSON.Feature = { type: 'Feature', id: n.id, geometry: n.geometry.geometry, properties: props };
    if (n.geometry.kind === 'point') points.push(f);
    else areas.push(f);
  }
  return {
    areas: { type: 'FeatureCollection', features: areas },
    points: { type: 'FeatureCollection', features: points },
    unmapped,
  };
}

export function routeFeatures(points: RoutePoint[]): FC {
  const features: GeoJSON.Feature[] = [];
  if (points.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: points.map((p) => [p.position.lon, p.position.lat]) },
      properties: { kind: 'route-line' },
    });
  }
  points.forEach((p, i) =>
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.position.lon, p.position.lat] },
      properties: { kind: 'route-point', ident: p.ident, seq: i },
    }),
  );
  return { type: 'FeatureCollection', features };
}

export const EMPTY_FC: FC = { type: 'FeatureCollection', features: [] };
