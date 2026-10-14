import {
  BAD_DATES,
  BULLETIN,
  CANCEL_RWY,
  CIRCLE_AREA,
  EST_END,
  FIR_WIDE,
  GARBAGE,
  NEW_RWY_CLOSED,
  PERM_NAVAID,
  POLYGON_AREA,
  REPLACE_RWY,
  SYNTHETIC_SOURCE,
} from '../../test/fixtures/notams.synthetic';
import { validatePolygon, ringSignedArea } from '../services/geo';
import { parseNotam, parseNotamDateTime, parseQLine, splitBulletin, splitItems } from './parser';

const ctx = { sourceId: SYNTHETIC_SOURCE, origin: 'synthetic' as const, retrievedAt: '2026-10-14T00:00:00.000Z' };

describe('parseNotamDateTime', () => {
  it('parses YYMMDDhhmm as UTC', () => {
    expect(parseNotamDateTime('2610140600')).toBe('2026-10-14T06:00:00.000Z');
  });
  it('rejects out-of-range values instead of rolling over', () => {
    expect(parseNotamDateTime('2613320000')).toBeNull();
    expect(parseNotamDateTime('2602310000')).toBeNull(); // 31 Feb
    expect(parseNotamDateTime('2610142460')).toBeNull();
  });
});

describe('parseQLine', () => {
  it('extracts all fields with correct coordinate sign and order', () => {
    const flags: string[] = [];
    const q = parseQLine('XXAA/QMRLC/IV/NBO/A/000/999/4100N02900E005', flags);
    expect(flags).toEqual([]);
    expect(q).toMatchObject({
      fir: 'XXAA',
      code: 'QMRLC',
      subject: 'MR',
      condition: 'LC',
      traffic: 'IV',
      purpose: 'NBO',
      scope: 'A',
      lowerFl: 0,
      upperFl: 999,
      radiusNm: 5,
    });
    expect(q!.centre!.lat).toBeCloseTo(41, 6);
    expect(q!.centre!.lon).toBeCloseTo(29, 6);
  });
  it('handles southern/western hemispheres', () => {
    const q = parseQLine('XXAA/QMRLC/IV/NBO/A/000/999/3330S07045W010', []);
    expect(q!.centre!.lat).toBeCloseTo(-33.5, 6);
    expect(q!.centre!.lon).toBeCloseTo(-70.75, 6);
  });
  it('flags incomplete Q lines', () => {
    const flags: string[] = [];
    expect(parseQLine('XXAA/QMRLC', flags)).toBeNull();
    expect(flags).toContain('q-line-incomplete');
  });
});

describe('splitItems', () => {
  it('keeps item E intact up to F)', () => {
    const items = splitItems('Q) X A) XXBB B) 2610140600 C) PERM E) TEXT WITH (BRACKETS) F) SFC G) FL100');
    expect(items.E).toBe('TEXT WITH (BRACKETS)');
    expect(items.F).toBe('SFC');
    expect(items.G).toBe('FL100');
  });
});

