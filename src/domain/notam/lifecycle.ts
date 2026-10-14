/**
 * NOTAM lifecycle evaluation.
 *
 * Validity is never derived from item C alone:
 *   - a later NOTAMR/NOTAMC referencing a NOTAM supersedes it;
 *   - PERM notices stay active until cancelled/replaced;
 *   - an EST (estimated) end that has passed does NOT make a NOTAM expired —
 *     ICAO requires a replacement or cancellation, so its state is "unknown"
 *     and the user is told why;
 *   - item D schedules are evaluated only for unambiguous forms (H24,
 *     "DAILY hhmm-hhmm"); otherwise the schedule is flagged as uninterpreted.
 */
import type { Notam, NotamLifecycle } from '../models/notam';
import { identityKey } from './parser';

export interface Supersession {
  kind: 'replaced' | 'cancelled';
  byDisplayId: string;
  byId: string;
  /** Item B of the superseding message (null if unknown). */
  effectiveFrom: string | null;
}

export interface LifecycleResult {
  state: NotamLifecycle;
  reasons: string[];
  supersededBy: Supersession | null;
  /** true/false when item D could be evaluated at `now`; null otherwise. */
  scheduleActiveNow: boolean | null;
}

/**
 * Builds an index of NOTAMs that have been replaced or cancelled by other
 * messages in the set. The reference is resolved within the same identity
 * context (Q-line FIR / location) as the referencing message.
 */
export function buildSupersessionIndex(notams: Notam[]): Map<string, Supersession> {
  const index = new Map<string, Supersession>();
  for (const n of notams) {
    if ((n.type !== 'REPLACE' && n.type !== 'CANCEL') || !n.referencedId || !n.displayId) continue;
    const key = identityKey({ displayId: n.referencedId, q: n.q, locations: n.locations });
    if (!key) continue;
    const existing = index.get(key);
    // A cancellation wins over a replacement; otherwise keep the first seen.
    if (!existing || (existing.kind === 'replaced' && n.type === 'CANCEL')) {
      index.set(key, {
        kind: n.type === 'CANCEL' ? 'cancelled' : 'replaced',
        byDisplayId: n.displayId,
        byId: n.id,
        effectiveFrom: n.validFrom.iso,
      });
    }
  }
  return index;
}

export function evaluateLifecycle(
  n: Notam,
  now: Date,
  index: Map<string, Supersession> = new Map(),
): LifecycleResult {
  const reasons: string[] = [];
  const key = identityKey(n);
  const sup = key ? (index.get(key) ?? null) : null;
  const scheduleActiveNow = n.schedule ? evaluateSchedule(n.schedule, now) : null;

  // Supersession applies once the superseding message is in force. If its B)
  // is in the future, this NOTAM stays in force until then (conservative: never hide early).
  const pending = sup?.effectiveFrom ? now.getTime() < Date.parse(sup.effectiveFrom) : false;
  if (sup && !pending) {
    reasons.push(`${sup.byDisplayId} ile ${sup.kind === 'cancelled' ? 'iptal edildi' : 'değiştirildi'}`);
    if (!sup.effectiveFrom) reasons.push('Yerine geçen mesajın başlangıç zamanı bilinmiyor');
    return { state: sup.kind, reasons, supersededBy: sup, scheduleActiveNow };
  }
  if (sup && pending) {
    reasons.push(
      `${sup.effectiveFrom!.slice(0, 16).replace('T', ' ')}Z itibarıyla ${sup.byDisplayId} ile ${sup.kind === 'cancelled' ? 'iptal edilecek' : 'değiştirilecek'}`,
    );
  }
  if (n.parseStatus === 'failed' || n.parseStatus === 'needs-review') {
    reasons.push('Mesaj güvenilir şekilde yorumlanamadı — orijinal metni inceleyin');
  }
  if (!n.validFrom.iso) {
    reasons.push('Başlangıç zamanı (B) bilinmiyor');
    return { state: 'unknown', reasons, supersededBy: null, scheduleActiveNow };
  }
  const t = now.getTime();
  if (t < Date.parse(n.validFrom.iso)) {
    return { state: 'future', reasons, supersededBy: null, scheduleActiveNow };
  }
  if (n.type === 'CANCEL') {
    reasons.push('İptal mesajı (NOTAMC)');
    return { state: 'active', reasons, supersededBy: null, scheduleActiveNow };
  }
  if (n.validTo.permanent) {
    reasons.push('PERM — iptal/değişiklik yayımlanana kadar yürürlükte');
    return withSchedule('active', reasons, scheduleActiveNow, n);
  }
  if (!n.validTo.iso) {
    reasons.push('Bitiş zamanı (C) bilinmiyor');
    return { state: 'unknown', reasons, supersededBy: null, scheduleActiveNow };
  }
  if (t > Date.parse(n.validTo.iso)) {
    if (n.validTo.estimated) {
      reasons.push('Tahmini (EST) bitiş geçti; NOTAMR/NOTAMC yayımlanmadıkça geçerlilik doğrulanamaz');
      return { state: 'unknown', reasons, supersededBy: null, scheduleActiveNow };
    }
    return { state: 'expired', reasons, supersededBy: null, scheduleActiveNow };
  }
  if (n.validTo.estimated) reasons.push('Bitiş zamanı tahmini (EST)');
  return withSchedule('active', reasons, scheduleActiveNow, n);
}

function withSchedule(
  state: NotamLifecycle,
  reasons: string[],
  scheduleActiveNow: boolean | null,
  n: Notam,
): LifecycleResult {
  if (n.schedule) {
    if (scheduleActiveNow === null) reasons.push(`Program (D) yorumlanmadı: "${n.schedule}"`);
    else if (!scheduleActiveNow) reasons.push(`Şu an program (D) dışında: "${n.schedule}"`);
  }
  return { state, reasons, supersededBy: null, scheduleActiveNow };
}

/**
 * Evaluates item D for a small set of unambiguous forms. Times are UTC.
 * Returns null for anything else (the caller must flag it).
 */
export function evaluateSchedule(schedule: string, now: Date): boolean | null {
  const s = schedule.trim().toUpperCase();
  if (s === 'H24') return true;
  const m = /^DAILY\s+(\d{4})\s*-\s*(\d{4})$/.exec(s);
  if (!m) return null;
  const start = hhmm(m[1]!);
  const end = hhmm(m[2]!);
  if (start === null || end === null) return null;
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  return start <= end ? cur >= start && cur <= end : cur >= start || cur <= end;
}

function hhmm(s: string): number | null {
  const h = Number(s.slice(0, 2));
  const m = Number(s.slice(2));
  if (h > 24 || m > 59 || (h === 24 && m !== 0)) return null;
  return h * 60 + m;
}

export const LIFECYCLE_LABELS: Record<NotamLifecycle, string> = {
  active: 'Yürürlükte',
  future: 'İleri tarihli',
  expired: 'Süresi doldu',
  cancelled: 'İptal edildi',
  replaced: 'Değiştirildi',
  unknown: 'Belirsiz — inceleyin',
};
