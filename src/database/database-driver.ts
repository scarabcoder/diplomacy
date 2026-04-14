import { PGlite } from '@electric-sql/pglite';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  drizzle as drizzlePG,
  type NodePgDatabase,
} from 'drizzle-orm/node-postgres';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import {
  drizzle as drizzlePGLite,
  type PgliteDatabase,
} from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';

function getGitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'main';
  }
}

export type Database =
  | NodePgDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

export const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
export const databaseProvider = databaseUrl ? 'postgres' : 'pglite';

function isTestRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    process.argv.includes('test') ||
    process.argv.some((arg) => arg.endsWith('.test.ts'))
  );
}

function getPgliteDataDir(): string {
  const configuredDataDir = process.env.PGLITE_DATA_DIR?.trim();

  if (configuredDataDir) {
    return configuredDataDir;
  }

  if (isTestRuntime()) {
    const dataDir = mkdtempSync(join(tmpdir(), 'diplomacy-pglite-test-'));

    process.once('exit', () => {
      try {
        rmSync(dataDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup for ephemeral test databases.
      }
    });

    return dataDir;
  }

  const branch = getGitBranch();

  return `./.database/${branch}`;
}

export async function createDatabase({
  migrateLocal = true,
}: {
  migrateLocal?: boolean;
} = {}): Promise<Database> {
  if (!databaseUrl) {
    const dataDir = getPgliteDataDir();
    mkdirSync(dataDir, { recursive: true });
    console.log(
      `No DATABASE_URL found, using PGlite for local development (${dataDir})`,
    );
    const client = new PGlite({ dataDir });
    const db = drizzlePGLite<typeof schema>({ client, schema });
    if (migrateLocal) {
      await migratePglite(db, { migrationsFolder: './drizzle' });
    }
    return db;
  }

  return drizzlePG<typeof schema>(databaseUrl, {
    schema,
    logger: process.env.DATABASE_DEBUG === 'true',
  });
}

export async function migrateDatabase(
  db: Database,
  migrationsFolder = './drizzle',
): Promise<void> {
  if (databaseProvider === 'postgres') {
    await migratePostgres(db as NodePgDatabase<typeof schema>, {
      migrationsFolder,
    });
    return;
  }

  await migratePglite(db as PgliteDatabase<typeof schema>, {
    migrationsFolder,
  });
}
