import { parseCsv, parseCsvRows, SchemaError } from './aviation/csv';
import { validateBackendPayload } from './notams/backend';
import { parseManualNotams } from './notams/manualImport';
import { ALL_SOURCES } from './registry';
import { estimateTileCount, OFFLINE_LIMITS, styleById } from './basemap/styles';
import { BULLETIN } from '@/test/fixtures/notams.synthetic';

describe('csv', () => {
  it('handles quotes, escaped quotes, embedded newlines, CRLF and BOM', () => {
    const rows = parseCsvRows('﻿"a","b"\r\n"x, y","he said ""hi"""\n1,"multi\nline"\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
      ['1', 'multi\nline'],
    ]);
  });
  it('maps by header and validates required columns', () => {
    expect(parseCsv('id,name\n1,A\n2,', ['id'])).toEqual([{ id: '1', name: 'A' }, { id: '2', name: '' }]);
    expect(() => parseCsv('id\n1', ['id', 'name'])).toThrow(SchemaError);
  });
  it('rejects unterminated quotes', () => {
    expect(() => parseCsvRows('"abc')).toThrow();
  });
});

describe('manual NOTAM import', () => {
  it('counts parse results', () => {
    const r = parseManualNotams(BULLETIN, '2026-10-14T00:00:00Z');
    expect(r.notams).toHaveLength(4);
    expect(r.counts.parsed).toBe(4);
  });
});

describe('backend payload validation', () => {
  it('accepts the documented contract and rejects others', () => {
    expect(validateBackendPayload({ source: 'x', retrievedAt: '2026-10-14T00:00:00Z', items: [{ providerId: '1', icao: 'A' }] }).items).toHaveLength(1);
    expect(() => validateBackendPayload({ source: 'x', retrievedAt: 'nope', items: [] })).toThrow(SchemaError);
    expect(() => validateBackendPayload({ source: 'x', retrievedAt: '2026-10-14T00:00:00Z', items: [{}] })).toThrow(SchemaError);
    expect(() => validateBackendPayload(null)).toThrow(SchemaError);
  });
});

describe('registry', () => {
  it('has unique ids and never claims verification for blocked providers', () => {
    const ids = ALL_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of ALL_SOURCES) {
      if (s.access === 'backend-required' || s.access === 'agreement') expect(s.verification).toBe('blocked');
      expect(s.documentationUrl.length).toBeGreaterThan(0);
    }
  });
});

describe('basemap', () => {
  it('estimates tile counts and enforces sane limits', () => {
    expect(estimateTileCount([28, 40, 30, 42], 0, 0)).toBe(1);
    const z10 = estimateTileCount([28, 40, 30, 42], 5, 10);
    expect(z10).toBeGreaterThan(30);
    expect(z10).toBeLessThan(OFFLINE_LIMITS.maxTiles);
    expect(styleById('nope').id).toBe('ofm-liberty');
  });
});
