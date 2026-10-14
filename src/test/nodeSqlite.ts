/**
 * Test-only SqlDatabase backed by Node's built-in SQLite (node:sqlite).
 * Gives repository/migration tests a real SQLite engine instead of mocks.
 */
import type { SqlDatabase, SqlRunResult, SqlValue } from '@/infrastructure/database/sql';

interface NodeStatement {
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: SqlValue[]): unknown[];
  get(...params: SqlValue[]): unknown;
}
interface NodeDb {
  exec(sql: string): void;
  prepare(sql: string): NodeStatement;
  close(): void;
}

export function createTestDatabase(): SqlDatabase & { close(): void } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => NodeDb };
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const plain = <T>(row: unknown): T => (row ? ({ ...(row as object) } as T) : (row as T));
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params = []): Promise<SqlRunResult> {
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getAllAsync<T>(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).all(...params).map((r) => plain<T>(r));
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[] = []) {
      const r = db.prepare(sql).get(...params);
      return r === undefined ? null : plain<T>(r);
    },
    async withTransactionAsync(task) {
      if (depth > 0) throw new Error('Nested transactions are not supported (matches expo-sqlite semantics)');
      depth++;
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
    close() {
      db.close();
    },
  };
}