describe('parseNotam', () => {
  it('parses a NEW NOTAM and preserves the raw message', () => {
    const n = parseNotam(NEW_RWY_CLOSED, ctx);
    expect(n.parseStatus).toBe('parsed');
    expect(n.type).toBe('NEW');
    expect(n.displayId).toBe('A0101/26');
    expect(n.series).toBe('A');
    expect(n.number).toBe(101);
    expect(n.year).toBe(2026);
    expect(n.locations).toEqual(['XXBB']);
    expect(n.validFrom.iso).toBe('2026-10-14T06:00:00.000Z');
    expect(n.validTo.iso).toBe('2026-10-20T18:00:00.000Z');
    expect(n.text).toBe('RWY 16/34 CLSD DUE TO MAINT.');
    expect(n.raw).toBe(NEW_RWY_CLOSED);
    expect(n.id).toBe(`${SYNTHETIC_SOURCE}:XXAA:A0101/26`);
    expect(n.provenance.origin).toBe('synthetic');
    // Synthetic/manual data is never marked as verified.
    expect(n.lastVerifiedAt).toBeNull();
  });

  it('parses replacement and cancellation references', () => {
    const r = parseNotam(REPLACE_RWY, ctx);
    expect(r.type).toBe('REPLACE');
    expect(r.referencedId).toBe('A0101/26');
    const c = parseNotam(CANCEL_RWY, ctx);
    expect(c.type).toBe('CANCEL');
    expect(c.referencedId).toBe('A0102/26');
    expect(c.geometry).toBeNull();
    expect(c.parseStatus).toBe('parsed');
  });

  it('derives an approximate circle from the Q line when E has no geometry', () => {
    const n = parseNotam(NEW_RWY_CLOSED, ctx);
    expect(n.geometry?.kind).toBe('circle');
    expect(n.geometry?.confidence).toBe('approximate');
    expect(n.geometry?.origin).toBe('q-line');
    expect(n.geometry?.radiusNm).toBe(5);
  });

  it('uses an explicit polygon from item E as confirmed geometry', () => {
    const n = parseNotam(POLYGON_AREA, ctx);
    expect(n.geometry?.kind).toBe('polygon');
    expect(n.geometry?.confidence).toBe('confirmed');
    const poly = n.geometry!.geometry as GeoJSON.Polygon;
    expect(validatePolygon(poly)).toEqual([]);
    // GeoJSON order is [lon, lat]
    expect(poly.coordinates[0]![0]).toEqual([29, 41]);
    expect(poly.coordinates[0]![1]![1]).toBeCloseTo(41 + 10 / 60, 6);
    expect(n.lower?.reference).toBe('SFC');
    expect(n.upper).toMatchObject({ reference: 'FL', value: 95 });
    expect(n.schedule).toBe('DAILY 0600-1500');
  });

  it('uses an explicit circle from item E as confirmed geometry', () => {
    const n = parseNotam(CIRCLE_AREA, ctx);
    expect(n.geometry?.kind).toBe('circle');
    expect(n.geometry?.origin).toBe('item-e-circle');
    expect(n.geometry?.confidence).toBe('confirmed');
    expect(n.geometry?.radiusNm).toBe(2);
    expect(n.geometry?.centre?.lat).toBeCloseTo(41 + 10 / 60, 6);
    expect(n.upper).toMatchObject({ value: 4000, unit: 'ft', reference: 'MSL' });
    const ring = (n.geometry!.geometry as GeoJSON.Polygon).coordinates[0]!;
    expect(ringSignedArea(ring)).toBeGreaterThan(0); // counter-clockwise exterior ring
  });

  it('does not invent geometry for FIR-wide notices', () => {
    const n = parseNotam(FIR_WIDE, ctx);
    expect(n.geometry).toBeNull();
    expect(n.qualityFlags).toContain('fir-wide');
  });

  it('handles PERM and EST', () => {
    const p = parseNotam(PERM_NAVAID, ctx);
    expect(p.validTo.permanent).toBe(true);
    expect(p.validTo.iso).toBeNull();
    const e = parseNotam(EST_END, ctx);
    expect(e.validTo.estimated).toBe(true);
    expect(e.validTo.iso).toBe('2026-10-05T00:00:00.000Z');
  });

  it('marks invalid dates as needing review rather than discarding', () => {
    const n = parseNotam(BAD_DATES, ctx);
    expect(n.parseStatus).toBe('needs-review');
    expect(n.qualityFlags).toContain('item-b-invalid-datetime');
    expect(n.validFrom.iso).toBeNull();
    expect(n.raw).toBe(BAD_DATES);
  });

  it('keeps unrecognisable input as a failed record with the original text', () => {
    const n = parseNotam(GARBAGE, ctx);
    expect(n.parseStatus).toBe('failed');
    expect(n.raw).toBe(GARBAGE);
    expect(n.geometry).toBeNull();
    expect(n.id).toMatch(/^synthetic-fixtures:raw:[0-9a-f]{8}$/);
  });
});

describe('splitBulletin', () => {
  it('splits multiple messages', () => {
    const parts = splitBulletin(BULLETIN);
    expect(parts).toHaveLength(4);
    expect(parts[1]).toContain('A0102/26 NOTAMR');
  });
  it('returns a single block for unrecognised text', () => {
    expect(splitBulletin(GARBAGE)).toEqual([GARBAGE]);
    expect(splitBulletin('   ')).toEqual([]);
  });
});
