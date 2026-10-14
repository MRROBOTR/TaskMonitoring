/**
 * App-private PDF storage. Imported files are copied into
 * <documentDirectory>/documents/<uuid>.pdf; the original filename is kept only
 * as metadata and never used as a path. Files never leave the device.
 */
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import type { DocumentCategory, StoredDocument } from '@/domain/models/document';
import {
  isSafeRelativePath,
  storedFileName,
  titleFromFilename,
  validatePdfCandidate,
} from '@/domain/services/documentValidation';
import {
  deleteDocumentRow,
  findByChecksum,
  insertDocument,
} from '@/infrastructure/database/documentRepository';
import type { SqlDatabase } from '@/infrastructure/database/sql';

const DOCS_DIR = 'documents';

function docsDirectory(): Directory {
  const dir = new Directory(Paths.document, DOCS_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function fileForDocument(doc: Pick<StoredDocument, 'relativePath'>): File {
  if (!isSafeRelativePath(doc.relativePath)) throw new Error('Unsafe document path');
  return new File(Paths.document, doc.relativePath);
}

export function documentExists(doc: Pick<StoredDocument, 'relativePath'>): boolean {
  try {
    return fileForDocument(doc).exists;
  } catch {
    return false;
  }
}

export type ImportResult =
  | { status: 'imported'; document: StoredDocument }
  | { status: 'duplicate'; existing: StoredDocument }
  | { status: 'cancelled' }
  | { status: 'invalid'; message: string };

export async function pickAndImportPdf(
  db: SqlDatabase,
  category: DocumentCategory,
  onProgress?: (stage: 'copying' | 'validating' | 'saving') => void,
): Promise<ImportResult> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  if (res.canceled) return { status: 'cancelled' };
  const asset = res.assets[0];
  if (!asset) return { status: 'cancelled' };

  const picked = new File(asset.uri);
  onProgress?.('validating');
  const size = asset.size ?? picked.size;
  let head: Uint8Array;
  const handle = picked.open();
  try {
    head = handle.readBytes(Math.min(1100, size));
  } finally {
    handle.close();
  }
  const error = validatePdfCandidate(size, head);
  if (error) {
    cleanupCache(picked);
    return { status: 'invalid', message: error.message };
  }
  const md5 = picked.info({ md5: true }).md5 ?? null;
  if (md5) {
    const existing = await findByChecksum(db, md5);
    if (existing) {
      cleanupCache(picked);
      return { status: 'duplicate', existing };
    }
  }

  onProgress?.('copying');
  const id = Crypto.randomUUID();
  const name = storedFileName(id);
  const target = new File(docsDirectory(), name);
  picked.copySync(target);
  cleanupCache(picked);

  onProgress?.('saving');
  const now = new Date().toISOString();
  const doc: StoredDocument = {
    id,
    title: titleFromFilename(asset.name),
    category,
    relativePath: `${DOCS_DIR}/${name}`,
    originalFilename: asset.name.slice(0, 255),
    mimeType: 'application/pdf',
    fileSize: size,
    checksum: md5,
    importedAt: now,
    modifiedAt: now,
    source: 'device-import',
    tags: [],
    favorite: false,
    lastOpenedAt: null,
    lastPage: null,
  };
  try {
    await insertDocument(db, doc);
  } catch (e) {
    if (target.exists) target.delete();
    throw e;
  }
  return { status: 'imported', document: doc };
}

function cleanupCache(f: File) {
  try {
    if (f.uri.startsWith(Paths.cache.uri) && f.exists) f.delete();
  } catch {
    // best effort
  }
}

export async function deleteStoredDocument(db: SqlDatabase, doc: StoredDocument): Promise<void> {
  await deleteDocumentRow(db, doc.id);
  try {
    const f = fileForDocument(doc);
    if (f.exists) f.delete();
  } catch {
    // Row removed; orphaned file (if any) is reported by the storage check.
  }
}

export function storageUsage(): { files: number; bytes: number } {
  const dir = docsDirectory();
  let files = 0;
  let bytes = 0;
  for (const item of dir.list()) {
    if (item instanceof File) {
      files++;
      bytes += item.size;
    }
  }
  return { files, bytes };
}
