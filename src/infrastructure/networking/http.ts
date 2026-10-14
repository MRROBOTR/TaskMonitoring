/**
 * HTTP helper with timeouts and error classification. All remote access goes
 * through here so failures are reported consistently to sync logic and UI.
 */
export type NetworkErrorKind =
  | 'offline'
  | 'timeout'
  | 'auth'
  | 'rate-limited'
  | 'server'
  | 'http'
  | 'cancelled'
  | 'unknown';

export class NetworkError extends Error {
  constructor(
    public readonly kind: NetworkErrorKind,
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  fetchImpl?: FetchLike;
}

export function classifyStatus(status: number): NetworkErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'server';
  return 'http';
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  if (!url.startsWith('https://')) throw new NetworkError('http', 'Only HTTPS URLs are allowed');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), opts.timeoutMs ?? 60_000);
  const onAbort = () => controller.abort(new Error('cancelled'));
  opts.signal?.addEventListener('abort', onAbort);
  const f = opts.fetchImpl ?? fetch;
  try {
    const res = await f(url, { signal: controller.signal, headers: opts.headers });
    if (!res.ok) throw new NetworkError(classifyStatus(res.status), `HTTP ${res.status} (${url})`, res.status);
    return await res.text();
  } catch (e) {
    if (e instanceof NetworkError) throw e;
    if (opts.signal?.aborted) throw new NetworkError('cancelled', 'İstek iptal edildi');
    if (controller.signal.aborted) throw new NetworkError('timeout', 'Zaman aşımı');
    const msg = e instanceof Error ? e.message : String(e);
    if (/network request failed|failed to fetch|network/i.test(msg)) throw new NetworkError('offline', 'Ağ bağlantısı yok');
    throw new NetworkError('unknown', msg);
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

export const NETWORK_ERROR_LABELS: Record<NetworkErrorKind, string> = {
  offline: 'Bağlantı yok',
  timeout: 'Zaman aşımı',
  auth: 'Yetkilendirme hatası (kimlik bilgisi geçersiz veya süresi dolmuş)',
  'rate-limited': 'İstek sınırı aşıldı',
  server: 'Sunucu hatası',
  http: 'HTTP hatası',
  cancelled: 'İptal edildi',
  unknown: 'Bilinmeyen hata',
};
