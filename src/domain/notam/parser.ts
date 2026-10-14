/**
 * Parser for ICAO-format NOTAMs (ICAO Annex 15 / PANS-AIM Doc 10066 format):
 *
 *   A1234/26 NOTAMN
 *   Q) LTAA/QMRLC/IV/NBO/A/000/999/4058N02849E005
 *   A) LTFM B) 2610140600 C) 2610201800 EST
 *   D) ...  E) free text  F) lower  G) upper
 *
 * The parser never throws for malformed input: it returns a Notam whose
 * parseStatus/qualityFlags describe what could not be understood, and it
 * always keeps the original text.
 */
import type { Notam, NotamTime, NotamType, ParseStatus, QLine } from '../models/notam';
import type { Provenance } from '../models/provenance';
import { parseVerticalLimit } from '../services/verticalLimits';
import { parseCoordinate } from './coordinates';
import { interpretGeometry } from './geometry';

export interface ParseContext {
  sourceId: string;
  origin: Provenance['origin'];
  retrievedAt: string;
  providerId?: string | null;
}

const HEADER =
  /^\s*([A-Z])(\d{4})\/(\d{2})\s+NOTAM([NRC])(?:\s+([A-Z])(\d{4})\/(\d{2}))?/;

const ITEM_ORDER = ['Q', 'A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
type ItemKey = (typeof ITEM_ORDER)[number];

/** Splits a message into its lettered items, respecting canonical order. */
export function splitItems(body: string): Partial<Record<ItemKey, string>> {
  const found: { key: ItemKey; start: number; contentStart: number }[] = [];
  let from = 0;
  for (const key of ITEM_ORDER) {
    const re = new RegExp(`(^|\\s)${key}\\)\\s?`, 'g');
    re.lastIndex = from;
    const m = re.exec(body);
    if (m) {
      const start = m.index + m[1]!.length;
      found.push({ key, start, contentStart: m.index + m[0].length });
      from = m.index + m[0].length;
    }
  }
  const out: Partial<Record<ItemKey, string>> = {};
  found.forEach((f, i) => {
    const next = found[i + 1];
    out[f.key] = body.slice(f.contentStart, next ? next.start : body.length).trim();
  });
  return out;
}

/** Parses YYMMDDhhmm (UTC) to ISO. Returns null when out of range. */
export function parseNotamDateTime(s: string): string | null {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const date = new Date(Date.UTC(2000 + y, mo - 1, d, h, mi));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null; // e.g. 31 Feb
  return date.toISOString();
}

function parseTime(raw: string | undefined, allowPerm: boolean, flags: string[], item: string): NotamTime {
  if (!raw) return { iso: null, permanent: false, estimated: false, raw: null };
  const t = raw.trim().toUpperCase();
  if (allowPerm && t.startsWith('PERM')) return { iso: null, permanent: true, estimated: false, raw };
  const m = /^(\d{10})\s*(EST)?/.exec(t);
  if (!m) {
    flags.push(`item-${item}-unparsable`);
    return { iso: null, permanent: false, estimated: false, raw };
  }
  const iso = parseNotamDateTime(m[1]!);
  if (!iso) flags.push(`item-${item}-invalid-datetime`);
  return { iso, permanent: false, estimated: Boolean(m[2]), raw };
}

export function parseQLine(raw: string, flags: string[]): QLine | null {
  const parts = raw.replace(/\s+/g, '').split('/');
  if (parts.length < 8) {
    flags.push('q-line-incomplete');
    return null;
  }
  const [fir, code, traffic, purpose, scope, lower, upper, geo] = parts as [
    string, string, string, string, string, string, string, string,
  ];
  if (!/^[A-Z]{4}$/.test(fir)) flags.push('q-fir-invalid');
  if (!/^Q[A-Z]{4}$/.test(code)) flags.push('q-code-invalid');

  let centre: QLine['centre'] = null;
  let radiusNm: number | null = null;
  const g = /^(\d{4}[NS]\d{5}[EW])(\d{3})?$/.exec(geo);
  if (g) {
    centre = parseCoordinate(g[1]!);
    radiusNm = g[2] !== undefined ? Number(g[2]) : null;
    if (!centre) flags.push('q-coordinate-invalid');
  } else if (geo) {
    flags.push('q-geo-unparsable');
  }
  const lowerFl = /^\d{3}$/.test(lower) ? Number(lower) : null;
  const upperFl = /^\d{3}$/.test(upper) ? Number(upper) : null;
  if (lowerFl !== null && upperFl !== null && lowerFl > upperFl) flags.push('q-levels-inverted');

  return {
    fir,
    code,
    subject: code.slice(1, 3),
    condition: code.slice(3, 5),
    traffic: traffic || null,
    purpose: purpose || null,
    scope: scope || null,
    lowerFl,
    upperFl,
    centre,
    radiusNm,
    raw,
  };
}

/** 32-bit FNV-1a hash, used for stable ids of unparsable messages. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function normalizeMessage(raw: string): string {
  let t = raw.replace(/\r\n?/g, '\n').trim();
  if (t.startsWith('(') && t.endsWith(')')) t = t.slice(1, -1).trim();
  return t;
}

export function identityKey(n: Pick<Notam, 'displayId' | 'q' | 'locations'>): string | null {
  if (!n.displayId) return null;
  const ctx = n.q?.fir ?? n.locations[0] ?? 'UNKN';
  return `${ctx}:${n.displayId}`;
}

export function parseNotam(raw: string, ctx: ParseContext): Notam {
  const flags: string[] = [];
  const text = normalizeMessage(raw);
  const provenance: Provenance = {
    sourceId: ctx.sourceId,
    sourceRecordId: ctx.providerId ?? null,
    origin: ctx.origin,
    retrievedAt: ctx.retrievedAt,
  };

  const header = HEADER.exec(text);
  const items = splitItems(header ? text.slice(header[0].length) : text);

  let series: string | null = null;
  let number: number | null = null;
  let year: number | null = null;
  let type: NotamType = 'UNKNOWN';
  let referencedId: string | null = null;
  if (header) {
    series = header[1]!;
    number = Number(header[2]);
    year = 2000 + Number(header[3]);
    type = header[4] === 'N' ? 'NEW' : header[4] === 'R' ? 'REPLACE' : 'CANCEL';
    if (header[5]) referencedId = `${header[5]}${header[6]}/${header[7]}`;
    if (type !== 'NEW' && !referencedId) flags.push('missing-reference');
    if (type === 'NEW' && referencedId) flags.push('unexpected-reference');
  } else {
    flags.push('header-unrecognised');
  }
  const displayId = header ? `${series}${header[2]}/${header[3]}` : null;

  const q = items.Q ? parseQLine(items.Q, flags) : null;
  if (!items.Q) flags.push('missing-q');
  const locations = items.A ? items.A.split(/\s+/).filter((s) => /^[A-Z]{4}$/.test(s)) : [];
  if (!items.A) flags.push('missing-a');
  const validFrom = parseTime(items.B, false, flags, 'b');
  if (!items.B) flags.push('missing-b');
  const validTo = parseTime(items.C, true, flags, 'c');
  if (!items.C && type !== 'CANCEL') flags.push('missing-c');
  if (validFrom.iso && validTo.iso && validTo.iso < validFrom.iso) flags.push('end-before-start');

  const eText = items.E ?? '';
  if (!items.E) flags.push('missing-e');
  const lower = items.F ? parseVerticalLimit(items.F.replace(/\)$/, '')) : null;
  const upper = items.G ? parseVerticalLimit(items.G.replace(/\)$/, '')) : null;
  if (lower?.reference === 'UNKNOWN') flags.push('item-f-reference-unknown');
  if (upper?.reference === 'UNKNOWN') flags.push('item-g-reference-unknown');

  const geo = type === 'CANCEL' ? { geometry: null, flags: [] as string[] } : interpretGeometry(eText, q);
  flags.push(...geo.flags);

  const parseStatus = decideStatus(Boolean(header), flags);
  const base = { displayId, q, locations };
  const key = identityKey(base);

  return {
    id: key ? `${ctx.sourceId}:${key}` : `${ctx.sourceId}:raw:${fnv1a(text)}`,
    providerId: ctx.providerId ?? null,
    series,
    number,
    year,
    displayId,
    type,
    referencedId,
    q,
    locations,
    validFrom,
    validTo,
    schedule: items.D ?? null,
    text: eText.replace(/\)$/, '').trim(),
    lower,
    upper,
    raw,
    parseStatus,
    qualityFlags: Array.from(new Set(flags)),
    geometry: geo.geometry,
    provenance,
    lastVerifiedAt: ctx.origin === 'provider' ? ctx.retrievedAt : null,
  };
}

const CRITICAL = new Set([
  'header-unrecognised',
  'missing-b',
  'item-b-unparsable',
  'item-b-invalid-datetime',
  'item-c-unparsable',
  'item-c-invalid-datetime',
  'end-before-start',
  'missing-reference',
]);

function decideStatus(hasHeader: boolean, flags: string[]): ParseStatus {
  if (!hasHeader && flags.includes('missing-q') && flags.includes('missing-e')) return 'failed';
  if (flags.some((f) => CRITICAL.has(f))) return 'needs-review';
  const soft = flags.filter(
    (f) =>
      f.startsWith('missing-') ||
      f.startsWith('q-') ||
      f.endsWith('-reference-unknown') ||
      f === 'item-e-multiple-areas' ||
      f === 'item-e-polygon-invalid' ||
      f === 'item-e-circle-ambiguous',
  );
  return soft.length ? 'partial' : 'parsed';
}

/**
 * Splits a bulletin containing multiple NOTAMs. Messages are delimited by a
 * new NOTAM header line, or by parenthesised blocks.
 */
export function splitBulletin(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  const starts: number[] = [];
  const re = /(^|\n)\s*\(?\s*[A-Z]\d{4}\/\d{2}\s+NOTAM[NRC]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) starts.push(m.index + m[1]!.length);
  if (starts.length === 0) return normalized.trim() ? [normalized.trim()] : [];
  return starts
    .map((s, i) => normalized.slice(s, starts[i + 1] ?? normalized.length).trim())
    .filter((s) => s.length > 0);
}
