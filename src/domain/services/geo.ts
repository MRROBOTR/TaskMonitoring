/**
 * Geodesy helpers on a spherical Earth model (mean radius). Accuracy is
 * adequate for planning displays (typically < 0.5 % distance error vs. WGS-84
 * ellipsoid); these values are not a substitute for certified navigation data.
 *
 * GeoJSON positions are always [longitude, latitude].
 */
import type { LatLon } from '../models/aviation';

export const EARTH_RADIUS_NM = 3440.065;
const DEG = Math.PI / 180;

export function isValidLatLon(p: { lat: number; lon: number }): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lon >= -180 &&
    p.lon <= 180
  );
}

export function toPosition(p: LatLon): GeoJSON.Position {
  return [p.lon, p.lat];
}

export function fromPosition(pos: GeoJSON.Position): LatLon {
  const [lon, lat] = pos;
  if (lon === undefined || lat === undefined) throw new Error('Invalid GeoJSON position');
  return { lat, lon };
}

/** Great-circle distance in nautical miles (haversine). */
export function distanceNm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial true bearing from a to b, degrees [0, 360). */
export function initialBearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = a.lat * DEG;
  const φ2 = b.lat * DEG;
  const Δλ = (b.lon - a.lon) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeDeg(Math.atan2(y, x) / DEG);
}

export function normalizeDeg(d: number): number {
  const r = d % 360;
  return r < 0 ? r + 360 : r;
}

/** Destination point given start, true bearing and distance (NM). */
export function destination(start: LatLon, bearingDeg: number, distNm: number): LatLon {
  const δ = distNm / EARTH_RADIUS_NM;
  const θ = bearingDeg * DEG;
  const φ1 = start.lat * DEG;
  const λ1 = start.lon * DEG;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / DEG, lon: normalizeLon(λ2 / DEG) };
}

export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * Polygon approximating a geodesic circle. Ring is closed and
 * counter-clockwise (RFC 7946 right-hand rule for exterior rings).
 */
export function circlePolygon(centre: LatLon, radiusNm: number, steps = 64): GeoJSON.Polygon {
  if (!(radiusNm > 0)) throw new Error('radius must be positive');
  const ring: GeoJSON.Position[] = [];
  for (let i = 0; i < steps; i++) {
    // Counter-clockwise: decreasing bearing.
    const brg = 360 - (i * 360) / steps;
    ring.push(toPosition(destination(centre, brg % 360, radiusNm)));
  }
  const first = ring[0];
  if (first) ring.push([first[0]!, first[1]!]);
  return { type: 'Polygon', coordinates: [ring] };
}

/** Signed area (shoelace, planar degrees). Positive = counter-clockwise. */
export function ringSignedArea(ring: GeoJSON.Position[]): number {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[i + 1]!;
    s += x1! * y2! - x2! * y1!;
  }
  return s / 2;
}

export interface GeometryIssue {
  code: string;
  message: string;
}

/** Validates a polygon for use on the map. Returns a list of issues (empty = valid). */
export function validatePolygon(poly: GeoJSON.Polygon): GeometryIssue[] {
  const issues: GeometryIssue[] = [];
  if (poly.coordinates.length === 0) issues.push({ code: 'empty', message: 'Polygon has no rings' });
  poly.coordinates.forEach((ring, idx) => {
    if (ring.length < 4) issues.push({ code: 'ring-too-short', message: `Ring ${idx} has < 4 positions` });
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
      issues.push({ code: 'ring-not-closed', message: `Ring ${idx} is not closed` });
    }
    for (const pos of ring) {
      const [lon, lat] = pos;
      if (lon === undefined || lat === undefined || !isValidLatLon({ lat, lon })) {
        issues.push({ code: 'invalid-position', message: `Ring ${idx} contains an out-of-range position` });
        break;
      }
    }
  });
  return issues;
}

export function boundsOf(points: LatLon[]): [number, number, number, number] | null {
  if (points.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.lon);
    e = Math.max(e, p.lon);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [w, s, e, n];
}

/** Formats a coordinate as e.g. 41°00.45'N 028°58.32'E. */
export function formatLatLon(p: LatLon): string {
  const fmt = (v: number, pos: string, neg: string, degDigits: number) => {
    const abs = Math.abs(v);
    let d = Math.floor(abs);
    let m = (abs - d) * 60;
    if (Number(m.toFixed(2)) >= 60) {
      d += 1;
      m = 0;
    }
    return `${String(d).padStart(degDigits, '0')}°${m.toFixed(2).padStart(5, '0')}'${v >= 0 ? pos : neg}`;
  };
  return `${fmt(p.lat, 'N', 'S', 2)} ${fmt(p.lon, 'E', 'W', 3)}`;
}
