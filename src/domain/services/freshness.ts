import type { DataOrigin, FreshnessState } from '../models/provenance';

export interface FreshnessThresholds {
  /** Data younger than this is considered live (ms). */
  liveMs: number;
  /** Data older than this is stale (ms). */
  staleMs: number;
}

export const DEFAULT_THRESHOLDS: Record<'notam' | 'reference', FreshnessThresholds> = {
  // NOTAMs change continuously; 30 min "live", 6 h before stale.
  notam: { liveMs: 30 * 60_000, staleMs: 6 * 3_600_000 },
  // Reference data (airports, navaids) is updated on AIRAC/daily cadence.
  reference: { liveMs: 24 * 3_600_000, staleMs: 28 * 24 * 3_600_000 },
};

export interface FreshnessInput {
  configured: boolean;
  origin: DataOrigin | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastAttemptFailed: boolean;
  hasData: boolean;
}

/**
 * Computes the freshness state shown to the user. Pure function; the order of
 * checks matters: synthetic/manual data is never upgraded to "live".
 */
export function evaluateFreshness(
  input: FreshnessInput,
  thresholds: FreshnessThresholds,
  now: Date = new Date(),
): FreshnessState {
  if (input.origin === 'synthetic') return 'synthetic';
  if (input.origin === 'manual-import') return 'manual-import';
  if (!input.configured) return input.hasData ? 'stale' : 'not-configured';
  if (!input.hasData || !input.lastSuccessAt) {
    return input.lastAttemptFailed ? 'unavailable' : 'not-configured';
  }
  const success = Date.parse(input.lastSuccessAt);
  if (Number.isNaN(success)) return 'stale';
  const attempt = input.lastAttemptAt ? Date.parse(input.lastAttemptAt) : NaN;
  const age = now.getTime() - success;

  if (age > thresholds.staleMs) return 'stale';
  // A failed attempt newer than the last success means we could not confirm.
  if (input.lastAttemptFailed && !Number.isNaN(attempt) && attempt >= success) return 'update-failed';
  if (age <= thresholds.liveMs && age >= -60_000) return 'live';
  return 'cached';
}

export const FRESHNESS_LABELS: Record<FreshnessState, string> = {
  live: 'Güncel (senkronize)',
  cached: 'Önbellek (eşik içinde)',
  stale: 'ESKİ VERİ',
  'update-failed': 'Güncelleme başarısız',
  unavailable: 'Kaynak erişilemez',
  'not-configured': 'Yetkili kaynak yapılandırılmadı',
  'manual-import': 'Manuel içe aktarım (doğrulanmadı)',
  synthetic: 'SİMÜLE TEST VERİSİ',
};

/** States that must be rendered with a warning style. */
export function isWarningState(s: FreshnessState): boolean {
  return s !== 'live' && s !== 'cached';
}

export function formatAge(fromIso: string | null, now: Date = new Date()): string {
  if (!fromIso) return 'hiç';
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return 'bilinmiyor';
  const mins = Math.round((now.getTime() - t) / 60_000);
  if (mins < 1) return 'az önce';
  if (mins < 60) return `${mins} dk önce`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}
