/**
 * Data provenance and freshness. Every record shown to the user must be
 * traceable to a data source and a retrieval time.
 */

/** How a piece of data entered the application. */
export type DataOrigin =
  | 'provider' // fetched from a documented provider adapter
  | 'manual-import' // pasted or imported by the user
  | 'user' // created by the user (routes, markers)
  | 'synthetic'; // explicitly labelled test/development data

/**
 * Freshness states shown in the UI. The UI must never present anything other
 * than `live` as verified current information.
 */
export type FreshnessState =
  | 'live' // synchronised within the live threshold
  | 'cached' // older than live threshold but within stale threshold
  | 'stale' // older than stale threshold
  | 'update-failed' // last attempt failed; showing previous data
  | 'unavailable' // source reachable state unknown/down and no data
  | 'not-configured' // no authorised source configured
  | 'manual-import' // user-imported; freshness cannot be verified
  | 'synthetic'; // simulated test data

export type SyncStatus = 'success' | 'partial' | 'failed' | 'running';

export interface Provenance {
  sourceId: string;
  /** Identifier of the record at the source, preserved verbatim. */
  sourceRecordId: string | null;
  origin: DataOrigin;
  /** ISO-8601 UTC timestamp of retrieval/import. */
  retrievedAt: string;
}

export type AccessRequirement = 'none' | 'api-key' | 'account' | 'agreement' | 'backend-required';

export type VerificationStatus = 'verified' | 'partial' | 'unverified' | 'blocked';

/** Static description of a data source; persisted in `data_sources`. */
export interface DataSourceDescriptor {
  id: string;
  name: string;
  documentationUrl: string;
  categories: string[];
  coverage: string;
  updateFrequency: string;
  access: AccessRequirement;
  license: string;
  attribution: string;
  /** Whether storing data offline on the device is permitted (null = unknown). */
  offlineStoragePermitted: boolean | null;
  redistributionPermitted: boolean | null;
  limitations: string[];
  verification: VerificationStatus;
}

export interface SyncRun {
  id: string;
  sourceId: string;
  startedAt: string;
  finishedAt: string | null;
  status: SyncStatus;
  recordsReceived: number;
  recordsStored: number;
  errorKind: string | null;
  errorMessage: string | null;
}
