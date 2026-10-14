/**
 * Route planning calculations. Routes are user-defined sequences of points;
 * nothing here generates or validates airway routings.
 */
import type { LatLon } from '../models/aviation';
import { distanceNm, initialBearingDeg, normalizeDeg } from './geo';

export interface RoutePoint {
  id: string;
  ident: string;
  name: string | null;
  kind: 'airport' | 'navaid' | 'waypoint' | 'user';
  /** Id of the referenced reference-data record, if any. */
  refId: string | null;
  position: LatLon;
}

export interface RouteLeg {
  from: RoutePoint;
  to: RoutePoint;
  distanceNm: number;
  trueCourseDeg: number;
  /** Magnetic course when variation is supplied (east positive). */
  magneticCourseDeg: number | null;
  /** Estimated time enroute in minutes for a given groundspeed. */
  eteMin: number | null;
  cumulativeNm: number;
}

export interface RouteSummary {
  legs: RouteLeg[];
  totalNm: number;
  totalEteMin: number | null;
}

/**
 * @param variationDeg magnetic variation (east positive) applied uniformly; pass
 *   null when unknown — magnetic courses are then omitted rather than guessed.
 * @param groundSpeedKt planned ground speed; null omits ETE.
 */
export function computeRoute(
  points: RoutePoint[],
  groundSpeedKt: number | null,
  variationDeg: number | null = null,
): RouteSummary {
  const legs: RouteLeg[] = [];
  let cumulative = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const d = distanceNm(from.position, to.position);
    cumulative += d;
    const tc = initialBearingDeg(from.position, to.position);
    legs.push({
      from,
      to,
      distanceNm: d,
      trueCourseDeg: tc,
      magneticCourseDeg: variationDeg === null ? null : normalizeDeg(tc - variationDeg),
      eteMin: groundSpeedKt && groundSpeedKt > 0 ? (d / groundSpeedKt) * 60 : null,
      cumulativeNm: cumulative,
    });
  }
  const totalEteMin =
    groundSpeedKt && groundSpeedKt > 0 && legs.length > 0 ? (cumulative / groundSpeedKt) * 60 : null;
  return { legs, totalNm: cumulative, totalEteMin };
}

export function routeLineString(points: RoutePoint[]): GeoJSON.LineString | null {
  if (points.length < 2) return null;
  return { type: 'LineString', coordinates: points.map((p) => [p.position.lon, p.position.lat]) };
}

export function formatCourse(deg: number): string {
  const r = Math.round(deg) % 360;
  return String(r === 0 ? 360 : r).padStart(3, '0');
}

export function formatEte(min: number | null): string {
  if (min === null) return '—';
  const total = Math.round(min);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
