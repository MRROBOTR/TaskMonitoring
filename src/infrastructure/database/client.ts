/**
 * Device database bootstrap (expo-sqlite). Opens the database, applies
 * migrations, registers data-source descriptors and recovers runs that were
 * interrupted by an app kill.
 */
import * as SQLite from 'expo-sqlite';
import { ALL_SOURCES } from '@/providers/registry';
import { migrate } from './migrations';
import { recoverInterruptedRuns, registerSources } from './sourceRepository';
import type { SqlDatabase, SqlValue } from './sql';

export const DATABASE_NAME = 'atlas-efb.db';

function adapt(db: SQLite.SQLiteDatabase): SqlDatabase {
  return {
    execAsync: (s) => db.execAsync(s),
    runAsync: (s, p: SqlValue[] = []) => db.runAsync(s, p),
    getAllAsync: <T>(s: string, p: SqlValue[] = []) => db.getAllAsync<T>(s, p),
    getFirstAsync: <T>(s: string, p: SqlValue[] = []) => db.getFirstAsync<T>(s, p),
    withTransactionAsync: (t) => db.withTransactionAsync(t),
  };
}

let opening: Promise<SqlDatabase> | null = null;

export function openAppDatabase(): Promise<SqlDatabase> {
  if (!opening) {
    opening = (async () => {
      const native = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await native.execAsync('PRAGMA journal_mode = WAL;');
      const db = adapt(native);
      await migrate(db);
      await registerSources(db, ALL_SOURCES);
      await recoverInterruptedRuns(db, new Date().toISOString());
      return db;
    })().catch((e) => {
      opening = null;
      throw e;
    });
  }
  return opening;
}
