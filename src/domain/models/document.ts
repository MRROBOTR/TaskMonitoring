export const DOCUMENT_CATEGORIES = [
  'aip',
  'charts',
  'airport',
  'manuals',
  'checklists',
  'emergency',
  'qrh',
  'user',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  aip: 'AIP',
  charts: 'Charts',
  airport: 'Havalimanı dokümanları',
  manuals: 'El kitapları',
  checklists: 'Checklists',
  emergency: 'Acil durum prosedürleri',
  qrh: 'QRH',
  user: 'Kullanıcı dokümanları',
};

/** Categories exposed on the quick emergency access screen. */
export const EMERGENCY_CATEGORIES: DocumentCategory[] = ['emergency', 'qrh', 'checklists'];

export interface StoredDocument {
  id: string;
  title: string;
  category: DocumentCategory;
  /** Path relative to the app's private document directory. */
  relativePath: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  checksum: string | null;
  importedAt: string;
  modifiedAt: string;
  source: string | null;
  tags: string[];
  favorite: boolean;
  lastOpenedAt: string | null;
  lastPage: number | null;
}

export interface DocumentBookmark {
  id: string;
  documentId: string;
  page: number;
  label: string;
  createdAt: string;
}
