import {
  CANCEL_RWY,
  CIRCLE_AREA,
  EST_END,
  NEW_RWY_CLOSED,
  PERM_NAVAID,
  POLYGON_AREA,
  REPLACE_RWY,
  SYNTHETIC_SOURCE,
} from '../../test/fixtures/notams.synthetic';
import { buildSupersessionIndex, evaluateLifecycle, evaluateSchedule } from './lifecycle';
import { parseNotam } from './parser';

const ctx = { sourceId: SYNTHETIC_SOURCE, origin: 'synthetic' as const, retrievedAt: '2026-10-14T00:00:00.000Z' };
const p = (s: string) => parseNotam(s, ctx);

describe('evaluateLifecycle', () => {
  it('distinguishes future, active and expired', () => {
    const n = p(NEW_RWY_CLOSED);
    expect(evaluateLifecycle(n, new Date('2026-10-14T05:59:00Z')).state).toBe('future');
    expect(evaluateLifecycle(n, new Date('2026-10-15T00:00:00Z')).state).toBe('active');
    expect(evaluateLifecycle(n, new Date('2026-10-20T18:01:00Z')).state).toBe('expired');
  });

  it('marks a NOTAM replaced by a NOTAMR even before its own end time', () => {
    const a = p(NEW_RWY_CLOSED);
    const r = p(REPLACE_RWY);
    const index = buildSupersessionIndex([a, r]);
    const res = evaluateLifecycle(a, new Date('2026-10-15T12:00:00Z'), index);
    expect(res.state).toBe('replaced');
    expect(res.supersededBy?.byDisplayId).toBe('A0102/26');
    expect(evaluateLifecycle(r, new Date('2026-10-15T12:00:00Z'), index).state).toBe('active');
  });

  it('keeps the original in force until the replacement\'s own start time', () => {
    const a = p(NEW_RWY_CLOSED); // B 14 Oct 06:00
    const r = p(REPLACE_RWY); // B 15 Oct 06:00
    const index = buildSupersessionIndex([a, r]);
    const before = evaluateLifecycle(a, new Date('2026-10-14T12:00:00Z'), index);
    expect(before.state).toBe('active');
    expect(before.reasons.join(' ')).toMatch(/A0102\/26 ile değiştirilecek/);
    expect(evaluateLifecycle(a, new Date('2026-10-15T06:00:00Z'), index).state).toBe('replaced');
  });

  it('marks a NOTAM cancelled by a NOTAMC, and cancellation wins over replacement', () => {
    const a = p(NEW_RWY_CLOSED);
    const r = p(REPLACE_RWY);
    const c = p(CANCEL_RWY);
    const index = buildSupersessionIndex([a, r, c]);
    expect(evaluateLifecycle(r, new Date('2026-10-16T12:00:00Z'), index).state).toBe('cancelled');
    // A0101 is replaced (its replacement was later cancelled — chain preserved).
    expect(evaluateLifecycle(a, new Date('2026-10-16T12:00:00Z'), index).state).toBe('replaced');
  });

  it('keeps PERM notices active far into the future', () => {
    const n = p(PERM_NAVAID);
    expect(evaluateLifecycle(n, new Date('2030-01-01T00:00:00Z')).state).toBe('active');
  });

  it('does not expire an EST notice automatically once its estimate has passed', () => {
    const n = p(EST_END);
    const res = evaluateLifecycle(n, new Date('2026-10-06T00:00:00Z'));
    expect(res.state).toBe('unknown');
    expect(res.reasons.join(' ')).toMatch(/EST/);
    expect(evaluateLifecycle(n, new Date('2026-10-03T00:00:00Z')).state).toBe('active');
  });

  it('reports schedule state for DAILY windows without changing validity', () => {
    const n = p(POLYGON_AREA);
    const inside = evaluateLifecycle(n, new Date('2026-10-20T10:00:00Z'));
    const outside = evaluateLifecycle(n, new Date('2026-10-20T20:00:00Z'));
    expect(inside.state).toBe('active');
    expect(inside.scheduleActiveNow).toBe(true);
    expect(outside.state).toBe('active');
    expect(outside.scheduleActiveNow).toBe(false);
    expect(outside.reasons.join(' ')).toMatch(/program/i);
  });

  it('treats time comparisons in UTC independent of local timezone', () => {
    const n = p(CIRCLE_AREA); // 0800-1600Z
    // 10:59 local (+03:00) is 07:59Z — still before B) 0800Z.
    expect(evaluateLifecycle(n, new Date('2026-10-14T10:59:00+03:00')).state).toBe('future');
    expect(evaluateLifecycle(n, new Date('2026-10-14T11:01:00+03:00')).state).toBe('active');
    expect(evaluateLifecycle(n, new Date('2026-10-14T16:01:00Z')).state).toBe('expired');
  });
});

describe('evaluateSchedule', () => {
  it('handles H24, DAILY windows including midnight wrap, and unknown forms', () => {
    expect(evaluateSchedule('H24', new Date())).toBe(true);
    expect(evaluateSchedule('DAILY 2200-0400', new Date('2026-10-14T23:00:00Z'))).toBe(true);
    expect(evaluateSchedule('DAILY 2200-0400', new Date('2026-10-14T12:00:00Z'))).toBe(false);
    expect(evaluateSchedule('MON-FRI 0600-1400', new Date())).toBeNull();
  });
});
