import type { Notam } from '@/domain/models/notam';
import type { FreshnessState } from '@/domain/models/provenance';
import { buildSupersessionIndex, evaluateLifecycle, type LifecycleResult } from '@/domain/notam/lifecycle';
import { qCodeGroup, type NotamCategory } from '@/domain/notam/qcodes';
import { DEFAULT_THRESHOLDS, evaluateFreshness } from '@/domain/services/freshness';

export interface EvaluatedNotam {
  notam: Notam;
  life: LifecycleResult;
  category: NotamCategory;
}

export function evaluateAll(notams: Notam[], now: Date): EvaluatedNotam[] {
  const index = buildSupersessionIndex(notams);
  return notams.map((notam) => ({
    notam,
    life: evaluateLifecycle(notam, now, index),
    category: qCodeGroup(notam.q?.code).category,
  }));
}

export interface NotamFilter {
  text: string;
  location: string;
  states: Set<LifecycleResult['state']>;
  categories: Set<NotamCategory>;
  mappableOnly?: boolean;
  needsReviewOnly?: boolean;
}

export function filterNotams(items: EvaluatedNotam[], f: NotamFilter): EvaluatedNotam[] {
  const text = f.text.trim().toUpperCase();
  const loc = f.location.trim().toUpperCase();
  return items.filter(({ notam: n, life, category }) => {
    if (!f.states.has(life.state)) return false;
    if (!f.categories.has(category)) return false;
    if (f.mappableOnly && !n.geometry) return false;
    if (f.needsReviewOnly && n.parseStatus !== 'needs-review' && n.parseStatus !== 'failed') return false;
    if (loc && !(n.q?.fir === loc || n.locations.includes(loc))) return false;
    if (text && !(n.raw.toUpperCase().includes(text) || (n.displayId ?? '').includes(text))) return false;
    return true;
  });
}

/**
 * Freshness of the NOTAM dataset as a whole. Manual and synthetic datasets
 * are labelled as such regardless of age, so they are never shown as live.
 */
export function notamDatasetFreshness(
  notams: Notam[],
  provider: { configured: boolean; lastSuccessAt: string | null; lastAttemptAt: string | null; lastAttemptFailed: boolean } | null,
  now: Date,
): { state: FreshnessState; lastSuccessAt: string | null; source: string } {
  if (notams.length === 0 && !provider?.configured) return { state: 'not-configured', lastSuccessAt: null, source: '—' };
  const origins = new Set(notams.map((n) => n.provenance.origin));
  const latest = notams.reduce<string | null>(
    (acc, n) => (acc === null || n.provenance.retrievedAt > acc ? n.provenance.retrievedAt : acc),
    null,
  );
  if (origins.has('synthetic')) return { state: 'synthetic', lastSuccessAt: latest, source: 'Simüle test verisi' };
  if (!origins.has('provider')) return { state: 'manual-import', lastSuccessAt: latest, source: 'Manuel içe aktarım' };
  const state = evaluateFreshness(
    {
      configured: provider?.configured ?? false,
      origin: 'provider',
      lastSuccessAt: provider?.lastSuccessAt ?? null,
      lastAttemptAt: provider?.lastAttemptAt ?? null,
      lastAttemptFailed: provider?.lastAttemptFailed ?? false,
      hasData: notams.length > 0,
    },
    DEFAULT_THRESHOLDS.notam,
    now,
  );
  return { state, lastSuccessAt: provider?.lastSuccessAt ?? null, source: 'Sağlayıcı' };
}
