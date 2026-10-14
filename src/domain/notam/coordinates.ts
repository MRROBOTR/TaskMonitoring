/**
 * Parsing of the coordinate notations used in ICAO NOTAMs.
 *  - Q-line:  ddmmNdddmmE  (minute precision, e.g. 4058N02849E)
 *  - Item E:  ddmmssNdddmmssE (e.g. 405830N0284915E), ddmmNdddmmE,
 *             optionally with decimal seconds (405830.5N0284915.2E)
 */
import type { LatLon } from '../models/aviation';
import { isValidLatLon } from '../services/geo';

export const COORD_PATTERN =
  /(\d{2})(\d{2})(\d{2}(?:\.\d+)?)?\s?([NS])\s?(\d{3})(\d{2})(\d{2}(?:\.\d+)?)?\s?([EW])/g;

function toDecimal(d: string, m: string, s: string | undefined, hemi: string): number | null {
  const deg = Number(d);
  const min = Number(m);
  const sec = s ? Number(s) : 0;
  if (min >= 60 || sec >= 60) return null;
  const v = deg + min / 60 + sec / 3600;
  return hemi === 'S' || hemi === 'W' ? -v : v;
}

export function parseCoordinate(text: string): LatLon | null {
  const re = new RegExp(COORD_PATTERN.source);
  const m = re.exec(text.trim());
  if (!m || m.index !== 0 || m[0].length !== text.trim().length) return null;
  return matchToLatLon(m);
}

export function matchToLatLon(m: RegExpExecArray): LatLon | null {
  const lat = toDecimal(m[1]!, m[2]!, m[3], m[4]!);
  const lon = toDecimal(m[5]!, m[6]!, m[7], m[8]!);
  if (lat === null || lon === null) return null;
  const p = { lat, lon };
  return isValidLatLon(p) ? p : null;
}

export interface CoordinateMatch {
  position: LatLon;
  index: number;
  end: number;
}

export function findCoordinates(text: string): CoordinateMatch[] {
  const out: CoordinateMatch[] = [];
  const re = new RegExp(COORD_PATTERN.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const p = matchToLatLon(m);
    if (p) out.push({ position: p, index: m.index, end: m.index + m[0].length });
  }
  return out;
}
