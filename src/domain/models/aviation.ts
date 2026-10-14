/**
 * Normalised aviation reference models. Provider-specific payloads are mapped
 * into these types by provider adapters; UI code only ever sees these.
 *
 * Unknown values are represented as `null` — never guessed.
 * Coordinates are WGS-84 decimal degrees.
 */
import type { Provenance } from './provenance';

export interface LatLon {
  lat: number;
  lon: number;
}

export type AirportType =
  | 'large_airport'
  | 'medium_airport'
  | 'small_airport'
  | 'heliport'
  | 'seaplane_base'
  | 'balloonport'
  | 'closed'
  | 'unknown';

export interface Frequency {
  /** Source-defined type, e.g. TWR, APP, ATIS. Preserved verbatim. */
  type: string;
  description: string | null;
  mhz: number;
}

export interface RunwayEnd {
  ident: string | null;
  position: LatLon | null;
  elevationFt: number | null;
  headingTrueDeg: number | null;
  displacedThresholdFt: number | null;
}

export interface Runway {
  id: string;
  airportId: string;
  lengthFt: number | null;
  widthFt: number | null;
  /** Source surface code, preserved verbatim (sources use free text). */
  surface: string | null;
  lighted: boolean | null;
  closed: boolean | null;
  le: RunwayEnd;
  he: RunwayEnd;
  provenance: Provenance;
}

export interface Airport {
  id: string;
  ident: string;
  icao: string | null;
  iata: string | null;
  localCode: string | null;
  name: string;
  type: AirportType;
  position: LatLon;
  elevationFt: number | null;
  country: string | null;
  region: string | null;
  municipality: string | null;
  frequencies: Frequency[];
  provenance: Provenance;
}

/**
 * Navaid types follow the source classification. We never infer a type
 * from a name.
 */
export type NavaidType = 'VOR' | 'VOR-DME' | 'VORTAC' | 'TACAN' | 'DME' | 'NDB' | 'NDB-DME' | 'UNKNOWN';

export interface Navaid {
  id: string;
  ident: string;
  name: string;
  type: NavaidType;
  /** Raw type string from the source, preserved for audit. */
  sourceType: string;
  position: LatLon;
  /** VOR/DME frequencies in kHz as supplied (e.g. 113100 for 113.10 MHz). */
  frequencyKhz: number | null;
  dmeChannel: string | null;
  dmeFrequencyKhz: number | null;
  elevationFt: number | null;
  country: string | null;
  magneticVariationDeg: number | null;
  usage: string | null;
  power: string | null;
  associatedAirport: string | null;
  provenance: Provenance;
}

export type WaypointType = 'enroute' | 'terminal' | 'reporting-point' | 'vfr-reporting-point' | 'user' | 'unknown';

export interface Waypoint {
  id: string;
  ident: string;
  /** Identity context (e.g. ICAO region/FIR). Idents are not globally unique. */
  region: string | null;
  type: WaypointType;
  position: LatLon;
  provenance: Provenance;
}

/** Vertical reference as defined by the source. Never silently unified. */
export type VerticalReference = 'MSL' | 'AGL' | 'FL' | 'SFC' | 'UNL' | 'STD' | 'UNKNOWN';

export interface VerticalLimit {
  /** Numeric value in feet, or flight level number when reference is FL. Null for SFC/UNL/unknown. */
  value: number | null;
  unit: 'ft' | 'm' | 'FL' | null;
  reference: VerticalReference;
  /** Original text from the source. */
  raw: string;
}

export interface Airspace {
  id: string;
  name: string;
  /** Source classification (A..G, CTR, TMA, R, P, D ...). */
  classification: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  lower: VerticalLimit;
  upper: VerticalLimit;
  frequencies: Frequency[];
  effective: string | null;
  provenance: Provenance;
}

export interface AirwaySegment {
  fromWaypointId: string;
  toWaypointId: string;
  geometry: GeoJSON.LineString;
  direction: 'both' | 'forward' | 'backward' | 'unknown';
  lower: VerticalLimit | null;
  upper: VerticalLimit | null;
}

export interface Airway {
  id: string;
  ident: string;
  segments: AirwaySegment[];
  effectiveFrom: string | null;
  effectiveTo: string | null;
  dataVersion: string | null;
  provenance: Provenance;
}
