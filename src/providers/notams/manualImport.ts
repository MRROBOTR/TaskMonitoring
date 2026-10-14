/**
 * Manual NOTAM import: the user pastes or imports ICAO-format NOTAM text
 * obtained from an official briefing source (e.g. a national AIS portal PIB).
 * Imported data is labelled "manual-import" and is never shown as live.
 */
import type { Notam } from '@/domain/models/notam';
import type { DataSourceDescriptor } from '@/domain/models/provenance';
import { parseNotam, splitBulletin } from '@/domain/notam/parser';

export const MANUAL_NOTAM_SOURCE_ID = 'manual-notam';
export const MAX_IMPORT_CHARS = 2_000_000;

export const MANUAL_NOTAM_DESCRIPTOR: DataSourceDescriptor = {
  id: MANUAL_NOTAM_SOURCE_ID,
  name: 'Manuel NOTAM içe aktarımı',
  documentationUrl: 'docs/NOTAM_PIPELINE.md',
  categories: ['notams'],
  coverage: 'Kullanıcının içe aktardığı mesajlar',
  updateFrequency: 'Kullanıcı tarafından',
  access: 'none',
  license: 'Kaynağın koşullarına tabidir (kullanıcı sorumluluğunda)',
  attribution: 'Kullanıcı tarafından sağlanan NOTAM metni',
  offlineStoragePermitted: true,
  redistributionPermitted: false,
  limitations: [
    'Güncelliği doğrulanamaz; resmi brifing yerine geçmez.',
    'Yalnızca ICAO formatındaki mesajlar ayrıştırılır; diğerleri "inceleme gerekli" olarak saklanır.',
  ],
  verification: 'verified',
};

export interface ManualImportResult {
  notams: Notam[];
  counts: Record<Notam['parseStatus'], number>;
}

export function parseManualNotams(text: string, retrievedAt: string): ManualImportResult {
  if (text.length > MAX_IMPORT_CHARS) throw new Error('Metin çok uzun');
  const notams = splitBulletin(text).map((msg) =>
    parseNotam(msg, { sourceId: MANUAL_NOTAM_SOURCE_ID, origin: 'manual-import', retrievedAt }),
  );
  const counts = { parsed: 0, partial: 0, 'needs-review': 0, failed: 0 };
  for (const n of notams) counts[n.parseStatus]++;
  return { notams, counts };
}
