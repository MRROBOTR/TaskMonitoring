import type { SqlDatabase, SqlValue } from './sql';

/** Conservative limit compatible with SQLite builds using the old 999-variable default. */
const MAX_VARS = 999;

/**
 * Inserts rows with multi-row VALUES statements in chunks. Must be called
 * inside a transaction by the caller for atomicity.
 */
export async function insertRows(
  db: SqlDatabase,
  table: string,
  columns: string[],
  rows: SqlValue[][],
  mode: 'INSERT' | 'INSERT OR REPLACE' = 'INSERT OR REPLACE',
): Promise<number> {
  if (!/^[a-z_]+$/.test(table) || columns.some((c) => !/^[a-z_]+$/.test(c))) {
    throw new Error('Invalid identifier');
  }
  const perRow = columns.length;
  const chunk = Math.max(1, Math.floor(MAX_VARS / perRow));
  const rowSql = `(${columns.map(() => '?').join(',')})`;
  let n = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    for (const r of slice) {
      if (r.length !== perRow) throw new Error(`Row has ${r.length} values, expected ${perRow}`);
    }
    const sql = `${mode} INTO ${table} (${columns.join(',')}) VALUES ${slice.map(() => rowSql).join(',')}`;
    const res = await db.runAsync(sql, slice.flat());
    n += res.changes;
  }
  return n;
}
