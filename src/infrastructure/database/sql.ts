/**
 * Minimal async SQL interface implemented by expo-sqlite's SQLiteDatabase on
 * device and by a node:sqlite adapter in tests. Keeps repositories testable
 * against a real SQLite engine.
 */
export type SqlValue = string | number | null;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: SqlValue[]): Promise<SqlRunResult>;
  getAllAsync<T>(source: string, params?: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params?: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export function bool(v: boolean | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return v ? 1 : 0;
}

export function fromBool(v: number | null): boolean | null {
  return v === null ? null : v !== 0;
}
