import { useCallback, useEffect, useEffectEvent, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

interface Settled<T> {
  token: object | null;
  data: T | undefined;
  error: Error | null;
}

/**
 * Runs an async loader whenever `deps` change. Previous data stays visible
 * while reloading; results of superseded runs are discarded.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  // A fresh object identity per deps change identifies the current request
  // (React's "adjust state when a prop changes" pattern, no effect needed).
  const [prevDeps, setPrevDeps] = useState(deps);
  const [token, setToken] = useState<object>(() => ({}));
  if (prevDeps.length !== deps.length || prevDeps.some((d, i) => !Object.is(d, deps[i]))) {
    setPrevDeps(deps);
    setToken({});
  }
  const load = useEffectEvent(fn);
  const [settled, setSettled] = useState<Settled<T>>({ token: null, data: undefined, error: null });

  useEffect(() => {
    let active = true;
    load().then(
      (data) => active && setSettled({ token, data, error: null }),
      (e: unknown) =>
        active && setSettled((s) => ({ token, data: s.data, error: e instanceof Error ? e : new Error(String(e)) })),
    );
    return () => {
      active = false;
    };
  }, [token]);

  const reload = useCallback(() => setToken({}), []);
  return { data: settled.data, error: settled.error, loading: settled.token !== token, reload };
}
