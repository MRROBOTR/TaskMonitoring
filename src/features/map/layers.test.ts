import { parseNotam } from '@/domain/notam/parser';
import { evaluateLifecycle } from '@/domain/notam/lifecycle';
import { CANCEL_RWY, CIRCLE_AREA, FIR_WIDE, NEW_RWY_CLOSED, SYNTHETIC_SOURCE } from '@/test/fixtures/notams.synthetic';
import type { Airport, Navaid, Runway } from '@/domain/models/aviation';
import {
  airportFeatures,
  DEFAULT_LAYER_VISIBILITY,
  LAYERS,
  navaidFeatures,
  notamFeatures,
  routeFeatures,
  runwayFeatures,
  visibleNavaidTypes,
} from './layers';

const prov = { sourceId: 's', sourceRecordId: '1', origin: 'provider' as const, retrievedAt: 'x' };

describe('map feature builders', () => {
  it('emits [lon, lat] ordering', () => {
    const a: Airport = {
      id: 'a1', ident: 'TEST', icao: null, iata: null, localCode: null, name: 'Test', type: 'large_airport',
      position: { lat: 41.2, lon: 28.7 }, elevationFt: null, country: null, region: null, municipality: null,
      frequencies: [], provenance: prov,
    };
    const f = airportFeatures([a]).features[0]!;
    expect((f.geometry as GeoJSON.Point).coordinates).toEqual([28.7, 41.2]);
    expect(f.properties).toMatchObject({ kind: 'airport', ident: 'TEST', rank: 3 });
  });

  it('labels navaids with formatted frequency and preserves type', () => {
    const n: Navaid = {
      id: 'n1', ident: 'IST', name: 'Istanbul', type: 'VORTAC', sourceType: 'VORTAC', position: { lat: 41, lon: 28.8 },
      frequencyKhz: 112500, dmeChannel: null, dmeFrequencyKhz: null, elevationFt: null, country: 'TR',
      magneticVariationDeg: null, usage: null, power: null, associatedAirport: null, provenance: prov,
    };
    expect(navaidFeatures([n]).features[0]!.properties).toMatchObject({ navType: 'VORTAC', label: 'IST 112.50 MHz' });
  });

  it('draws runways only when both ends have coordinates and runway is open', () => {
    const end = (lat: number | null) => ({
      ident: 'X', position: lat === null ? null : { lat, lon: 29 }, elevationFt: null, headingTrueDeg: null, displacedThresholdFt: null,
    });
    const base: Runway = { id: 'r', airportId: 'a', lengthFt: 1, widthFt: 1, surface: null, lighted: null, closed: false, le: end(41), he: end(41.01), provenance: prov };
    expect(runwayFeatures([base, { ...base, id: 'r2', he: end(null) }, { ...base, id: 'r3', closed: true }]).features).toHaveLength(1);
  });

  it('maps NOTAMs by lifecycle and excludes cancellations and unmapped notices', () => {
    const ctx = { sourceId: SYNTHETIC_SOURCE, origin: 'synthetic' as const, retrievedAt: 'x' };
    const now = new Date('2026-10-14T10:00:00Z');
    const items = [NEW_RWY_CLOSED, CIRCLE_AREA, CANCEL_RWY, FIR_WIDE].map((s) => {
      const notam = parseNotam(s, ctx);
      return { notam, lifecycle: evaluateLifecycle(notam, now).state };
    });
    const r = notamFeatures(items);
    expect(r.areas.features).toHaveLength(2);
    expect(r.unmapped).toBe(1); // FIR-wide notice listed, not mapped
    const conf = r.areas.features.map((f) => f.properties!.confidence).sort();
    expect(conf).toEqual(['approximate', 'confirmed']);
    const expired = items.map((i) => ({ ...i, lifecycle: 'expired' as const }));
    expect(notamFeatures(expired).areas.features).toHaveLength(0);
    expect(notamFeatures(expired, true).areas.features).toHaveLength(2);
  });

  it('route line + points', () => {
    const p = (ident: string, lat: number) => ({ id: ident, ident, name: null, kind: 'user' as const, refId: null, position: { lat, lon: 29 } });
    expect(routeFeatures([p('A', 40)]).features).toHaveLength(1);
    expect(routeFeatures([p('A', 40), p('B', 41)]).features).toHaveLength(3);
  });

  it('marks layers without sources as unavailable and off by default', () => {
    for (const l of LAYERS) {
      if (l.unavailableReason) expect(DEFAULT_LAYER_VISIBILITY[l.id]).toBe(false);
    }
    expect(visibleNavaidTypes({ ...DEFAULT_LAYER_VISIBILITY, dme: false })).not.toContain('TACAN');
  });
});
