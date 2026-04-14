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
}

const databasePromise =
  globalThis.__diplomacyDatabasePromise__ ?? createDatabase();

if (!globalThis.__diplomacyDatabasePromise__) {
  globalThis.__diplomacyDatabasePromise__ = databasePromise;
}

export const database = await databasePromise;
