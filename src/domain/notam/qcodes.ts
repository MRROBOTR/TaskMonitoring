/**
 * ICAO NOTAM code (Q-code) subject groups, keyed by the 2nd letter of the
 * five-letter code (ICAO Doc 8126 / PANS-AIM structure). Only the group level
 * is decoded; the full subject/condition is always shown as the raw code so
 * nothing is invented.
 */
export type NotamCategory =
  | 'aerodrome'
  | 'atm'
  | 'navaid'
  | 'communications'
  | 'airspace-restriction'
  | 'warning'
  | 'other';

interface Group {
  label: string;
  category: NotamCategory;
}

const GROUPS: Record<string, Group> = {
  L: { label: 'Işıklandırma (Lighting)', category: 'aerodrome' },
  M: { label: 'Hareket ve iniş alanı (Movement area)', category: 'aerodrome' },
  F: { label: 'Tesis ve hizmetler (Facilities)', category: 'aerodrome' },
  A: { label: 'Airspace organisation', category: 'atm' },
  S: { label: 'ATS ve VOLMET', category: 'atm' },
  P: { label: 'ATC prosedürleri', category: 'atm' },
  C: { label: 'Communications & surveillance', category: 'communications' },
  I: { label: 'ILS / MLS', category: 'navaid' },
  G: { label: 'GNSS', category: 'navaid' },
  N: { label: 'Navaids (terminal / en-route)', category: 'navaid' },
  R: { label: 'Airspace restrictions', category: 'airspace-restriction' },
  W: { label: 'Warnings (Navigation warnings)', category: 'warning' },
  O: { label: 'Diğer bilgiler', category: 'other' },
};

export function qCodeGroup(code: string | null | undefined): Group {
  const letter = code && code.length >= 2 ? code[1]!.toUpperCase() : '';
  return GROUPS[letter] ?? { label: 'Bilinmeyen grup', category: 'other' };
}

export const CATEGORY_LABELS: Record<NotamCategory, string> = {
  aerodrome: 'Aerodrome',
  atm: 'ATM / Airspace org.',
  navaid: 'Navaid / ILS / GNSS',
  communications: 'Communications',
  'airspace-restriction': 'Airspace restriction',
  warning: 'Warning',
  other: 'Diğer',
};
