import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/app-state/AppContext';
import { useAsync } from '@/hooks/useAsync';
import { listNotams } from '@/infrastructure/database/notamRepository';
import { getSourceState } from '@/infrastructure/database/sourceRepository';
import { BACKEND_NOTAM_SOURCE_ID } from '@/providers/notams/backend';
import { evaluateAll, notamDatasetFreshness } from './notamData';

/** Clock that ticks every minute so lifecycle states update while the screen is open. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function useNotams() {
  const { db, revision } = useApp();
  const now = useMinuteClock();
  const q = useAsync(
    async () => ({ notams: await listNotams(db), provider: await getSourceState(db, BACKEND_NOTAM_SOURCE_ID) }),
    [db, revision],
  );
  const evaluated = useMemo(() => evaluateAll(q.data?.notams ?? [], now), [q.data, now]);
  const freshness = useMemo(
    () => notamDatasetFreshness(q.data?.notams ?? [], q.data?.provider ?? null, now),
    [q.data, now],
  );
  return { ...q, evaluated, freshness, now };
}
