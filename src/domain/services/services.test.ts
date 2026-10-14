import {
  circlePolygon,
  destination,
  distanceNm,
  formatLatLon,
  initialBearingDeg,
  isValidLatLon,
  validatePolygon,
} from './geo';
import { DEFAULT_THRESHOLDS, evaluateFreshness, type FreshnessInput } from './freshness';
import { classifyNavaid, formatNavaidFrequency, hasDme } from './navaid';
import { formatVerticalLimit, mayIntersectBand, parseVerticalLimit, toFeetMsl } from './verticalLimits';
import {
  hasPdfSignature,
  isSafeRelativePath,
  storedFileName,
  titleFromFilename,
  validatePdfCandidate,
} from './documentValidation';
import { computeRoute, formatCourse, type RoutePoint } from './route';

describe('geo', () => {
  const LTFM = { lat: 41.2753, lon: 28.7519 };
  const LTAC = { lat: 40.1281, lon: 32.9951 };

  it('computes great-circle distance (Istanbul–Ankara ≈ 205 NM)', () => {
    expect(distanceNm(LTFM, LTAC)).toBeGreaterThan(200);
    expect(distanceNm(LTFM, LTAC)).toBeLessThan(212);
    expect(distanceNm(LTFM, LTFM)).toBe(0);
  });

  it('computes known bearings', () => {
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 6);
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 6);
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: -1, lon: 0 })).toBeCloseTo(180, 6);
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: -1 })).toBeCloseTo(270, 6);
  });

  it('destination is consistent with distance', () => {
    const d = destination(LTFM, 123, 50);
    expect(distanceNm(LTFM, d)).toBeCloseTo(50, 6);
  });

  it('builds a valid closed circle polygon in [lon, lat] order', () => {
    const poly = circlePolygon({ lat: 41, lon: 29 }, 10);
    expect(validatePolygon(poly)).toEqual([]);
    const ring = poly.coordinates[0]!;
    for (const pos of ring) {
      expect(distanceNm({ lat: 41, lon: 29 }, { lat: pos[1]!, lon: pos[0]! })).toBeCloseTo(10, 6);
    }
    expect(() => circlePolygon({ lat: 0, lon: 0 }, 0)).toThrow();
  });

  it('validates coordinates and detects swapped/invalid polygons', () => {
    expect(isValidLatLon({ lat: 91, lon: 0 })).toBe(false);
    expect(isValidLatLon({ lat: 0, lon: 181 })).toBe(false);
    const open: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] };
    expect(validatePolygon(open).map((i) => i.code)).toContain('ring-not-closed');
    const bad: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[0, 0], [200, 0], [1, 1], [0, 0]]] };
    expect(validatePolygon(bad).map((i) => i.code)).toContain('invalid-position');
  });

  it('formats coordinates', () => {
    expect(formatLatLon({ lat: 41.5, lon: -28.25 })).toBe("41°30.00'N 028°15.00'W");
  });
});

describe('freshness', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const base: FreshnessInput = {
    configured: true,
    origin: 'provider',
    lastSuccessAt: '2026-10-14T11:50:00Z',
    lastAttemptAt: '2026-10-14T11:50:00Z',
    lastAttemptFailed: false,
    hasData: true,
  };
  const T = DEFAULT_THRESHOLDS.notam;

  it('live / cached / stale by age', () => {
    expect(evaluateFreshness(base, T, now)).toBe('live');
    expect(evaluateFreshness({ ...base, lastSuccessAt: '2026-10-14T10:00:00Z' }, T, now)).toBe('cached');
    expect(evaluateFreshness({ ...base, lastSuccessAt: '2026-10-13T10:00:00Z' }, T, now)).toBe('stale');
  });

  it('a failed newer attempt downgrades to update-failed; stale always wins', () => {
    const failed = { ...base, lastAttemptAt: '2026-10-14T11:55:00Z', lastAttemptFailed: true };
    expect(evaluateFreshness(failed, T, now)).toBe('update-failed');
    expect(evaluateFreshness({ ...failed, lastSuccessAt: '2026-10-13T00:00:00Z' }, T, now)).toBe('stale');
  });

  it('never upgrades manual or synthetic data to live', () => {
    expect(evaluateFreshness({ ...base, origin: 'manual-import' }, T, now)).toBe('manual-import');
    expect(evaluateFreshness({ ...base, origin: 'synthetic' }, T, now)).toBe('synthetic');
  });

  it('not configured / unavailable', () => {
    expect(evaluateFreshness({ ...base, configured: false, hasData: false }, T, now)).toBe('not-configured');
    expect(evaluateFreshness({ ...base, configured: false, hasData: true }, T, now)).toBe('stale');
    expect(
      evaluateFreshness({ ...base, hasData: false, lastSuccessAt: null, lastAttemptFailed: true }, T, now),
    ).toBe('unavailable');
  });
});

