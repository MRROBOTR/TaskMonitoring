/**
 * OurAirports provider adapter.
 *
 * Source:   https://ourairports.com/data/  (files hosted in the GitHub repo
 *           davidmegginson/ourairports-data, published via GitHub Pages)
 * License:  Public Domain, "no guarantee of accuracy or fitness for use".
 * Coverage: worldwide, community-maintained; NOT an official AIP source.
 * Schema:   verified 2026-10-14 against the live CSV headers (see fixtures).
 */
import type { Airport, AirportType, Frequency, Navaid, Runway } from '@/domain/models/aviation';
import type { DataSourceDescriptor, Provenance } from '@/domain/models/provenance';
import { isValidLatLon } from '@/domain/services/geo';
import { classifyNavaid } from '@/domain/services/navaid';
import type { ReferenceDataset } from '@/infrastructure/database/referenceRepository';
import { fetchText, type FetchOptions } from '@/infrastructure/networking/http';
import { parseCsv } from './csv';

export const OURAIRPORTS_SOURCE_ID = 'ourairports';

export const OURAIRPORTS_DESCRIPTOR: DataSourceDescriptor = {
  id: OURAIRPORTS_SOURCE_ID,
  name: 'OurAirports',
  documentationUrl: 'https://ourairports.com/data/',
  categories: ['airports', 'runways', 'frequencies', 'navaids'],
  coverage: 'Dünya geneli (topluluk tarafından derlenir; resmi AIP değildir)',
  updateFrequency: 'Günlük dosya üretimi',
  access: 'none',
  license: 'Public Domain (no guarantee of accuracy or fitness for use)',
  attribution: 'Airport/navaid data: OurAirports (ourairports.com), Public Domain',
  offlineStoragePermitted: true,
  redistributionPermitted: true,
  limitations: [
    'Resmi AIP kaynağı değildir; doğruluk garanti edilmez.',
    'Waypoint, airway ve airspace verisi içermez.',
    'Pist yüzeyi serbest metindir; olduğu gibi gösterilir.',
  ],
  verification: 'verified',
};

const BASE = 'https://davidmegginson.github.io/ourairports-data';
export const OURAIRPORTS_FILES = {
  airports: `${BASE}/airports.csv`,
  runways: `${BASE}/runways.csv`,
  frequencies: `${BASE}/airport-frequencies.csv`,
  navaids: `${BASE}/navaids.csv`,
} as const;

export const AIRPORT_COLUMNS = [
  'id', 'ident', 'type', 'name', 'latitude_deg', 'longitude_deg', 'elevation_ft', 'iso_country', 'iso_region',
  'municipality', 'icao_code', 'iata_code', 'gps_code', 'local_code',
];
export const RUNWAY_COLUMNS = [
  'id', 'airport_ref', 'length_ft', 'width_ft', 'surface', 'lighted', 'closed', 'le_ident', 'le_latitude_deg',
  'le_longitude_deg', 'le_elevation_ft', 'le_heading_degT', 'le_displaced_threshold_ft', 'he_ident',
  'he_latitude_deg', 'he_longitude_deg', 'he_elevation_ft', 'he_heading_degT', 'he_displaced_threshold_ft',
];
export const FREQUENCY_COLUMNS = ['id', 'airport_ref', 'type', 'description', 'frequency_mhz'];
export const NAVAID_COLUMNS = [
  'id', 'ident', 'name', 'type', 'frequency_khz', 'latitude_deg', 'longitude_deg', 'elevation_ft', 'iso_country',
  'dme_frequency_khz', 'dme_channel', 'magnetic_variation_deg', 'usageType', 'power', 'associated_airport',
];

const AIRPORT_TYPES: AirportType[] = [
  'large_airport', 'medium_airport', 'small_airport', 'heliport', 'seaplane_base', 'balloonport', 'closed',
];

