/**
 * Geographic interpretation of NOTAMs.
 *
 * Rules (conservative by design):
 *  1. An explicit polygon in item E ("... BOUNDED BY / AREA / WI c1-c2-c3 ...")
 *     is used only when exactly one coordinate chain of >= 3 points exists and
 *     it forms a valid ring. Geometry confidence: "confirmed".
 *  2. An explicit circle in item E ("RADIUS n NM CENTRED ON c" or
 *     "CIRCLE ... c ... RADIUS n NM") with exactly one centre. "confirmed".
 *  3. Otherwise the Q-line centre/radius is used and flagged "approximate"
 *     (the ICAO Q-line radius is indicative and rounded up to whole NM).
 *  4. Q-line radius 999 (whole FIR) or no Q-line => no geometry; list-only.
 *  We never assign coordinates from the associated aerodrome.
 */
import type { NotamGeometry, QLine } from '../models/notam';
import { circlePolygon, toPosition, validatePolygon } from '../services/geo';
import { findCoordinates, matchToLatLon, COORD_PATTERN } from './coordinates';

export interface GeometryResult {
  geometry: NotamGeometry | null;
  flags: string[];
}

const POLYGON_KEYWORDS = /(BOUNDED BY|AREA|\bWI\b|WITHIN|POLYGON|LINES? JOINING|POINTS?)/;
const MAX_REASONABLE_RADIUS_NM = 500;

export function interpretGeometry(itemE: string, q: QLine | null): GeometryResult {
  const flags: string[] = [];
  const text = itemE.toUpperCase();

  const circle = findCircle(text);
  if (circle === 'ambiguous') flags.push('item-e-circle-ambiguous');
  const chains = findCoordinateChains(text);

  if (chains.length === 1 && chains[0]!.length >= 3 && POLYGON_KEYWORDS.test(text) && circle === null) {
    const ring = chains[0]!.map(toPosition);
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0]!, first[1]!]);
    const poly: GeoJSON.Polygon = { type: 'Polygon', coordinates: [ring] };
    const issues = validatePolygon(poly);
    if (issues.length === 0) {
      return {
        geometry: {
          kind: 'polygon',
          geometry: poly,
          centre: null,
          radiusNm: null,
          confidence: 'confirmed',
          origin: 'item-e-polygon',
        },
        flags,
      };
    }
    flags.push('item-e-polygon-invalid');
  } else if (chains.length > 1) {
    flags.push('item-e-multiple-areas');
  }

  if (circle && circle !== 'ambiguous') {
    return {
      geometry: {
        kind: 'circle',
        geometry: circlePolygon(circle.centre, circle.radiusNm),
        centre: circle.centre,
        radiusNm: circle.radiusNm,
        confidence: 'confirmed',
        origin: 'item-e-circle',
      },
      flags,
    };
  }

  if (!q || !q.centre) {
    flags.push('no-geometry');
    return { geometry: null, flags };
  }
  if (q.radiusNm === 999) {
    flags.push('fir-wide');
    return { geometry: null, flags };
  }
  if (q.radiusNm === null || q.radiusNm === 0) {
    return {
      geometry: {
        kind: 'point',
        geometry: { type: 'Point', coordinates: toPosition(q.centre) },
        centre: q.centre,
        radiusNm: null,
        confidence: 'approximate',
        origin: 'q-line',
      },
      flags,
    };
  }
  if (q.radiusNm > MAX_REASONABLE_RADIUS_NM) {
    flags.push('q-radius-implausible');
    return { geometry: null, flags };
  }
  return {
    geometry: {
      kind: 'circle',
      geometry: circlePolygon(q.centre, q.radiusNm),
      centre: q.centre,
      radiusNm: q.radiusNm,
      confidence: 'approximate',
      origin: 'q-line',
    },
    flags,
  };
}

/** Finds sequences of coordinates separated only by dashes/whitespace/"TO". */
export function findCoordinateChains(text: string): { lat: number; lon: number }[][] {
  const coords = findCoordinates(text);
  const chains: { lat: number; lon: number }[][] = [];
  let current: { lat: number; lon: number }[] = [];
  let prevEnd = -1;
  for (const c of coords) {
    const gap = prevEnd >= 0 ? text.slice(prevEnd, c.index) : '';
    if (prevEnd >= 0 && /^\s*(-|–|TO)?\s*$/.test(gap)) {
      current.push(c.position);
    } else {
      if (current.length) chains.push(current);
      current = [c.position];
    }
    prevEnd = c.end;
  }
  if (current.length) chains.push(current);
  return chains.filter((ch) => ch.length >= 2);
}

const C = COORD_PATTERN.source;
const CIRCLE_A = new RegExp(
  `RADIUS\\s*(?:OF\\s*)?(\\d+(?:\\.\\d+)?)\\s*NM\\s*(?:CENTRED|CENTERED|CENTRE|CENTER)?\\s*(?:ON|AT)?\\s*(${C})`,
  'g',
);
const CIRCLE_B = new RegExp(
  `(?:CIRCLE|CENTRED|CENTERED|CENTRE|CENTER)\\D{0,20}?(${C})\\D{0,20}?RADIUS\\s*(?:OF\\s*)?(\\d+(?:\\.\\d+)?)\\s*NM`,
  'g',
);

function findCircle(text: string): { centre: { lat: number; lon: number }; radiusNm: number } | 'ambiguous' | null {
  const found: { centre: { lat: number; lon: number }; radiusNm: number }[] = [];
  for (const m of text.matchAll(CIRCLE_A)) {
    const coordMatch = new RegExp(C).exec(m[2]!);
    const centre = coordMatch ? matchToLatLon(coordMatch) : null;
    const r = Number(m[1]);
    if (centre && r > 0) found.push({ centre, radiusNm: r });
  }
  if (found.length === 0) {
    for (const m of text.matchAll(CIRCLE_B)) {
      const coordMatch = new RegExp(C).exec(m[1]!);
      const centre = coordMatch ? matchToLatLon(coordMatch) : null;
      const r = Number(m[m.length - 1]);
      if (centre && r > 0) found.push({ centre, radiusNm: r });
    }
  }
  if (found.length === 0) return null;
  if (found.length > 1) return 'ambiguous';
  return found[0]!;
}
