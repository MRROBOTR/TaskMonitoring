import type { DocumentBookmark, DocumentCategory, StoredDocument } from '@/domain/models/document';
import type { SqlDatabase } from './sql';

interface Row {
  id: string;
  title: string;
  category: DocumentCategory;
  relative_path: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  checksum: string | null;
  imported_at: string;
  modified_at: string;
  source: string | null;
  favorite: number;
  last_opened_at: string | null;
  last_page: number | null;
  tags: string | null;
}

function toDoc(r: Row): StoredDocument {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    relativePath: r.relative_path,
    originalFilename: r.original_filename,
    mimeType: r.mime_type,
    fileSize: r.file_size,
    checksum: r.checksum,
    importedAt: r.imported_at,
    modifiedAt: r.modified_at,
    source: r.source,
    tags: r.tags ? r.tags.split('\u001f') : [],
    favorite: r.favorite === 1,
    lastOpenedAt: r.last_opened_at,
    lastPage: r.last_page,
  };
}

const SELECT = `SELECT d.*, (SELECT group_concat(tag, char(31)) FROM document_tags t WHERE t.document_id = d.id) AS tags
  FROM documents d`;

export async function insertDocument(db: SqlDatabase, d: StoredDocument): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO documents (id, title, category, relative_path, original_filename, mime_type, file_size, checksum,
        imported_at, modified_at, source, favorite, last_opened_at, last_page)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        d.id, d.title, d.category, d.relativePath, d.originalFilename, d.mimeType, d.fileSize, d.checksum,
        d.importedAt, d.modifiedAt, d.source, d.favorite ? 1 : 0, d.lastOpenedAt, d.lastPage,
      ],
    );
    for (const tag of d.tags) {
      await db.runAsync('INSERT OR IGNORE INTO document_tags (document_id, tag) VALUES (?,?)', [d.id, tag]);
    }
  });
}

export async function listDocuments(
  db: SqlDatabase,
  filter: { category?: DocumentCategory | DocumentCategory[]; favoritesOnly?: boolean; query?: string } = {},
): Promise<StoredDocument[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.category) {
    const cats = Array.isArray(filter.category) ? filter.category : [filter.category];
    where.push(`d.category IN (${cats.map(() => '?').join(',')})`);
    params.push(...cats);
  }
  if (filter.favoritesOnly) where.push('d.favorite = 1');
  if (filter.query?.trim()) {
    where.push(`(d.title LIKE ? ESCAPE '\\' OR d.original_filename LIKE ? ESCAPE '\\')`);
    const like = `%${filter.query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    params.push(like, like);
  }
  const rows = await db.getAllAsync<Row>(
    `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.favorite DESC, d.title COLLATE NOCASE`,
    params,
  );
  return rows.map(toDoc);
}

export async function recentDocuments(db: SqlDatabase, limit = 5): Promise<StoredDocument[]> {
  const rows = await db.getAllAsync<Row>(
    `${SELECT} WHERE d.last_opened_at IS NOT NULL ORDER BY d.last_opened_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map(toDoc);
}

export async function getDocument(db: SqlDatabase, id: string): Promise<StoredDocument | null> {
  const r = await db.getFirstAsync<Row>(`${SELECT} WHERE d.id = ?`, [id]);
  return r ? toDoc(r) : null;
}

export async function findByChecksum(db: SqlDatabase, checksum: string): Promise<StoredDocument | null> {
  const r = await db.getFirstAsync<Row>(`${SELECT} WHERE d.checksum = ?`, [checksum]);
  return r ? toDoc(r) : null;
}

export async function updateDocumentMeta(
  db: SqlDatabase,
  id: string,
  patch: { title?: string; category?: DocumentCategory; favorite?: boolean; tags?: string[] },
  now: string,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    if (patch.title !== undefined) await db.runAsync('UPDATE documents SET title=?, modified_at=? WHERE id=?', [patch.title, now, id]);
    if (patch.category !== undefined) {
      await db.runAsync('UPDATE documents SET category=?, modified_at=? WHERE id=?', [patch.category, now, id]);
    }
    if (patch.favorite !== undefined) {
      await db.runAsync('UPDATE documents SET favorite=?, modified_at=? WHERE id=?', [patch.favorite ? 1 : 0, now, id]);
    }
    if (patch.tags !== undefined) {
      await db.runAsync('DELETE FROM document_tags WHERE document_id = ?', [id]);
      for (const t of patch.tags) await db.runAsync('INSERT OR IGNORE INTO document_tags VALUES (?,?)', [id, t]);
    }
  });
}

export async function markOpened(db: SqlDatabase, id: string, now: string, page: number | null): Promise<void> {
  await db.runAsync('UPDATE documents SET last_opened_at=?, last_page=COALESCE(?, last_page) WHERE id=?', [now, page, id]);
}

export async function deleteDocumentRow(db: SqlDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM documents WHERE id = ?', [id]);
}

export async function addBookmark(db: SqlDatabase, b: DocumentBookmark): Promise<void> {
  await db.runAsync('INSERT INTO document_bookmarks (id, document_id, page, label, created_at) VALUES (?,?,?,?,?)', [
    b.id, b.documentId, b.page, b.label, b.createdAt,
  ]);
}

export async function listBookmarks(db: SqlDatabase, documentId: string): Promise<DocumentBookmark[]> {
  const rows = await db.getAllAsync<{ id: string; document_id: string; page: number; label: string; created_at: string }>(
    'SELECT * FROM document_bookmarks WHERE document_id = ? ORDER BY page',
    [documentId],
  );
  return rows.map((r) => ({ id: r.id, documentId: r.document_id, page: r.page, label: r.label, createdAt: r.created_at }));
}

export async function deleteBookmark(db: SqlDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM document_bookmarks WHERE id = ?', [id]);
}
