/**
 * Normalised NOTAM model. Designed for auditability: the original text is
 * always kept, every derived field records how it was derived, and unknown
 * values stay `null`.
 */
import type { VerticalLimit } from './aviation';
import type { Provenance } from './provenance';

export type NotamType = 'NEW' | 'REPLACE' | 'CANCEL' | 'UNKNOWN';

export type ParseStatus =
  | 'parsed' // all mandatory ICAO items understood
  | 'partial' // some items understood, others missing/ambiguous
  | 'needs-review' // could not be interpreted reliably; shown in list only
  | 'failed'; // not recognisable as a NOTAM; original text kept

/** Lifecycle evaluated at a point in time. */
export type NotamLifecycle =
  | 'active'
  | 'future'
  | 'expired'
  | 'cancelled'
  | 'replaced'
  | 'unknown';

export type GeometryConfidence =
  | 'confirmed' // explicit coordinates/polygon in item E or a structured payload
  | 'approximate' // derived from the Q-line centre/radius (ICAO: indicative)
  | 'none'; // no reliable geometry; list-only

export type GeometryOrigin = 'q-line' | 'item-e-polygon' | 'item-e-circle' | 'provider-structured' | 'none';

export interface NotamGeometry {
  kind: 'point' | 'circle' | 'polygon';
  /** GeoJSON geometry in [lon, lat] order. Circles are approximated by a polygon ring. */
  geometry: GeoJSON.Point | GeoJSON.Polygon;
  centre: { lat: number; lon: number } | null;
  radiusNm: number | null;
  confidence: GeometryConfidence;
  origin: GeometryOrigin;
}

export interface QLine {
  fir: string;
  /** Five letter NOTAM code, e.g. QMRLC. */
  code: string;
  subject: string; // 2nd+3rd letters
  condition: string; // 4th+5th letters
  traffic: string | null; // I, V, IV, K
  purpose: string | null; // N, B, O, M, K combinations
  scope: string | null; // A, E, W, AE, AW, K
  lowerFl: number | null;
  upperFl: number | null;
  centre: { lat: number; lon: number } | null;
  radiusNm: number | null;
  raw: string;
}

export interface NotamTime {
  /** ISO-8601 UTC, or null if unknown. */
  iso: string | null;
  /** True when item C is PERM. */
  permanent: boolean;
  /** True when item C carries EST (estimated). */
  estimated: boolean;
  raw: string | null;
}

export interface Notam {
  id: string; // internal id
  providerId: string | null;
  series: string | null;
  number: number | null;
  year: number | null;
  /** e.g. A1234/26 */
  displayId: string | null;
  type: NotamType;
  /** For R/C NOTAMs: the referenced NOTAM, e.g. A1200/26. */
  referencedId: string | null;
  q: QLine | null;
  locations: string[]; // item A
  validFrom: NotamTime; // item B
  validTo: NotamTime; // item C
  schedule: string | null; // item D (kept verbatim; not interpreted as active windows)
  text: string; // item E
  lower: VerticalLimit | null; // item F
  upper: VerticalLimit | null; // item G
  raw: string; // the original message, never discarded
  parseStatus: ParseStatus;
  qualityFlags: string[];
  geometry: NotamGeometry | null;
  provenance: Provenance;
  lastVerifiedAt: string | null;
}
