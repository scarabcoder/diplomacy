import {
  createDatabase,
  databaseProvider,
  databaseUrl,
  migrateDatabase,
  type Database,
} from './database-driver';

export type { Database };
export { createDatabase, databaseProvider, databaseUrl, migrateDatabase };

declare global {
  // Reuse the same local database connection across Vite SSR module reloads.
  var __diplomacyDatabasePromise__: Promise<Database> | undefined;
  var __diplomacyDatabaseClosePromise__: Promise<void> | undefined;
}

const databasePromise =
  globalThis.__diplomacyDatabasePromise__ ?? createDatabase();

if (!globalThis.__diplomacyDatabasePromise__) {
  globalThis.__diplomacyDatabasePromise__ = databasePromise;
}

export async function closeDatabase() {
  if (globalThis.__diplomacyDatabaseClosePromise__) {
    return globalThis.__diplomacyDatabaseClosePromise__;
  }

  globalThis.__diplomacyDatabaseClosePromise__ = (async () => {
    const db = await databasePromise;
    await (db as { $client?: { close?: () => Promise<void> } }).$client?.close?.();
  })();

  return globalThis.__diplomacyDatabaseClosePromise__;
}

export const database = await databasePromise;
