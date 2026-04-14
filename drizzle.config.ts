import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/database/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL?.trim() ||
      'postgresql://postgres:postgres@localhost:5432/diplomacy',
  },
});
