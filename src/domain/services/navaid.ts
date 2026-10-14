import type { NavaidType } from '../models/aviation';

const KNOWN: Record<string, NavaidType> = {
  VOR: 'VOR',
  'VOR-DME': 'VOR-DME',
  'VOR/DME': 'VOR-DME',
  VORDME: 'VOR-DME',
  VORTAC: 'VORTAC',
  TACAN: 'TACAN',
  DME: 'DME',
  NDB: 'NDB',
  'NDB-DME': 'NDB-DME',
  'NDB/DME': 'NDB-DME',
};

/**
 * Maps a source-supplied type string to the normalised navaid type.
 * Only the explicit classification field is used — never the station name.
 * Anything not recognised becomes UNKNOWN (and the raw type is kept).
 */
export function classifyNavaid(sourceType: string | null | undefined): NavaidType {
  if (!sourceType) return 'UNKNOWN';
  return KNOWN[sourceType.trim().toUpperCase()] ?? 'UNKNOWN';
}

export function hasDme(type: NavaidType): boolean {
  return type === 'VOR-DME' || type === 'VORTAC' || type === 'TACAN' || type === 'DME' || type === 'NDB-DME';
}

export function isVhf(type: NavaidType): boolean {
  return type === 'VOR' || type === 'VOR-DME' || type === 'VORTAC';
}

/**
 * Formats a navaid frequency. Sources commonly supply kHz for both VHF and LF:
 * VOR 113100 kHz -> "113.10 MHz", NDB 373 kHz -> "373 kHz".
 */
export function formatNavaidFrequency(type: NavaidType, khz: number | null): string | null {
  if (khz === null || !Number.isFinite(khz) || khz <= 0) return null;
  if (isVhf(type) || khz >= 30_000) return `${(khz / 1000).toFixed(2)} MHz`;
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`;
}

export const NAVAID_LABELS: Record<NavaidType, string> = {
  VOR: 'VOR',
  'VOR-DME': 'VOR/DME',
  VORTAC: 'VORTAC',
  TACAN: 'TACAN',
  DME: 'DME',
  NDB: 'NDB',
  'NDB-DME': 'NDB/DME',
  UNKNOWN: 'Bilinmeyen tip',
};
