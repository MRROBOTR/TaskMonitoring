/**
 * NOTAM provider that talks to an (optional, future) ATLAS synchronisation
 * backend. The backend — not the mobile app — would hold provider
 * credentials (e.g. FAA NMS-API client secrets) and return ICAO-format
 * messages. This is ATLAS's own contract, documented in docs/NOTAM_PIPELINE.md;
 * no such server exists yet, so this adapter is BLOCKED until one is deployed.
 *
 * Contract (GET {baseUrl}/v1/notams?locations=XXXX,YYYY):
 *   200 { "source": string, "retrievedAt": ISO-8601,
 *         "items": [{ "providerId": string, "icao": string }] }
 */
import type { Notam } from '@/domain/models/notam';
import { parseNotam } from '@/domain/notam/parser';
import { fetchText, type FetchOptions } from '@/infrastructure/networking/http';
import { SchemaError } from '../aviation/csv';

export const BACKEND_NOTAM_SOURCE_ID = 'atlas-backend-notam';

interface BackendPayload {
  source: string;
  retrievedAt: string;
  items: { providerId: string; icao: string }[];
}

export function validateBackendPayload(json: unknown): BackendPayload {
  const p = json as Partial<BackendPayload> | null;
  if (!p || typeof p !== 'object') throw new SchemaError('Payload is not an object');
  if (typeof p.source !== 'string' || typeof p.retrievedAt !== 'string' || Number.isNaN(Date.parse(p.retrievedAt))) {
    throw new SchemaError('Missing source/retrievedAt');
  }
  if (!Array.isArray(p.items)) throw new SchemaError('items must be an array');
  for (const it of p.items) {
    if (!it || typeof it.providerId !== 'string' || typeof it.icao !== 'string') throw new SchemaError('Invalid item');
  }
  return p as BackendPayload;
}

export async function fetchBackendNotams(
  baseUrl: string,
  locations: string[],
  opts: FetchOptions = {},
): Promise<Notam[]> {
  const locs = locations.filter((l) => /^[A-Z]{4}$/.test(l));
  if (locs.length === 0) return [];
  const url = `${baseUrl.replace(/\/$/, '')}/v1/notams?locations=${encodeURIComponent(locs.join(','))}`;
  const payload = validateBackendPayload(JSON.parse(await fetchText(url, opts)));
  return payload.items.map((it) =>
    parseNotam(it.icao, {
      sourceId: BACKEND_NOTAM_SOURCE_ID,
      origin: 'provider',
      retrievedAt: payload.retrievedAt,
      providerId: it.providerId,
    }),
  );
}