describe('navaid classification', () => {
  it('uses only the explicit source type', () => {
    expect(classifyNavaid('VOR-DME')).toBe('VOR-DME');
    expect(classifyNavaid('vortac')).toBe('VORTAC');
    expect(classifyNavaid('NDB-DME')).toBe('NDB-DME');
    expect(classifyNavaid('')).toBe('UNKNOWN');
    expect(classifyNavaid('LOCATOR')).toBe('UNKNOWN');
    expect(classifyNavaid(null)).toBe('UNKNOWN');
  });
  it('dme availability and frequency formatting', () => {
    expect(hasDme('VOR')).toBe(false);
    expect(hasDme('VORTAC')).toBe(true);
    expect(formatNavaidFrequency('VOR-DME', 113100)).toBe('113.10 MHz');
    expect(formatNavaidFrequency('NDB', 373)).toBe('373 kHz');
    expect(formatNavaidFrequency('NDB', null)).toBeNull();
  });
});

describe('vertical limits', () => {
  it('parses references without assuming MSL', () => {
    expect(parseVerticalLimit('FL095')).toMatchObject({ value: 95, reference: 'FL' });
    expect(parseVerticalLimit('3500FT AMSL')).toMatchObject({ value: 3500, unit: 'ft', reference: 'MSL' });
    expect(parseVerticalLimit('1000 FT AGL')).toMatchObject({ value: 1000, reference: 'AGL' });
    expect(parseVerticalLimit('2500FT')).toMatchObject({ value: 2500, reference: 'UNKNOWN' });
    expect(parseVerticalLimit('500M MSL')).toMatchObject({ value: 500, unit: 'm', reference: 'MSL' });
    expect(parseVerticalLimit('GND').reference).toBe('SFC');
    expect(parseVerticalLimit('UNL').reference).toBe('UNL');
    expect(parseVerticalLimit('1500FT AAL').reference).toBe('UNKNOWN');
  });
  it('converts only reference-safe values', () => {
    expect(toFeetMsl(parseVerticalLimit('500M MSL'))).toBe(1640);
    expect(toFeetMsl(parseVerticalLimit('1000FT AGL'))).toBeNull();
    expect(toFeetMsl(parseVerticalLimit('FL100'))).toBeNull();
  });
  it('altitude band filter is conservative', () => {
    const sfc = parseVerticalLimit('SFC');
    const fl95 = parseVerticalLimit('FL095');
    expect(mayIntersectBand(sfc, fl95, 10000, 12000)).toBe(false);
    expect(mayIntersectBand(sfc, fl95, 3000, 5000)).toBe(true);
    // AGL cannot be compared — keep visible.
    expect(mayIntersectBand(parseVerticalLimit('1000FT AGL'), fl95, 15000, 20000)).toBe(true);
    expect(formatVerticalLimit(fl95)).toBe('FL095');
  });
});

describe('document validation', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7\n...');
  it('detects PDF signature', () => {
    expect(hasPdfSignature(pdf)).toBe(true);
    expect(hasPdfSignature(new TextEncoder().encode('<html>'))).toBe(false);
  });
  it('validates size and type', () => {
    expect(validatePdfCandidate(10, pdf)).toBeNull();
    expect(validatePdfCandidate(0, pdf)?.code).toBe('empty');
    expect(validatePdfCandidate(10, new Uint8Array([1, 2, 3, 4, 5, 6]))?.code).toBe('not-pdf');
    expect(validatePdfCandidate(400 * 1024 * 1024, pdf)?.code).toBe('too-large');
  });
  it('prevents path traversal', () => {
    expect(titleFromFilename('../../etc/passwd.pdf')).toBe('passwd');
    expect(titleFromFilename('C:\\x\\Doc.PDF')).toBe('Doc');
    expect(() => storedFileName('../evil')).toThrow();
    expect(storedFileName('0b7c9e3a-1111-4a2b-9c3d-123456789abc')).toBe('0b7c9e3a-1111-4a2b-9c3d-123456789abc.pdf');
    expect(isSafeRelativePath('documents/a.pdf')).toBe(true);
    expect(isSafeRelativePath('../a.pdf')).toBe(false);
    expect(isSafeRelativePath('/abs/a.pdf')).toBe(false);
  });
});

describe('route', () => {
  const pt = (ident: string, lat: number, lon: number): RoutePoint => ({
    id: ident,
    ident,
    name: null,
    kind: 'user',
    refId: null,
    position: { lat, lon },
  });
  it('computes legs, cumulative distance and ETE', () => {
    const r = computeRoute([pt('A', 0, 0), pt('B', 1, 0), pt('C', 1, 1)], 120, 5);
    expect(r.legs).toHaveLength(2);
    expect(r.legs[0]!.distanceNm).toBeCloseTo(60.04, 1);
    expect(r.legs[0]!.trueCourseDeg).toBeCloseTo(0, 6);
    expect(r.legs[0]!.magneticCourseDeg).toBeCloseTo(355, 6);
    expect(r.legs[1]!.cumulativeNm).toBeCloseTo(r.totalNm, 9);
    expect(r.totalEteMin).toBeCloseTo((r.totalNm / 120) * 60, 9);
    expect(formatCourse(0)).toBe('360');
  });
  it('omits ETE and magnetic course when inputs are unknown', () => {
    const r = computeRoute([pt('A', 0, 0), pt('B', 1, 0)], null, null);
    expect(r.legs[0]!.eteMin).toBeNull();
    expect(r.legs[0]!.magneticCourseDeg).toBeNull();
    expect(r.totalEteMin).toBeNull();
  });
});
