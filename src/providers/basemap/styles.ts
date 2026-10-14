/**
 * Basemap configuration. Map styles are kept separate from aviation layers.
 *
 * OpenFreeMap public instance (https://openfreemap.org, MIT code, OSM data):
 *  - no API key, no registration, no stated request caps (README, 2026-10);
 *  - attribution required (rendered automatically by MapLibre from the style);
 *  - offline bulk prefetch is NOT addressed in its terms → offline packs are
 *    limited to small user-selected regions and documented as "permission
 *    not verified".
 */
import type { DataSourceDescriptor } from '@/domain/models/provenance';

export interface BasemapStyle {
  id: string;
  name: string;
  url: string;
  attribution: string;
}

export const BASEMAP_STYLES: BasemapStyle[] = [
  {
    id: 'ofm-liberty',
    name: 'OpenFreeMap Liberty',
    url: 'https://tiles.openfreemap.org/styles/liberty',
    attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  },
  {
    id: 'ofm-positron',
    name: 'OpenFreeMap Positron (sade)',
    url: 'https://tiles.openfreemap.org/styles/positron',
    attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  },
  {
    id: 'ofm-dark',
    name: 'OpenFreeMap Dark',
    url: 'https://tiles.openfreemap.org/styles/dark',
    attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  },
];

export const DEFAULT_STYLE = BASEMAP_STYLES[0]!;

export function styleById(id: string | null | undefined): BasemapStyle {
  return BASEMAP_STYLES.find((s) => s.id === id) ?? DEFAULT_STYLE;
}

/** Hard limits for user-created offline packs (respecting a free community service). */
export const OFFLINE_LIMITS = {
  maxZoom: 12,
  maxAreaDeg2: 16, // ~ 4° x 4°
  maxTiles: 20_000,
};

/** Estimated tile count for a bbox and zoom range (Web Mercator XYZ). */
export function estimateTileCount(bounds: [number, number, number, number], minZoom: number, maxZoom: number): number {
  const [w, s, e, n] = bounds;
  const lat2y = (lat: number, z: number) => {
    const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  };
  const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
  let total = 0;
  for (let z = Math.floor(minZoom); z <= Math.floor(maxZoom); z++) {
    const xs = Math.abs(lon2x(e, z) - lon2x(w, z)) + 1;
    const ys = Math.abs(lat2y(s, z) - lat2y(n, z)) + 1;
    total += xs * ys;
  }
  return total;
}

export const OPENFREEMAP_DESCRIPTOR: DataSourceDescriptor = {
  id: 'openfreemap',
  name: 'OpenFreeMap (basemap)',
  documentationUrl: 'https://openfreemap.org/',
  categories: ['basemap'],
  coverage: 'Dünya geneli (OpenStreetMap)',
  updateFrequency: 'Düzenli planet karo üretimi (sürümler README\'de listelenir)',
  access: 'none',
  license: 'OpenFreeMap kodu MIT; harita verisi © OpenStreetMap katkıcıları (ODbL)',
  attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  offlineStoragePermitted: null,
  redistributionPermitted: null,
  limitations: [
    'Toplu çevrimdışı indirme koşulları belgelenmemiş; yalnızca küçük bölgeler indirilir.',
    'Havacılık haritası değildir (VFR/IFR chart yerine geçmez).',
  ],
  verification: 'partial',
};
