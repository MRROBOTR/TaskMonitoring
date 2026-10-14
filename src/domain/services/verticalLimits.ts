import type { VerticalLimit } from '../models/aviation';

const FT_PER_M = 3.28084;

/**
 * Parses a vertical limit string such as "FL095", "3500FT AMSL", "1000 FT AGL",
 * "SFC", "GND", "UNL", "900M MSL". The reference is kept as given; if no
 * reference is stated the result is UNKNOWN — we do not assume MSL.
 */
export function parseVerticalLimit(raw: string): VerticalLimit {
  const text = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (text === '') return { value: null, unit: null, reference: 'UNKNOWN', raw };
  if (/^(SFC|GND|SURFACE)$/.test(text)) return { value: 0, unit: 'ft', reference: 'SFC', raw };
  if (/^(UNL|UNLTD|UNLIMITED)$/.test(text)) return { value: null, unit: null, reference: 'UNL', raw };

  const fl = /^FL\s?(\d{2,3})$/.exec(text);
  if (fl) return { value: Number(fl[1]), unit: 'FL', reference: 'FL', raw };

  const m = /^(\d+(?:\.\d+)?)\s?(FT|F|M)?\s?(AMSL|MSL|AGL|AAL|SFC|GND|STD)?$/.exec(text);
  if (m) {
    const value = Number(m[1]);
    const unit = m[2] === 'M' ? 'm' : m[2] ? 'ft' : null;
    const refRaw = m[3];
    let reference: VerticalLimit['reference'] = 'UNKNOWN';
    if (refRaw === 'AMSL' || refRaw === 'MSL') reference = 'MSL';
    else if (refRaw === 'AGL' || refRaw === 'SFC' || refRaw === 'GND') reference = 'AGL';
    else if (refRaw === 'STD') reference = 'STD';
    // "AAL" (above aerodrome level) is not AGL; keep UNKNOWN to avoid conflating.
    return { value, unit, reference, raw };
  }
  return { value: null, unit: null, reference: 'UNKNOWN', raw };
}

/**
 * Converts a limit to feet **only** when the conversion is reference-safe.
 * Returns null for AGL (terrain dependent), UNKNOWN, or UNL.
 * Flight levels are converted using standard pressure (FL x 100 ft) and are
 * only comparable to other STD/FL values, which callers must respect.
 */
export function toFeetMsl(limit: VerticalLimit): number | null {
  if (limit.reference === 'SFC') return null; // terrain-dependent
  if (limit.reference !== 'MSL') return null;
  if (limit.value === null) return null;
  return limit.unit === 'm' ? Math.round(limit.value * FT_PER_M) : limit.value;
}

export function flightLevelOf(limit: VerticalLimit): number | null {
  if (limit.reference === 'FL' && limit.value !== null) return limit.value;
  return null;
}

/**
 * Altitude filter: does an airspace with [lower, upper] possibly contain the
 * altitude band [minFt, maxFt] MSL? Uses a conservative approach — when a limit
 * cannot be compared safely (AGL, unknown) the airspace is kept (returns true)
 * so that nothing relevant is hidden.
 * Flight levels are approximated as FL*100 ft for filtering only (flagged in UI).
 */
export function mayIntersectBand(
  lower: VerticalLimit,
  upper: VerticalLimit,
  minFt: number,
  maxFt: number,
): boolean {
  const lo = comparableFeet(lower, 'lower');
  const hi = comparableFeet(upper, 'upper');
  if (lo === undefined || hi === undefined) return true;
  return lo <= maxFt && hi >= minFt;
}

function comparableFeet(l: VerticalLimit, side: 'lower' | 'upper'): number | undefined {
  if (l.reference === 'SFC') return side === 'lower' ? -Infinity : undefined;
  if (l.reference === 'UNL') return side === 'upper' ? Infinity : undefined;
  if (l.reference === 'FL' && l.value !== null) return l.value * 100;
  const msl = toFeetMsl(l);
  return msl === null ? undefined : msl;
}

export function formatVerticalLimit(l: VerticalLimit | null): string {
  if (!l) return 'bilinmiyor';
  switch (l.reference) {
    case 'SFC':
      return 'SFC';
    case 'UNL':
      return 'UNL';
    case 'FL':
      return `FL${String(l.value).padStart(3, '0')}`;
    case 'UNKNOWN':
      return l.raw ? `${l.raw} (referans belirsiz)` : 'bilinmiyor';
    default:
      return `${l.value ?? '?'} ${l.unit ?? ''} ${l.reference}`.replace(/\s+/g, ' ').trim();
  }
}