function num(s: string | undefined): number | null {
  if (s === undefined || s.trim() === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
function str(s: string | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}
function flag(s: string | undefined): boolean | null {
  if (s === '1') return true;
  if (s === '0') return false;
  return null;
}

export interface NormalizeStats {
  airports: number;
  runways: number;
  navaids: number;
  frequencies: number;
  rejected: { kind: string; id: string; reason: string }[];
}

export interface CsvBundle {
  airports: string;
  runways: string;
  frequencies: string;
  navaids: string;
}

/**
 * Pure normalisation of the four CSV files. `countries` (ISO 3166-1 alpha-2)
 * limits the dataset; empty = all.
 */
export function normalizeOurAirports(
  csv: CsvBundle,
  retrievedAt: string,
  countries: string[] = [],
): { dataset: ReferenceDataset; stats: NormalizeStats } {
  const rejected: NormalizeStats['rejected'] = [];
  const keep = (c: string | null) => countries.length === 0 || (c !== null && countries.includes(c));
  const prov = (id: string): Provenance => ({
    sourceId: OURAIRPORTS_SOURCE_ID,
    sourceRecordId: id,
    origin: 'provider',
    retrievedAt,
  });

  const freqByAirport = new Map<string, Frequency[]>();
  let freqCount = 0;
  for (const f of parseCsv(csv.frequencies, FREQUENCY_COLUMNS)) {
    const mhz = num(f.frequency_mhz);
    if (mhz === null || mhz <= 0) continue;
    const list = freqByAirport.get(f.airport_ref!) ?? [];
    list.push({ type: f.type?.trim() || 'UNKNOWN', description: str(f.description), mhz });
    freqByAirport.set(f.airport_ref!, list);
    freqCount++;
  }

  const airports: Airport[] = [];
  const airportIdByRef = new Map<string, string>();
  for (const a of parseCsv(csv.airports, AIRPORT_COLUMNS)) {
    const country = str(a.iso_country);
    if (!keep(country)) continue;
    const lat = num(a.latitude_deg);
    const lon = num(a.longitude_deg);
    if (lat === null || lon === null || !isValidLatLon({ lat, lon })) {
      rejected.push({ kind: 'airport', id: a.id!, reason: 'invalid-coordinates' });
      continue;
    }
    const type = (AIRPORT_TYPES as string[]).includes(a.type!) ? (a.type as AirportType) : 'unknown';
    const id = `${OURAIRPORTS_SOURCE_ID}:apt:${a.id}`;
    airportIdByRef.set(a.id!, id);
    airports.push({
      id,
      ident: a.ident!,
      icao: str(a.icao_code),
      iata: str(a.iata_code),
      localCode: str(a.local_code),
      name: a.name?.trim() || a.ident!,
      type,
      position: { lat, lon },
      elevationFt: num(a.elevation_ft),
      country,
      region: str(a.iso_region),
      municipality: str(a.municipality),
      frequencies: freqByAirport.get(a.id!)?.sort((x, y) => x.type.localeCompare(y.type)) ?? [],
      provenance: prov(a.id!),
    });
  }

  const runways: Runway[] = [];
  for (const r of parseCsv(csv.runways, RUNWAY_COLUMNS)) {
    const airportId = airportIdByRef.get(r.airport_ref!);
    if (!airportId) continue;
    const end = (p: 'le' | 'he') => {
      const lat = num(r[`${p}_latitude_deg`]);
      const lon = num(r[`${p}_longitude_deg`]);
      const position = lat !== null && lon !== null && isValidLatLon({ lat, lon }) ? { lat, lon } : null;
      return {
        ident: str(r[`${p}_ident`]),
        position,
        elevationFt: num(r[`${p}_elevation_ft`]),
        headingTrueDeg: num(r[`${p}_heading_degT`]),
        displacedThresholdFt: num(r[`${p}_displaced_threshold_ft`]),
      };
    };
    runways.push({
      id: `${OURAIRPORTS_SOURCE_ID}:rwy:${r.id}`,
      airportId,
      lengthFt: num(r.length_ft),
      widthFt: num(r.width_ft),
      surface: str(r.surface),
      lighted: flag(r.lighted),
      closed: flag(r.closed),
      le: end('le'),
      he: end('he'),
      provenance: prov(r.id!),
    });
  }

  const navaids: Navaid[] = [];
  for (const n of parseCsv(csv.navaids, NAVAID_COLUMNS)) {
    const country = str(n.iso_country);
    if (!keep(country)) continue;
    const lat = num(n.latitude_deg);
    const lon = num(n.longitude_deg);
    if (lat === null || lon === null || !isValidLatLon({ lat, lon })) {
      rejected.push({ kind: 'navaid', id: n.id!, reason: 'invalid-coordinates' });
      continue;
    }
    navaids.push({
      id: `${OURAIRPORTS_SOURCE_ID}:nav:${n.id}`,
      ident: n.ident!,
      name: n.name?.trim() || n.ident!,
      type: classifyNavaid(n.type),
      sourceType: n.type ?? '',
      position: { lat, lon },
      frequencyKhz: num(n.frequency_khz),
      dmeChannel: str(n.dme_channel),
      dmeFrequencyKhz: num(n.dme_frequency_khz),
      elevationFt: num(n.elevation_ft),
      country,
      magneticVariationDeg: num(n.magnetic_variation_deg),
      usage: str(n.usageType),
      power: str(n.power),
      associatedAirport: str(n.associated_airport),
      provenance: prov(n.id!),
    });
  }

  return {
    dataset: { airports, runways, navaids },
    stats: {
      airports: airports.length,
      runways: runways.length,
      navaids: navaids.length,
      frequencies: freqCount,
      rejected,
    },
  };
}

/** Downloads the four CSV files. Throws NetworkError on failure. */
export async function downloadOurAirports(opts: FetchOptions = {}): Promise<CsvBundle> {
  const o = { timeoutMs: 120_000, ...opts };
  const [airports, runways, frequencies, navaids] = await Promise.all([
    fetchText(OURAIRPORTS_FILES.airports, o),
    fetchText(OURAIRPORTS_FILES.runways, o),
    fetchText(OURAIRPORTS_FILES.frequencies, o),
    fetchText(OURAIRPORTS_FILES.navaids, o),
  ]);
  return { airports, runways, frequencies, navaids };
}
